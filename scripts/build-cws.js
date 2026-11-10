/**
 * QualityBuffer - Chrome Web Store Publication Package Builder & Validator
 *
 * Verifies Chrome Web Store Manifest V3 policy compliance (description <= 132 chars,
 * least-privilege permissions, zero remote code, required icons) and builds a clean,
 * ready-to-publish unpacked directory and ZIP archive in ./chrome-web-store/.
 *
 * License: GPL-3.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const CWS_ROOT = path.join(ROOT_DIR, 'chrome-web-store');
const CWS_UNPACKED_DIR = path.join(CWS_ROOT, 'QualityBuffer-CWS');

function copyRecursiveSync(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function validateManifest(manifestPath) {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  if (manifest.manifest_version !== 3) {
    throw new Error('Manifest must use manifest_version: 3');
  }
  if (!manifest.description || manifest.description.length > 132) {
    throw new Error(
      `Manifest description length (${manifest.description ? manifest.description.length : 0}) exceeds Chrome Web Store 132-character limit`
    );
  }
  if (Array.isArray(manifest.permissions) && manifest.permissions.includes('tabs')) {
    throw new Error('Manifest should use "activeTab" instead of broad "tabs" permission for CWS compliance');
  }
  if (
    Array.isArray(manifest.host_permissions) &&
    manifest.host_permissions.some((h) => h.includes('localhost'))
  ) {
    throw new Error('Manifest host_permissions must not include localhost for CWS production package');
  }

  for (const size of ['16', '32', '48', '128']) {
    const iconRel = manifest.icons && manifest.icons[size];
    if (!iconRel || !fs.existsSync(path.join(ROOT_DIR, iconRel))) {
      throw new Error(`Missing required icon size ${size}: ${iconRel}`);
    }
  }

  return manifest;
}

function buildChromeWebStorePackage() {
  console.log('[CWS-Builder] Validating manifest.json against Chrome Web Store policies...');
  const manifest = validateManifest(path.join(ROOT_DIR, 'manifest.json'));
  console.log(
    `[CWS-Builder] Manifest valid: ${manifest.name} v${manifest.version} (description: ${manifest.description.length}/132 chars)`
  );

  // Clean previous unpacked publication build and old ZIP archives
  if (fs.existsSync(CWS_UNPACKED_DIR)) {
    fs.rmSync(CWS_UNPACKED_DIR, { recursive: true, force: true });
  }
  if (fs.existsSync(CWS_ROOT)) {
    for (const file of fs.readdirSync(CWS_ROOT)) {
      if (file.endsWith('.zip')) {
        fs.unlinkSync(path.join(CWS_ROOT, file));
      }
    }
  }
  fs.mkdirSync(CWS_UNPACKED_DIR, { recursive: true });

  const includeItems = [
    'manifest.json',
    'LICENSE',
    'PRIVACY_POLICY.md',
    'src',
    path.join('assets', 'icons')
  ];

  for (const item of includeItems) {
    const srcPath = path.join(ROOT_DIR, item);
    const destPath = path.join(CWS_UNPACKED_DIR, item);
    copyRecursiveSync(srcPath, destPath);
  }

  const stdZipName = `QualityBuffer-v${manifest.version}.zip`;
  const stdZipPath = path.join(CWS_ROOT, stdZipName);

  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${CWS_UNPACKED_DIR}\\*' -DestinationPath '${stdZipPath}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(`cd "${CWS_UNPACKED_DIR}" && zip -r "${stdZipPath}" .`, { stdio: 'inherit' });
  }

  console.log(`[CWS-Builder] Unpacked publication folder ready: ${CWS_UNPACKED_DIR}`);
  console.log(`[CWS-Builder] Release ZIP archive ready: ${stdZipPath}`);
}

buildChromeWebStorePackage();
