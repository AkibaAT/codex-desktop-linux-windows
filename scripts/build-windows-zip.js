#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createPatchReport, recordPatch, writePatchReport } = require("./lib/patch-report.js");
const { patchExtractedWindowsApp } = require("./patch-windows-connections.js");

const REPO_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(REPO_DIR, "dist");
const WINDOWS_UPSTREAM_DIR = path.join(DIST_DIR, "windows-upstream");

function envValue(name) {
  const value = process.env[name];
  return value && value.trim() ? value : null;
}

function usage() {
  return [
    "Usage: build-windows-zip.js [--msix path] [--output path] [--work-dir dir] [--keep-work]",
    "",
    "Environment:",
    "  WINDOWS_MSIX=/path/file.msix        Reuse a local Windows MSIX",
    "  WINDOWS_MSIX_URL=https://...        Download a specific Windows MSIX",
    "  WINDOWS_ZIP_OUTPUT=/path/file.zip   Override output zip path",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    keepWork: process.env.WINDOWS_KEEP_WORK === "1",
    msix: envValue("WINDOWS_MSIX"),
    output: envValue("WINDOWS_ZIP_OUTPUT"),
    workDir: envValue("WINDOWS_WORK_DIR"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--msix") {
      options.msix = argv[++index];
    } else if (arg === "--output") {
      options.output = argv[++index];
    } else if (arg === "--work-dir") {
      options.workDir = argv[++index];
    } else if (arg === "--keep-work") {
      options.keepWork = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return options;
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: options.cwd ?? REPO_DIR,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr || result.stdout || ""}` : "";
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}${detail}`);
  }
  return result.stdout ?? "";
}

function ensureCommand(command) {
  run("bash", ["-lc", `command -v ${command} >/dev/null`], { capture: true });
}

function fetchMsix() {
  const stdout = run("node", [path.join(REPO_DIR, "scripts", "fetch-windows-msix.js")], { capture: true });
  const msixPath = stdout.trim().split(/\r?\n/u).at(-1);
  if (!msixPath || !fs.existsSync(msixPath)) {
    throw new Error("Windows MSIX fetch did not return a valid path");
  }
  return msixPath;
}

function parseManifestVersion(packageRoot) {
  const manifestPath = path.join(packageRoot, "AppxManifest.xml");
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = fs.readFileSync(manifestPath, "utf8");
  return manifest.match(/<Identity\b[^>]*\bVersion="([^"]+)"/u)?.[1] ?? null;
}

function findWindowsAppDir(packageRoot) {
  const candidates = [
    path.join(packageRoot, "app"),
    packageRoot,
  ];
  const stack = [packageRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir == null) continue;
    const resources = path.join(dir, "resources", "app.asar");
    if (fs.existsSync(resources)) candidates.push(dir);
    for (const name of fs.readdirSync(dir)) {
      const child = path.join(dir, name);
      if (fs.statSync(child).isDirectory() && !name.startsWith(".")) {
        stack.push(child);
      }
    }
  }
  const appDir = candidates.find((candidate) => fs.existsSync(path.join(candidate, "resources", "app.asar")));
  if (appDir == null) {
    throw new Error(`Could not find resources/app.asar under ${packageRoot}`);
  }
  return appDir;
}

function copyDirectoryContents(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  run("cp", ["-a", `${from}/.`, to]);
}

function unpackedEntries(asarPath) {
  const output = run("npx", ["--yes", "asar", "list", "--is-pack", asarPath], { capture: true });
  return output
    .split(/\r?\n/u)
    .map((line) => line.match(/^unpack\s*:\s*\/(.+)$/u)?.[1])
    .filter((entry) => entry != null);
}

function shouldCreateExtractionPlaceholder(relativePath) {
  return /\.(?:node|dll|exe|js|json|cmd|ps1)$/iu.test(relativePath);
}

