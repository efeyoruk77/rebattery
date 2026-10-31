// Which Coworker and Workspaces this worker serves. SOKOSUMI_ORGANIZATION_ID and SOKOSUMI_ORGANIZATION_SLUG may each
// list several Workspaces, comma-separated and in the same order, so one Coworker can work for several companies.
// Both blank means the Personal Workspace.
const list=v=>(v??'').split(',').map(s=>s.trim()).filter(Boolean);
export function taskTarget(env=process.env){
 const coworkerId=env.COWORKER_ID?.trim();
 if(!coworkerId||/\s/u.test(coworkerId))throw new Error('COWORKER_ID must identify your Coworker');
 const ids=list(env.SOKOSUMI_ORGANIZATION_ID),slugs=list(env.SOKOSUMI_ORGANIZATION_SLUG);
 if(Boolean(ids.length)!==Boolean(slugs.length))throw new Error('Set both SOKOSUMI_ORGANIZATION_ID and SOKOSUMI_ORGANIZATION_SLUG, or leave both blank');
 if(ids.length!==slugs.length)throw new Error('SOKOSUMI_ORGANIZATION_ID and SOKOSUMI_ORGANIZATION_SLUG must list the same number of Workspaces, in the same order');
 for(const id of ids)if(/\s/u.test(id))throw new Error('Each SOKOSUMI_ORGANIZATION_ID must be a single ID');
 for(const slug of slugs)if(!/^[a-zA-Z0-9_-]+$/u.test(slug))throw new Error('SOKOSUMI_ORGANIZATION_SLUG must be a valid Workspace slug');
 if(new Set(ids).size!==ids.length)throw new Error('SOKOSUMI_ORGANIZATION_ID lists a Workspace twice');
 const workspaces=ids.length?ids.map((id,i)=>({organizationId:id,taskArgs:['--organization-slug',slugs[i]],runtimeArgs:['--organization-id',id]}))
  :[{organizationId:null,taskArgs:[],runtimeArgs:['--personal']}];
 // The first Workspace's fields stay at the top level for code that serves one Workspace.
 return {coworkerId,...workspaces[0],workspaces};
}
// The configured Workspace a task belongs to, or null.
export function workspaceOf(task,target){
 if((task?.coworkerId??task?.assigneeId)!==target.coworkerId)return null;
 return (target.workspaces??[target]).find(w=>w.organizationId===task.organizationId)??null;
}
export function isTaskForTarget(task,target){
 return Boolean(workspaceOf(task,target));
}
export function assertTaskTarget(task,target){
 if(!isTaskForTarget(task,target))throw new Error('Task must match the configured Coworker and Workspace');
}
export async function verifyRuntimeTask(client,taskId,target){
 const {data:task}=await client.get(`/v1/tasks/${encodeURIComponent(taskId)}`,AbortSignal.timeout(30000));
 if(task?.id!==taskId)throw new Error('Runtime Task ID does not match');
 assertTaskTarget(task,target);
 return client;
}
