import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
// The CLI and the review screen are not imported by the other tests. Load both, so a syntax error or a missing export fails npm test.
test('the CLI loads and lists its commands without touching the network',()=>{
 const run=spawnSync(process.execPath,['cardano-cli.mjs'],{encoding:'utf8',timeout:60000});
 assert.equal(run.status,1);
 for(const command of ['brew','status','dry-run','anchor','sign','sign-test','stage-b','trace','drop-unsent','read'])assert.match(run.stderr,new RegExp(`[<|]${command}[|>]`),command);
});
test('the review screen loads with the Cardano steps connected',async()=>{
 const review=await import('./review.mjs');
 assert.equal(typeof review.listDrafts,'function');
});
