"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { requireName } = require("../../scripts/patches/shared.js");

const HANDLER_NAME = "codex-linux-wrapper-updater";
const RUNTIME_VERSION = "codex-wrapper-updater-v2";
const KEYBINDS_ASSET = "keybinds-settings-linux.js";
const WRAPPER_UPDATES_SETTING_KEY = "codex-linux-wrapper-updates-enabled";

function warn(message, patchName) {
  console.warn(`WARN: ${message} - skipping ${patchName}`);
}

function applyMainBundlePatch(source) {
  if (source.includes(`"${HANDLER_NAME}":async`)) {
    return source;
  }

  const fsVar = requireName(source, "node:fs");
  const pathVar = requireName(source, "node:path");
  const childProcessVar =
    requireName(source, "node:child_process") ?? requireName(source, "child_process");
  if (fsVar == null || pathVar == null || childProcessVar == null) {
    warn(
      "Could not find node:fs/node:path/node:child_process deps",
      "codex wrapper updater main-bundle patch",
    );
    return source;
  }

  const helper = [
    `function codexLinuxWrapHome(){return process.env.HOME||\`\`}`,
    `function codexLinuxWrapAppId(){let i=process.env.CODEX_LINUX_APP_ID||process.env.CODEX_APP_ID||\`codex-desktop\`;return /^[A-Za-z0-9._-]+$/.test(i)?i:\`codex-desktop\`}`,
    `function codexLinuxWrapAppStateDir(){let e=process.env.CODEX_LINUX_APP_STATE_DIR;if(typeof e===\`string\`&&e.trim())return e;let h=codexLinuxWrapHome();let r=process.env.XDG_STATE_HOME||(h&&${pathVar}.join(h,\`.local\`,\`state\`));return r?${pathVar}.join(r,codexLinuxWrapAppId()):null}`,
    `function codexLinuxWrapStatePath(){let h=codexLinuxWrapHome();let d=process.env.XDG_STATE_HOME||(h&&${pathVar}.join(h,\`.local\`,\`state\`));return d?${pathVar}.join(d,\`codex-update-manager\`,\`state.json\`):null}`,
    `function codexLinuxWrapMarkerPath(){let d=codexLinuxWrapAppStateDir();return d?${pathVar}.join(d,\`codex-wrapper-updater\`,\`pending\`):null}`,
    `function codexLinuxWrapReadStatus(){try{let p=codexLinuxWrapStatePath();if(!p||!${fsVar}.existsSync(p))return null;return JSON.parse(${fsVar}.readFileSync(p,\`utf8\`))}catch{return null}}`,
    `function codexLinuxWrapShouldShow(s){return !!(s&&typeof s===\`object\`&&typeof s.candidate_wrapper_commit===\`string\`&&s.candidate_wrapper_commit.length>0)}`,
    `function codexLinuxWrapStatusPayload(){let s=codexLinuxWrapReadStatus();return{ok:!0,show:codexLinuxWrapShouldShow(s),changelog:s?s.wrapper_changelog||\`\`:\`\`,commit:s?s.candidate_wrapper_commit||\`\`:\`\`}}`,
    `function codexLinuxWrapManagerPath(){let e=process.env.CODEX_UPDATE_MANAGER_PATH;return typeof e===\`string\`&&e.trim().length>0?e:\`codex-update-manager\`}`,
    `function codexLinuxWrapSpawnCheck(){try{let c=${childProcessVar}.spawn(codexLinuxWrapManagerPath(),[\`check-wrapper\`],{stdio:\`ignore\`,detached:!0,env:process.env});c.on(\`error\`,()=>{});c.unref()}catch{}}`,
    `function codexLinuxWrapWriteMarker(){let p=codexLinuxWrapMarkerPath();if(!p)return{ok:!1,reason:\`no-marker-path\`};try{${fsVar}.mkdirSync(${pathVar}.dirname(p),{recursive:!0});${fsVar}.writeFileSync(p,new Date().toISOString());return{ok:!0,path:p}}catch(e){return{ok:!1,error:String(e?.message||e)}}}`,
    `function codexLinuxWrapInstallNow(){let m=codexLinuxWrapWriteMarker();if(!m.ok)return m;try{let a=require(\`electron\`).app;setTimeout(()=>a.exit(0),120);return{ok:!0,path:m.path}}catch(e){return{ok:!1,error:String(e?.message||e)}}}`,
    `function codexLinuxWrapHandle(e={}){let action=e&&e.action;if(action===\`status\`)return codexLinuxWrapStatusPayload();if(action===\`check\`){codexLinuxWrapSpawnCheck();return{ok:!0}}if(action===\`install\`)return codexLinuxWrapInstallNow();return{ok:!1,reason:\`unknown-action\`}}`,
    `(()=>{if(process.env.CODEX_LINUX_MULTI_LAUNCH!==\`1\`)codexLinuxWrapSpawnCheck()})();`,
  ].join("");

  const handler = `"${HANDLER_NAME}":async(e)=>codexLinuxWrapHandle(e),`;
  const needle = `"native-desktop-apps":`;
  const handlerIndex = source.indexOf(needle);
  if (handlerIndex === -1) {
    warn(`Could not find ${needle} handler map needle`, "codex wrapper updater main-bundle patch");
    return source;
  }

  const withHandler = source.slice(0, handlerIndex) + handler + source.slice(handlerIndex);
  const useStrictDouble = `"use strict";`;
  const useStrictSingle = `'use strict';`;
  const helperInsertAt = withHandler.startsWith(useStrictDouble)
    ? useStrictDouble.length
    : withHandler.startsWith(useStrictSingle)
      ? useStrictSingle.length
      : 0;
  return withHandler.slice(0, helperInsertAt) + helper + withHandler.slice(helperInsertAt);
}

