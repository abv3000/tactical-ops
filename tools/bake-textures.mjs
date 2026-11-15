#!/usr/bin/env node
/** Offline deterministic texture build. Requires installed Chrome and local Vite. */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

let sharp;
try { sharp = (await import(process.env.SHARP_MODULE_PATH || 'sharp')).default; } catch { console.info('sharp is unavailable; preserving lossless PNG output.'); }
const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.BAKE_PORT || 5184);
const output = resolve(root, 'public/baked');
const profiles = process.env.TEXTURE_PROFILES?.split(',') ?? ['performance', 'low', 'high'];
if (profiles.some(q => !['performance', 'low', 'high'].includes(q))) throw new Error('Unknown texture profile');
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore', env: { ...process.env, OW_NO_HMR: '1' } });
let browser;
try {
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') console.error(m.text()); });
  const manifest = process.env.TEXTURE_PROFILES
    ? JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'))
    : { version: 1, profiles: {}, assets: {}, textures: {} };
  await page.exposeFunction('saveTexture', async ({ data, width, height, metadata }) => {
    const bytes = Buffer.from(data, 'base64');
    const png = new PNG({ width, height });
    png.data = bytes;
    let encoded = PNG.sync.write(png);
    let extension = '.png';
    if (sharp) {
      const webp = await sharp(bytes, { raw: { width, height, channels: 4 } }).webp({ lossless: true, effort: 4 }).toBuffer();
      // Transparent RGB can carry height-map data; reject any encoder change.
      if (webp.length < encoded.length && (await sharp(webp).ensureAlpha().raw().toBuffer()).equals(bytes)) { encoded = webp; extension = '.webp'; }
    }
    const id = createHash('sha256').update(bytes).update(JSON.stringify(metadata)).digest('hex').slice(0, 20) + extension;
    if (!manifest.textures[id]) {
      await writeFile(resolve(output, id), encoded);
      manifest.textures[id] = { width, height, ...metadata };
    }
    return id;
  });
  await page.goto(`http://127.0.0.1:${port}/src/assets/bake.html?bake=1`);
  await page.waitForFunction(() => window.__BAKER_READY__, { timeout: 30000 });
  for (const quality of profiles) {
    console.log(`Baking ${quality} textures…`);
    const assets = await page.evaluate(q => window.bakeProfile(q), quality);
    manifest.profiles[quality] = Object.keys(assets);
    Object.assign(manifest.assets, assets);
    console.log(`${quality}: ${Object.keys(assets).length} sets, ${Object.keys(manifest.textures).length} unique textures`);
  }
  const usedAssets = new Set(Object.values(manifest.profiles).flat());
  const usedTextures = new Set();
  const collect = value => {
    if (value && typeof value === 'object') {
      if (typeof value.texture === 'string') usedTextures.add(value.texture);
      else Object.values(value).forEach(collect);
    }
  };
  for (const key of Object.keys(manifest.assets)) {
    if (usedAssets.has(key)) collect(manifest.assets[key]);
    else delete manifest.assets[key];
  }
  for (const file of Object.keys(manifest.textures)) {
    if (!usedTextures.has(file)) delete manifest.textures[file];
  }
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest));
  for (const file of await readdir(output)) {
    if (/^[a-f0-9]{20}\.(png|webp)$/.test(file) && !manifest.textures[file]) await unlink(resolve(output, file));
  }
  console.log(`Saved prebuilt textures to ${output}`);
} finally {
  await browser?.close();
  server.kill();
}
