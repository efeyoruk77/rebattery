import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {client} from './client.mjs';
import {loadSokosumiRuntime} from './sokosumi-runtime.mjs';
import {taskTarget,assertTaskTarget,verifyRuntimeTask} from './task-target.mjs';
const target=taskTarget();
const {readRuntimeCredential,createCoworkerHttpClient,fetchTaskEvents,createTaskEvent}=await loadSokosumiRuntime();
const runtime=createCoworkerHttpClient({apiKey:readRuntimeCredential(target.coworkerId)});
// A chat task leaves its model session in <task>-session.json. A draft task only leaves the draft (<task>.txt),
// so its first follow-up opens a new session that starts with that draft.
export function followUpMessage(comment,draft){
 return draft===undefined?comment:`You delivered this draft for the task:\n${draft}\n\nFollow-up from the person who reviews it. Answer briefly in plain text:\n${comment}`;
}
async function openSession(taskId,state){
 const sessionFile=`.local/${taskId}-session.json`,draftFile=`.local/${taskId}.txt`;
 const saved=existsSync(sessionFile)?JSON.parse(readFileSync(sessionFile,'utf8')):{};
 if(saved.sessionId)return {session:client.sessions.attach(saved.sessionId),draft:undefined};
 if(state.sessionId)return {session:client.sessions.attach(state.sessionId),draft:undefined};
 if(!existsSync(draftFile))return null;
 const {session}=await client.sessions.create();
 return {session,draft:readFileSync(draftFile,'utf8'),newSessionId:session.state.sessionId};
}
export async function reply(task){
 assertTaskTarget(task,target);
 const taskId=task.id;
 await verifyRuntimeTask(runtime,taskId,target);
 const p=`.local/${taskId}-comments.json`;
 const state=existsSync(p)?JSON.parse(readFileSync(p,'utf8')):{};
 const save=()=>writeFileSync(p,JSON.stringify(state),{mode:0o600});
 const {events}=await fetchTaskEvents(runtime,taskId,AbortSignal.timeout(30000));
 for(const event of events.filter(e=>e.actor?.type==='user'&&typeof e.comment==='string'&&e.comment.trim())){
 // A reply the model failed to give is tried again on later polls, at most 3 times.
 if(state[event.id]&&!(state[event.id]==='model-failed'&&(state.tries?.[event.id]??0)<3))continue;
 const opened=await openSession(taskId,state);
 if(!opened)return;
 if(opened.newSessionId){state.sessionId=opened.newSessionId;opened.newSessionId=undefined;}
 state[event.id]='model-pending';save();
 const response=await(await opened.session.send(followUpMessage(event.comment.slice(0,16000),opened.draft))).result();
 if(response.status==='failed'||response.inputRequests.length||!response.message?.trim()){
  state.tries={...state.tries,[event.id]:(state.tries?.[event.id]??0)+1};state[event.id]='model-failed';save();
  console.error('Follow-up reply failed',taskId,event.id,`attempt ${state.tries[event.id]}`);continue;}
 state[event.id]='post-pending';save();
 await verifyRuntimeTask(runtime,taskId,target);
 await createTaskEvent(runtime,taskId,{comment:response.message},AbortSignal.timeout(30000));
 state[event.id]='posted';save();
 }
}
