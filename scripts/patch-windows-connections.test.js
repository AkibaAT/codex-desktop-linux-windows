"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  applyWindowsAppServerFeatureEnablementPatch,
  applyWindowsBottomPanelDefaultPatch,
  applyWindowsBottomPanelLauncherVisibilityPatch,
  applyWindowsComputerUseFeaturePatch,
  applyWindowsComputerUseInstallFlowPatch,
  applyWindowsComputerUsePluginGatePatch,
  applyWindowsComputerUseRendererAvailabilityPatch,
  applyWindowsConfigReadFeaturePrecedenceFallbackPatch,
  applyWindowsInAppBrowserUseAvailabilityPatch,
  applyWindowsRemoteConnectionConnectDiagnosticsPatch,
  applyWindowsRemoteConnectionUpdateErrorDetailPatch,
  applyWindowsRemoteControlMainProcessAutoConnectPatch,
  applyWindowsRemoteConnectionsRefreshPatch,
  applyWindowsRemoteMobileAppServerRemoteControlPatch,
  applyWindowsRemoteMobileActiveStatusPatch,
  applyWindowsRemoteMobileConversationHydrationPatch,
  applyWindowsRemoteMobileProjectlessRemoteTaskPatch,
  applyWindowsRemoteThreadBottomPanelPatch,
  applyWindowsRemoteControlAuthorizationErrorDetailPatch,
  applyWindowsRemoteControlClientSettingsVisibilityPatch,
  applyWindowsRemoteControlDeviceKeyPatch,
  applyWindowsRemoteControlEnablementBridgePatch,
  applyWindowsRemoteControlHostEnablementPatch,
  applyWindowsRemoteControlVisibilityPatch,
  windowsConnectionPatchDescriptors,
  windowsDeviceKeyProviderSource,
} = require("./patches/windows-connections.js");
const {
  parseWindowsPackageLinks,
} = require("./fetch-windows-msix.js");
const {
  isWindowsComputerUseUiEnabled,
} = require("./patches/computer-use.js");

test("Windows patch descriptor ids are unique", () => {
  const ids = windowsConnectionPatchDescriptors.map((descriptor) => descriptor.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("windows-remote-control-device-key"));
  assert.ok(ids.includes("windows-in-app-browser-use-availability"));
  assert.ok(ids.includes("windows-remote-control-enablement-bridge"));
  assert.ok(ids.includes("windows-remote-control-main-process-auto-connect"));
  assert.ok(ids.includes("windows-remote-mobile-app-server-remote-control"));
  assert.ok(ids.includes("windows-remote-control-client-settings-visibility"));
  assert.ok(ids.includes("windows-remote-mobile-conversation-hydration"));
  assert.ok(ids.includes("windows-remote-mobile-active-status"));
  assert.ok(ids.includes("windows-remote-connections-refresh"));
  assert.ok(ids.includes("windows-config-read-feature-precedence-fallback"));
  assert.ok(ids.includes("windows-bottom-panel-default-placement"));
  assert.ok(ids.includes("windows-bottom-panel-launcher-visibility"));
  assert.ok(ids.includes("windows-remote-thread-bottom-panel"));
  assert.ok(ids.includes("windows-computer-use-plugin-gate"));
  assert.ok(ids.includes("windows-computer-use-ui-feature"));
  assert.ok(ids.includes("windows-computer-use-ui-availability"));
  assert.ok(ids.includes("windows-computer-use-install-flow"));
});

test("DPAPI helper uses EncodedCommand and keeps unprotect input as stored DPAPI blob", () => {
  const source = windowsDeviceKeyProviderSource({
    childProcessVar: "childProcess",
    cryptoVar: "crypto",
    fsVar: "fs",
    osVar: "os",
    pathVar: "path",
  });
  assert.match(source, /-EncodedCommand/u);
  assert.match(source, /CODEX_DPAPI_RESULT:/u);
  assert.match(source, /t===`protect`\?Buffer\.from\(e,`utf8`\)\.toString\(`base64`\):e/u);
  assert.doesNotMatch(source, /let s=.*let s=/u);
});

