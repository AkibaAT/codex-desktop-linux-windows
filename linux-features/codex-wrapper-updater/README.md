# codex-wrapper-updater

Adds a **separate** in-app Update button for the *wrapper*: this repository's
Linux features, patches, and fixes. It is distinct from the upstream Codex app
(DMG) updater.

## What it does

- A small top-right **Update** button appears only when `codex-update-manager`
  reports that a newer upstream wrapper build is available (it stays invisible
  otherwise, like the DMG update button).
- The button's tooltip shows the changelog of what changed.
- One click writes an app-id-aware pending marker under the app state directory
  and quits the app.
- The feature's declarative `prelaunch`/`afterExit` hooks consume the marker and
  run `codex-update-manager apply-wrapper-update`, which:
  - **user-local installs**: re-runs `install.sh` in place via
    `~/.local/bin/codex-desktop-update` (no privilege escalation), then relaunches;
  - **packaged installs**: rebuilds a native package from a freshly fetched
    wrapper source and installs it with `pkexec`.
- Failed applies leave the marker in place so a later launch/exit retries.

## Enabling

This feature is opt-in twice, by design:

1. Enable the feature for the build by adding `codex-wrapper-updater` to
   `linux-features/features.json`.
2. Turn on **Settings → Keybinds → Updates → "Check for Codex Desktop Linux
   updates"**. This persists `codex-linux-wrapper-updates-enabled` in
   `settings.json`; the updater treats that setting as the runtime opt-in for
   wrapper update tracking.

## How to test

- Enable both opt-ins above and rebuild/install.
- With an older installed build, `codex-update-manager check-wrapper --json`
  reports `candidate_wrapper_commit` + `wrapper_changelog`.
- Open Codex: the Update button appears top-right; click it; the app exits,
  applies the pending wrapper update from the feature hook, and relaunches. The
  button then disappears.

## Known risks

- Packaged rebuild is heavy (clone + `install.sh` + package build + `pkexec`);
  when build tools are absent, the marker is preserved for retry.
- Detection needs network access (a git shallow fetch of the upstream repo);
  offline simply shows no button.
