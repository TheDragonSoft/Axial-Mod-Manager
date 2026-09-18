#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

/**
 * Generates a Tauri 2 updater manifest (latest.json) by scanning a bundles directory
 * for platform installers/packages and their corresponding .sig files.
 *
 * Usage:
 *   node scripts/generate-updater-manifest.mjs [bundlesDir] [outputFile]
 */

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: node scripts/generate-updater-manifest.mjs [bundlesDir] [outputFile]");
  process.exit(0);
}

const bundlesDir = path.resolve(process.argv[2] || "bundles");
const outputFile = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(bundlesDir, "latest.json");

const ownerRepo = process.env.GITHUB_REPOSITORY || "TheDragonSoft/Axial-Mod-Manager";

// Derive tag and clean semver version
let rawTag = process.env.GITHUB_REF_NAME || process.env.RELEASE_TAG;
if (!rawTag) {
  try {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    rawTag = `v${pkg.version}`;
  } catch {
    rawTag = "v0.0.0";
  }
}

// Semver tag normalization (strip leading 'v')
const cleanVersion = rawTag.replace(/^v/, "");

if (!fs.existsSync(bundlesDir)) {
  console.error(`Bundles directory not found: ${bundlesDir}`);
  process.exit(1);
}

// Recursively find all files in directory
function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(walkDir(filePath));
    } else {
      results.push(filePath);
    }
  }
  return results;
}

const allFiles = walkDir(bundlesDir);
const sigFiles = allFiles.filter((f) => f.endsWith(".sig"));

/**
 * Fetches the GitHub release body for the tag — it becomes the `notes` field
 * that the in-app release-notes popover renders (A5). Notes are cosmetic:
 * any failure (no release yet, rate limit, offline) falls back to the plain
 * tag line instead of failing the manifest.
 */
async function fetchReleaseBody(ownerRepo, tag) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // Authenticated when CI provides a token: avoids the anonymous 60 req/hour
  // rate limit and works if the repo ever goes private.
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${ownerRepo}/releases/tags/${encodeURIComponent(tag)}`,
      { headers },
    );
    if (!res.ok) {
      throw new Error(`GitHub API responded ${res.status}`);
    }
    const release = await res.json();
    if (typeof release.body === "string" && release.body.trim()) {
      return release.body;
    }
    console.warn("Release body is empty; falling back to default notes.");
    return null;
  } catch (err) {
    console.warn(`Could not fetch release notes (${err.message}); falling back to default notes.`);
    return null;
  }
}

const releaseBody = await fetchReleaseBody(ownerRepo, rawTag);

const platforms = {};

for (const sigPath of sigFiles) {
  const bundlePath = sigPath.slice(0, -4); // Remove .sig
  if (!fs.existsSync(bundlePath)) {
    console.warn(`Signature file ${sigPath} has no corresponding bundle at ${bundlePath}; skipping.`);
    continue;
  }

  const bundleFileName = path.basename(bundlePath);
  const signature = fs.readFileSync(sigPath, "utf8").trim();
  const downloadUrl = `https://github.com/${ownerRepo}/releases/download/${rawTag}/${bundleFileName}`;

  const lowerName = bundleFileName.toLowerCase();

  // 1. Windows (prioritize NSIS: *setup.exe or *.nsis.zip; ignore MSI for updater)
  if (lowerName.endsWith(".exe") || lowerName.endsWith(".nsis.zip")) {
    if (lowerName.includes("setup") || lowerName.endsWith(".nsis.zip")) {
      platforms["windows-x86_64"] = {
        signature,
        url: downloadUrl,
      };
    }
  }

  // 2. macOS (dmg or app tar.gz)
  else if (lowerName.endsWith(".app.tar.gz") || lowerName.endsWith(".dmg.tar.gz") || lowerName.endsWith(".dmg")) {
    if (lowerName.includes("aarch64") || lowerName.includes("arm64")) {
      platforms["darwin-aarch64"] = {
        signature,
        url: downloadUrl,
      };
    } else if (lowerName.includes("x64") || lowerName.includes("x86_64")) {
      platforms["darwin-x86_64"] = {
        signature,
        url: downloadUrl,
      };
    } else {
      // Universal or single macOS bundle — advertise to both architectures
      if (!platforms["darwin-x86_64"]) {
        platforms["darwin-x86_64"] = {
          signature,
          url: downloadUrl,
        };
      }
      if (!platforms["darwin-aarch64"]) {
        platforms["darwin-aarch64"] = {
          signature,
          url: downloadUrl,
        };
      }
    }
  }

  // 3. Linux (AppImage.tar.gz or AppImage)
  else if (lowerName.endsWith(".appimage.tar.gz") || lowerName.endsWith(".appimage")) {
    platforms["linux-x86_64"] = {
      signature,
      url: downloadUrl,
    };
  }
}

const manifest = {
  version: cleanVersion,
  // Rendered by the in-app release-notes popover; the GitHub release body
  // (markdown-lite: headings/bullets/bold) when fetchable, tag line otherwise.
  notes: releaseBody || `Axial release ${rawTag}`,
  pub_date: new Date().toISOString(),
  platforms,
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(`Generated updater manifest for ${rawTag} (${cleanVersion}) at ${outputFile}:`);
console.log(JSON.stringify(manifest, null, 2));