test("remote-control device-key patch routes win32 to the DPAPI client", () => {
  const source = [
    "var a=(0,b.createRequire)(__filename),c=`remote-control-device-key.node`;",
    "const childProcess=require(`node:child_process`),crypto=require(`node:crypto`),fs=require(`node:fs`),os=require(`node:os`),path=require(`node:path`);",
    "function get(){if(process.platform!==`darwin`)throw Error(`Remote control device keys are only available on macOS`);return a(`./${c}`)}",
  ].join("");
  const patched = applyWindowsRemoteControlDeviceKeyPatch(source);
  assert.match(patched, /codexWindowsRemoteControlDeviceKeyClient/u);
  assert.match(patched, /process\.platform===`win32`/u);
});

test("host enablement patch can hook current Windows startup initialization", () => {
  const source = "local_remote_control_environment_id;async function start(){let ke=de.appServerConnectionRegistry.getConnection(L);if(!await n._({databasePath:n.h,open:async()=>{await ke.connect()},shouldHandleError:Q0}))return;D(`local app-server sqlite initialized`,M);try{await settings()}}";
  const patched = applyWindowsRemoteControlHostEnablementPatch(source);
  assert.match(patched, /codexWindowsRemoteControlHostEnablement/);
  assert.match(patched, /codexWindowsRemoteControlHostEnablement\(ke,de\.globalState\)/);
  assert.match(patched, /\}\)\(\);let ke=/u);
  assert.doesNotMatch(patched, /\}\)\(\),let ke=/u);
});

test("Windows visibility patch makes the remote-control settings gate visible on Windows", () => {
  const source = "function a({remoteControlConnectionsState:e,slingshotEnabled:t}){return t&&(e?.available??!0)&&e?.accessRequired!==!0}";
  const patched = applyWindowsRemoteControlVisibilityPatch(source);
  assert.match(patched, /navigator\.userAgent\.includes\(`Windows`\)/u);
  assert.match(patched, /return\(n\|\|t\)/u);
});

test("Windows Browser Use availability patch bypasses the rollout gate on Windows", () => {
  const source = "function ab(cd){let ef=(0,gh.c)(13),{hostId:ij}=cd,kl=mn(op),qr=st(`410262010`),browser_use=true;return qr&&kl&&ij}";
  const patched = applyWindowsInAppBrowserUseAvailabilityPatch(source);
  assert.match(patched, /codexWindowsInAppBrowserUseEnabled/u);
  assert.match(patched, /st\(`410262010`\)\|\|codexWindowsInAppBrowserUseEnabled\(\)/u);
});

test("Windows Browser Use availability patch handles the current plugin availability asset", () => {
  const source = "function h(t){let i=(0,l.c)(13),{hostId:o}=t,s=n(c),d=a(`410262010`),f;i[0]===o?f=i[1]:(f={featureName:`browser_use`,hostId:o},i[0]=o,i[1]=f);return d&&s}";
  const patched = applyWindowsInAppBrowserUseAvailabilityPatch(source);
  assert.match(patched, /codexWindowsInAppBrowserUseEnabled/);
  assert.match(patched, /a\(`410262010`\)\|\|codexWindowsInAppBrowserUseEnabled\(\)/);
});

test("Windows Computer Use plugin gate removes the internal-only guard", () => {
  const source = "var lt=`browser-use`,ft=`computer-use`;var Kr=[{name:ft,isAvailable:({features:e,platform:t})=>t===`darwin`&&e.computerUse,migrate:vr},{installWhenMissing:!0,name:ft,isAvailable:({buildFlavor:e,features:n,platform:r})=>B.isInternal(e)&&r===`win32`&&n.computerUse},{name:pt,isAvailable:()=>!0}];";
  const patched = applyWindowsComputerUsePluginGatePatch(source);

  assert.match(patched, /installWhenMissing:!0,name:ft,isAvailable:\(\{features:n,platform:r\}\)=>r===`win32`&&n\.computerUse/);
  assert.doesNotMatch(patched, /B\.isInternal\(e\)&&r===`win32`&&n\.computerUse/);
  assert.match(patched, /name:ft,isAvailable:\(\{features:e,platform:t\}\)=>t===`darwin`&&e\.computerUse/);
});

