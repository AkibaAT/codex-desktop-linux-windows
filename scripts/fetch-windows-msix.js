#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const https = require("node:https");
const path = require("node:path");

const DEFAULT_PRODUCT_ID = "9PLM9XGG6VKS";
const DEFAULT_PACKAGE_PREFIX = "OpenAI.Codex_";
const DEFAULT_DEST_DIR = path.join(process.cwd(), "dist", "windows-upstream");
const RG_ADGUARD_ENDPOINT = "https://store.rg-adguard.net/api/GetFiles";
const DEFAULT_MIRROR_URL = "https://codexapp.agentsmirror.com/latest/win";
const DEFAULT_MIRROR_CHECKSUMS_URL = "https://codexapp.agentsmirror.com/latest/checksums";

function envValue(name) {
  const value = process.env[name];
  return value && value.trim() ? value : null;
}

function usage() {
  return [
    "Usage: fetch-windows-msix.js [--dest-dir dir] [--product-id id] [--url url] [--input path]",
    "",
    "Environment:",
    "  WINDOWS_MSIX=/path/file.msix        Reuse a local MSIX",
    "  WINDOWS_MSIX_URL=https://...        Download a specific MSIX URL",
    "  WINDOWS_MSIX_MIRROR_URL=https://... Download fallback mirror URL",
    "  WINDOWS_MSIX_DISABLE_MIRROR=1       Disable fallback mirror downloads",
    "  WINDOWS_MSIX_DEST_DIR=dir           Override destination directory",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    destDir: envValue("WINDOWS_MSIX_DEST_DIR") ?? DEFAULT_DEST_DIR,
    input: envValue("WINDOWS_MSIX"),
    mirrorChecksumsUrl: envValue("WINDOWS_MSIX_MIRROR_CHECKSUMS_URL") ?? DEFAULT_MIRROR_CHECKSUMS_URL,
    mirrorUrl: envValue("WINDOWS_MSIX_MIRROR_URL") ?? DEFAULT_MIRROR_URL,
    productId: envValue("WINDOWS_PRODUCT_ID") ?? DEFAULT_PRODUCT_ID,
    url: envValue("WINDOWS_MSIX_URL"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dest-dir") {
      options.destDir = argv[++index];
    } else if (arg === "--input") {
      options.input = argv[++index];
    } else if (arg === "--product-id") {
      options.productId = argv[++index];
    } else if (arg === "--url") {
      options.url = argv[++index];
    } else if (arg === "--mirror-url") {
      options.mirrorUrl = argv[++index];
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  if (!options.destDir) throw new Error("--dest-dir is required");
  return options;
}

async function resolveStoreMsixUrlWithMirror(options) {
  try {
    return await resolveStoreMsixUrl(options.productId);
  } catch (error) {
    if (process.env.WINDOWS_MSIX_DISABLE_MIRROR === "1") {
      throw error;
    }
    console.warn(
      `WARN: Microsoft Store lookup failed (${error instanceof Error ? error.message : String(error)}); ` +
      `falling back to Windows MSIX mirror ${options.mirrorUrl}`,
    );
    return options.mirrorUrl;
  }
}

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => resolve(res));
    req.on("error", reject);
    if (options.body != null) req.write(options.body);
    req.end();
  });
}

async function readResponseText(res) {
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function htmlDecode(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseWindowsPackageLinks(html) {
  const links = [];
  const regex = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/giu;
  let match;
  while ((match = regex.exec(html)) != null) {
    const href = htmlDecode(match[1]);
    const label = htmlDecode(match[2].replace(/<[^>]+>/g, "").trim());
    const filename = label || path.basename(new URL(href).pathname);
    if (!/\.msix(?:bundle)?(?:$|\?)/iu.test(href) && !/\.msix(?:bundle)?$/iu.test(filename)) continue;
    if (!filename.startsWith(DEFAULT_PACKAGE_PREFIX)) continue;
    if (!/_x64__/u.test(filename)) continue;
    links.push({ href, filename });
  }
  return links.sort((left, right) => right.filename.localeCompare(left.filename, undefined, { numeric: true }));
}

async function resolveStoreMsixUrl(productId) {
  const body = new URLSearchParams({
    type: "ProductId",
    url: productId,
    ring: "Retail",
    lang: "en-US",
  }).toString();
  const res = await request(RG_ADGUARD_ENDPOINT, {
    method: "POST",
    headers: {
      "content-length": Buffer.byteLength(body),
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "codex-desktop-linux-windows-patcher/1.0",
    },
    body,
  });
  if (res.statusCode !== 200) {
    throw new Error(`MSIX lookup failed with HTTP ${res.statusCode}`);
  }
  const html = await readResponseText(res);
  const [candidate] = parseWindowsPackageLinks(html);
  if (candidate == null) {
    throw new Error(
      `Could not find an ${DEFAULT_PACKAGE_PREFIX} x64 MSIX for product ${productId}. ` +
      "Set WINDOWS_MSIX=/path/to/OpenAI.Codex_...msix or WINDOWS_MSIX_URL=https://... and rerun.",
    );
  }
  return candidate.href;
}

function filenameFromContentDisposition(header) {
  if (!header) return null;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/iu)?.[1];
  if (utf8 != null) return decodeURIComponent(utf8.replace(/^"|"$/g, ""));
  const plain = header.match(/filename="?([^";]+)"?/iu)?.[1];
  return plain ?? null;
}

