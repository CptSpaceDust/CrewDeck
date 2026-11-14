const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

async function main() {
  if (!process.versions.electron) {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "crewdeck-security-visual-"),
    );
    const entry = path.join(directory, "entry.jsx");
    const source = `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import ${JSON.stringify(path.join(root, "src/renderer/styles.css"))};
      import ${JSON.stringify(path.join(root, "src/renderer/space-glass.css"))};
      import ${JSON.stringify(path.join(root, "src/renderer/captain.css"))};
      import { AvailabilityOverlap } from ${JSON.stringify(path.join(root, "src/renderer/components/AvailabilityOverlap.jsx"))};
      import PhysicalAccessKey from ${JSON.stringify(path.join(root, "src/renderer/components/PhysicalAccessKey.jsx"))};
      import PrivacyCover from ${JSON.stringify(path.join(root, "src/renderer/components/PrivacyCover.jsx"))};
      const today = new Date().toISOString().slice(0,10);
      window.desktop = { accessKey: {
        getState: async () => ({ enabled:false, present:false }),
        listDrives: async () => [{ root:'E:\\\\', label:'Crew Key', serial:'TEST-KEY', size:128849018880, free:96636764160, bus:'USB' }],
        provision: async () => ({ ok:true, settings:{ enabled:true, present:true, driveLabel:'Crew Key', rootHint:'E:\\\\' } }),
        disable: async () => ({ ok:true }), recover: async () => ({ ok:false, error:'Fixture' })
      }};
      const profiles=[{id:'me',username:'CptSpaceDust'},{id:'other',username:'LogieVR'}];
      const availability=[{user_id:'me',block_date:today,all_day:false,start_time:'19:00',end_time:'23:00',time_zone:'America/Denver'}];
      function Harness(){
        const view=new URLSearchParams(location.search).get('view');
        if(view==='privacy') return <PrivacyCover/>;
        if(view==='key') return <main className="page captain-page"><section className="calendar-container"><span className="eyebrow">Captain security</span><h1 className="calendar-title">Physical App Access Key</h1><p>Turn one removable drive into your private local unlock key.</p><PhysicalAccessKey/></section></main>;
        return <main className="page" style={{padding:'18px'}}><AvailabilityOverlap participantIds={['me','other']} profiles={profiles} availability={availability} meetups={[]} duration={1} minimumAttendance={2} selectedDate={today} onUseTime={()=>{}} userId="me"/></main>;
      }
      createRoot(document.getElementById('root')).render(<Harness/>);
    `;
    fs.writeFileSync(entry, source);
    await require("esbuild").build({
      entryPoints: [entry],
      bundle: true,
      outfile: path.join(directory, "app.js"),
      absWorkingDir: root,
      nodePaths: [path.join(root, "node_modules")],
      jsx: "automatic",
      loader: { ".css": "css", ".png": "file", ".mp3": "file", ".wav": "file" },
      plugins: [
        {
          name: "supabase-fixture",
          setup(build) {
            build.onLoad({ filter: /lib[\\/]supabase\.js$/ }, () => ({
              contents:
                "const query=new Proxy({}, {get:(_,name)=>name==='then'?resolve=>Promise.resolve(resolve({data:[],error:null})):()=>query});export const supabase={from:()=>query};",
              loader: "js",
            }));
          },
        },
      ],
    });
    fs.writeFileSync(
      path.join(directory, "index.html"),
      '<html><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>',
    );
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;
    const child = require("node:child_process").spawn(
      require("electron"),
      [__filename, directory],
      { stdio: "inherit", env: environment },
    );
    child.on("error", (error) => {
      console.error(error);
      process.exitCode = 1;
    });
    child.on("exit", (code, signal) => {
      if (code)
        console.error(
          `Visual check exited with ${code}${signal ? ` (${signal})` : ""}.`,
        );
      process.exitCode = code || 0;
    });
    return;
  }
  const { app, BrowserWindow } = require("electron");
  const directory = process.argv[2];
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.setPath("userData", path.join(directory, "user-data"));
  await app.whenReady();
  const win = new BrowserWindow({
    show: false,
    width: 1480,
    height: 940,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const errors = [];
  win.webContents.on("console-message", (_event, level, message) => {
    if (level === 3) errors.push(message);
  });
  const evidence = path.join(root, "audit-evidence");
  fs.mkdirSync(evidence, { recursive: true });
  const capture = async (name) => {
    win.showInactive();
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.writeFileSync(
      path.join(evidence, name),
      (await win.webContents.capturePage()).toPNG(),
    );
    win.hide();
  };
  try {
    await win.loadFile(path.join(directory, "index.html"), {
      query: { view: "planner" },
    });
    win.showInactive();
    await win.webContents.executeJavaScript(
      "document.querySelector('.meetup-overlap-summary').click()",
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    await capture("availability-planner-security-release-wide.png");
    win.setSize(760, 820);
    await capture("availability-planner-security-release-narrow.png");
    win.setSize(1480, 940);
    await win.loadFile(path.join(directory, "index.html"), {
      query: { view: "key" },
    });
    await capture("physical-access-key-wide.png");
    win.setSize(760, 820);
    await capture("physical-access-key-narrow.png");
    win.setSize(1480, 940);
    await win.loadFile(path.join(directory, "index.html"), {
      query: { view: "privacy" },
    });
    await capture("privacy-cover-wide.png");
    win.setSize(760, 820);
    await capture("privacy-cover-narrow.png");
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(
      JSON.stringify({
        plannerWide: true,
        plannerNarrow: true,
        keyWide: true,
        keyNarrow: true,
        privacyWide: true,
        privacyNarrow: true,
        rendererErrors: errors,
      }),
    );
    win.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error);
    win.destroy();
    app.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