test("Windows Computer Use feature patch enables desktop features when opted in", () => {
  const source = "function me(e,{env:t=process.env,platform:n=process.platform}={}){return n!==`win32`||t.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE!==`1`?e:{...e,computerUse:!0,computerUseNodeRepl:!0}}";
  const patched = applyWindowsComputerUseFeaturePatch(source);

  assert.match(patched, /return n===`win32`\?\{\.\.\.e,computerUse:!0,computerUseNodeRepl:!0\}:e/);
  assert.doesNotMatch(patched, /CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE/);
});

test("Windows Computer Use renderer availability bypasses rollout gates", () => {
  const source = "function h(e){let n=(0,f.c)(15),{enabled:r,hostId:i}=e,a=r===void 0?!0:r,{isLoading:o,platform:s}=u(),c=t(i).kind===`local`,d=l(`1506311413`),h;n[0]===i?h=n[1]:(h={featureName:`computer_use`,hostId:i},n[0]=i,n[1]=h);let _=p(h),v;n[2]!==_.enabled||n[3]!==_.isLoading||n[4]!==a||n[5]!==d||n[6]!==c||n[7]!==o||n[8]!==s?(v=g({enabled:a,isComputerUseFeatureEnabled:_.enabled,isComputerUseFeatureLoading:_.isLoading,isComputerUseGateEnabled:d,isHostCompatiblePlatform:m(s),isHostLocal:c,isPlatformLoading:o,windowType:`electron`}),n[2]=_.enabled,n[3]=_.isLoading,n[4]=a,n[5]=d,n[6]=c,n[7]=o,n[8]=s,n[9]=v):v=n[9];return v}";
  const patched = applyWindowsComputerUseRendererAvailabilityPatch(source);

  assert.match(patched, /isComputerUseFeatureEnabled:s===`windows`\|\|_\.enabled/);
  assert.match(patched, /isComputerUseGateEnabled:s===`windows`\|\|d/);
  assert.match(patched, /isHostCompatiblePlatform:s===`windows`\|\|m\(s\)/);
});

test("Windows Computer Use install flow allows Windows user agents", () => {
  const source = "te=ne({featureName:`computer_use`,hostId:t}),z=B({hostId:t,isHostLocal:m}),U=!te.isLoading&&te.enabled,G=z.available,";
  const patched = applyWindowsComputerUseInstallFlowPatch(source);

  assert.match(patched, /U=!te\.isLoading&&te\.enabled\|\|navigator\.userAgent\.includes\(`Windows`\),/);
});

test("Windows Computer Use UI opt-in honours explicit settings file", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-windows-computer-use-settings-"));
  const settingsFile = path.join(tempRoot, "settings.json");
  fs.writeFileSync(settingsFile, JSON.stringify({ "codex-windows-computer-use-ui-enabled": true }), "utf8");

  assert.equal(isWindowsComputerUseUiEnabled({
    CODEX_WINDOWS_SETTINGS_FILE: settingsFile,
  }), true);
});

test("Windows Computer Use UI opt-in honours build-host config path", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-windows-computer-use-config-"));
  const configHome = path.join(tempRoot, "config");
  const settingsDir = path.join(configHome, "codex-cua-lab");
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(
    path.join(settingsDir, "settings.json"),
    JSON.stringify({ "codex-windows-computer-use-ui-enabled": true }),
    "utf8",
  );

  assert.equal(isWindowsComputerUseUiEnabled({
    CODEX_WINDOWS_APP_ID: "codex-cua-lab",
    XDG_CONFIG_HOME: configHome,
  }), true);
  assert.equal(isWindowsComputerUseUiEnabled({
    CODEX_WINDOWS_APP_ID: "codex-cua-lab",
    XDG_CONFIG_HOME: configHome,
    CODEX_WINDOWS_ENABLE_COMPUTER_USE_UI: "0",
  }), true);
});

