import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// OrcaSlicer's default feature colours; order matters (first match wins).
// Names: Orca/Bambu ("Outer wall"), PrusaSlicer ("External perimeter"), Cura ("WALL-OUTER").
export const FEATURE_COLORS = [
  [/overhang/i, '#1F1FFF', 'Overhang wall'],
  [/support.*interface|interface/i, '#008000', 'Support interface'],
  [/support/i, '#00C000', 'Support'],
  [/prime|wipe|tower/i, '#B3E3AB', 'Prime tower'],
  [/skirt|brim/i, '#0D3B73', 'Skirt / brim'],
  [/bridge/i, '#4D80BA', 'Bridge'],
  [/ironing/i, '#FF8C69', 'Ironing'],
  [/gap/i, '#FFFFFF', 'Gap infill'],
  [/outer|external|wall-outer/i, '#FF7D38', 'Outer wall'],
  [/top/i, '#F04040', 'Top surface'],
  [/bottom|solid|skin/i, '#9654CC', 'Bottom / solid infill'],
  [/inner|perimeter|wall/i, '#FFE64D', 'Inner wall'],
  [/infill|fill/i, '#B03029', 'Sparse infill'],
  [/custom/i, '#5E9E85', 'Custom'],
];
export function featureLegend(names) {
  const seen = new Map();
  for (const n of names) for (const [re, c, label] of FEATURE_COLORS) if (re.test(n)) { if (!seen.has(label)) seen.set(label, c); break; }
  return [...seen.entries()];
}
function featureColor(name) {
  for (const [re, c] of FEATURE_COLORS) if (re.test(name)) return c;
  return null;
}

const STALL_MS = 60000;  // no answer / no new data for this long -> give up instead of spinning forever
async function fetchWithProgress(url, onProgress, as = 'arrayBuffer', firstMs = STALL_MS) {
  const ctl = new AbortController();
  let timer;
  const arm = (ms = STALL_MS) => { clearTimeout(timer); timer = setTimeout(() => ctl.abort(), ms); };
  arm(firstMs);  // the first answer may take longer (STEP / OpenSCAD files are converted on first view)
  try { return await _fetchBody(url, onProgress, as, ctl, arm); }
  catch (e) {
    if (e.name === 'AbortError') throw new Error('the server did not respond – try again; if it keeps happening, check `docker compose logs zhopdeck`');
    throw e;
  } finally { clearTimeout(timer); }
}
async function _fetchBody(url, onProgress, as, ctl, arm) {
  const r = await fetch(url, { credentials: 'same-origin', signal: ctl.signal });
  arm();
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error || msg; } catch { }
    throw new Error(msg);
  }
  const total = +r.headers.get('content-length') || 0;
  if (!r.body) return as === 'text' ? await r.text() : await r.arrayBuffer();
  const reader = r.body.getReader();
  const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    arm(); chunks.push(value); got += value.length;
    if (onProgress && total) onProgress(got / total);
  }
  const buf = new Uint8Array(got); let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  return as === 'text' ? new TextDecoder().decode(buf) : buf.buffer;
}

export class Viewer {
  constructor(el, { color = '#f29d38', bed = [350, 350], dark = true } = {}) {
    this.el = el;
    this.color = color;
    this.bedSize = bed;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20000);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.autoRotateSpeed = 1.6;

    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2016, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(-1.2, -1.6, 2.2);
    const fill = new THREE.DirectionalLight(0xb8c8ff, 0.7); fill.position.set(1.5, 1, 0.6);
    const rim = new THREE.DirectionalLight(0xffe0c0, 0.6); rim.position.set(0.3, 2, -0.8);
    this.scene.add(key, fill, rim);
    this.lights = [key, fill, rim];

    this.bed = new THREE.Group();
    this.scene.add(this.bed);
    this.dark = dark;
    this.buildBed();

