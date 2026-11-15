import { PNG } from 'pngjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const png = new PNG({width:512,height:256});
for(let y=0;y<256;y++)for(let x=0;x<512;x++) {
  const h=y/255;
  const a=h<.5?[85,137,197]:[183,170,149],b=h<.5?[210,221,228]:[91,82,70];
  const t=h<.5?h*2:(h-.5)*2;
  const i=(y*512+x)*4;
  for(let c=0;c<3;c++)png.data[i+c]=Math.round(a[c]+(b[c]-a[c])*t);
  png.data[i+3]=255;
}
await mkdir(new URL('../public/baked/',import.meta.url),{recursive:true});
await writeFile(new URL('../public/baked/environment.png',import.meta.url),PNG.sync.write(png));

// Run Three's exact reflection filter once, offline. Its CubeUV layout can be
// uploaded as a regular half-float texture on every compatible graphics driver.
const port = Number(process.env.BAKE_PORT || 5185);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--port', String(port)], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'ignore', env: { ...process.env, OW_NO_HMR: '1' },
});
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  await page.route('**/bake-environment.html', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Reflection bake</title>',
  }));
  await page.goto(origin + '/bake-environment.html');
  const asset = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const source = await new T.TextureLoader().loadAsync('/baked/environment.png');
    source.mapping = T.EquirectangularReflectionMapping;
    source.colorSpace = T.SRGBColorSpace;
    const renderer = new T.WebGLRenderer();
    const pmrem = new T.PMREMGenerator(renderer);
    const target = pmrem.fromEquirectangular(source);
    const { width, height } = target;
    const pixels = new Uint16Array(4 * width * height);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    if (!pixels.some(Boolean)) throw new Error('Reflection texture is empty');
    const bytes = new Uint8Array(pixels.buffer);
    let raw = '';
    for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
    target.dispose(); pmrem.dispose(); source.dispose(); renderer.dispose();
    return { width, height, data: btoa(raw) };
  });
  const header = Buffer.alloc(8);
  header.writeUInt32LE(asset.width, 0);
  header.writeUInt32LE(asset.height, 4);
  const compressed = gzipSync(Buffer.concat([header, Buffer.from(asset.data, 'base64')]), { level: 9 });
  await writeFile(new URL('../public/baked/reflections.bin.gz', import.meta.url), compressed);
  console.info(`Reflection atlas: ${asset.width} × ${asset.height}, ${compressed.length} bytes`);
} finally {
  await browser?.close();
  server.kill();
}