test("Windows app-server feature enablement patch adds remote_control to the current feature list", () => {
  const source = "statsig_default_enable_features;set-experimental-feature-enablement-for-host;var oI=[`apps`,`memories`,`plugins`,`tool_call_mcp_elicitation`,`tool_suggest`],sI=`4218407052`,cI=`remote_plugin`;function lI(){return oI}";
  const patched = applyWindowsAppServerFeatureEnablementPatch(source);
  assert.match(patched, /`tool_suggest`,`remote_control`\]/);
});

test("Windows remote-control enablement bridge supports controlling other devices", () => {
  const source = "var NF=`[remote-connections/slingshot-gate-bridge]`;function PF(){let e=(0,Z.c)(3),t=qa(),n,r;return e[0]===t?(n=e[1],r=e[2]):(n=()=>{Pi(`set-remote-control-connections-enabled`,{params:{enabled:t}}).catch(e=>{G.warning(`${NF} sync_failed`,{safe:{enabled:t},sensitive:{error:e}})})},r=[t],e[0]=t,e[1]=n,e[2]=r),(0,$.useEffect)(n,r),null}";
  const patched = applyWindowsRemoteControlEnablementBridgePatch(source);

  assert.match(patched, /codexWindowsRemoteControlEnablementBridge/u);
  assert.match(patched, /codexWindowsRemoteControlSelfAutoConnect/u);
  assert.match(patched, /navigator\.userAgent\.includes\(`Windows`\)/u);
  assert.doesNotMatch(patched, /navigator\.userAgent\.includes\(`Linux`\)/u);
  assert.match(patched, /set-remote-control-connections-enabled`,\{params:\{enabled:t\}\}\)\.then\(async/u);
  assert.match(patched, /set-remote-connection-auto-connect`,\{params:\{hostId:e\.hostId,autoConnect:!0\}\}/u);
});

test("Windows main-process remote-control refresh auto-connects discovered hosts", () => {
  const source = "async refreshRemoteControlConnections(){let r=this.filterLocalRemoteControlConnection(await this.loadRemoteControlConnections()).map(e=>({...e,autoConnect:this.getAutoConnectForRemoteConnection(e)}));return this.sharedObjectRepository.set(`remote_control_connections`,r),this.sharedObjectRepository.get(`remote_control_connections_state`)?.clientAuthorized===!0?this.connectRemoteConnectionsAndLogFailures(r.filter(e=>e.autoConnect).map(e=>e.hostId)):null,sJ().info(`refresh_remote_control_completed`,{safe:{autoConnectConnectionCount:r.filter(e=>e.autoConnect).length},sensitive:{}}),{remoteControlConnections:r}}";
  const patched = applyWindowsRemoteControlMainProcessAutoConnectPatch(source);

  assert.match(patched, /codexWindowsRemoteControlMainProcessAutoConnect/u);
  assert.match(patched, /process\.platform===`win32`/u);
  assert.match(patched, /hostId\.startsWith\(`remote-control:`\).*?\?!0:this\.getAutoConnectForRemoteConnection/su);
});

test("Windows app-server launch args enable remote-control protocol support", () => {
  const source = "new X({args:[`app-server`,`--analytics-default-enabled`],env:y});";
  const patched = applyWindowsRemoteMobileAppServerRemoteControlPatch(source);

  assert.match(patched, /codexWindowsRemoteMobileAppServerArgs/u);
  assert.match(patched, /process\.platform===`win32`/u);
  assert.match(patched, /`--remote-control`/u);
  assert.match(patched, /args:codexWindowsRemoteMobileAppServerArgs\(\)/u);
});