function wrapperRuntimeSource() {
  return [
    `;(()=>{`,
    `const VERSION=${JSON.stringify(RUNTIME_VERSION)};`,
    `if(globalThis.codexLinuxWrapperUpdaterVersion===VERSION)return;`,
    `globalThis.codexLinuxWrapperUpdaterVersion=VERSION;`,
    `const METHOD=${JSON.stringify(HANDLER_NAME)};`,
    `let seq=0,pending=new Map,button=null,busy=false;`,
    `function onMessage(e){let t=e?.data;if(!t||typeof t!=="object"||t.type!=="fetch-response")return;let n=pending.get(t.requestId);if(!n)return;pending.delete(t.requestId);if(t.responseType==="success"){let v=null;try{v=t.bodyJsonString?JSON.parse(t.bodyJsonString):null}catch{}n.resolve({status:t.status,body:v})}else n.reject(Error(t.error||"fetch failed"))}`,
    `window.addEventListener("message",onMessage);`,
    `function dispatch(payload){let bridge=window.electronBridge,ev=new CustomEvent("codex-message-from-view",{detail:payload});if(bridge?.sendMessageFromView){ev.__codexForwardedViaBridge=!0;bridge.sendMessageFromView(payload).catch(()=>{})}window.dispatchEvent(ev)}`,
    `function post(params,timeoutMs=4000){let requestId="codex-linux-wrapper-updater-"+ ++seq;let payload={type:"fetch",hostId:"local",requestId,method:"POST",url:"vscode://codex/"+METHOD,body:JSON.stringify(params??{})};return new Promise((resolve,reject)=>{pending.set(requestId,{resolve,reject});setTimeout(()=>{pending.delete(requestId);reject(Error("timeout"))},timeoutMs);dispatch(payload)})}`,
    `function installStyle(){if(document.getElementById("codex-linux-wrapper-update-style"))return;let s=document.createElement("style");s.id="codex-linux-wrapper-update-style";s.textContent=".codex-linux-wrapper-update-btn{height:22px;padding:0 10px;margin:0 8px;display:none;align-items:center;font:500 12px/1 -apple-system,BlinkMacSystemFont,\\"Segoe UI\\",Roboto,sans-serif;color:#fff;background:#3a7d44;border:1px solid #4a9d54;border-radius:4px;cursor:pointer;pointer-events:auto;-webkit-app-region:no-drag;box-shadow:0 1px 2px rgba(0,0,0,0.18);transition:background-color 120ms ease;vertical-align:middle;line-height:1}.codex-linux-wrapper-update-btn[data-state=\\"available\\"]{display:inline-flex}.codex-linux-wrapper-update-btn.codex-linux-wrapper-update-floating{position:fixed;top:6px;right:210px;z-index:2147483000}.codex-linux-wrapper-update-btn:hover{background:#4a9d54}.codex-linux-wrapper-update-btn:disabled{opacity:.7;cursor:default}";document.head.appendChild(s)}`,
    `function findHeaderTarget(){const candidates=["header","[role=\\"banner\\"]","nav[aria-label]"];for(const sel of candidates){const el=document.querySelector(sel);if(el&&el.getBoundingClientRect().top<120&&el.offsetHeight>0)return el}return null}`,
    `function attachButton(b){if(b.parentElement)return;let host=findHeaderTarget();if(host){b.classList.remove("codex-linux-wrapper-update-floating");host.appendChild(b)}else{b.classList.add("codex-linux-wrapper-update-floating");(document.body||document.documentElement).appendChild(b)}}`,
    `function ensureButton(){if(button&&document.contains(button))return button;installStyle();let b=document.createElement("button");b.type="button";b.className="codex-linux-wrapper-update-btn";b.setAttribute("aria-label","Update Codex Desktop Linux");b.title="A newer Codex Desktop Linux build is available";b.textContent="Update";b.addEventListener("click",onClick);button=b;attachButton(b);return b}`,
    `let observer=null;function watchForHeader(){if(observer)return;observer=new MutationObserver(()=>{if(!button)return;if(button.classList.contains("codex-linux-wrapper-update-floating")){let host=findHeaderTarget();if(host){button.classList.remove("codex-linux-wrapper-update-floating");host.appendChild(button)}}else if(!button.parentElement||!document.contains(button.parentElement)){attachButton(button)}});observer.observe(document.body||document.documentElement,{childList:!0,subtree:!0})}`,
    `function setState(payload){let b=ensureButton();if(payload&&payload.show){b.dataset.state="available";b.textContent="Update";b.disabled=false;let cl=(payload.changelog||"").trim();b.title=cl?("What's new:\\n"+cl.split("\\n").slice(0,12).join("\\n")):"A newer Codex Desktop Linux build is available";return}b.dataset.state="hidden"}`,
    `async function onClick(){if(busy)return;busy=true;let b=ensureButton();b.disabled=true;b.textContent="Restarting...";try{let r=await post({action:"install"});if(r&&r.body&&r.body.ok===false){b.textContent="Update";b.title=r.body.error||r.body.reason||"Update failed";setTimeout(()=>{b.title="A newer Codex Desktop Linux build is available"},2400)}}catch{b.textContent="Update"}finally{busy=false;b.disabled=false}}`,
    `async function refresh(){try{let r=await post({action:"status"},2500);setState(r?.body||null)}catch{}}`,
    `function start(){if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",start,{once:!0});return}ensureButton();watchForHeader();post({action:"check"}).catch(()=>{});refresh();[2000,5000,9000,15000,22000].forEach(t=>setTimeout(refresh,t));setInterval(()=>{post({action:"check"}).catch(()=>{});setTimeout(refresh,4000)},30000)}`,
    `start();`,
    `})();`,
  ].join("");
}

