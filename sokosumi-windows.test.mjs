// Regression: the worker could not run on Windows. execFileSync('sokosumi') failed with ENOENT
// (npm installs sokosumi.cmd there), and `sokosumi skills path` ends in "\skills\", which the root check refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runSokosumi,sokosumiRoot} from './sokosumi-runtime.mjs';

test('runs sokosumi.cmd through the shell on Windows, with plain arguments only', () => {
 const calls=[];
 runSokosumi(['--preprod','tasks','list','--coworker-id','01a18e63-a950','--json'],{encoding:'utf8'},'win32',(c,a,o)=>{calls.push([c,o.shell]);return '';});
 assert.deepEqual(calls,[['sokosumi.cmd',true]]);
 assert.throws(()=>runSokosumi(['tasks','comment','x','--comment','a & del *'],{},'win32',()=>''),/not safe/);
 runSokosumi(['skills','path'],{},'linux',(c,a,o)=>{assert.equal(c,'sokosumi');assert.equal(o.shell,undefined);return '';});
});

test('accepts the Windows skills path with a trailing backslash', {skip: process.platform!=='win32'}, () => {
 assert.equal(sokosumiRoot(()=>'C:\\npm\\node_modules\\@masumi_network\\sokosumi\\skills\\\r\n'),'C:\\npm\\node_modules\\@masumi_network\\sokosumi\\dist\\src');
});
