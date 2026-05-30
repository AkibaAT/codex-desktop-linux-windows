"use strict";

const {
  applyLinuxAppServerFeatureEnablementPatch,
} = require("./webview-assets.js");
const {
  applyBrowserUseNodeReplApprovalPatch,
} = require("./main-process.js");
const {
  applyWindowsComputerUseFeaturePatch,
  applyWindowsComputerUseInstallFlowPatch,
  applyWindowsComputerUsePluginGatePatch,
  applyWindowsComputerUseRendererAvailabilityPatch,
  isWindowsComputerUseUiEnabled,
} = require("./computer-use.js");
const {
  applyLinuxRemoteControlClientAccountCompatibilityPatch,
  applyLinuxRemoteControlClientRevocationRecoveryPatch,
  applyLinuxRemoteControlEnablementBridgePatch,
  applyLinuxRemoteConnectionsRefreshPatch,
  applyLinuxRemoteMobileActiveStatusPatch,
  applyLinuxRemoteMobileConversationHydrationPatch,
  applyLinuxRemoteMobileProjectlessRemoteTaskPatch,
} = require("../../linux-features/remote-mobile-control/patch.js");

const WINDOWS_TARGET_SUMMARY = "windows-connections";
const DEVICE_KEY_CLIENT_MARKER = "codexWindowsRemoteControlDeviceKeyClient";
const IN_APP_BROWSER_USE_MARKER = "codexWindowsInAppBrowserUseEnabled";
const CLIENT_SETTINGS_VISIBILITY_MARKER = "codexWindowsRemoteControlClientSettingsVisibility";
const AUTHORIZATION_DIAGNOSTICS_MARKER = "windows_remote_control_authorize_failed_detail";
const AUTHORIZATION_ERROR_MESSAGE_MARKER = "codexWindowsRemoteControlAuthorizeErrorMessage";
const REMOTE_CONNECTION_CONNECT_DIAGNOSTICS_MARKER =
  "windows_remote_control_connect_failure_auth_refresh_failed";
const REMOTE_CONNECTION_UPDATE_ERROR_MESSAGE_MARKER =
  "codexWindowsRemoteConnectionUpdateErrorMessage";
const REMOTE_CONTROL_MAIN_PROCESS_AUTO_CONNECT_MARKER =
  "codexWindowsRemoteControlMainProcessAutoConnect";
const REMOTE_MOBILE_APP_SERVER_REMOTE_CONTROL_MARKER =
  "codexWindowsRemoteMobileAppServerArgs";
const REMOTE_MOBILE_APP_SERVER_ARGS_NEEDLE =
  "args:[`app-server`,`--analytics-default-enabled`]";
const REMOTE_THREAD_BOTTOM_PANEL_MARKER =
  "codexWindowsRemoteThreadBottomPanel";
const BOTTOM_PANEL_DEFAULT_MARKER =
  "codexWindowsBottomPanelDefault";
const BOTTOM_PANEL_LAUNCHER_MARKER =
  "codexWindowsBottomPanelLauncherVisible";
const CONFIG_READ_FALLBACK_MARKER = "codexWindowsConfigReadFeaturePrecedenceFallback";
const DEVICE_KEY_GUARD =
  "if(process.platform!==`darwin`)throw Error(`Remote control device keys are only available on macOS`);";
const DEVICE_KEY_GUARD_REPLACEMENT =
  "if(process.platform===`win32`)return codexWindowsRemoteControlDeviceKeyClient();if(process.platform!==`darwin`)throw Error(`Remote control device keys are only available on macOS`);";

function windowsComputerUseUiEnabled(context) {
  return context?.enableComputerUseUi ?? isWindowsComputerUseUiEnabled();
}
const DEVICE_KEY_REQUIRE_NEEDLE =
  /(?:var|let|const)\s+[A-Za-z_$][\w$]*=\(0,[A-Za-z_$][\w$]*\.createRequire\)\(__filename\),[A-Za-z_$][\w$]*=`remote-control-device-key\.node`/u;
const REMOTE_CONTROL_VISIBILITY_NEEDLE =
  "function a({remoteControlConnectionsState:e,slingshotEnabled:t}){return t&&(e?.available??!0)&&e?.accessRequired!==!0}";
const REMOTE_CONTROL_VISIBILITY_REPLACEMENT =
  "function a({remoteControlConnectionsState:e,slingshotEnabled:t}){let n=typeof navigator!=`undefined`&&navigator.userAgent.includes(`Windows`);return(n||t)&&(n||(e?.available??!0))&&e?.accessRequired!==!0}";
const REMOTE_CONTROL_SETTINGS_VISIBILITY_NEEDLE =
  /function ([A-Za-z_$][\w$]*)\(\{remoteControlConnectionsState:([A-Za-z_$][\w$]*),slingshotEnabled:([A-Za-z_$][\w$]*)\}\)\{return \3&&\(\2\?\.available\?\?!0\)(?:&&\2\?\.accessRequired!==!0)?\}/u;
const REMOTE_CONTROL_LOAD_GATE_NEEDLE =
  /function ([A-Za-z_$][\w$]*)\(\)\{return ([A-Za-z_$][\w$]*)\(`1042620455`\)\}/u;
const REMOTE_CONTROL_WINDOWS_COPY_REPLACEMENTS = [
  ["defaultMessage:`Mac`", "defaultMessage:`Windows`"],
  ["Keep this Mac awake", "Keep this Windows PC awake"],
  ["Keep Mac awake", "Keep Windows PC awake"],
  ["Devices that can control this Mac", "Devices that can control this Windows PC"],
  ["Control this Mac from your phone or other device", "Control this Windows PC from your phone or other device"],
  ["Add device to control this Mac remotely", "Add device to control this Windows PC remotely"],
  ["Control other devices from this Mac", "Control other devices from this Windows PC"],
  ["Authorize this Mac to control other devices signed in to your ChatGPT account", "Authorize this Windows PC to control other devices signed in to your ChatGPT account"],
  ["Allow this Mac to be discovered and controlled", "Allow this Windows PC to be discovered and controlled"],
  ["Control this Mac", "Control this Windows PC"],
  ["Devices you can control from this Mac", "Devices you can control from this Windows PC"],
  ["SSH connections from this Mac", "SSH connections from this Windows PC"],
  ["Use your Mac apps while locked", "Use your Windows apps while locked"],
  ["Control Mac apps from your phone", "Control Windows apps from your phone"],
  ["Let Codex control the apps on your Mac.", "Let Codex control apps on this Windows PC."],
  ["Let Codex control the apps on your Mac", "Let Codex control apps on this Windows PC"],
  ["Connect a device to this Mac", "Connect a device to this Windows PC"],
  ["Connect your phone to this Mac", "Connect your phone to this Windows PC"],
  ["this Mac", "this Windows PC"],
  ["local Mac", "local Windows PC"],
];

function requireName(source, moduleName) {
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`([A-Za-z_$][\\w$]*)=require\\(\`${escaped}\`\\)`));
  return match?.[1] ?? null;
}

