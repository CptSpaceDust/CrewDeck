// Isolated renderer check: synthetic accounts only; no production session or network.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
async function main() {
  if (!process.versions.electron) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpd-interactions-'));
    const dataSource = fs.readFileSync(path.join(root, 'src/renderer/lib/data.js'), 'utf8');
    const names = [...dataSource.matchAll(/export async function (\w+)/g)].map(match => match[1]);
    const mocks = `
      const me={id:'me',username:'Test Captain',rank:'Member',badges:[]};
      const other={id:'other',username:'Test Member',rank:'Member',badges:'legacy badge',bio:'Profile opened successfully'};
      const values={getProfile:async id=>id==='me'?me:other,getProfiles:async()=>[other],getConversations:async()=>[{id:'conversation',person:other}],getMessages:async()=>[{id:'message',sender_id:'me',content:'Hi',created_at:new Date().toISOString()}],getMessageRequests:async()=>[],getActiveRestrictions:async()=>[],getIntroductions:async()=>[],editMessage:async(id,user,content)=>{if(content==='fail')throw Error('Test save failure');window.savedMessage=content;return true;}};
      ${names.map(name => `export const ${name}=values.${name}|| (async()=>[]);`).join('\n')}`;
    const supabaseMock = `const query=new Proxy({}, {get:(_,name)=>name==='then'?resolve=>Promise.resolve(resolve({data:[],count:0})):()=>query});export const supabase={from:()=>query,channel:()=>query,removeChannel:()=>{},realtime:{setAuth:async()=>{}},auth:{getSession:async()=>({data:{session:{user:{id:'me'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'}})}}};export const HCAPTCHA_HOST='localhost';export const HCAPTCHA_SITE_KEY='test';`;
    await require('esbuild').build({entryPoints:[path.join(root,'src/renderer/main.jsx')],bundle:true,outfile:path.join(dir,'app.js'),jsx:'automatic',assetNames:'assets/[name]-[hash]',loader:{'.css':'css','.png':'file','.mp3':'file','.wav':'file'},plugins:[{name:'fixtures',setup(build){build.onLoad({filter:/lib[\\/]data\.js$/},()=>({contents:mocks,loader:'js'}));build.onLoad({filter:/lib[\\/]supabase\.js$/},()=>({contents:supabaseMock,loader:'js'}));}}]});
    fs.writeFileSync(path.join(dir,'index.html'),'<html><head><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>');
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const child=require('node:child_process').spawn(require('electron'),[__filename,dir],{stdio:'inherit',env});
    child.on('exit',code=>{process.exitCode=code||0;});return;
  }
  const {app,BrowserWindow,session}=require('electron');
  app.setPath('userData',path.join(process.argv[2],'user-data'));
  await app.whenReady();
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_,callback)=>callback({cancel:true}));
  const win=new BrowserWindow({show:false,width:1480,height:940,webPreferences:{contextIsolation:true,nodeIntegration:false}});
  const errors=[];win.webContents.on('console-message',(_event,level,message)=>{if(level===3&&!message.includes('ERR_BLOCKED'))errors.push(message);});
  await win.loadFile(path.join(process.argv[2],'index.html'));
  const run=expression=>win.webContents.executeJavaScript(expression,true);
  const wait=async expression=>{for(let i=0;i<100;i++){if(await run(expression))return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Timed out: '+expression);};
  const click=label=>run(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)} || b.getAttribute('aria-label')===${JSON.stringify(label)})?.click()`);
  try {
    const evidenceDir=path.join(root,'audit-evidence');fs.mkdirSync(evidenceDir,{recursive:true});async function capture(name){win.showInactive();await new Promise(resolve=>setTimeout(resolve,250));await win.webContents.capturePage();await new Promise(resolve=>setTimeout(resolve,150));fs.writeFileSync(path.join(evidenceDir,name),(await win.webContents.capturePage()).toPNG());win.hide()}
    await wait("document.body.innerText.includes('Crew introductions')");
    await click('Crew Directory');await wait("document.body.innerText.includes('View Profile')");
    await click('View Profile');await wait("document.body.innerText.includes('Profile opened successfully')");
    await capture('crew-profile.png');
    await click('Back to directory');await wait("document.body.innerText.includes('View Profile')");
    await click('Messages');await wait("!!document.querySelector('.message.mine')");
    await capture('direct-messages.png');
    const compact=await run("document.querySelector('.message.mine').getBoundingClientRect().width");
    await run("document.querySelector('.message.mine').focus()");
    const expanded=await run("document.querySelector('.message.mine').getBoundingClientRect().width");
    if(expanded<=compact)throw Error('Message did not expand on focus');
    await click('Edit message');await wait("!!document.querySelector('[role=dialog] textarea')");
    async function editFailure(){await run("(()=>{const input=document.querySelector('[role=dialog] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'fail');input.dispatchEvent(new Event('input',{bubbles:true}));})()");await click('Save changes');}
    async function editSuccess(){await run("(()=>{const input=document.querySelector('[role=dialog] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Updated message');input.dispatchEvent(new Event('input',{bubbles:true}));})()");await click('Save changes');}
    await editFailure();await wait("document.body.innerText.includes('Test save failure')");
    await editSuccess();await wait("window.savedMessage==='Updated message' && !document.querySelector('[role=dialog]')");
    await wait("document.querySelector('.message.mine p').textContent==='Updated message'");
    await click('Edit message');await click('Cancel');await wait("!document.querySelector('[role=dialog]')");
    if(errors.length)throw Error(errors.join('\n'));
    console.log(JSON.stringify({profileOpened:true,profileBack:true,editSaved:true,failedEditRecoverable:true,cancelWorks:true,compactWidth:compact,expandedWidth:expanded,rendererErrors:errors}));
    win.destroy();app.exit(0);
  }catch(error){console.error(error);win.destroy();app.exit(1);}
}
main().catch(error=>{console.error(error);process.exit(1)});