function filenameFromUrl(url) {
  const parsed = new URL(url);
  const name = path.basename(parsed.pathname);
  return name && name !== "/" ? name : null;
}

async function downloadFile(url, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  let currentUrl = url;
  for (let redirects = 0; redirects < 5; redirects += 1) {
    const res = await request(currentUrl, {
      headers: { "user-agent": "codex-desktop-linux-windows-patcher/1.0" },
    });
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
      currentUrl = new URL(res.headers.location, currentUrl).toString();
      res.resume();
      continue;
    }
    if (res.statusCode !== 200) {
      res.resume();
      throw new Error(`MSIX download failed with HTTP ${res.statusCode}`);
    }
    const filename = filenameFromContentDisposition(res.headers["content-disposition"]) ??
      filenameFromUrl(currentUrl) ??
      "OpenAI.Codex_x64.msix";
    const dest = path.join(destDir, filename.replace(/[\\/:*?"<>|]/g, "_"));
    const tmp = `${dest}.tmp-${process.pid}`;
    const out = fs.createWriteStream(tmp, { mode: 0o644 });
    try {
      await new Promise((resolve, reject) => {
        res.pipe(out);
        res.on("error", reject);
        out.on("error", reject);
        out.on("finish", resolve);
      });
      fs.renameSync(tmp, dest);
      return dest;
    } catch (error) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {}
      throw error;
    }
  }
  throw new Error("MSIX download followed too many redirects");
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

async function verifyMirrorChecksum(filePath, checksumsUrl) {
  if (!checksumsUrl) return;
  const res = await request(checksumsUrl, {
    headers: { "user-agent": "codex-desktop-linux-windows-patcher/1.0" },
  });
  if (res.statusCode !== 200) {
    res.resume();
    console.warn(`WARN: Could not fetch mirror checksums: HTTP ${res.statusCode}`);
    return;
  }
  const checksums = await readResponseText(res);
  const basename = path.basename(filePath);
  const lines = checksums.split(/\r?\n/u);
  const line = lines.find((entry) => entry.includes(basename)) ??
    (basename === "Codex-Windows-x64.msix"
      ? lines.filter((entry) => /\sOpenAI\.Codex_.*_x64__2p2nqsd0c76g0\.Msix$/u.test(entry.trim()))[0]
      : null);
  if (line == null) {
    console.warn(`WARN: Mirror checksum file did not include ${basename}`);
    return;
  }
  const expected = line.trim().split(/\s+/u)[0]?.toLowerCase();
  const actual = sha256File(filePath);
  if (!/^[a-f0-9]{64}$/u.test(expected) || actual !== expected) {
    throw new Error(`Mirror checksum mismatch for ${basename}: expected ${expected}, got ${actual}`);
  }
}

function copyInput(input, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(input));
  if (path.resolve(input) !== path.resolve(dest)) {
    fs.copyFileSync(input, dest);
  }
  return dest;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    let msixPath;
    if (options.input != null) {
      msixPath = copyInput(options.input, options.destDir);
    } else {
      const url = options.url ?? await resolveStoreMsixUrlWithMirror(options);
      msixPath = await downloadFile(url, options.destDir);
      if (url === options.mirrorUrl) {
        await verifyMirrorChecksum(msixPath, options.mirrorChecksumsUrl);
      }
    }
    console.log(msixPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseWindowsPackageLinks,
  resolveStoreMsixUrl,
};