test("Windows remote-control settings show the control-other-devices tab", () => {
  const source = "settings.remoteConnections.tabs.accessOtherDevices;function er(){let e=F(M),{platform:a}=ue(),o=oe(`782640499`),c=i.formatMessage({id:`settings.remoteConnections.refresh`}),[l]=v(`remote_connections`),[u]=v(`remote_control_connections`),ye=he(),be=!o,Le=be&&(ye||!1),Nt=[...Le?Ot:[]];return Nt}";
  const patched = applyWindowsRemoteControlClientSettingsVisibilityPatch(source);

  assert.match(patched, /codexWindowsRemoteControlClientSettingsVisibility/u);
  assert.match(patched, /be=\(a===`windows`\|\|!o\)/u);
  assert.doesNotMatch(patched, /be=!o/u);
});

test("Windows remote-control settings handles current control-other-devices gate shape", () => {
  const source = "settings.remoteConnections.tabs.accessOtherDevices;function er(){let e=j(te),n=ee(U),r=ie(),i=z(),{platform:a}=ue(),o=re(`782640499`),s=i.formatMessage({id:`settings.remoteConnections.refresh`,defaultMessage:`Refresh`}),[c]=v(`remote_connections`),[l]=v(`remote_control_connections`),[p]=v(`remote_control_connections_state`),X=me(),be=!o,xe=c==null,Se=X&&l==null,Le=be&&(X||!1),Be=he({selectedConnectionsTab:de,showControlOtherDevices:be,showControlThisMacTab:Ie,showRemoteControlConnectionsSection:X,showRemoteSshConnections:!0});return Be}";
  const patched = applyWindowsRemoteControlClientSettingsVisibilityPatch(source);

  assert.match(patched, /codexWindowsRemoteControlClientSettingsVisibility/u);
  assert.match(patched, /be=\(a===`windows`\|\|!o\)/u);
  assert.doesNotMatch(patched, /be=!o/u);
});

test("Windows remote-mobile conversation hydration ports Linux runtime markers", () => {
  const source = "e.resumeState===`needs_resume`&&(e.threadRuntimeStatus=p);class T{onNotification(e,t){let n={method:e,params:t};switch(n.method){case`turn/started`:{let{threadId:e,turn:t}=n.params,r=j(e),i=this.conversations.get(r);if(this.captureBrowserUseTurnRoute(r,t.id),this.captureComputerUseTurnRoute(r,t.id),!i){R.error(`Received turn/started for unknown conversation`,{safe:{conversationId:r},sensitive:{}});break}this.markConversationStreaming(r),this.updateConversationState(r,e=>{});break}case`turn/completed`:{if(this.frameTextDeltaQueue.drainBefore(()=>{this.onNotification(`turn/completed`,n.params)}))break;let{threadId:e,turn:t}=n.params,r=j(e);if(!this.conversations.get(r)){this.browserUseTurnRouteIdsByConversationId.get(r)?.has(t.id)===!0&&this.releaseBrowserUseTurnRoute(r,t.id),this.computerUseTurnRouteIdsByConversationId.get(r)?.has(t.id)===!0&&this.releaseComputerUseTurnRoute(r,t.id),R.error(`Received turn/completed for unknown conversation`,{safe:{conversationId:r},sensitive:{}});break}break}case`item/started`:{let{item:e,threadId:t,turnId:r}=n.params,i=j(t);if(!this.conversations.get(i)){R.error(`Received item/started for unknown conversation`,{safe:{conversationId:i},sensitive:{}});break}this.markConversationStreaming(i),this.updateConversationState(i,t=>{});break}case`item/completed`:{if(this.frameTextDeltaQueue.drainBefore(()=>{this.onNotification(`item/completed`,n.params)}))break;let{item:e,threadId:t,turnId:r}=n.params,i=j(t);if(!this.conversations.get(i)){R.error(`Received item/completed for unknown conversation`,{safe:{conversationId:i},sensitive:{}});break}this.updateConversationState(i,t=>{});break}}}}";
  const patched = applyWindowsRemoteMobileConversationHydrationPatch(source);

  assert.match(patched, /codexWindowsRemoteMobileHydrateUnknownTurn/u);
  assert.match(patched, /codexWindowsRemoteMobileNotificationQueue/u);
  assert.doesNotMatch(patched, /codexLinuxRemoteMobile/u);
});

