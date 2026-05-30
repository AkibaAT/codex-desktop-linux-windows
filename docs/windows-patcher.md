# Windows Patcher

This repo can also build a patched Windows ZIP from the official Codex Windows MSIX:

```bash
make windows-zip
```

The Windows path is intentionally different from the Linux installer. It does not cross-port the macOS DMG. It starts from the official Windows MSIX, preserves the upstream Windows executables, DLLs, native Node modules, manifests, and resources, then patches only the extracted Electron `app.asar` payload.

## Inputs

`make windows-zip` downloads the current x64 `OpenAI.Codex` MSIX into `dist/windows-upstream/` when possible. It first tries the Microsoft Store package lookup. If that endpoint rejects the request, it falls back to the Codex app mirror and verifies the downloaded MSIX against the mirror checksum file.

For repeatable or offline builds, provide the MSIX explicitly:

```bash
WINDOWS_MSIX=/path/to/OpenAI.Codex_26.x.x.x_x64__2p2nqsd0c76g0.msix make windows-zip
```

You can also pin a direct Microsoft delivery URL:

```bash
WINDOWS_MSIX_URL=https://... make windows-zip
```

Set `WINDOWS_MSIX_DISABLE_MIRROR=1` to require a direct Store/MSIX source and fail instead of using the mirror fallback.

## Output

The build writes:

- `dist/codex-desktop-windows_<version>_win32-x64.zip`
- `dist/windows-upstream/patch-report.json`

Extract the ZIP on Windows and run `Codex.exe` from the ZIP root. The artifact is a patched standalone app payload for testing the connection fixes; it is not a signed MSIX replacement.

## Patch Scope

The Windows patcher applies the connection patches that are needed for the Windows build:

- DPAPI-backed remote-control device keys when the upstream macOS-only native module is missing
- remote-control config preservation for `[features] remote_control = true`
- local remote-control host enablement for Windows
- connection and authorization diagnostics that surface the underlying error instead of only generic toasts
- remote-control visibility and Windows-specific copy in settings
- Browser Use / in-app browser availability patches for Windows remote sessions
- Computer Use plugin registration on Windows by removing the internal-only plugin gate and adding `installWhenMissing`
- opt-in Computer Use UI patches when `CODEX_WINDOWS_ENABLE_COMPUTER_USE_UI=1` is set at build time, when `CODEX_WINDOWS_SETTINGS_FILE=/path/settings.json` points at a JSON file with `"codex-windows-computer-use-ui-enabled": true`, or when the build host has that key in `~/.config/codex-desktop/settings.json`

The patcher is fail-soft like the Linux patcher. When an upstream bundle moves, the patch report records the skipped optional patch and the build continues so the failure can be diagnosed from the generated artifact.
