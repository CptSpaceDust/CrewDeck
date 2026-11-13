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
      const me={id:'me',username:'Test Captain',rank:'Captain',badges:['Trusted Person']};
      const other={id:'other',username:'Test Member',rank:'Member',badges:'legacy badge',bio:'Profile opened successfully'};
      const values={getProfile:async id=>id==='me'?me:other,getProfiles:async()=>[other],getConversations:async()=>[{id:'conversation',person:other}],getMessages:async()=>[{id:'message',sender_id:'me',content:'Hi',created_at:new Date().toISOString()}],getMessageRequests:async()=>[],getActiveRestrictions:async()=>[],getIntroductions:async()=>[],editMessage:async(id,user,content)=>{if(content==='fail')throw Error('Test save failure');window.savedMessage=content;return true;}};
      ${names.map(name => `export const ${name}=values.${name}|| (async()=>[]);`).join('\n')}`;
    const supabaseMock = `const query=new Proxy({}, {get:(_,name)=>name==='then'?resolve=>Promise.resolve(resolve({data:[],count:0})):()=>query});const completedOnboarding=new Proxy({}, {get:(_,name)=>name==='then'?resolve=>Promise.resolve(resolve({data:{completed_at:'2026-01-01T00:00:00.000Z'},error:null})):()=>completedOnboarding});const devices=[{device_id:'device-right-ankle',device_name:'Right Ankle',provider_name:'Right Ankle',provider:'openshock',is_paused:false,safety:{max_intensity:100,max_duration:30,high_intensity_threshold:40,cooldown_seconds:3,hold_milliseconds:800,require_hold_to_shock:true}},{device_id:'device-left-thigh-long-name',device_name:'Left Thigh · Long Device Name',provider_name:'Left Thigh',provider:'pishock',is_paused:false,safety:{max_intensity:72,max_duration:18,high_intensity_threshold:35,cooldown_seconds:4,hold_milliseconds:900,require_hold_to_shock:true}}];const invoke=async(name,{body}={})=>{if(name!=='control-provider')return{data:{success:true},error:null};if(body?.action==='status')return{data:{success:true,paired:{user_id:'me',provider:'mixed'},connections:[{id:'connection-a',provider:'openshock',connection_label:'Primary devices',status:'active'},{id:'connection-b',provider:'pishock',connection_label:'Travel devices',status:'active'}],owners:[],trusted_people:[],crew_options:[]},error:null};if(body?.action==='devices')return{data:{success:true,devices},error:null};if(body?.action==='shares')return{data:{success:true,links:[]},error:null};return{data:{success:true},error:null};};const channel={on(){return channel},subscribe(){return channel}};export const supabase={from:(table)=>table==='member_onboarding_preferences'?completedOnboarding:query,rpc:async()=>({data:{},error:null}),functions:{invoke},channel:()=>channel,removeChannel:async()=>{},realtime:{setAuth:async()=>{}},auth:{getSession:async()=>({data:{session:{user:{id:'me'}}}}),getUser:async()=>({data:{user:{id:'me'}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'}})}}};export const HCAPTCHA_HOST='localhost';export const HCAPTCHA_SITE_KEY='test';`;
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
    await click('Control Center');await new Promise(resolve=>setTimeout(resolve,1200));
    if(!(await run("document.body.innerText.includes('Right Ankle') && document.body.innerText.includes('Left Thigh · Long Device Name')"))) throw Error('Control Center fixture did not load: '+(await run("document.body.innerText.slice(-1200)")));
    win.setSize(1480,940);await new Promise(resolve=>setTimeout(resolve,300));await capture('control-center-owner-wide.png');
    await run("document.querySelector('.control-device-card').scrollIntoView({block:'start'})");await new Promise(resolve=>setTimeout(resolve,250));await capture('control-center-device-wide.png');
    await run("window.scrollTo(0,0)");
    await click('Generate access');await wait("document.body.innerText.includes('Create guest Control Center access')");
    await capture('control-center-share-builder-wide.png');
    await click('Create link');await wait("document.body.innerText.includes('Show QR code')");await run("document.querySelector('.control-link-output-row').scrollIntoView({block:'center'})");await new Promise(resolve=>setTimeout(resolve,200));await capture('control-center-share-result-wide.png');
    await click('Show QR code');await wait("document.body.innerText.includes('Scan access QR code')");await capture('control-center-qr-wide.png');
    await run("[...document.querySelectorAll('.control-qr-presentation-modal button')].find(button=>button.textContent.trim()==='Done').click()");await wait("!document.body.innerText.includes('Scan access QR code')");
    await run("[...document.querySelectorAll('.control-share-builder-modal button')].find(button=>button.textContent.trim()==='Done').click()");await wait("!document.body.innerText.includes('Create guest Control Center access')");
    win.setSize(760,820);await new Promise(resolve=>setTimeout(resolve,350));await capture('control-center-owner-narrow.png');
    await run("document.querySelector('.control-device-card').scrollIntoView({block:'start'})");await new Promise(resolve=>setTimeout(resolve,250));await capture('control-center-device-narrow.png');
    await click('Generate access');await wait("document.body.innerText.includes('Create guest Control Center access')");await capture('control-center-share-builder-narrow.png');
    if(errors.length)throw Error(errors.join('\n'));
    console.log(JSON.stringify({profileOpened:true,profileBack:true,messagesRendered:true,controlCenterWide:true,controlCenterDeviceWide:true,shareBuilderWide:true,controlCenterNarrow:true,controlCenterDeviceNarrow:true,shareBuilderNarrow:true,rendererErrors:errors}));
    win.destroy();app.exit(0);
  }catch(error){console.error(error);win.destroy();app.exit(1);}
}
main().catch(error=>{console.error(error);process.exit(1)});
