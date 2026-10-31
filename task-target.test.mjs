import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taskTarget,assertTaskTarget,verifyRuntimeTask,workspaceOf} from './task-target.mjs';

test('task listing and runtime select the same Personal or organization Workspace',()=>{
 const personal=taskTarget({COWORKER_ID:'coworker'});
 const P={organizationId:null,taskArgs:[],runtimeArgs:['--personal']};
 assert.deepEqual(personal,{coworkerId:'coworker',...P,workspaces:[P]});
 const organization=taskTarget({COWORKER_ID:'coworker',SOKOSUMI_ORGANIZATION_ID:'organization',SOKOSUMI_ORGANIZATION_SLUG:'event-workspace'});
 const O={organizationId:'organization',taskArgs:['--organization-slug','event-workspace'],runtimeArgs:['--organization-id','organization']};
 assert.deepEqual(organization,{coworkerId:'coworker',...O,workspaces:[O]});
 assert.doesNotThrow(()=>assertTaskTarget({coworkerId:'coworker',organizationId:null},personal));
 assert.doesNotThrow(()=>assertTaskTarget({coworkerId:'coworker',organizationId:'organization'},organization));
 assert.throws(()=>assertTaskTarget({coworkerId:'coworker',organizationId:null},organization),/configured Coworker and Workspace/);
 assert.throws(()=>assertTaskTarget({coworkerId:'coworker',organizationId:'organization'},personal),/configured Coworker and Workspace/);
});

test('incomplete or invalid Workspace settings cannot fall back to Personal Workspace',()=>{
 assert.throws(()=>taskTarget({COWORKER_ID:'coworker',SOKOSUMI_ORGANIZATION_ID:'organization'}),/Set both/);
 assert.throws(()=>taskTarget({COWORKER_ID:'coworker',SOKOSUMI_ORGANIZATION_SLUG:'event-workspace'}),/Set both/);
 assert.throws(()=>taskTarget({COWORKER_ID:'coworker',SOKOSUMI_ORGANIZATION_ID:'organization',SOKOSUMI_ORGANIZATION_SLUG:'event/workspace'}),/slug/);
 assert.throws(()=>taskTarget({}),/COWORKER_ID/);
});

test('runtime reads confirm the current Task before comments or payment operations',async()=>{
 const target={coworkerId:'coworker',organizationId:'organization'};
 let observed={id:'task',assigneeId:'coworker',organizationId:'organization'};
 const client={get:async(path)=>{assert.equal(path,'/v1/tasks/task');return {data:observed};}};
 assert.equal(await verifyRuntimeTask(client,'task',target),client);
 for(const change of [{id:'another-task'},{assigneeId:'another-coworker'},{organizationId:null}]){
  const previous=observed;observed={...observed,...change};
  await assert.rejects(verifyRuntimeTask(client,'task',target),/Runtime Task ID|configured Coworker and Workspace/);
  observed=previous;
 }
});

// Named gap (open problem #13): the worker served one Workspace only, so a second company could not hire the Coworker.
test('one worker serves several Workspaces, each task with its own Workspace',()=>{
 const t=taskTarget({COWORKER_ID:'c',SOKOSUMI_ORGANIZATION_ID:'org1, org2',SOKOSUMI_ORGANIZATION_SLUG:'tum,recycler-co'});
 assert.deepEqual(t.workspaces.map(w=>w.taskArgs),[['--organization-slug','tum'],['--organization-slug','recycler-co']]);
 assert.deepEqual(workspaceOf({coworkerId:'c',organizationId:'org2'},t).runtimeArgs,['--organization-id','org2']);
 assert.equal(workspaceOf({coworkerId:'c',organizationId:'org3'},t),null);
 assert.equal(workspaceOf({coworkerId:'other',organizationId:'org1'},t),null);
 assert.equal(workspaceOf({coworkerId:'c',organizationId:null},t),null,'a Personal task does not match organization Workspaces');
 assert.throws(()=>taskTarget({COWORKER_ID:'c',SOKOSUMI_ORGANIZATION_ID:'org1,org2',SOKOSUMI_ORGANIZATION_SLUG:'tum'}),/same number/);
 assert.throws(()=>taskTarget({COWORKER_ID:'c',SOKOSUMI_ORGANIZATION_ID:'org1,org1',SOKOSUMI_ORGANIZATION_SLUG:'a,b'}),/twice/);
});
