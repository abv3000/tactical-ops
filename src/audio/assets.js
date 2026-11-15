/** Precomputed PCM assets. Synthesis is permitted only in the offline bake page. */
export const AUDIO_BAKE = typeof location !== 'undefined' && new URLSearchParams(location.search).get('bake') === '1';
const buffers = new Map();
let pending;
export function audioAsset(key, actx) {
  const buffer = buffers.get(key);
  if (!buffer || !actx || buffer.sampleRate === actx.sampleRate) return buffer;
  const cacheKey = key + '@' + actx.sampleRate;
  if (buffers.has(cacheKey)) return buffers.get(cacheKey);
  // ConvolverNode requires the hardware context rate. Resample existing PCM,
  // never regenerate an impulse response from random noise in the browser.
  const out = actx.createBuffer(buffer.numberOfChannels, Math.ceil(buffer.duration * actx.sampleRate), actx.sampleRate);
  const ratio = buffer.sampleRate / actx.sampleRate;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const source = buffer.getChannelData(c), dest = out.getChannelData(c);
    for (let i = 0; i < dest.length; i++) {
      const at = i * ratio, lo = Math.floor(at), frac = at - lo;
      dest[i] = source[Math.min(lo, source.length - 1)] * (1 - frac) + source[Math.min(lo + 1, source.length - 1)] * frac;
    }
  }
  buffers.set(cacheKey, out);
  return out;
}
export function preloadAudioAssets() {
  if (AUDIO_BAKE) return Promise.resolve();
  if (!pending) pending = (async () => {
    const base = import.meta.env.BASE_URL + 'baked/audio/';
    const response = await fetch(base + 'manifest.json');
    if (!response.ok) throw new Error('Missing baked audio manifest');
    const manifest = await response.json();
    const decoder = new OfflineAudioContext(2, 1, manifest.sampleRate);
    const entries = Object.entries(manifest.files);
    let next = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < entries.length) {
        const [key, file] = entries[next++];
        const r = await fetch(base + file);
        if (!r.ok) throw new Error('Missing baked audio: ' + file);
        buffers.set(key, await decoder.decodeAudioData(await r.arrayBuffer()));
      }
    }));
  })().catch(error => { pending = undefined; throw error; });
  return pending;
}