test("Windows remote-mobile conversation hydration handles current upstream turn-start shape", () => {
  const source = "class T{onNotification(e,t){let n={method:e,params:t};switch(n.method){case`turn/started`:{let{threadId:e,turn:t}=n.params,r=I(e);if(!this.conversations.get(r)){z.error(`Received turn/started for unknown conversation`,{safe:{conversationId:r},sensitive:{}});break}this.markConversationStreaming(r),this.updateConversationState(r,e=>{});break}}}readThread(e,t){}upsertConversationFromThread(e){}}";
  const patched = applyWindowsRemoteMobileConversationHydrationPatch(source);

  assert.match(patched, /codexWindowsRemoteMobileHydrateUnknownTurn/u);
  assert.match(patched, /codexWindowsRemoteMobilePendingNotifications/u);
  assert.match(patched, /this\.readThread\(r,\{includeTurns:!1\}\)/u);
  assert.match(patched, /this\.upsertConversationFromThread\(t\)/u);
  assert.doesNotMatch(patched, /Received turn\/started for unknown conversation`,\{safe:\{conversationId:r\},sensitive:\{\}\}\);break\}this\.markConversationStreaming/u);
});

test("Windows config read retries without cwd on feature precedence resolution failure", () => {
  const source = "async function Jt(e,t){return Yt((await e.sendRequest(`config/read`,{includeLayers:!1,cwd:t??null})).config)}";
  const patched = applyWindowsConfigReadFeaturePrecedenceFallbackPatch(source);

  assert.match(patched, /codexWindowsConfigReadFeaturePrecedenceFallback/u);
  assert.match(patched, /navigator\.userAgent\.includes\(`Windows`\)/u);
  assert.match(patched, /failed to resolve feature override precedence/u);
  assert.match(patched, /sendRequest\(`config\/read`,\{includeLayers:!1,cwd:null\}\)/u);
  assert.match(patched, /throw e/u);
});

test("Windows remote-mobile active status ports Linux renderer marker", () => {
  const source = "function a({latestTurnStatus:e,resumeState:t,streamRole:n,threadRuntimeStatus:r}){return n==null?t===`needs_resume`?`needs-resume`:`read-only`:n.role===`follower`?`follower`:r?.type===`active`||e===`inProgress`?`active`:`inactive`}";
  const patched = applyWindowsRemoteMobileActiveStatusPatch(source);

  assert.match(patched, /codexWindowsRemoteMobileActiveStatus/u);
  assert.doesNotMatch(patched, /codexLinuxRemoteMobile/u);
});

test("Windows remote-connections refresh ports Linux refresh marker", () => {
  const source = "refresh-remote-connections;Qn=15e3;(0,Z.useEffect)(()=>{let e=null,t=!1,n=async()=>{if(!t){t=!0,e=new AbortController;try{await r(e.signal)}finally{e=null,t=!1}}},i=window.setInterval(()=>{n()},Qn);return()=>{e?.abort(),window.clearInterval(i)}},[]);";
  const patched = applyWindowsRemoteConnectionsRefreshPatch(source);

  assert.match(patched, /codexWindowsRemoteConnectionsRefreshNow/u);
  assert.match(patched, /Qn=5e3/u);
  assert.doesNotMatch(patched, /codexLinuxRemote/u);
});

test("Windows projectless remote tasks ports Linux grouping marker", () => {
  const source = "No owner repo found for remote task;function a(b,c,d){let e=f(b,c),g=h(e);if(!g){R.warning(`No owner repo found for remote task`,{safe:{taskId:b.task.id},sensitive:{}});return}return g}";
  const patched = applyWindowsRemoteMobileProjectlessRemoteTaskPatch(source);

  assert.match(patched, /codexWindowsRemoteMobileProjectlessRemoteTaskId/u);
  assert.doesNotMatch(patched, /codexLinuxRemoteMobile/u);
});

test("Windows remote-thread routes can open the bottom terminal panel", () => {
  const source = "import{Ia as r,Ma as i}from\"./app-server-manager-signals-Bpaj8VHp.js\";var Te=`terminal:`;function qe(e){switch(e.value.routeKind){case`home`:{let t=e.get(E),n=e.get(T);return{conversationId:`home:${n}:${t}`,conversationTitle:null,cwd:t,hostId:n}}case`local-thread`:return{conversationId:e.value.conversationId,conversationTitle:e.get(S,e.value.conversationId),cwd:e.get(E),hostId:e.get(T)};case`new-thread-panel`:case`remote-thread`:case`other`:return null}}";
  const patched = applyWindowsRemoteThreadBottomPanelPatch(source);

  assert.match(patched, /codexWindowsRemoteThreadBottomPanel/u);
  assert.match(patched, /case`remote-thread`:return\{conversationId:`remote:\$\{e\.value\.taskId\}`,conversationTitle:null,cwd:null,hostId:e\.get\(T\)\}/u);
  assert.doesNotMatch(patched, /case`new-thread-panel`:case`remote-thread`:case`other`:return null/u);
});

test("Windows remote-thread bottom panel handles current upstream route aliases", () => {
  const source = "var Ee=`terminal:`;function Ze(e){switch(e.value.routeKind){case`home`:{let t=e.get(w),n=e.get(C);return{conversationId:`home:${n}:${t}`,conversationTitle:null,cwd:t,hostId:n}}case`local-thread`:return{conversationId:e.value.conversationId,conversationTitle:e.get(S,e.value.conversationId),cwd:e.get(w),hostId:e.get(C)};case`new-thread-panel`:case`remote-thread`:case`other`:return null}}";
  const patched = applyWindowsRemoteThreadBottomPanelPatch(source);

  assert.match(patched, /codexWindowsRemoteThreadBottomPanel/u);
  assert.match(patched, /case`remote-thread`:return\{conversationId:`remote:\$\{e\.value\.taskId\}`,conversationTitle:null,cwd:null,hostId:e\.get\(C\)\}/u);
});

test("Windows terminal toggles default to the bottom panel even when the launcher setting is false", () => {
  const source = "var Te=`terminal:`;function ze(e){return e.get(h)===!1?`right`:`bottom`}";
  const patched = applyWindowsBottomPanelDefaultPatch(source);

  assert.match(patched, /codexWindowsBottomPanelDefault/u);
  assert.match(patched, /navigator\.userAgent\.includes\(`Windows`\).*?\?`bottom`/u);
  assert.match(patched, /e\.get\(h\)===!1\?`right`:`bottom`/u);
});

test("Windows shows the bottom panel launcher even if the saved launcher setting is false", () => {
  const source = "toggle-bottom-panel;toggle-bottom-panel-launcher;function kt(){let o=D(te)!==!1,s=E(G,`toggleBottomPanel`)}function jt(){let n=D(te)!==!1;return n}";
  const patched = applyWindowsBottomPanelLauncherVisibilityPatch(source);

  assert.match(patched, /codexWindowsBottomPanelLauncherVisible/u);
  assert.equal((patched.match(/navigator\.userAgent\.includes\(`Windows`\)/gu) ?? []).length, 2);
  assert.doesNotMatch(patched, /=D\(te\)!==!1/u);
});

test("Windows bottom panel launcher visibility handles current upstream signal hook aliases", () => {
  const source = "toggle-bottom-panel;toggle-bottom-panel-launcher;function jt(){let o=b(ce)!==!1,s=S(U,`toggleBottomPanel`)}function Nt(){let n=b(ce)!==!1;return n}";
  const patched = applyWindowsBottomPanelLauncherVisibilityPatch(source);

  assert.match(patched, /codexWindowsBottomPanelLauncherVisible/u);
  assert.equal((patched.match(/navigator\.userAgent\.includes\(`Windows`\)/gu) ?? []).length, 2);
  assert.doesNotMatch(patched, /=b\(ce\)!==!1/u);
});

test("remote-control authorization toast can surface the underlying error", () => {
  const source = "authorize-remote-control-connections`,{onSuccess:()=>{},onError:e=>{x.get(y).danger(z.formatMessage({id:`settings.remoteControlConnections.authorize.error`,defaultMessage:`Failed to authorize remote control`,description:`Toast shown when remote control authorization fails`}),{id:w})}}";
  const patched = applyWindowsRemoteControlAuthorizationErrorDetailPatch(source);
  assert.match(patched, /codexWindowsRemoteControlAuthorizeErrorMessage\(e\)\?\?/u);
});

test("remote-control authorization toast patch handles current account-mismatch ternary", () => {
  const source = "authorize-remote-control-connections`,{onSuccess:()=>{},onError:t=>{e.get(q).danger(t instanceof ne&&t.errorCode===`remote_control_enrollment_account_mismatch`?i.formatMessage({id:`settings.remoteControlConnections.authorize.accountMismatch`,defaultMessage:`Remote control authorization used a different account`,description:`Toast shown when remote control authorization completes for a different account`}):i.formatMessage({id:`settings.remoteControlConnections.authorize.error`,defaultMessage:`Failed to authorize remote control`,description:`Toast shown when remote control authorization fails`}),{id:Yn})}}";
  const patched = applyWindowsRemoteControlAuthorizationErrorDetailPatch(source);
  assert.match(patched, /codexWindowsRemoteControlAuthorizeErrorMessage\(t\)\?\?/);
  assert.match(patched, /remote_control_enrollment_account_mismatch/);
});

test("remote connection update toast can surface the underlying error", () => {
  const source = "set-remote-connection-auto-connect`,{onError:(e,{variables:t})=>{x.get(y).danger(z.formatMessage({id:`settings.remoteConnections.connectToggle.error`,defaultMessage:`Failed to update connection`,description:`Toast shown when remote connection toggle fails`}),{id:w})}}";
  const patched = applyWindowsRemoteConnectionUpdateErrorDetailPatch(source);
  assert.match(patched, /codexWindowsRemoteConnectionUpdateErrorMessage\(e\)\?\?/u);
});

test("remote connection connect diagnostics preserves connect failure details", () => {
  const source = [
    "class X{",
    "async connectRemoteConnection(a){try{}catch(e){throw l().warning(`connect_failed`,{safe:{},sensitive:{error:e,hostId:a}}),Error(`Failed to connect remote connection.`)}}",
    "async setRemoteConnectionAutoConnect(a,b){let c=this.getRemoteConnectionAutoConnectByHostId();this.appState.set(d.wn.REMOTE_CONNECTION_AUTO_CONNECT_BY_HOST_ID,{...c,[a]:b});let e=await this.refreshRemoteConnectionsForHostId(a);return b?{remoteConnections:e,...await this.ensureRemoteConnectionConnected(a)}:{remoteConnections:e,...await this.disconnectRemoteConnection(a)}}}",
  ].join("");
  const patched = applyWindowsRemoteConnectionConnectDiagnosticsPatch(source);
  assert.match(patched, /Failed to connect remote connection: \$\{e\.message\}/u);
  assert.match(patched, /refreshRemoteControlClientAuthorizationState/u);
});

test("MSIX lookup parser selects OpenAI Codex x64 MSIX links", () => {
  const html = [
    '<a href="https://example.invalid/ignore.msix">Other_1.0.0.0_x64__abc.msix</a>',
    '<a href="https://tlu.dl.delivery.mp.microsoft.com/a.msix">OpenAI.Codex_26.1.0.0_arm64__2p2nqsd0c76g0.msix</a>',
    '<a href="https://tlu.dl.delivery.mp.microsoft.com/b.msix?x=1&amp;y=2">OpenAI.Codex_26.519.2736.0_x64__2p2nqsd0c76g0.msix</a>',
  ].join("");
  const links = parseWindowsPackageLinks(html);
  assert.equal(links.length, 1);
  assert.equal(links[0].filename, "OpenAI.Codex_26.519.2736.0_x64__2p2nqsd0c76g0.msix");
  assert.match(links[0].href, /&y=2/u);
});