function windowsDeviceKeyProviderSource({ childProcessVar, cryptoVar, fsVar, osVar, pathVar }) {
  return [
    `const codexWindowsRemoteControlChildProcess=${childProcessVar},codexWindowsRemoteControlCrypto=${cryptoVar},codexWindowsRemoteControlFs=${fsVar},codexWindowsRemoteControlOs=${osVar},codexWindowsRemoteControlPath=${pathVar};`,
    "function codexWindowsRemoteControlDeviceKeyStorePath(){",
    "let e=process.env.APPDATA&&process.env.APPDATA.trim()?process.env.APPDATA.trim():process.env.USERPROFILE?codexWindowsRemoteControlPath.join(process.env.USERPROFILE,`AppData`,`Roaming`):codexWindowsRemoteControlOs.homedir()?codexWindowsRemoteControlPath.join(codexWindowsRemoteControlOs.homedir(),`AppData`,`Roaming`):null;",
    "if(e==null)throw Error(`Windows remote control device keys require APPDATA, USERPROFILE, or a home directory`);",
    "codexWindowsRemoteControlFs.mkdirSync(codexWindowsRemoteControlPath.join(e,`codex-desktop`),{recursive:!0,mode:448});",
    "return codexWindowsRemoteControlPath.join(e,`codex-desktop`,`remote-control-device-keys-v1.json`)}",
    "function codexWindowsRemoteControlPublicDeviceKey(e){return{algorithm:e.algorithm,keyId:e.keyId,protectionClass:e.protectionClass,publicKeySpkiDerBase64:e.publicKeySpkiDerBase64}}",
    "function codexWindowsReadRemoteControlDeviceKeyStore(){let e=codexWindowsRemoteControlDeviceKeyStorePath();if(!codexWindowsRemoteControlFs.existsSync(e))return{keys:{}};try{let t=JSON.parse(codexWindowsRemoteControlFs.readFileSync(e,`utf8`));return t&&typeof t==`object`&&!Array.isArray(t)&&t.keys&&typeof t.keys==`object`&&!Array.isArray(t.keys)?t:{keys:{}}}catch{return{keys:{}}}}",
    "function codexWindowsWriteRemoteControlDeviceKeyStore(e){let t=codexWindowsRemoteControlDeviceKeyStorePath(),n=`${t}.tmp-${process.pid}-${Date.now()}`;try{codexWindowsRemoteControlFs.writeFileSync(n,JSON.stringify(e,null,2)+`\\n`,{encoding:`utf8`,mode:384}),codexWindowsRemoteControlFs.chmodSync(n,384),codexWindowsRemoteControlFs.renameSync(n,t),codexWindowsRemoteControlFs.chmodSync(t,384)}catch(e){try{codexWindowsRemoteControlFs.rmSync(n,{force:!0})}catch{}throw e}}",
    "function codexWindowsRemoteControlDpapi(e,t){let n=t===`protect`?Buffer.from(e,`utf8`).toString(`base64`):e,r=`try{[void][System.Security.Cryptography.ProtectedData]}catch{try{Add-Type -AssemblyName System.Security -ErrorAction Stop}catch{}try{Add-Type -AssemblyName System.Security.Cryptography.ProtectedData -ErrorAction SilentlyContinue}catch{}}[void][System.Security.Cryptography.ProtectedData];`,i=[`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$InformationPreference='SilentlyContinue';`,r,`$b=[Convert]::FromBase64String('`,n,`');`,t===`protect`?`$p=[System.Security.Cryptography.ProtectedData]::Protect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);`:`$p=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);`,`[Console]::Out.WriteLine('CODEX_DPAPI_RESULT:'+[Convert]::ToBase64String($p))`].join(``),a=Buffer.from(i,`utf16le`).toString(`base64`),o=codexWindowsRemoteControlChildProcess.spawnSync(`powershell.exe`,[`-NoProfile`,`-ExecutionPolicy`,`Bypass`,`-EncodedCommand`,a],{encoding:`utf8`,windowsHide:!0});if(o.error)throw o.error;if(o.status!==0)throw Error(`Windows DPAPI ${t} failed: ${(o.stderr||o.stdout||``).trim()}`);let s=(o.stdout||``).match(/CODEX_DPAPI_RESULT:([A-Za-z0-9+/=]+)/)?.[1]??``;if(!s)throw Error(`Windows DPAPI ${t} returned no data`);return t===`protect`?s:Buffer.from(s,`base64`).toString(`utf8`)}",
    "function codexWindowsRemoteControlDeviceKeyClient(){return{createDeviceKey:async()=>{let e=codexWindowsReadRemoteControlDeviceKeyStore(),{publicKey:t,privateKey:n}=(0,codexWindowsRemoteControlCrypto.generateKeyPairSync)(`ec`,{namedCurve:`P-256`}),r=(0,codexWindowsRemoteControlCrypto.randomUUID)(),i=t.export({type:`spki`,format:`der`}).toString(`base64`),a=n.export({type:`pkcs8`,format:`pem`}),o={algorithm:`ecdsa_p256_sha256`,keyId:r,protectionClass:`os_protected_nonextractable`,publicKeySpkiDerBase64:i,privateKeyPkcs8PemDpapiBase64:codexWindowsRemoteControlDpapi(a,`protect`),createdAt:new Date().toISOString()};return e.keys={...e.keys,[r]:o},codexWindowsWriteRemoteControlDeviceKeyStore(e),codexWindowsRemoteControlPublicDeviceKey(o)},deleteDeviceKey:async e=>{let t=codexWindowsReadRemoteControlDeviceKeyStore();t.keys&&delete t.keys[e],codexWindowsWriteRemoteControlDeviceKeyStore(t)},getDeviceKeyPublic:async e=>{let t=codexWindowsReadRemoteControlDeviceKeyStore().keys?.[e];if(t==null)throw Error(`Windows remote control device key not found`);return codexWindowsRemoteControlPublicDeviceKey(t)},signDeviceKey:async(e,t)=>{let n=codexWindowsReadRemoteControlDeviceKeyStore().keys?.[e];if(n==null)throw Error(`Windows remote control device key not found`);let r=(0,codexWindowsRemoteControlCrypto.createPrivateKey)(codexWindowsRemoteControlDpapi(n.privateKeyPkcs8PemDpapiBase64,`unprotect`)),i=(0,codexWindowsRemoteControlCrypto.sign)(`sha256`,t,r).toString(`base64`);return{algorithm:n.algorithm,signatureDerBase64:i}}}}",
  ].join("");
}

function applyWindowsRemoteControlDeviceKeyPatch(source) {
  if (source.includes(DEVICE_KEY_CLIENT_MARKER)) return source;
  const childProcessVar = requireName(source, "node:child_process");
  const cryptoVar = requireName(source, "node:crypto");
  const fsVar = requireName(source, "node:fs");
  const osVar = requireName(source, "node:os");
  const pathVar = requireName(source, "node:path");
  if (childProcessVar == null || cryptoVar == null || fsVar == null || osVar == null || pathVar == null) {
    console.warn("WARN: Could not find Node module aliases - skipping Windows remote-control device-key patch");
    return source;
  }
  const insertionNeedle = source.match(DEVICE_KEY_REQUIRE_NEEDLE)?.[0] ?? null;
  if (insertionNeedle == null || !source.includes(DEVICE_KEY_GUARD)) {
    console.warn("WARN: Could not find remote-control device-key needles - skipping Windows patch");
    return source;
  }
  return source
    .replace(insertionNeedle, `${windowsDeviceKeyProviderSource({ childProcessVar, cryptoVar, fsVar, osVar, pathVar })}${insertionNeedle}`)
    .replace(DEVICE_KEY_GUARD, DEVICE_KEY_GUARD_REPLACEMENT);
}

