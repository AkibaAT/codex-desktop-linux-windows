"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  applyMainBundlePatch,
  applyWrapperUpdateSettingsPatch,
} = require("./patch.js");

const featureDir = __dirname;

test("main bundle patch writes app-state wrapper marker", () => {
  const source =
    `"use strict";var f=require("node:fs"),p=require("node:path"),c=require("node:child_process");` +
    `var handlers={"native-desktop-apps":async()=>({ok:true})};`;

  const patched = applyMainBundlePatch(source);

  assert.match(patched, /"codex-linux-wrapper-updater":async/);
  assert.match(patched, /CODEX_LINUX_APP_STATE_DIR/);
  assert.match(patched, /codex-wrapper-updater/);
  assert.doesNotMatch(patched, /wrapper-update-pending/);
});

test("settings patch adds wrapper update toggle", () => {
  const source =
    `var KEYS={autoUpdateOnExit:"codex-linux-auto-update-on-exit"};` +
    `function Settings(){return $.jsx(SettingsGroup,{children:$.jsx(LinuxToggle,{settingKey:KEYS.autoUpdateOnExit,label:"Install updates when you close Codex",description:"When on, a ready update waits for Codex to close and then installs. When off, updates wait until you click Update."})})}`;

  const patched = applyWrapperUpdateSettingsPatch(source);

  assert.match(patched, /wrapperUpdates:"codex-linux-wrapper-updates-enabled"/);
  assert.match(patched, /Check for Codex Desktop Linux updates/);
  assert.equal(applyWrapperUpdateSettingsPatch(patched), patched);
});

test("apply hook preserves marker on failure and clears it on success", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-wrapper-updater-"));
  const markerDir = path.join(temp, "codex-wrapper-updater");
  const marker = path.join(markerDir, "pending");
  const manager = path.join(temp, "codex-update-manager");
  fs.mkdirSync(markerDir, { recursive: true });
  fs.writeFileSync(marker, "pending\n");
  fs.writeFileSync(manager, "#!/usr/bin/env bash\nexit ${CODEX_FAKE_MANAGER_STATUS:-0}\n");
  fs.chmodSync(manager, 0o755);

  const env = {
    ...process.env,
    CODEX_LINUX_APP_STATE_DIR: temp,
    CODEX_LINUX_FEATURE_HOOK_PHASE: "prelaunch",
    CODEX_UPDATE_MANAGER_PATH: manager,
  };

  const failed = spawnSync("bash", [path.join(featureDir, "apply-pending.sh")], {
    env: { ...env, CODEX_FAKE_MANAGER_STATUS: "42" },
    encoding: "utf8",
  });
  assert.equal(failed.status, 0, failed.stderr);
  assert.equal(fs.existsSync(marker), true);

  const succeeded = spawnSync("bash", [path.join(featureDir, "apply-pending.sh")], {
    env,
    encoding: "utf8",
  });
  assert.equal(succeeded.status, 0, succeeded.stderr);
  assert.equal(fs.existsSync(marker), false);
});