    this.object = null;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    this._raf = 0;
    const loop = () => { this._raf = requestAnimationFrame(loop); this.controls.update(); this.renderer.render(this.scene, this.camera); };
    loop();
  }

  buildBed() {
    this.bed.clear();
    const [bx, by] = this.bedSize;
    const plateMat = new THREE.MeshStandardMaterial({ color: this.dark ? 0x1d222b : 0xdfe3ea, roughness: 0.9, metalness: 0.05, transparent: true, opacity: 0.85 });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(bx, by), plateMat);
    plate.position.z = -0.05;
    this.bed.add(plate);
    const step = 10;
    const pts = [];
    for (let x = -bx / 2; x <= bx / 2 + 0.01; x += step) pts.push(x, -by / 2, 0, x, by / 2, 0);
    for (let y = -by / 2; y <= by / 2 + 0.01; y += step) pts.push(-bx / 2, y, 0, bx / 2, y, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: this.dark ? 0x2f3644 : 0xc5cbd6, transparent: true, opacity: 0.9 }));
    this.bed.add(grid);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(bx, by)),
      new THREE.LineBasicMaterial({ color: 0xf29d38, transparent: true, opacity: 0.55 }));
    this.bed.add(edge);
  }

  setBed(x, y) { this.bedSize = [x || 350, y || 350]; this.buildBed(); }

  // grow the grid so the whole model sits on it (rounded up to 50 mm, with a margin)
  fitBed() {
    if (!this.object) return;
    const s = new THREE.Box3().setFromObject(this.object).getSize(new THREE.Vector3());
    const need = v => Math.ceil((v * 1.15) / 50) * 50;
    const [bx, by] = this.bedSize;
    const nx = Math.max(bx, need(s.x)), ny = Math.max(by, need(s.y));
    if (nx !== bx || ny !== by) this.setBed(nx, ny);
  }
  setDark(d) { this.dark = d; this.buildBed(); }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  clear() {
    if (this.object) {
      this.scene.remove(this.object);
      this.object.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
      this.object = null;
    }
    this.gcode = null;
  }

  frame(dir = [-0.9, -1.25, 0.95]) {
    if (!this.object) return;
    const box = new THREE.Box3().setFromObject(this.object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.length() / 2, 5);
    const dist = r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.08;
    const d = new THREE.Vector3(...dir).normalize();
    this.camera.position.copy(center).addScaledVector(d, dist);
    this.camera.near = dist / 100; this.camera.far = dist * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
  }
  view(name) {
    const dirs = { iso: [-0.9, -1.25, 0.95], front: [0, -1, 0.05], top: [0, -0.001, 1], side: [1, 0, 0.05] };
    this.frame(dirs[name] || dirs.iso);
  }

  async loadMesh(url, onProgress, { firstMs } = {}) {
    const buf = await fetchWithProgress(url, onProgress, 'arrayBuffer', firstMs);
    let pos, colors = null, palette = [];
    const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    if (head.length === 4 && String.fromCharCode(...head) === 'LDMC') {  // colour-aware format
      const dv = new DataView(buf);
      const n = dv.getUint32(4, true), np = dv.getUint32(8, true), nj = dv.getUint32(12, true);
      let o = 16;
      const pal = new Uint8Array(buf, o, np * 4); o += np * 4;
      let names = [];
      if (nj) { try { names = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, o, nj))); } catch { } o += nj; }
      pos = new Float32Array(buf.slice(o, o + n * 36)); o += n * 36;
      const idx = new Uint8Array(buf, o, n);
      if (np > 1) {
        const lin = [];
        for (let k = 0; k < np; k++) {
          lin.push([srgbToLinear(pal[k * 4] / 255), srgbToLinear(pal[k * 4 + 1] / 255), srgbToLinear(pal[k * 4 + 2] / 255)]);
          palette.push({ color: '#' + [0, 1, 2].map(j => pal[k * 4 + j].toString(16).padStart(2, '0')).join(''), name: names[k] || '' });
        }
        colors = new Float32Array(n * 9);
        for (let t = 0; t < n; t++) {
          const c = lin[idx[t]] || lin[0];
          for (let v = 0; v < 3; v++) { const q = t * 9 + v * 3; colors[q] = c[0]; colors[q + 1] = c[1]; colors[q + 2] = c[2]; }
        }
      }
    } else pos = new Float32Array(buf);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (colors) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    this.multicolor = !!colors;
    this.material = new THREE.MeshStandardMaterial({ color: colors ? 0xffffff : this.color, vertexColors: !!colors, roughness: 0.52, metalness: 0.06, side: THREE.DoubleSide, flatShading: false });
    this.clear();
    this.object = new THREE.Mesh(geo, this.material);
    this.scene.add(this.object);
    this.fitBed();
    this.frame();
    const s = geo.boundingBox.getSize(new THREE.Vector3());
    return { triangles: pos.length / 9, x: s.x, y: s.y, z: s.z, palette: colors ? palette : null };
  }

  setColor(c) {
    this.color = c;
    if (this.material && !this.multicolor) this.material.color.set(c);
  }
  setWireframe(on) { if (this.material) this.material.wireframe = on; }
  setAutoRotate(on) { this.controls.autoRotate = on; }
  setBedVisible(on) { this.bed.visible = on; }

  async loadGcode(url, onProgress) {
    const text = await fetchWithProgress(url, onProgress, 'text');
    const parsed = parseGcode(text);
    if (!parsed.count) throw new Error('No extrusion moves found');
    this.clear();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(parsed.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(parsed.colors, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true });
    const lines = new THREE.LineSegments(geo, mat);
    // gcode is in bed coordinates: centre it on our bed
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    lines.position.set(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, 0);
    this.object = new THREE.Group();
    this.object.add(lines);
    this.scene.add(this.object);
    this.gcode = { geo, layerEnds: parsed.layerEnds, layerZ: parsed.layerZ };
    this.fitBed();
    this.frame();
    return { layers: parsed.layerEnds.length, segments: parsed.count, features: parsed.features, x: bb.max.x - bb.min.x, y: bb.max.y - bb.min.y, z: bb.max.z };
  }

  setLayer(n) {
    if (!this.gcode) return;
    const ends = this.gcode.layerEnds;
    const idx = Math.max(0, Math.min(ends.length - 1, n));
    this.gcode.geo.setDrawRange(0, ends[idx] * 2);
    return this.gcode.layerZ[idx];
  }

  async screenshot(size = 640) {
    const bedVis = this.bed.visible;
    this.bed.visible = false;
    const prevAuto = this.controls.autoRotate; this.controls.autoRotate = false;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1; this.camera.updateProjectionMatrix();
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.render(this.scene, this.camera);
    const blob = await new Promise(res => this.renderer.domElement.toBlob(res, 'image/png'));
    this.bed.visible = bedVis; this.controls.autoRotate = prevAuto;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    return blob;
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this.ro.disconnect();
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();  // browsers allow only ~16 live WebGL contexts per tab
    this.renderer.domElement.remove();
  }
}

