#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  createPatchReport,
  patchStatusFromChange,
  recordPatch,
  writePatchReport,
} = require("./lib/patch-report.js");
const {
  applyWebviewAssetPatchDescriptors,
  normalizePatchDescriptors,
} = require("./patches/engine.js");
const {
  findIconAsset,
  findMainBundle,
} = require("./patches/shared.js");
const {
  windowsConnectionPatchDescriptors,
} = require("./patches/windows-connections.js");
const {
  isWindowsComputerUseUiEnabled,
} = require("./patches/computer-use.js");

function usage() {
  return "Usage: patch-windows-connections.js [--report-json path] <extracted-app-asar-dir>";
}

function parseArgs(argv) {
  let reportJson = null;
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report-json") {
      reportJson = argv[index + 1];
      if (!reportJson) throw new Error(usage());
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length !== 1) {
    throw new Error(usage());
  }

  return { extractedDir: positional[0], reportJson };
}

function createWindowsPatchContext(iconAsset) {
  return {
    enableComputerUseUi: isWindowsComputerUseUiEnabled(),
    iconAsset,
    targetSummary: "windows-connections",
    windows: {
      arch: process.env.CODEX_WINDOWS_ARCH ?? "x64",
    },
  };
}

function setReportWindowsTarget(report) {
  if (report == null) return;
  report.linuxTarget = null;
  report.windowsTarget = {
    summary: "windows-connections",
    arch: process.env.CODEX_WINDOWS_ARCH ?? "x64",
    computerUseUi: isWindowsComputerUseUiEnabled(),
  };
}

function viteBuildJavaScriptFiles(buildDir) {
  return fs.readdirSync(buildDir)
    .filter((name) => name.endsWith(".js"))
    .sort()
    .map((name) => path.join(buildDir, name));
}

function windowsPatchStatus(changed, warnings, descriptor) {
  if (changed) return "applied";
  if (warnings.length > 0) {
    return descriptor.ciPolicy === "required-upstream" ? "failed-required" : "skipped-optional";
  }
  return "already-applied";
}

function captureWarningsQuiet(fn) {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    return { value: fn(), warnings };
  } finally {
    console.warn = originalWarn;
  }
}

function descriptorEnabled(descriptor, context) {
  if (descriptor.enabled == null) {
    return true;
  }
  return descriptor.enabled(context) !== false;
}

function applyWindowsMainBundlePatchDescriptors(buildDir, descriptors, context, report) {
  const files = viteBuildJavaScriptFiles(buildDir);
  const aggregateWarnings = [];
  let aggregateChanged = false;

  for (const descriptor of descriptors.filter((patch) => patch.phase === "main-bundle")) {
    if (!descriptorEnabled(descriptor, context)) {
      continue;
    }

    let descriptorChanged = false;
    const descriptorWarnings = [];
    const changedFiles = [];

    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      const result = captureWarningsQuiet(() => descriptor.apply(source, context));
      if (result.value !== source) {
        fs.writeFileSync(file, result.value, "utf8");
        descriptorChanged = true;
        aggregateChanged = true;
        changedFiles.push(path.basename(file));
      } else {
        descriptorWarnings.push(...result.warnings);
      }
    }

    if (!descriptorChanged) {
      aggregateWarnings.push(...descriptorWarnings);
    }

    recordPatch(
      report,
      descriptor.id,
      windowsPatchStatus(descriptorChanged, descriptorWarnings, descriptor),
      descriptorChanged ? null : descriptorWarnings[0] ?? null,
      {
        phase: descriptor.phase,
        targetSummary: "windows-connections",
        ...(changedFiles.length > 0 ? { targets: changedFiles } : {}),
      },
    );
  }

  return { changed: aggregateChanged, warnings: aggregateWarnings };
}

function patchExtractedWindowsApp(extractedDir, options = {}) {
  const report = options.report ?? null;
  const descriptors = normalizePatchDescriptors(windowsConnectionPatchDescriptors);

  setReportWindowsTarget(report);

  const main = findMainBundle(extractedDir);
  if (report != null) {
    report.mainBundle = main?.mainBundle ?? null;
    report.target = main == null ? null : path.join(main.buildDir, main.mainBundle);
  }
  if (main == null) {
    const reason = `Could not find main bundle in ${path.join(extractedDir, ".vite", "build")}`;
    console.warn(`WARN: ${reason} - skipping Windows main-process patches`);
    recordPatch(report, "windows-main-process-ui", "failed-required", reason);
  }

  const iconAsset = findIconAsset(extractedDir);
  if (report != null) {
    report.iconAsset = iconAsset;
  }

  const context = createWindowsPatchContext(iconAsset);
  context.report = report;

  if (main != null) {
    const { changed, warnings } = applyWindowsMainBundlePatchDescriptors(main.buildDir, descriptors, context, report);
    recordPatch(
      report,
      "windows-main-process-ui",
      patchStatusFromChange(changed, warnings),
      changed ? null : warnings[0] ?? null,
    );
  }

  captureWarningsQuiet(() => applyWebviewAssetPatchDescriptors(extractedDir, descriptors, context, report));

  console.log("Patched Windows connection behavior:", {
    target: main == null ? null : path.join(main.buildDir, main.mainBundle),
    mainBundle: main?.mainBundle ?? null,
    iconAsset,
  });
}

function main() {
  try {
    const { extractedDir, reportJson } = parseArgs(process.argv.slice(2));
    const report = reportJson == null ? null : createPatchReport();
    patchExtractedWindowsApp(extractedDir, { report });
    writePatchReport(reportJson, report);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  createWindowsPatchContext,
  patchExtractedWindowsApp,
};