function applyWebviewRuntimePatch(source) {
  if (source.includes(`codexLinuxWrapperUpdaterVersion=`)) {
    return source;
  }
  return source + wrapperRuntimeSource();
}

function applyWrapperUpdateSettingsPatch(source) {
  let next = source;
  if (!next.includes("wrapperUpdates:")) {
    const keyNeedle = `autoUpdateOnExit:"codex-linux-auto-update-on-exit"`;
    if (!next.includes(keyNeedle)) {
      throw new Error("could not find Linux update settings keys");
    }
    next = next.replace(
      keyNeedle,
      `${keyNeedle},wrapperUpdates:${JSON.stringify(WRAPPER_UPDATES_SETTING_KEY)}`,
    );
  }

  if (!next.includes("Check for Codex Desktop Linux updates")) {
    const toggleNeedle =
      `children:$.jsx(LinuxToggle,{settingKey:KEYS.autoUpdateOnExit,label:"Install updates when you close Codex",description:"When on, a ready update waits for Codex to close and then installs. When off, updates wait until you click Update."})`;
    if (!next.includes(toggleNeedle)) {
      throw new Error("could not find Linux update toggle");
    }
    const wrapperToggle =
      `children:[$.jsx(LinuxToggle,{settingKey:KEYS.autoUpdateOnExit,label:"Install updates when you close Codex",description:"When on, a ready update waits for Codex to close and then installs. When off, updates wait until you click Update."},"autoUpdateOnExit"),$.jsx(LinuxToggle,{settingKey:KEYS.wrapperUpdates,label:"Check for Codex Desktop Linux updates",description:"Check for Linux wrapper updates from codex-desktop-linux in addition to upstream Codex app updates.",defaultValue:!1},"wrapperUpdates")]`;
    next = next.replace(toggleNeedle, wrapperToggle);
  }

  return next;
}

function patchWrapperUpdateSettingsAssets(extractedDir) {
  try {
    const filePath = path.join(extractedDir, "webview", "assets", KEYBINDS_ASSET);
    if (!fs.existsSync(filePath)) {
      return { matched: false, changed: 0, reason: `${KEYBINDS_ASSET} is not present` };
    }
    const current = fs.readFileSync(filePath, "utf8");
    const patched = applyWrapperUpdateSettingsPatch(current);
    if (patched === current) {
      return { matched: true, changed: 0 };
    }
    fs.writeFileSync(filePath, patched, "utf8");
    return { matched: true, changed: 1 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`WARN: Wrapper update settings patch skipped: ${message}`);
    return { matched: false, changed: 0, reason: message };
  }
}

module.exports = {
  HANDLER_NAME,
  RUNTIME_VERSION,
  WRAPPER_UPDATES_SETTING_KEY,
  applyMainBundlePatch,
  applyWebviewRuntimePatch,
  applyWrapperUpdateSettingsPatch,
  patchWrapperUpdateSettingsAssets,
  descriptors: [
    {
      id: "main-handler",
      phase: "main-bundle",
      order: 20_920,
      ciPolicy: "optional",
      apply: applyMainBundlePatch,
    },
    {
      id: "webview-runtime",
      phase: "webview-asset",
      order: 20_921,
      ciPolicy: "optional",
      pattern: /^index-.*\.js$/,
      missingDescription: "webview index bundle",
      skipDescription: "codex wrapper updater webview runtime patch",
      apply: applyWebviewRuntimePatch,
    },
    {
      id: "settings-toggle",
      phase: "extracted-app",
      order: 20_922,
      ciPolicy: "optional",
      apply: (extractedDir) => patchWrapperUpdateSettingsAssets(extractedDir),
      status: (result, warnings) => {
        if (result?.matched === false) {
          return { status: "skipped-optional", reason: result.reason ?? warnings[0] ?? null };
        }
        return (result?.changed ?? 0) > 0 ? "applied" : "already-applied";
      },
    },
  ],
};