// vertex colours are interpreted as *linear* by three.js (sRGB output): convert, otherwise everything looks washed out
const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

export function parseGcode(text) {
  let x = 0, y = 0, z = 0, e = 0, absXYZ = true, absE = true;
  let cap = 1 << 18, pos = new Float32Array(cap * 6), col = new Float32Array(cap * 6), n = 0;
  const layerEnds = [], layerZ = [];
  let layerZcur = null;
  let feature = null, fcol = null, hasTypes = false;
  const features = new Set();
  const grow = () => {
    cap *= 2;
    const p2 = new Float32Array(cap * 6); p2.set(pos); pos = p2;
    const c2 = new Float32Array(cap * 6); c2.set(col); col = c2;
  };
  const re = /([XYZE])\s*(-?\d*\.?\d+)/gi;
  let start = 0;
  const len = text.length;
  while (start < len) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = len;
    let line = text.slice(start, end);
    start = end + 1;
    const c0 = line.charCodeAt(0);
    if (c0 === 59) { // ';' comment: feature type markers
      const m = /^;\s*(?:TYPE|FEATURE)\s*:\s*(.+)$/i.exec(line);
      if (m) { feature = m[1].trim(); const c = featureColor(feature); fcol = c ? hexToRgb(c) : null; hasTypes = true; features.add(feature); }
      continue;
    }
    const sc = line.indexOf(';');
    if (sc >= 0) line = line.slice(0, sc);
    line = line.trim();
    if (!line) continue;
    const up = line.toUpperCase();
    if (up.startsWith('G90')) { absXYZ = true; absE = true; continue; }
    if (up.startsWith('G91')) { absXYZ = false; absE = false; continue; }
    if (up.startsWith('M82')) { absE = true; continue; }
    if (up.startsWith('M83')) { absE = false; continue; }
    if (up.startsWith('G92')) { const m = /E\s*(-?\d*\.?\d+)/i.exec(up); if (m) e = +m[1]; continue; }
    if (!(up.startsWith('G1') || up.startsWith('G0')) || /^G[01]\d/.test(up)) continue;
    let nx = x, ny = y, nz = z, ext = false, m;
    re.lastIndex = 0;
    while ((m = re.exec(up))) {
      const v = +m[2];
      switch (m[1]) {
        case 'X': nx = absXYZ ? v : x + v; break;
        case 'Y': ny = absXYZ ? v : y + v; break;
        case 'Z': nz = absXYZ ? v : z + v; break;
        case 'E': { const de = absE ? v - e : v; e = absE ? v : e + v; ext = de > 0; }
      }
    }
    if (ext && (nx !== x || ny !== y)) {
      if (layerZcur === null || nz > layerZcur + 1e-4) {
        if (layerZcur !== null) layerEnds.push(n);
        layerZ.push(nz);
        layerZcur = nz;
      }
      if (n >= cap) grow();
      const o = n * 6;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = nz; pos[o + 3] = nx; pos[o + 4] = ny; pos[o + 5] = nz;
      const k = (layerZ.length % 2) ? 1 : 0.8;  // every other layer slightly darker -> visible layer lines
      if (fcol) { col[o] = col[o + 3] = fcol[0] * k; col[o + 1] = col[o + 4] = fcol[1] * k; col[o + 2] = col[o + 5] = fcol[2] * k; }
      else { col[o] = -1; }
      n++;
    }
    x = nx; y = ny; z = nz;
  }
  if (layerZcur !== null) layerEnds.push(n);
  // height gradient for segments without a feature colour
  const zmax = layerZ.length ? layerZ[layerZ.length - 1] : 1;
  const a = hexToRgb('#5aa7ff'), b = hexToRgb('#f29d38');
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    if (col[o] === -1 || (!hasTypes && col[o] === 0 && col[o + 1] === 0)) {
      const t = Math.min(1, pos[o + 2] / (zmax || 1));
      const r = a[0] + (b[0] - a[0]) * t, g = a[1] + (b[1] - a[1]) * t, bl = a[2] + (b[2] - a[2]) * t;
      col[o] = col[o + 3] = r; col[o + 1] = col[o + 4] = g; col[o + 2] = col[o + 5] = bl;
    }
  }
  return { positions: pos.subarray(0, n * 6), colors: col.subarray(0, n * 6), count: n, layerEnds, layerZ, features: [...features] };
}