function createMissingUnpackedPlaceholders(asarPath, unpackedPath) {
  if (!fs.existsSync(unpackedPath)) return [];
  const placeholders = [];
  for (const relativePath of unpackedEntries(asarPath)) {
    if (!shouldCreateExtractionPlaceholder(relativePath)) continue;
    const target = path.join(unpackedPath, relativePath);
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "");
    placeholders.push(relativePath);
  }
  if (placeholders.length > 0) {
    console.log(`[windows-zip] Created ${placeholders.length} temporary placeholders for missing upstream unpacked ASAR entries`);
  }
  return placeholders;
}

function removeRelativePaths(root, relativePaths) {
  for (const relativePath of relativePaths) {
    fs.rmSync(path.join(root, relativePath), { force: true });
  }
}

function replacePath(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  run("cp", ["-a", from, to]);
}

function patchAsar(appDir, workDir, reportPath) {
  const resourcesDir = path.join(appDir, "resources");
  const asarPath = path.join(resourcesDir, "app.asar");
  const unpackedPath = path.join(resourcesDir, "app.asar.unpacked");
  const extractedDir = path.join(workDir, "app-extracted");
  const patchedAsar = path.join(workDir, "app.asar");
  const patchedUnpacked = path.join(workDir, "app.asar.unpacked");

  fs.rmSync(extractedDir, { recursive: true, force: true });
  fs.rmSync(patchedAsar, { force: true });
  fs.rmSync(patchedUnpacked, { recursive: true, force: true });

  const placeholders = createMissingUnpackedPlaceholders(asarPath, unpackedPath);
  run("npx", ["--yes", "asar", "extract", asarPath, extractedDir]);
  removeRelativePaths(extractedDir, placeholders);
  removeRelativePaths(unpackedPath, placeholders);
  copyDirectoryContents(unpackedPath, extractedDir);

  const report = createPatchReport();
  patchExtractedWindowsApp(extractedDir, { report });

  run("bash", ["-lc", "find . -type f | LC_ALL=C sort | sed 's#^\\./##' > \"$1\"", "bash", path.join(workDir, "app.asar.ordering")], {
    cwd: extractedDir,
  });
  run("npx", [
    "--yes",
    "asar",
    "pack",
    extractedDir,
    patchedAsar,
    "--ordering",
    path.join(workDir, "app.asar.ordering"),
    "--unpack",
    "{*.node,*.dll,*.exe}",
  ]);

  recordPatch(report, "windows-asar-integrity", fs.existsSync(patchedAsar) ? "applied" : "failed-required");
  writePatchReport(reportPath, report);

  replacePath(patchedAsar, asarPath);
  fs.rmSync(unpackedPath, { recursive: true, force: true });
  if (fs.existsSync(patchedUnpacked)) {
    replacePath(patchedUnpacked, unpackedPath);
  }
}

function buildZip(appDir, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.rmSync(output, { force: true });
  run("zip", ["-qr", output, "."], { cwd: appDir });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let workDir = options.workDir;
  let createdTemp = false;
  if (workDir == null) {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-windows-zip-"));
    createdTemp = true;
  } else {
    fs.mkdirSync(workDir, { recursive: true });
  }

  try {
    ensureCommand("unzip");
    ensureCommand("zip");
    const msixPath = options.msix ?? fetchMsix();
    if (!fs.existsSync(msixPath)) {
      throw new Error(`Windows MSIX not found: ${msixPath}`);
    }

    const packageRoot = path.join(workDir, "package");
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.mkdirSync(packageRoot, { recursive: true });
    run("unzip", ["-q", msixPath, "-d", packageRoot]);

    const appDir = findWindowsAppDir(packageRoot);
    const version = process.env.PACKAGE_VERSION || parseManifestVersion(packageRoot) || "unknown";
    const output = options.output ?? path.join(DIST_DIR, `codex-desktop-windows_${version}_win32-x64.zip`);
    const reportPath = path.join(WINDOWS_UPSTREAM_DIR, "patch-report.json");

    patchAsar(appDir, workDir, reportPath);
    buildZip(appDir, output);

    console.log(`Windows ZIP: ${output}`);
    console.log(`Patch report: ${reportPath}`);
  } finally {
    if (createdTemp && !options.keepWork) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