function applyWindowsRemoteControlConfigPreservationPatch(source) {
  const already =
    /async function [A-Za-z_$][\w$]*\(\{codexHome:[A-Za-z_$][\w$]*,hostConfig:([A-Za-z_$][\w$]*),logger:[A-Za-z_$][\w$]*=[^}]*\}\)\{if\(\1\.kind===`local`&&(?:process\.platform!==`linux`&&process\.platform!==`win32`|process\.platform!==`win32`)\)try\{/u;
  if (already.test(source)) return source;
  let patched = source.replace(
    /async function [A-Za-z_$][\w$]*\(\{codexHome:[A-Za-z_$][\w$]*,hostConfig:([A-Za-z_$][\w$]*),logger:[A-Za-z_$][\w$]*=[^}]*\}\)\{if\(\1\.kind===`local`&&process\.platform!==`linux`\)try\{/gu,
    (needle) => needle.replace("&&process.platform!==`linux`", "&&process.platform!==`linux`&&process.platform!==`win32`"),
  );
  if (patched !== source) return patched;
  patched = source.replace(
    /async function [A-Za-z_$][\w$]*\(\{codexHome:[A-Za-z_$][\w$]*,hostConfig:([A-Za-z_$][\w$]*),logger:[A-Za-z_$][\w$]*=[^}]*\}\)\{if\(\1\.kind===`local`\)try\{/gu,
    (needle, hostConfigVar) => needle.replace(`if(${hostConfigVar}.kind===\`local\`)try{`, `if(${hostConfigVar}.kind===\`local\`&&process.platform!==\`win32\`)try{`),
  );
  if (patched !== source) return patched;
  if (source.includes("Removed remote_control from config before app-server start")) {
    console.warn("WARN: Could not find remote-control config stripper guard - skipping Windows patch");
  }
  return source;
}

function windowsRemoteControlHostEnablementHelperSource() {
  return [
    "(()=>{",
    "function codexWindowsRemoteControlPreferenceEnabled(){try{let e=require(`node:fs`),t=require(`node:path`),n=require(`node:os`),r=process.env.CODEX_HOME&&process.env.CODEX_HOME.trim()?process.env.CODEX_HOME.trim():t.join(n.homedir(),`.codex`),i=t.join(r,`config.toml`);if(!e.existsSync(i))return!1;let a=e.readFileSync(i,`utf8`),o=e=>{let t=e.match(/(^|\\n)\\s*remote_control\\s*=\\s*(true|false)\\b/);return t==null?null:t[2]===`true`},s=a.search(/\\n\\s*\\[[^\\]\\n]+\\]\\s*(?:\\n|$)/),c=s<0?a:a.slice(0,s),l=o(c),u=a.match(/(^|\\n)(\\s*\\[features\\]\\s*\\n)([\\s\\S]*?)(?=\\n\\s*\\[[^\\]\\n]+\\]\\s*(?:\\n|$)|$)/),d=u?o(u[3]):null;return d??l??!1}catch{return!1}}",
    "globalThis.codexWindowsRemoteControlHostEnablement=async function(e,t){if(process.platform!==`win32`||!codexWindowsRemoteControlPreferenceEnabled())return;let n=async e=>{if(e==null||typeof e!=`object`)return;let n=e.installationId??e.installation_id,r=e.environmentId??e.environment_id;n!=null&&t.set(`local_remote_control_installation_id`,n),r!=null&&t.set(`local_remote_control_environment_id`,r)};try{await n(await e.sendAppServerRequest(`remoteControl/enable`));try{await n(await e.sendAppServerRequest(`remoteControl/status/read`))}catch{}}catch(e){console.warn(`Windows remote-control host enablement failed`,e)}}",
    "})()",
  ].join("");
}

function applyWindowsRemoteControlHostEnablementPatch(source) {
  if (source.includes("codexWindowsRemoteControlHostEnablement")) return source;
  if (!source.includes("local_remote_control_environment_id")) return source;
  const connectionRegex =
    /(this\.appServerClient=([A-Za-z_$][\w$]*),this\.appServerClients\.set\(this\.hostId,this\.appServerClient\),this\.appServerConnectionRegistry=new [A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?(?:\(\))?[;,]this\.appServerConnectionRegistry\.addConnection\(this\.hostId,\2\);)/u;
  const patched = source.replace(
    connectionRegex,
    `${windowsRemoteControlHostEnablementHelperSource()},$1globalThis.codexWindowsRemoteControlHostEnablement(this.appServerClient,this.sharedObjectRepository);`,
  );
  if (patched !== source) return patched;
  const startupRegex =
    /(let ([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\.appServerConnectionRegistry\.getConnection\(L\);if\(!await [\s\S]{0,800}?D\(`local app-server sqlite initialized`,M\);)/u;
  const startupPatched = source.replace(
    startupRegex,
    (_needle, prefix, connectionVar, windowContextVar) =>
      `${windowsRemoteControlHostEnablementHelperSource()};${prefix}try{await globalThis.codexWindowsRemoteControlHostEnablement(${connectionVar},${windowContextVar}.globalState)}catch(e){console.warn(\`Windows remote-control host enablement failed\`,e)}`,
  );
  if (startupPatched === source) {
    console.warn("WARN: Could not find local app-server connection initialization - skipping Windows remote-control host enablement patch");
  }
  return startupPatched;
}

function applyWindowsRemoteControlAuthorizationDiagnosticsPatch(source) {
  if (source.includes(AUTHORIZATION_DIAGNOSTICS_MARKER)) return source;
  if (!source.includes("authorizeRemoteControlConnections")) return source;
  const authorizationMethodRegex =
    /async authorizeRemoteControlConnections\(\)\{return await ([A-Za-z_$][\w$]*)\(\{appServerClient:this\.desktopAuthAppServerClient,desktopApiOptions:this\.desktopApiOptions,deviceKeyClient:this\.remoteControlDeviceKeyClient,globalState:this\.appState,requestRemoteControlEnrollmentStepUpToken:\(\{accountId:([A-Za-z_$][\w$]*)\}\)=>([A-Za-z_$][\w$]*)\(\{accountId:\2,desktopApiOptions:this\.desktopApiOptions\}\)\}\),this\.refreshRemoteControlConnections\(\)\}/u;
  const loggerFunction = source.match(/([A-Za-z_$][\w$]*)\(\)\.info\(`refresh_remote_control_started`/u)?.[1] ?? null;
  const loggerCall = loggerFunction == null
    ? ""
    : `try{typeof ${loggerFunction}==\`function\`&&${loggerFunction}().warning(\`${AUTHORIZATION_DIAGNOSTICS_MARKER}\`,{safe:{message:e instanceof Error?e.message:String(e),name:e instanceof Error?e.name:null},sensitive:{error:e,stack:e instanceof Error?e.stack:null}})}catch{}`;
  const patched = source.replace(
    authorizationMethodRegex,
    (_needle, authorizeFn, accountVar, stepUpTokenFn) =>
      `async authorizeRemoteControlConnections(){try{return await ${authorizeFn}({appServerClient:this.desktopAuthAppServerClient,desktopApiOptions:this.desktopApiOptions,deviceKeyClient:this.remoteControlDeviceKeyClient,globalState:this.appState,requestRemoteControlEnrollmentStepUpToken:({accountId:${accountVar}})=>${stepUpTokenFn}({accountId:${accountVar},desktopApiOptions:this.desktopApiOptions})}),this.refreshRemoteControlConnections()}catch(e){try{console.warn(\`${AUTHORIZATION_DIAGNOSTICS_MARKER}\`,e?.stack??e)}catch{}${loggerCall}throw e}}`,
  );
  if (patched === source) console.warn("WARN: Could not find remote-control authorization method - skipping Windows diagnostics patch");
  return patched;
}

function remoteControlAuthorizationErrorMessageHelperSource() {
  return `function ${AUTHORIZATION_ERROR_MESSAGE_MARKER}(e){return e instanceof Error&&e.message?e.message:e&&typeof e==\`object\`&&typeof e.message==\`string\`&&e.message?e.message:typeof e==\`string\`&&e?e:null}`;
}

function applyWindowsRemoteControlAuthorizationErrorDetailPatch(source) {
  if (source.includes(AUTHORIZATION_ERROR_MESSAGE_MARKER)) return source;
  if (!source.includes("settings.remoteControlConnections.authorize.error")) return source;
  const errorVar = source.match(/authorize-remote-control-connections`,\{onSuccess:[\s\S]*?,onError:([A-Za-z_$][\w$]*)=>\{[\s\S]{0,2000}?settings\.remoteControlConnections\.authorize\.error/u)?.[1];
  if (errorVar == null) {
    console.warn("WARN: Could not find remote-control authorization error handler - skipping Windows error detail patch");
    return source;
  }
  const toastRegex =
    /([A-Za-z_$][\w$]*)\.get\(([A-Za-z_$][\w$]*)\)\.danger\(([A-Za-z_$][\w$]*)\.formatMessage\(\{id:`settings\.remoteControlConnections\.authorize\.error`,defaultMessage:`Failed to authorize remote control`,description:`Toast shown when remote control authorization fails`\}\),\{id:([A-Za-z_$][\w$]*)\}\)/u;
  let patched = source.replace(
    toastRegex,
    (_needle, toastRepo, toastChannel, intl, toastId) =>
      `${toastRepo}.get(${toastChannel}).danger(${AUTHORIZATION_ERROR_MESSAGE_MARKER}(${errorVar})??${intl}.formatMessage({id:\`settings.remoteControlConnections.authorize.error\`,defaultMessage:\`Failed to authorize remote control\`,description:\`Toast shown when remote control authorization fails\`}),{id:${toastId}})`,
  );
  if (patched === source) {
    const currentToastRegex =
      /([A-Za-z_$][\w$]*)\.get\(([A-Za-z_$][\w$]*)\)\.danger\(([A-Za-z_$][\w$]*) instanceof ([A-Za-z_$][\w$]*)&&\3\.errorCode===`remote_control_enrollment_account_mismatch`\?([A-Za-z_$][\w$]*)\.formatMessage\(\{id:`settings\.remoteControlConnections\.authorize\.accountMismatch`,defaultMessage:`Remote control authorization used a different account`,description:`Toast shown when remote control authorization completes for a different account`\}\):\5\.formatMessage\(\{id:`settings\.remoteControlConnections\.authorize\.error`,defaultMessage:`Failed to authorize remote control`,description:`Toast shown when remote control authorization fails`\}\),\{id:([A-Za-z_$][\w$]*)\}\)/u;
    patched = source.replace(
      currentToastRegex,
      (_needle, toastRepo, toastChannel, errorVarFromToast, errorClassVar, intl, toastId) =>
        `${toastRepo}.get(${toastChannel}).danger(${errorVarFromToast} instanceof ${errorClassVar}&&${errorVarFromToast}.errorCode===\`remote_control_enrollment_account_mismatch\`?${intl}.formatMessage({id:\`settings.remoteControlConnections.authorize.accountMismatch\`,defaultMessage:\`Remote control authorization used a different account\`,description:\`Toast shown when remote control authorization completes for a different account\`}):${AUTHORIZATION_ERROR_MESSAGE_MARKER}(${errorVarFromToast})??${intl}.formatMessage({id:\`settings.remoteControlConnections.authorize.error\`,defaultMessage:\`Failed to authorize remote control\`,description:\`Toast shown when remote control authorization fails\`}),{id:${toastId}})`,
    );
  }
  if (patched === source) {
    console.warn("WARN: Could not find remote-control authorization error toast - skipping Windows error detail patch");
    return source;
  }
  return `${remoteControlAuthorizationErrorMessageHelperSource()}${patched}`;
}

function applyWindowsRemoteConnectionConnectDiagnosticsPatch(source) {
  if (source.includes(REMOTE_CONNECTION_CONNECT_DIAGNOSTICS_MARKER)) return source;
  if (!source.includes("setRemoteConnectionAutoConnect") || !source.includes("connectRemoteConnection")) return source;
  const loggerFunction = source.match(/([A-Za-z_$][\w$]*)\(\)\.info\(`connect_requested`/u)?.[1] ?? null;
  let patched = source.replace(
    /catch\(([A-Za-z_$][\w$]*)\)\{throw ([A-Za-z_$][\w$]*)\(\)\.warning\(`connect_failed`,\{safe:\{\},sensitive:\{error:\1,hostId:([A-Za-z_$][\w$]*)\}\}\),Error\(`Failed to connect remote connection\.`\)\}/u,
    (_needle, errorVar, loggerVar, hostIdVar) =>
      `catch(${errorVar}){throw ${loggerVar}().warning(\`connect_failed\`,{safe:{},sensitive:{error:${errorVar},hostId:${hostIdVar}}}),Error(${errorVar} instanceof Error&&${errorVar}.message?\`Failed to connect remote connection: \${${errorVar}.message}\`:\`Failed to connect remote connection.\`)}`,
  );
  const autoConnectRegex =
    /async setRemoteConnectionAutoConnect\(([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\)\{let ([A-Za-z_$][\w$]*)=this\.getRemoteConnectionAutoConnectByHostId\(\);this\.appState\.set\(([A-Za-z_$][\w$]*)\.wn\.REMOTE_CONNECTION_AUTO_CONNECT_BY_HOST_ID,\{\.\.\.\3,\[\1\]:\2\}\);let ([A-Za-z_$][\w$]*)=await this\.refreshRemoteConnectionsForHostId\(\1\);return \2\?\{remoteConnections:\5,\.\.\.await this\.ensureRemoteConnectionConnected\(\1\)\}:\{remoteConnections:\5,\.\.\.await this\.disconnectRemoteConnection\(\1\)\}\}/u;
  patched = patched.replace(autoConnectRegex, (_needle, hostIdVar, autoConnectVar, stateVar, globalStateEnumVar, connectionsVar) => {
    const loggerCall = loggerFunction == null
      ? ""
      : `try{${loggerFunction}().warning(\`${REMOTE_CONNECTION_CONNECT_DIAGNOSTICS_MARKER}\`,{safe:{},sensitive:{error:codexWindowsRemoteConnectionAuthRefreshError,hostId:${hostIdVar}}})}catch{}`;
    return `async setRemoteConnectionAutoConnect(${hostIdVar},${autoConnectVar}){let ${stateVar}=this.getRemoteConnectionAutoConnectByHostId();this.appState.set(${globalStateEnumVar}.wn.REMOTE_CONNECTION_AUTO_CONNECT_BY_HOST_ID,{...${stateVar},[${hostIdVar}]:${autoConnectVar}});let ${connectionsVar}=await this.refreshRemoteConnectionsForHostId(${hostIdVar});try{return ${autoConnectVar}?{remoteConnections:${connectionsVar},...await this.ensureRemoteConnectionConnected(${hostIdVar})}:{remoteConnections:${connectionsVar},...await this.disconnectRemoteConnection(${hostIdVar})}}catch(codexWindowsRemoteConnectionAutoConnectError){try{this.sharedObjectRepository.get(\`remote_control_connections\`)?.some(e=>e.hostId===${hostIdVar})===!0&&await this.refreshRemoteControlClientAuthorizationState()}catch(codexWindowsRemoteConnectionAuthRefreshError){${loggerCall}}throw codexWindowsRemoteConnectionAutoConnectError}}`;
  });
  if (patched === source) console.warn("WARN: Could not find remote connection diagnostics needles - skipping Windows patch");
  return patched;
}

function remoteConnectionUpdateErrorMessageHelperSource() {
  return `function ${REMOTE_CONNECTION_UPDATE_ERROR_MESSAGE_MARKER}(e){return e instanceof Error&&e.message?e.message:e&&typeof e==\`object\`&&typeof e.message==\`string\`&&e.message?e.message:typeof e==\`string\`&&e?e:null}`;
}

function applyWindowsRemoteConnectionUpdateErrorDetailPatch(source) {
  if (source.includes(REMOTE_CONNECTION_UPDATE_ERROR_MESSAGE_MARKER)) return source;
  if (!source.includes("settings.remoteConnections.connectToggle.error")) return source;
  const errorVar = source.match(/set-remote-connection-auto-connect`,\{onError:\(([A-Za-z_$][\w$]*),\{/u)?.[1];
  if (errorVar == null) {
    console.warn("WARN: Could not find remote connection update error handler - skipping Windows patch");
    return source;
  }
  const toastRegex =
    /([A-Za-z_$][\w$]*)\.get\(([A-Za-z_$][\w$]*)\)\.danger\(([A-Za-z_$][\w$]*)\.formatMessage\(\{id:`settings\.remoteConnections\.connectToggle\.error`,defaultMessage:`Failed to update connection`,description:`Toast shown when remote connection toggle fails`\}\),\{id:([A-Za-z_$][\w$]*)\}\)/u;
  const patched = source.replace(
    toastRegex,
    (_needle, toastRepo, toastChannel, intl, toastId) =>
      `${toastRepo}.get(${toastChannel}).danger(${REMOTE_CONNECTION_UPDATE_ERROR_MESSAGE_MARKER}(${errorVar})??${intl}.formatMessage({id:\`settings.remoteConnections.connectToggle.error\`,defaultMessage:\`Failed to update connection\`,description:\`Toast shown when remote connection toggle fails\`}),{id:${toastId}})`,
  );
  if (patched === source) {
    console.warn("WARN: Could not find remote connection update error toast - skipping Windows patch");
    return source;
  }
  return `${remoteConnectionUpdateErrorMessageHelperSource()}${patched}`;
}

function applyWindowsRemoteControlMainProcessAutoConnectPatch(source) {
  if (source.includes(REMOTE_CONTROL_MAIN_PROCESS_AUTO_CONNECT_MARKER)) return source;
  if (!source.includes("refresh_remote_control_completed") || !source.includes("getAutoConnectForRemoteConnection")) {
    return source;
  }
  const autoConnectRegex =
    /\.map\(([A-Za-z_$][\w$]*)=>\(\{\.\.\.\1,autoConnect:this\.getAutoConnectForRemoteConnection\(\1\)\}\)\)/u;
  const patched = source.replace(
    autoConnectRegex,
    (_needle, connectionVar) =>
      `.map(${connectionVar}=>({...${connectionVar},autoConnect:process.platform===\`win32\`&&typeof ${connectionVar}?.hostId==\`string\`&&${connectionVar}.hostId.startsWith(\`remote-control:\`)/*${REMOTE_CONTROL_MAIN_PROCESS_AUTO_CONNECT_MARKER}*/?!0:this.getAutoConnectForRemoteConnection(${connectionVar})}))`,
  );
  if (patched === source) {
    console.warn("WARN: Could not find remote-control main-process auto-connect needle - skipping Windows patch");
  }
  return patched;
}

function applyWindowsRemoteMobileAppServerRemoteControlPatch(source) {
  if (source.includes(REMOTE_MOBILE_APP_SERVER_REMOTE_CONTROL_MARKER)) return source;
  if (!source.includes(REMOTE_MOBILE_APP_SERVER_ARGS_NEEDLE)) return source;

  const helper =
    "function codexWindowsRemoteMobileAppServerArgs(){return process.platform===`win32`?[`app-server`,`--remote-control`,`--analytics-default-enabled`]:[`app-server`,`--analytics-default-enabled`]}";
  return `${helper}${source.split(REMOTE_MOBILE_APP_SERVER_ARGS_NEEDLE).join("args:codexWindowsRemoteMobileAppServerArgs()")}`;
}

function applyWindowsRemoteControlLoadGatePatch(source) {
  if (source.includes("codexWindowsRemoteControlLoadGateEnabled")) return source;
  if (!source.includes("`1042620455`")) return source;
  const match = source.match(REMOTE_CONTROL_LOAD_GATE_NEEDLE);
  if (match == null) {
    console.warn("WARN: Could not find remote-control loader rollout gate - skipping Windows patch");
    return source;
  }
  const [, functionName, statsigFn] = match;
  return source.replace(
    REMOTE_CONTROL_LOAD_GATE_NEEDLE,
    `function ${functionName}(){return codexWindowsRemoteControlLoadGateEnabled()||${statsigFn}(\`1042620455\`)}function codexWindowsRemoteControlLoadGateEnabled(){return typeof navigator!=\`undefined\`&&navigator.userAgent.includes(\`Windows\`)}`,
  );
}

function applyWindowsRemoteControlVisibilityPatch(source) {
  if (source.includes(REMOTE_CONTROL_VISIBILITY_REPLACEMENT) || source.includes("navigator.userAgent.includes(`Windows`)")) return source;
  if (source.includes(REMOTE_CONTROL_VISIBILITY_NEEDLE)) {
    return source.replace(REMOTE_CONTROL_VISIBILITY_NEEDLE, REMOTE_CONTROL_VISIBILITY_REPLACEMENT);
  }
  const match = source.match(REMOTE_CONTROL_SETTINGS_VISIBILITY_NEEDLE);
  if (match == null) {
    if (source.includes("remoteControlConnectionsState")) {
      console.warn("WARN: Could not find remote-control visibility gate - skipping Windows patch");
    }
    return source;
  }
  const [, functionName, stateVar, slingshotVar] = match;
  return source.replace(
    REMOTE_CONTROL_SETTINGS_VISIBILITY_NEEDLE,
    `function ${functionName}({remoteControlConnectionsState:${stateVar},slingshotEnabled:${slingshotVar}}){let n=typeof navigator!=\`undefined\`&&navigator.userAgent.includes(\`Windows\`);return(n||${slingshotVar})&&(n||(${stateVar}?.available??!0))&&${stateVar}?.accessRequired!==!0}`,
  );
}

function applyWindowsRemoteControlCopyPatch(source) {
  const hasMacCopy = REMOTE_CONTROL_WINDOWS_COPY_REPLACEMENTS.some(([macCopy]) => source.includes(macCopy));
  if (!hasMacCopy && (source.includes("this Windows PC") || source.includes("Windows apps"))) return source;
  let patched = source;
  let changed = false;
  for (const [macCopy, windowsCopy] of REMOTE_CONTROL_WINDOWS_COPY_REPLACEMENTS) {
    if (patched.includes(macCopy)) {
      patched = patched.split(macCopy).join(windowsCopy);
      changed = true;
    }
  }
  return patched;
}

function applyWindowsRemoteControlClientAccountCompatibilityPatch(source) {
  if (
    source.includes("remote_control_client_enrollment_start_response") &&
    source.includes("tokenAccountId!=null") &&
    source.includes("headerChatGptAccountId") &&
    source.includes("tokenAuthUserId")
  ) {
    return source;
  }
  const patched = applyLinuxRemoteControlClientAccountCompatibilityPatch(source);
  if (patched === source) return source;
  return patched
    .split("codexLinuxRemoteControl").join("codexWindowsRemoteControl")
    .split("Linux remote-control").join("Windows remote-control");
}

function applyWindowsRemoteMobilePatch(source, linuxPatch, warningNeedle, warningDescription) {
  const originalWarn = console.warn;
  let linuxPatched = source;
  try {
    console.warn = () => {};
    linuxPatched = linuxPatch(source);
  } finally {
    console.warn = originalWarn;
  }
  if (linuxPatched === source) {
    if (warningNeedle != null && source.includes(warningNeedle)) {
      console.warn(`WARN: Could not find Windows ${warningDescription} needles - skipping patch`);
    }
    return source;
  }
  return linuxPatched
    .split("codexLinuxRemote").join("codexWindowsRemote")
    .split("navigator.userAgent.includes(`Linux`)").join("navigator.userAgent.includes(`Windows`)")
    .split("process.platform===`linux`").join("process.platform===`win32`")
    .split("process.platform!==`linux`").join("process.platform!==`win32`")
    .split("Linux remote-control").join("Windows remote-control")
    .split("Linux remote-mobile").join("Windows remote-mobile");
}

function applyWindowsRemoteControlEnablementBridgePatch(source) {
  const patched = applyWindowsRemoteMobilePatch(
    source,
    applyLinuxRemoteControlEnablementBridgePatch,
    "[remote-connections/slingshot-gate-bridge]",
    "remote-control enablement bridge",
  );
  if (patched === source || !patched.includes("codexWindowsRemoteControlSelfAutoConnect")) return patched;
  return patched.replaceAll("autoConnect:i.has(e.hostId)", "autoConnect:!0");
}

function applyWindowsRemoteConnectionsRefreshPatch(source) {
  return applyWindowsRemoteMobilePatch(
    source,
    applyLinuxRemoteConnectionsRefreshPatch,
    "refresh-remote-connections",
    "remote-connections refresh",
  );
}

function applyWindowsRemoteMobileConversationHydrationPatch(source) {
  let patched = applyWindowsRemoteMobilePatch(
    source,
    applyLinuxRemoteMobileConversationHydrationPatch,
    null,
    "remote-mobile conversation hydration",
  );
  if (patched !== source || source.includes("codexWindowsRemoteMobileHydrateUnknownTurn")) return patched;

  let currentTurnStartedRegex =
    /if\(!this\.conversations\.get\(r\)\)\{([A-Za-z_$][\w$]*)\.error\(`Received turn\/started for unknown conversation`,\{safe:\{conversationId:r\},sensitive:\{\}\}\);break\}this\.markConversationStreaming\(r\),/u;
  let turnStartedMatch = patched.match(currentTurnStartedRegex);
  let missingConversationPrefix = "if(!this.conversations.get(r)){";
  if (turnStartedMatch == null) {
    currentTurnStartedRegex =
      /if\(this\.captureBrowserUseTurnRoute\(r,t\.id\),this\.captureComputerUseTurnRoute\(r,t\.id\),!i\)\{([A-Za-z_$][\w$]*)\.error\(`Received turn\/started for unknown conversation`,\{safe:\{conversationId:r\},sensitive:\{\}\}\);break\}this\.markConversationStreaming\(r\),/u;
    turnStartedMatch = patched.match(currentTurnStartedRegex);
    missingConversationPrefix = "if(this.captureBrowserUseTurnRoute(r,t.id),this.captureComputerUseTurnRoute(r,t.id),!i){";
  }
  if (turnStartedMatch == null) {
    if (patched.includes("Received turn/started for unknown conversation")) {
      console.warn("WARN: Could not find current Windows turn/started hydration needle - skipping fallback hydration patch");
    }
    return patched;
  }
  const loggerVar = turnStartedMatch[1];
  patched = patched.replace(
    currentTurnStartedRegex,
    [
      `${missingConversationPrefix}/*codexWindowsRemoteMobileHydrateUnknownTurn*//*codexWindowsRemoteMobileNotificationQueue*/`,
      "let i=this.codexWindowsRemoteMobilePendingNotifications??=new Map,a=i.get(r);a||(a=[],i.set(r,a)),a.push(n),",
      `${loggerVar}.warning(\`Hydrating conversation for turn/started\`,{safe:{conversationId:r,queuedNotificationCount:a.length},sensitive:{}});`,
      "let o=(i=0)=>this.readThread(r,{includeTurns:!1}).then(e=>{let t=e?.thread??e,a=this.codexWindowsRemoteMobilePendingNotifications?.get(r)??[];",
      "if(!t){if(i<12){",
      `${loggerVar}.warning(\`Retrying hydration for missing conversation\`,{safe:{conversationId:r,queuedNotificationCount:a.length,attempt:i+1},sensitive:{}}),`,
      "setTimeout(()=>o(i+1),250);return}",
      "this.codexWindowsRemoteMobilePendingNotifications?.delete(r),",
      `${loggerVar}.warning(\`Skipping hydration for missing conversation\`,{safe:{conversationId:r,queuedNotificationCount:a.length},sensitive:{}});return}`,
      "this.upsertConversationFromThread(t),this.codexWindowsRemoteMobilePendingNotifications?.delete(r);for(let e of a)this.onNotification(e.method,e.params)}).catch(e=>{",
      `if(i<12){${loggerVar}.warning(\`Retrying hydration for turn/started\`,{safe:{conversationId:r,attempt:i+1},sensitive:{error:e}}),setTimeout(()=>o(i+1),250);return}`,
      `this.codexWindowsRemoteMobilePendingNotifications?.delete(r),${loggerVar}.error(\`Failed to hydrate conversation for turn/started\`,{safe:{conversationId:r},sensitive:{error:e}})});o();break}`,
      "this.markConversationStreaming(r),",
    ].join(""),
  );

  return patched;
}

function applyWindowsRemoteMobileActiveStatusPatch(source) {
  return applyWindowsRemoteMobilePatch(
    source,
    applyLinuxRemoteMobileActiveStatusPatch,
    "threadRuntimeStatus",
    "remote-mobile active status",
  );
}

function applyWindowsRemoteMobileProjectlessRemoteTaskPatch(source) {
  return applyWindowsRemoteMobilePatch(
    source,
    applyLinuxRemoteMobileProjectlessRemoteTaskPatch,
    "No owner repo found for remote task",
    "remote-mobile projectless remote task",
  );
}

function applyWindowsRemoteThreadBottomPanelPatch(source) {
  if (source.includes(REMOTE_THREAD_BOTTOM_PANEL_MARKER)) return source;
  if (!source.includes("case`remote-thread`") || !source.includes("terminal:")) return source;
  const routeTargetRegex =
    /case`local-thread`:return\{conversationId:([A-Za-z_$][\w$]*)\.value\.conversationId,conversationTitle:\1\.get\(([A-Za-z_$][\w$]*),\1\.value\.conversationId\),cwd:\1\.get\(([A-Za-z_$][\w$]*)\),hostId:\1\.get\(([A-Za-z_$][\w$]*)\)\};case`new-thread-panel`:case`remote-thread`:case`other`:return null/u;
  const patched = source.replace(
    routeTargetRegex,
    (_needle, scopeVar, titleSignalVar, cwdSignalVar, hostSignalVar) =>
      `case\`local-thread\`:return{conversationId:${scopeVar}.value.conversationId,conversationTitle:${scopeVar}.get(${titleSignalVar},${scopeVar}.value.conversationId),cwd:${scopeVar}.get(${cwdSignalVar}),hostId:${scopeVar}.get(${hostSignalVar})};case\`new-thread-panel\`:case\`other\`:return null;case\`remote-thread\`:return{conversationId:\`remote:\${${scopeVar}.value.taskId}\`,conversationTitle:null,cwd:null,hostId:${scopeVar}.get(${hostSignalVar})}/*${REMOTE_THREAD_BOTTOM_PANEL_MARKER}*/`,
  );
  if (patched === source) {
    console.warn("WARN: Could not find remote-thread bottom-panel route guard - skipping Windows patch");
  }
  return patched;
}

function applyWindowsBottomPanelDefaultPatch(source) {
  if (source.includes(BOTTOM_PANEL_DEFAULT_MARKER)) return source;
  if (!source.includes("terminal:") || !source.includes("`right`:`bottom`")) return source;
  const defaultPanelRegex =
    /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{return \2\.get\(([A-Za-z_$][\w$]*)\)===!1\?`right`:`bottom`\}/u;
  const patched = source.replace(
    defaultPanelRegex,
    (_needle, functionName, scopeVar, launcherVisibleVar) =>
      `function ${functionName}(${scopeVar}){return typeof navigator!=\`undefined\`&&navigator.userAgent.includes(\`Windows\`)/*${BOTTOM_PANEL_DEFAULT_MARKER}*/?\`bottom\`:${scopeVar}.get(${launcherVisibleVar})===!1?\`right\`:\`bottom\`}`,
  );
  if (patched === source) {
    console.warn("WARN: Could not find bottom-panel default placement helper - skipping Windows patch");
  }
  return patched;
}

function applyWindowsBottomPanelLauncherVisibilityPatch(source) {
  if (source.includes(BOTTOM_PANEL_LAUNCHER_MARKER)) return source;
  if (!source.includes("toggle-bottom-panel") || !source.includes("toggle-bottom-panel-launcher")) return source;
  const launcherVisibilityRegex = /=([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)!==!1/gu;
  let changed = false;
  let patched = source.replace(launcherVisibilityRegex, (_needle, readSignalVar, launcherVisibleVar) => {
    changed = true;
    return `=(${readSignalVar}(${launcherVisibleVar})!==!1||typeof navigator!=\`undefined\`&&navigator.userAgent.includes(\`Windows\`)/*${BOTTOM_PANEL_LAUNCHER_MARKER}*/)`;
  });
  if (!changed) {
    console.warn("WARN: Could not find bottom-panel launcher visibility reads - skipping Windows patch");
    return source;
  }
  return patched;
}

function applyWindowsRemoteControlClientSettingsVisibilityPatch(source) {
  if (source.includes(CLIENT_SETTINGS_VISIBILITY_MARKER)) return source;
  if (!source.includes("settings.remoteConnections.tabs.accessOtherDevices")) return source;
  const settingsGateRegex =
    /(\{platform:([A-Za-z_$][\w$]*)\}=ue\(\),([A-Za-z_$][\w$]*)=oe\(`782640499`\),[\s\S]{0,1600}?=he\(\),)([A-Za-z_$][\w$]*)=!\3,/u;
  const patched = source.replace(
    settingsGateRegex,
    (_needle, prefix, platformVar, statsigVar, enabledVar) =>
      `${prefix}${enabledVar}=(${platformVar}===\`windows\`||!${statsigVar})/*${CLIENT_SETTINGS_VISIBILITY_MARKER}*/,`,
  );
  if (patched !== source) {
    return patched;
  }
  const currentSettingsGateRegex =
    /(\{platform:([A-Za-z_$][\w$]*)\}=ue\(\),([A-Za-z_$][\w$]*)=[A-Za-z_$][\w$]*\(`782640499`\),[\s\S]{0,2400}?)([A-Za-z_$][\w$]*)=!\3,(?=[\s\S]{0,900}?showControlOtherDevices:\4)/u;
  const currentPatched = source.replace(
    currentSettingsGateRegex,
    (_needle, prefix, platformVar, statsigVar, enabledVar) =>
      `${prefix}${enabledVar}=(${platformVar}===\`windows\`||!${statsigVar})/*${CLIENT_SETTINGS_VISIBILITY_MARKER}*/,`,
  );
  if (currentPatched === source) {
    console.warn("WARN: Could not find Windows control-other-devices settings gate - skipping tab visibility patch");
  }
  return currentPatched;
}

function applyWindowsConfigReadFeaturePrecedenceFallbackPatch(source) {
  if (source.includes(CONFIG_READ_FALLBACK_MARKER)) return source;
  if (!source.includes("failed to resolve feature override precedence") && !source.includes("config/read")) {
    return source;
  }
  const configReadRegex =
    /async function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\)\{return ([A-Za-z_$][\w$]*)\(\(await \2\.sendRequest\(`config\/read`,\{includeLayers:!1,cwd:\3\?\?null\}\)\)\.config\)\}/u;
  const patched = source.replace(
    configReadRegex,
    (_needle, functionName, clientVar, cwdVar, normalizeConfigFn) =>
      `async function ${functionName}(${clientVar},${cwdVar}){try{return ${normalizeConfigFn}((await ${clientVar}.sendRequest(\`config/read\`,{includeLayers:!1,cwd:${cwdVar}??null})).config)}catch(e){if(${cwdVar}!=null&&typeof navigator!=\`undefined\`&&navigator.userAgent.includes(\`Windows\`)&&String(e?.message??e).includes(\`failed to resolve feature override precedence\`)){console.warn(\`${CONFIG_READ_FALLBACK_MARKER}\`,e);return ${normalizeConfigFn}((await ${clientVar}.sendRequest(\`config/read\`,{includeLayers:!1,cwd:null})).config)}throw e}}`,
  );
  if (patched === source) {
    console.warn("WARN: Could not find config/read helper - skipping Windows feature precedence fallback patch");
  }
  return patched;
}

function applyWindowsAppServerFeatureEnablementPatch(source) {
  const originalWarn = console.warn;
  let linuxPatched = source;
  try {
    console.warn = () => {};
    linuxPatched = applyLinuxAppServerFeatureEnablementPatch(source);
  } finally {
    console.warn = originalWarn;
  }
  if (linuxPatched !== source) return linuxPatched;
  if (!source.includes("statsig_default_enable_features") || !source.includes("set-experimental-feature-enablement-for-host")) {
    return source;
  }
  if (source.includes("`remote_control`")) return source;
  const featureArrayRegex =
    /var ([A-Za-z_$][\w$]*)=\[((?:`[^`]+`,?)*)\],([A-Za-z_$][\w$]*)=`4218407052`,([A-Za-z_$][\w$]*)=`remote_plugin`;function ([A-Za-z_$][\w$]*)\(\)\{/u;
  const match = source.match(featureArrayRegex);
  if (match == null) {
    console.warn("WARN: Could not find Windows app-server feature enablement list - skipping remote_control sync patch");
    return source;
  }
  const [needle, arrayVar, rawItems, statsigVar, remotePluginVar, functionName] = match;
  const items = rawItems
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (items.includes("`remote_control`")) return source;
  const patchedItems = [...items, "`remote_control`"].join(",");
  return source.replace(
    needle,
    `var ${arrayVar}=[${patchedItems}],${statsigVar}=\`4218407052\`,${remotePluginVar}=\`remote_plugin\`;function ${functionName}(){`,
  );
}

function applyWindowsInAppBrowserUseAvailabilityPatch(source) {
  if (source.includes(IN_APP_BROWSER_USE_MARKER)) return source;
  if (!source.includes("410262010") || !source.includes("browser_use")) return source;
  const currentAvailabilityRegex =
    /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{let ([A-Za-z_$][\w$]*)=\(0,([A-Za-z_$][\w$]*)\.c\)\(13\),\{hostId:([A-Za-z_$][\w$]*)\}=\2,([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\),([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\(`410262010`\),/u;
  const currentPatched = source.replace(
    currentAvailabilityRegex,
    (_needle, functionName, argName, cacheVar, cacheModuleVar, hostIdVar, sidebarVar, sidebarFnVar, sidebarAtomVar, statsigVar, statsigFnVar) =>
      `function ${IN_APP_BROWSER_USE_MARKER}(){return typeof navigator!=\`undefined\`&&navigator.userAgent.includes(\`Windows\`)}function ${functionName}(${argName}){let ${cacheVar}=(0,${cacheModuleVar}.c)(13),{hostId:${hostIdVar}}=${argName},${sidebarVar}=${sidebarFnVar}(${sidebarAtomVar}),${statsigVar}=${statsigFnVar}(\`410262010\`)||${IN_APP_BROWSER_USE_MARKER}(),`,
  );
  if (currentPatched !== source) return currentPatched;
  const availabilityRegex =
    /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{let ([A-Za-z_$][\w$]*)=\(0,([A-Za-z_$][\w$]*)\.c\)\(13\),\{hostId:([A-Za-z_$][\w$]*)\}=\2,([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\),([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\(`410262010`\),/u;
  const patched = source.replace(
    availabilityRegex,
    (_needle, functionName, argName, cacheVar, cacheModuleVar, hostIdVar, sidebarVar, readAtomVar, browserPaneAtomVar, statsigVar, statsigFnVar) =>
      `function ${IN_APP_BROWSER_USE_MARKER}(){return typeof navigator!=\`undefined\`&&navigator.userAgent.includes(\`Windows\`)}function ${functionName}(${argName}){let ${cacheVar}=(0,${cacheModuleVar}.c)(13),{hostId:${hostIdVar}}=${argName},${sidebarVar}=${readAtomVar}(${browserPaneAtomVar})||${IN_APP_BROWSER_USE_MARKER}(),${statsigVar}=${statsigFnVar}(\`410262010\`)||${IN_APP_BROWSER_USE_MARKER}(),`,
  );
  if (patched === source) console.warn("WARN: Could not find in-app browser availability gate - skipping Windows Browser Use patch");
  return patched;
}

const windowsConnectionPatchDescriptors = [
  { id: "windows-remote-control-config-preservation", phase: "main-bundle", order: 100, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, apply: applyWindowsRemoteControlConfigPreservationPatch },
  { id: "windows-remote-control-device-key", phase: "main-bundle", order: 105, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, apply: applyWindowsRemoteControlDeviceKeyPatch },
  { id: "windows-remote-control-host-enablement", phase: "main-bundle", order: 110, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, apply: applyWindowsRemoteControlHostEnablementPatch },
  { id: "windows-remote-control-authorization-diagnostics", phase: "main-bundle", order: 115, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, apply: applyWindowsRemoteControlAuthorizationDiagnosticsPatch },
  { id: "windows-remote-control-client-account-compatibility", phase: "main-bundle", order: 120, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, apply: applyWindowsRemoteControlClientAccountCompatibilityPatch },
  { id: "windows-remote-control-client-revocation-recovery", phase: "main-bundle", order: 125, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, apply: applyLinuxRemoteControlClientRevocationRecoveryPatch },
  { id: "windows-remote-connection-connect-diagnostics", phase: "main-bundle", order: 127, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, apply: applyWindowsRemoteConnectionConnectDiagnosticsPatch },
  { id: "windows-remote-control-main-process-auto-connect", phase: "main-bundle", order: 127.5, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, apply: applyWindowsRemoteControlMainProcessAutoConnectPatch },
  { id: "windows-remote-mobile-app-server-remote-control", phase: "main-bundle", order: 127.75, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, apply: applyWindowsRemoteMobileAppServerRemoteControlPatch },
  { id: "windows-browser-use-node-repl-approval", phase: "main-bundle", order: 128, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, apply: applyBrowserUseNodeReplApprovalPatch },
  { id: "windows-computer-use-ui-feature", phase: "main-bundle", order: 129, ciPolicy: "opt-in", targetSummary: WINDOWS_TARGET_SUMMARY, enabled: windowsComputerUseUiEnabled, apply: applyWindowsComputerUseFeaturePatch },
  { id: "windows-computer-use-plugin-gate", phase: "main-bundle", order: 129.5, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, apply: applyWindowsComputerUsePluginGatePatch },
  { id: "windows-app-server-feature-enablement", phase: "webview-asset", pattern: /^(app-main|index)-.*\.js$/, order: 130, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "webview app main bundle", skipDescription: "Windows app-server feature enablement compatibility patch", apply: applyWindowsAppServerFeatureEnablementPatch },
  { id: "windows-in-app-browser-use-availability", phase: "webview-asset", pattern: /^(?:use-in-app-browser-use-availability|use-is-plugins-enabled)-.*\.js$/, order: 135, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "in-app browser availability bundle", skipDescription: "Windows Browser Use availability patch", apply: applyWindowsInAppBrowserUseAvailabilityPatch },
  { id: "windows-remote-control-enablement-bridge", phase: "webview-asset", pattern: /^app-main-.*\.js$/, order: 137, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "app main bundle", skipDescription: "Windows remote-control enablement bridge patch", apply: applyWindowsRemoteControlEnablementBridgePatch },
  { id: "windows-remote-mobile-active-status", phase: "webview-asset", pattern: /^app-main-.*\.js$/, order: 138, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "app main bundle", skipDescription: "Windows remote-mobile active status patch", apply: applyWindowsRemoteMobileActiveStatusPatch },
  { id: "windows-remote-control-load-gate", phase: "webview-asset", pattern: /^remote-connection-visibility-.*\.js$/, order: 140, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "remote-control loader gate bundle", skipDescription: "Windows remote-control load gate patch", apply: applyWindowsRemoteControlLoadGatePatch },
  { id: "windows-remote-control-visibility", phase: "webview-asset", pattern: /^(?:remote-control-connections-visibility|remote-connections-settings)-.*\.js$/, order: 150, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "remote-control connections visibility bundle", skipDescription: "Windows remote-control visibility patch", apply: applyWindowsRemoteControlVisibilityPatch },
  { id: "windows-remote-control-copy", phase: "webview-asset", pattern: /^(?:codex-mobile-setup-flow|remote-connections-settings|use-codex-mobile-connected-settings)-.*\.js$/, order: 160, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "remote-control settings or mobile setup bundle", skipDescription: "Windows remote-control copy patch", apply: applyWindowsRemoteControlCopyPatch },
  { id: "windows-remote-control-client-settings-visibility", phase: "webview-asset", pattern: /^remote-connections-settings-.*\.js$/, order: 165, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "remote connections settings bundle", skipDescription: "Windows control-other-devices settings visibility patch", apply: applyWindowsRemoteControlClientSettingsVisibilityPatch },
  { id: "windows-remote-connections-refresh", phase: "webview-asset", pattern: /^remote-connections-settings-.*\.js$/, order: 166, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "remote connections settings bundle", skipDescription: "Windows remote-connections refresh patch", apply: applyWindowsRemoteConnectionsRefreshPatch },
  { id: "windows-computer-use-ui-availability", phase: "webview-asset", pattern: /^(use-model-settings|apps|use-in-app-browser-use-availability|use-is-plugins-enabled)-.*\.js$/, order: 167, ciPolicy: "opt-in", targetSummary: WINDOWS_TARGET_SUMMARY, enabled: windowsComputerUseUiEnabled, missingDescription: "Computer Use availability bundle", skipDescription: "Windows Computer Use UI availability patch", apply: applyWindowsComputerUseRendererAvailabilityPatch },
  { id: "windows-computer-use-install-flow", phase: "webview-asset", pattern: /^(use-plugin-install-flow|plugins-availability)-.*\.js$/, order: 168, ciPolicy: "opt-in", targetSummary: WINDOWS_TARGET_SUMMARY, enabled: windowsComputerUseUiEnabled, missingDescription: "plugin install flow bundle", skipDescription: "Windows Computer Use install flow patch", apply: applyWindowsComputerUseInstallFlowPatch },
  { id: "windows-remote-control-authorization-error-detail", phase: "webview-asset", pattern: /^remote-connections-settings-.*\.js$/, order: 170, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "remote-control settings bundle", skipDescription: "Windows remote-control authorization error detail patch", apply: applyWindowsRemoteControlAuthorizationErrorDetailPatch },
  { id: "windows-remote-connection-update-error-detail", phase: "webview-asset", pattern: /^remote-connections-settings-.*\.js$/, order: 180, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "remote connections settings bundle", skipDescription: "Windows remote connection update error detail patch", apply: applyWindowsRemoteConnectionUpdateErrorDetailPatch },
  { id: "windows-remote-mobile-conversation-hydration", phase: "webview-asset", pattern: /^app-server-manager-signals-.*\.js$/, order: 190, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "app-server manager signals bundle", skipDescription: "Windows remote-mobile conversation hydration patch", apply: applyWindowsRemoteMobileConversationHydrationPatch },
  { id: "windows-config-read-feature-precedence-fallback", phase: "webview-asset", pattern: /^app-server-manager-signals-.*\.js$/, order: 195, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "app-server manager signals bundle", skipDescription: "Windows config/read feature precedence fallback patch", apply: applyWindowsConfigReadFeaturePrecedenceFallbackPatch },
  { id: "windows-remote-mobile-projectless-remote-task", phase: "webview-asset", pattern: /^sidebar-project-groups-.*\.js$/, order: 200, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "sidebar project groups bundle", skipDescription: "Windows remote-mobile projectless remote task patch", apply: applyWindowsRemoteMobileProjectlessRemoteTaskPatch },
  { id: "windows-bottom-panel-default-placement", phase: "webview-asset", pattern: /^thread-page-bottom-panel-state-.*\.js$/, order: 205, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "thread page bottom-panel state bundle", skipDescription: "Windows bottom-panel default placement patch", apply: applyWindowsBottomPanelDefaultPatch },
  { id: "windows-bottom-panel-launcher-visibility", phase: "webview-asset", pattern: /^thread-app-shell-chrome-.*\.js$/, order: 206, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "thread app shell chrome bundle", skipDescription: "Windows bottom-panel launcher visibility patch", apply: applyWindowsBottomPanelLauncherVisibilityPatch },
  { id: "windows-remote-thread-bottom-panel", phase: "webview-asset", pattern: /^thread-page-bottom-panel-state-.*\.js$/, order: 210, ciPolicy: "optional", targetSummary: WINDOWS_TARGET_SUMMARY, missingDescription: "thread page bottom-panel state bundle", skipDescription: "Windows remote-thread bottom panel patch", apply: applyWindowsRemoteThreadBottomPanelPatch },
];

module.exports = {
  WINDOWS_TARGET_SUMMARY,
  applyWindowsAppServerFeatureEnablementPatch,
  applyWindowsBottomPanelDefaultPatch,
  applyWindowsBottomPanelLauncherVisibilityPatch,
  applyWindowsBrowserUseNodeReplApprovalPatch: applyBrowserUseNodeReplApprovalPatch,
  applyWindowsComputerUseFeaturePatch,
  applyWindowsComputerUseInstallFlowPatch,
  applyWindowsComputerUsePluginGatePatch,
  applyWindowsComputerUseRendererAvailabilityPatch,
  applyWindowsInAppBrowserUseAvailabilityPatch,
  applyWindowsConfigReadFeaturePrecedenceFallbackPatch,
  applyWindowsRemoteConnectionConnectDiagnosticsPatch,
  applyWindowsRemoteConnectionUpdateErrorDetailPatch,
  applyWindowsRemoteControlMainProcessAutoConnectPatch,
  applyWindowsRemoteConnectionsRefreshPatch,
  applyWindowsRemoteMobileAppServerRemoteControlPatch,
  applyWindowsRemoteMobileActiveStatusPatch,
  applyWindowsRemoteMobileConversationHydrationPatch,
  applyWindowsRemoteMobileProjectlessRemoteTaskPatch,
  applyWindowsRemoteThreadBottomPanelPatch,
  applyWindowsRemoteControlAuthorizationDiagnosticsPatch,
  applyWindowsRemoteControlAuthorizationErrorDetailPatch,
  applyWindowsRemoteControlClientAccountCompatibilityPatch,
  applyWindowsRemoteControlClientRevocationRecoveryPatch: applyLinuxRemoteControlClientRevocationRecoveryPatch,
  applyWindowsRemoteControlClientSettingsVisibilityPatch,
  applyWindowsRemoteControlConfigPreservationPatch,
  applyWindowsRemoteControlCopyPatch,
  applyWindowsRemoteControlDeviceKeyPatch,
  applyWindowsRemoteControlEnablementBridgePatch,
  applyWindowsRemoteControlHostEnablementPatch,
  applyWindowsRemoteControlLoadGatePatch,
  applyWindowsRemoteControlVisibilityPatch,
  remoteConnectionUpdateErrorMessageHelperSource,
  remoteControlAuthorizationErrorMessageHelperSource,
  windowsConnectionPatchDescriptors,
  windowsDeviceKeyProviderSource,
  windowsRemoteControlHostEnablementHelperSource,
};
