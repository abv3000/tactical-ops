import * as THREE from 'three';

let reflectionData;
export function preloadReflections() {
  reflectionData ??= (async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}baked/reflections.bin.gz`);
    if (!response.ok) throw new Error(`Reflection atlas unavailable: ${response.status}`);
    const uncompressed = response.headers.get('content-encoding')?.includes('gzip')
      ? response : new Response(response.body.pipeThrough(new DecompressionStream('gzip')));
    const bytes = await uncompressed.arrayBuffer();
    const header = new DataView(bytes);
    const width = header.getUint32(0, true), height = header.getUint32(4, true);
    if (!width || !height || bytes.byteLength !== 8 + width * height * 8) throw new Error('Invalid reflection atlas');
    return { width, height, pixels: new Uint16Array(bytes, 8) };
  })().catch(error => {
    reflectionData = undefined;
    throw error;
  });
  return reflectionData;
}

// Mobile uses a direct forward pass. The desktop deferred/post stack compiles
// dozens of GPU programs even with its effects switched off.
export class MobileRenderSystem {
  static id = 'render';
  static deps = [];
  async init(ctx) {
    this.ctx = ctx;
    this.mobile = true;
    this.q = ctx.config.q;
    this.lights = [];
    this.passes = [];
    this.screenSize = { width: 1, height: 1 };
    this.settings = {};
    this.renderer = new THREE.WebGLRenderer({canvas:ctx.canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.autoClear = false;
    this.sunDir = new THREE.Vector3(-.5,.8,.3).normalize();
    this.sun = new THREE.DirectionalLight(0xffe4bd,3.5);
    this.sun.position.copy(this.sunDir).multiplyScalar(100);
    this.activeSun = this.sun;
    this.fill = new THREE.HemisphereLight(0xc2dbff,0x756553,2);
    ctx.scene.add(this.sun,this.sun.target,this.fill);
    ctx.scene.background = new THREE.Color(0x9bbeda);
    ctx.scene.fog = new THREE.Fog(0xbac9d1,65,250);
    this.viewSun = new THREE.DirectionalLight(0xffe4bd,14);
    this.viewSun.position.set(-1,2,3);
    this.viewFill = new THREE.HemisphereLight(0xc2dbff,0x9b8063,6);
    ctx.viewScene.add(this.viewSun,this.viewSun.target,this.viewFill);
    const { width, height, pixels } = await preloadReflections();
    const environment = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
    environment.mapping = THREE.CubeUVReflectionMapping;
    environment.minFilter = environment.magFilter = THREE.LinearFilter;
    environment.colorSpace = THREE.LinearSRGBColorSpace;
    environment.needsUpdate = true;
    ctx.scene.environment = ctx.viewScene.environment = environment;
    this.environment = environment;
  }
  addLight(light, opts = {}) { this.lights.push({light,...opts}); light.visible = false; }
  removeLight(light) { this.lights = this.lights.filter(e => e.light !== light); }
  registerPass() { return () => {}; }
  setEnvMap(texture) { this.ctx.scene.environment = this.ctx.viewScene.environment = texture; }
  getRenderer() { return this.renderer; }
  getSettings() { return {...this.settings}; }
  setSetting(key,value) { this.settings[key] = value; }
  patchMaterials() {}
  resize(w,h) {
    const ratio = Math.min(devicePixelRatio || 1,1.25) * this.q.renderScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w,h,false);
    this.screenSize.width = Math.floor(w*ratio); this.screenSize.height = Math.floor(h*ratio);
  }
  _hidePointLights() {
    const hide = o => { if(o.isPointLight || o.isSpotLight) o.visible = false; };
    this.ctx.scene.traverse(hide); this.ctx.viewScene.traverse(hide);
  }
  async warm() {
    this._hidePointLights();
    // Compile the final light layout and both scenes once; no transient gameplay
    // staging, MRT overrides or post-processing permutations are needed.
    await this.renderer.compileAsync(this.ctx.scene,this.ctx.camera);
    await this.renderer.compileAsync(this.ctx.viewScene,this.ctx.viewCamera);
    this.render();
    return {ok:true,programs:this.renderer.info.programs.length};
  }
  render() {
    const {scene,camera,viewScene,viewCamera} = this.ctx;
    this._hidePointLights();
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(scene,camera);
    this.renderer.clearDepth();
    this.renderer.render(viewScene,viewCamera);
  }
  dispose() { this.environment?.dispose(); this.renderer?.dispose(); }
}

export class MobileSkySystem {
  static id = 'sky';
  static deps = ['render','materials'];
  init(ctx) {
    this.ctx = ctx;
    this.hour = 16.5;
    this.sunAltitude = .6;
    this.sunDirection = ctx.get('render').sunDir;
  }
  setTimeOfDay(hour) { this.hour = hour; }
  update() {}
  dispose() {}
}
