import {execFileSync} from 'node:child_process';
import {dirname,join,isAbsolute,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
let loaded;
// Runs the Sokosumi CLI. On Windows npm installs it as sokosumi.cmd, which Node only starts through the shell,
// so arguments are limited to plain IDs, flags, and paths there.
export function runSokosumi(args,options={},platform=process.platform,run=execFileSync){
 if(platform!=='win32')return run('sokosumi',args,options);
 if(!args.every(a=>/^[\w@.:\/\\=-]+$/.test(a)))throw new Error('Sokosumi argument is not safe for the Windows shell');
 return run('sokosumi.cmd',args,{...options,shell:true});
}
export function sokosumiRoot(run=(command,args,options)=>runSokosumi(args,options)){
 const skillsPath=run('sokosumi',['skills','path'],{encoding:'utf8',timeout:30000}).trim().replace(/[\\/]+$/,'');
 if(!isAbsolute(skillsPath)||basename(skillsPath)!=='skills')throw new Error('sokosumi skills path returned an invalid package path');
 return join(dirname(skillsPath),'dist','src');
}
export async function loadSokosumiRuntime(){
 if(!loaded){const root=sokosumiRoot();
  loaded=Promise.all(['coworker/runtime-credentials.js','api/http-client.js','api/services/task-service.js'].map(p=>import(pathToFileURL(join(root,p)).href))).then(modules=>Object.assign({},...modules));
 }
 return loaded;
}
