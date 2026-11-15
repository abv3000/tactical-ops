#!/usr/bin/env node
/** Offline audio build. Run with Node 22+, with Vite serving on BAKE_URL. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const base = process.env.BAKE_URL || 'http://127.0.0.1:5173';
const output = resolve(import.meta.dirname, '../public/baked/audio');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage();
  const files = {};
  await page.exposeFunction('writeAudio', async (key, channels, sampleRate) => {
    const frames = channels[0].length;
    const data = Buffer.alloc(44 + frames * channels.length * 2);
    data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
    data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(channels.length, 22);
    data.writeUInt32LE(sampleRate, 24); data.writeUInt32LE(sampleRate * channels.length * 2, 28);
    data.writeUInt16LE(channels.length * 2, 32); data.writeUInt16LE(16, 34);
    data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
    for (let i = 0; i < frames; i++) for (let c = 0; c < channels.length; c++) {
      data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 32767), 44 + (i * channels.length + c) * 2);
    }
    const filename = key.replaceAll(':', '-') + '.wav';
    await writeFile(resolve(output, filename), data);
    files[key] = filename;
    console.log(key, data.length);
  });
  await page.route('**/__bake.html?*', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Offline audio bake</body></html>' }));
  await page.goto(base + '/__bake.html?bake=1');
  await page.evaluate(async () => {
    const { NoiseBank } = await import('/src/audio/dsp.js');
    const { Rng } = await import('/src/core/rng.js');
    const { IR_SPECS, generateIR } = await import('/src/audio/ir.js');
    const { VoiceBank } = await import('/src/audio/shotbank.js');
    const { WEAPON_PROFILES } = await import('/src/audio/weapons.js');
    const sr = 24000, rng = new Rng(0x4839ac12);
    const oc = new OfflineAudioContext(2, 1, sr);
    const emit = async (key, buffer) => window.writeAudio(key,
      Array.from({ length: buffer.numberOfChannels }, (_, c) => Array.from(buffer.getChannelData(c))), sr);
    const noise = new NoiseBank(oc, rng.fork(), 2.4);
    for (const [name, buffer] of Object.entries(noise.buffers)) await emit('noise:' + name, buffer);
    for (const [name, spec] of Object.entries(IR_SPECS)) await emit('ir:' + name, generateIR(oc, rng.fork(), spec));
    const bank = new VoiceBank(rng.fork());
    for (const profile of Object.values(WEAPON_PROFILES)) bank.registerDefaults(profile);
    for (const [key, recipe] of bank.recipes) {
      // Slow, expensive synthesis happens here once, never in a published match.
      const variants = await bank._bake(recipe, sr);
      const name = typeof key === 'string' ? key : 'shot:' + Object.keys(WEAPON_PROFILES).find(k => WEAPON_PROFILES[k] === key);
      for (let i = 0; i < variants.length; i++) await emit(name + ':' + i, variants[i]);
    }
  });
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ version: 1, sampleRate: 24000, files }, null, 2) + '\n');
  console.log('Baked', Object.keys(files).length, 'audio files.');
} finally { await browser.close(); }
