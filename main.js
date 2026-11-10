import * as THREE from 'three';

/* =========================================================
   SETUP
   ========================================================= */
const D2 = document.getElementById('c2d');
const D3 = document.getElementById('c3d');
const ctx = D2.getContext('2d');
const overlay = document.getElementById('overlay');
const hintEl = document.getElementById('hint');
const hudEl = document.getElementById('hud');
const mobileUI = document.getElementById('mobile-ui');

const renderer3D = new THREE.WebGLRenderer({ canvas: D3, antialias: true });

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

/* ---------- world constants ---------- */
const ROOM = { minX: -12, maxX: 12, minZ: -16, maxZ: 16 };
const WALL_H = 5;
const WALL_T = 0.5;
const PLAYER_PAD = 0.8;
const RIFT_POS = new THREE.Vector3(0, 0.15, 0);
const RIFT_ACTIVATION_RADIUS = 4;
const RIFT_INTERACT_RADIUS = 3;
const KLUBOK_START = new THREE.Vector3(4.5, 0.35, 5);
const PLAYER_START = new THREE.Vector3(0, 0, 8);
const CAPSULES_X = -10.5;
const CAPSULE_Z = [-10, -5, 0, 5, 10];
const PULT_POS = { x: 10.5, z: 6 };

/* =========================================================
   INPUT
   ========================================================= */
const keys = Object.create(null);
const look = { dx: 0, dy: 0 };
const input = { moveX: 0, moveY: 0, joyActive: false, touchMode: false };

const actionBuf = Object.create(null);
function pressAction(code) { actionBuf[code] = (actionBuf[code] || 0) + 1; }
function consumeAction(code) {
  if (actionBuf[code] > 0) { actionBuf[code]--; return true; }
  return false;
}

addEventListener('keydown', e => {
  if (!keys[e.code]) pressAction(e.code);
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE','KeyF'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });

function getMoveInput() {
  let f = 0, r = 0;
  if (input.joyActive) { f = input.moveY; r = input.moveX; }
  else {
    f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  }
  const len = Math.hypot(f, r);
  if (len > 1) { f /= len; r /= len; }
  return { f, r };
}

let lookPointerId = null;
let lookLastX = 0, lookLastY = 0;
D3.addEventListener('pointerdown', e => {
  if (lookPointerId !== null) return;
  lookPointerId = e.pointerId;
  lookLastX = e.clientX; lookLastY = e.clientY;
  try { D3.setPointerCapture(e.pointerId); } catch {}
});
D3.addEventListener('pointermove', e => {
  if (e.pointerId !== lookPointerId) return;
  look.dx += e.clientX - lookLastX;
  look.dy += e.clientY - lookLastY;
  lookLastX = e.clientX; lookLastY = e.clientY;
});
D3.addEventListener('pointerup', e => { if (e.pointerId === lookPointerId) lookPointerId = null; });
D3.addEventListener('pointercancel', e => { if (e.pointerId === lookPointerId) lookPointerId = null; });

/* =========================================================
   TOUCH UI
   ========================================================= */
function detectTouch() {
  const url = new URL(location.href);
  const force = url.searchParams.get('touch');
  if (force === '1') return true;
  if (force === '0') return false;
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || matchMedia('(any-pointer: coarse)').matches;
}
function setupTouchUI() {
  if (!mobileUI) return;
  const show = detectTouch();
  input.touchMode = show;
  mobileUI.classList.toggle('visible', show);
  console.log('[touch] enabled =', show);
}

const joyBase = document.getElementById('joystick-base');
const joyThumb = document.getElementById('joystick-thumb');
const JOY_RADIUS = 38;
let joyPointerId = null, joyCenterX = 0, joyCenterY = 0;

if (joyBase && joyThumb) {
  joyBase.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    if (joyPointerId !== null) return;
    joyPointerId = e.pointerId;
    try { joyBase.setPointerCapture(e.pointerId); } catch {}
    const rect = joyBase.getBoundingClientRect();
    joyCenterX = rect.left + rect.width / 2;
    joyCenterY = rect.top + rect.height / 2;
    input.joyActive = true;
    updateJoystick(e.clientX, e.clientY);
  });
  joyBase.addEventListener('pointermove', e => {
    if (e.pointerId !== joyPointerId) return;
    e.preventDefault();
    updateJoystick(e.clientX, e.clientY);
  });
  const endJoy = e => {
    if (e.pointerId !== joyPointerId) return;
    joyPointerId = null;
    input.joyActive = false;
    input.moveX = 0; input.moveY = 0;
    joyThumb.style.transform = 'translate(-50%, -50%)';
  };
  joyBase.addEventListener('pointerup', endJoy);
  joyBase.addEventListener('pointercancel', endJoy);

  function updateJoystick(x, y) {
    let dx = x - joyCenterX, dy = y - joyCenterY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, JOY_RADIUS);
    const angle = Math.atan2(dy, dx);
    const fx = Math.cos(angle) * clamped;
    const fy = Math.sin(angle) * clamped;
    joyThumb.style.transform = `translate(calc(-50% + ${fx}px), calc(-50% + ${fy}px))`;
    const deadZone = 5;
    const effective = Math.max(0, clamped - deadZone) / (JOY_RADIUS - deadZone);
    input.moveX = Math.cos(angle) * effective;
    input.moveY = -Math.sin(angle) * effective;
  }
}

document.querySelectorAll('.action-btn').forEach(btn => {
  const action = btn.dataset.action;
  const key = 'Key' + action;
  btn.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    try { btn.setPointerCapture(e.pointerId); } catch {}
    pressAction(key);
    keys[key] = true;
    btn.classList.add('active');
  });
  const release = () => { keys[key] = false; btn.classList.remove('active'); };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('contextmenu', e => e.preventDefault());
});

setupTouchUI();

/* =========================================================
   GAME
   ========================================================= */
const game = {
  ctx, w: innerWidth, h: innerHeight,
  renderer3D,
  scene: null,
  time: 0,
  transitioning: false,
  state: {
    last3DPos: { x: PLAYER_START.x, z: PLAYER_START.z },
    started: false,
  },
};

function resize() {
  const w = innerWidth, h = innerHeight;
  game.w = w; game.h = h;
  const dpr = Math.min(devicePixelRatio, 2);
  D2.width = Math.floor(w * dpr);
  D2.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderer3D.setPixelRatio(dpr);
  renderer3D.setSize(w, h, false);
  if (game.scene?.resize) game.scene.resize(w, h);
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 100));

let hintTimer = null;
function hint(text, ms = 3000) {
  hintEl.textContent = text;
  hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.remove('show'), ms);
  console.log('[hint]', text);
}

function setCanvasMode(is3D) {
  D2.style.opacity = is3D ? '0' : '1';
  D3.style.opacity = is3D ? '1' : '0';
  D3.style.pointerEvents = is3D ? 'auto' : 'none';
  look.dx = 0; look.dy = 0;
  lookPointerId = null;
  hudEl.textContent = input.touchMode
    ? (is3D ? '3D · джойстик — ходьба · правый край — камера · F — бросок · E — действие'
            : '2D · джойстик — ходьба · E — действие')
    : (is3D ? '3D · WASD — движение · зажать мышь — камера · F — клубок · E — действие'
            : '2D · WASD / стрелки — движение · E — действие');
}

/* =========================================================
   HELPERS
   ========================================================= */
function makeCanvasTexture(renderFn, w = 512, h = 256) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c2 = cv.getContext('2d');
  renderFn(c2, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  tex.anisotropy = 4;
  return tex;
}

function makeTextTexture(text, { color = '#ff3a4a', fontSize = 80, height = 1.2, letterSpacing = 6 } = {}) {
  const cv = document.createElement('canvas');
  const c2 = cv.getContext('2d');
  c2.font = `bold ${fontSize}px "Courier New", monospace`;
  const measured = c2.measureText(text).width + letterSpacing * (text.length - 1);
  const pad = 40;
  cv.width = Math.ceil(measured + pad * 2);
  cv.height = fontSize + pad * 2;
  const c3 = cv.getContext('2d');
  c3.font = `bold ${fontSize}px "Courier New", monospace`;
  c3.fillStyle = color;
  c3.textBaseline = 'middle';
  let x = pad;
  for (const ch of text) {
    c3.fillText(ch, x, cv.height / 2);
    x += c3.measureText(ch).width + letterSpacing;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  tex.anisotropy = 4;
  const aspect = tex.image.width / tex.image.height;
  const geo = new THREE.PlaneGeometry(height * aspect, height);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  return new THREE.Mesh(geo, mat);
}

function buildCapsule(index) {
  const group = new THREE.Group();
  const isWarning = index === 1;

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a2a44, metalness: 0.7, roughness: 0.4 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.3, 24), baseMat);
  base.position.y = 0.15;
  group.add(base);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x4aa8ff, transparent: true, opacity: 0.22,
    metalness: 0.1, roughness: 0.1, side: THREE.DoubleSide,
    emissive: 0x113366, emissiveIntensity: 0.4,
  });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.6, 24, 1, true), glassMat);
  glass.position.y = 1.5;
  group.add(glass);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x081620, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.2, 16), bodyMat);
  body.position.y = 1.5;
  group.add(body);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.85, 0.3, 24), baseMat);
  cap.position.y = 2.95;
  group.add(cap);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.88, 0.04, 8, 32),
    new THREE.MeshBasicMaterial({
      color: isWarning ? 0xff3a4a : 0x44ffaa,
      transparent: true, opacity: 0.85,
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.31;
  group.add(ring);

  const glow = new THREE.PointLight(isWarning ? 0xff3a4a : 0x44aaff, 2.2, 5);
  glow.position.y = 0.5;
  group.add(glow);

  // Номер капсулы
  const numTex = makeCanvasTexture((c, w, h) => {
    c.fillStyle = isWarning ? '#ff3a4a' : '#4ff0ff';
    c.font = 'bold 80px monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(index + 1).padStart(2, '0'), w / 2, h / 2);
  }, 128, 128);
  const numMat = new THREE.MeshBasicMaterial({ map: numTex, transparent: true });
  const numPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), numMat);
  numPlane.position.set(0, 3.5, 0);
  group.add(numPlane);

  return group;
}

/* =========================================================
   TRANSITIONS
   ========================================================= */
async function collapseTo2D(world3d) {
  if (game.transitioning) return;
  game.transitioning = true;
  console.log('[transition] collapse start');

  game.state.last3DPos = { x: world3d.pos.x, z: world3d.pos.z };

  const cam = world3d.camera;
  const p = world3d.pos;
  const scene3 = world3d.scene3;

  const startPos = cam.position.clone();
  const startFov = cam.fov;
  const startFogDensity = scene3.fog ? scene3.fog.density : 0;
  const startScaleY = scene3.scale.y;
  const startLookTarget = new THREE.Vector3(p.x, 1.7, p.z);

  const endPos = new THREE.Vector3(p.x + 0.5, 1.2, p.z + 0.5);
  const endFov = 110;
  const endFogDensity = 0.55;
  const endScaleY = 0.04;
  const endLookTarget = new THREE.Vector3(p.x, 0, p.z);

  overlay.style.transition = 'none';
  overlay.style.background = 'white';
  overlay.style.opacity = '0';

  const dur = 900;
  const t0 = performance.now();

  await new Promise(resolve => {
    function step() {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = t * t;
      cam.position.lerpVectors(startPos, endPos, e);
      cam.fov = startFov + (endFov - startFov) * e;
      cam.updateProjectionMatrix();
      const lookT = new THREE.Vector3().lerpVectors(startLookTarget, endLookTarget, e);
      cam.lookAt(lookT);
      if (scene3.fog) scene3.fog.density = startFogDensity + (endFogDensity - startFogDensity) * e;
      scene3.scale.y = startScaleY + (endScaleY - startScaleY) * e;
      overlay.style.opacity = String(Math.pow(e, 2.5));
      if (t < 1) requestAnimationFrame(step); else resolve();
    }
    requestAnimationFrame(step);
  });

  overlay.style.background = 'black';
  overlay.style.opacity = '1';
  await new Promise(r => setTimeout(r, 180));

  world3d.exit?.();
  game.scene = new World2D(game);
  setCanvasMode(false);
  game.scene.enter();
  game.scene.resize(game.w, game.h);

  overlay.style.transition = 'opacity 0.6s ease';
  overlay.style.opacity = '0';
  await new Promise(r => setTimeout(r, 650));

  game.transitioning = false;
  console.log('[transition] collapse done');
}

async function inflateTo3D(world2d) {
  if (game.transitioning) return;
  game.transitioning = true;
  console.log('[transition] inflate start');

  overlay.style.transition = 'opacity 0.35s ease';
  overlay.style.background = 'black';
  overlay.style.opacity = '1';
  await new Promise(r => setTimeout(r, 380));

  world2d.exit?.();
  game.scene = new World3D(game);
  setCanvasMode(true);
  game.scene.enter();
  game.scene.resize(game.w, game.h);

  const world3d = game.scene;
  const cam = world3d.camera;
  const p = world3d.pos;

  world3d.scene3.scale.y = 0.04;
  if (world3d.scene3.fog) world3d.scene3.fog.density = 0.55;
  cam.fov = 110;
  cam.updateProjectionMatrix();
  cam.position.set(p.x + 0.5, 1.2, p.z + 0.5);
  cam.lookAt(p.x, 0, p.z);

  const startPos = cam.position.clone();
  const startFov = cam.fov;
  const startFogDensity = 0.55;
  const startScaleY = 0.04;

  const dist = 9;
  const off = new THREE.Vector3(
    Math.sin(world3d.yaw) * Math.cos(world3d.pitch),
    Math.sin(world3d.pitch),
    Math.cos(world3d.yaw) * Math.cos(world3d.pitch)
  ).multiplyScalar(dist);
  const endPos = new THREE.Vector3(p.x, 1.7, p.z).add(off);
  const endFov = 60;
  const endFogDensity = 0.02;
  const endScaleY = 1;

  overlay.style.transition = 'opacity 0.9s ease';
  overlay.style.opacity = '0';

  const dur = 900;
  const t0 = performance.now();

  await new Promise(resolve => {
    function step() {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - t, 2);
      cam.position.lerpVectors(startPos, endPos, e);
      cam.fov = startFov + (endFov - startFov) * e;
      cam.updateProjectionMatrix();
      cam.lookAt(p.x, 1.7, p.z);
      if (world3d.scene3.fog) world3d.scene3.fog.density = startFogDensity + (endFogDensity - startFogDensity) * e;
      world3d.scene3.scale.y = startScaleY + (endScaleY - startScaleY) * e;
      if (t < 1) requestAnimationFrame(step); else resolve();
    }
    requestAnimationFrame(step);
  });

  overlay.style.opacity = '0';
  game.transitioning = false;
  console.log('[transition] inflate done');
}

/* =========================================================
   WORLD 3D — КРИОЗАЛ (полированная версия)
   ========================================================= */
class World3D {
  constructor(game) { this.game = game; this.is3D = true; }

  enter() {
    look.dx = 0; look.dy = 0;
    actionBuf.KeyE = 0; actionBuf.KeyF = 0;

    const g = this.game;
    const isFirst = !g.state.started;
    g.state.started = true;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02040a);
    scene.fog = new THREE.FogExp2(0x02040a, 0.018);
    this.scene3 = scene;

    this.camera = new THREE.PerspectiveCamera(60, g.w / g.h, 0.1, 300);
    this.camera.position.set(0, 6, 16);
    this.camera.lookAt(0, 1.7, 8);

    /* ---- lighting ---- */
    scene.add(new THREE.HemisphereLight(0x88bbff, 0x0a1020, 0.5));
    const mainDir = new THREE.DirectionalLight(0xaaccff, 0.5);
    mainDir.position.set(5, 15, 10);
    scene.add(mainDir);
    // ambient fill
    scene.add(new THREE.AmbientLight(0x1a2a4a, 0.4));

    /* ---- starfield backdrop ---- */
    this._buildStars(scene);

    /* ---- floor ---- */
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 32),
      new THREE.MeshStandardMaterial({ color: 0x081228, roughness: 0.85, metalness: 0.3 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const grid = new THREE.GridHelper(32, 32, 0x2a6cff, 0x0e1c3a);
    grid.material.transparent = true;
    grid.material.opacity = 0.4;
    grid.position.y = 0.01;
    scene.add(grid);

    /* ---- walls ---- */
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0a1730, emissive: 0x050a18, emissiveIntensity: 0.6,
      roughness: 0.75, metalness: 0.5,
    });
    const wallGeoLR = new THREE.BoxGeometry(WALL_T, WALL_H, 32);
    const wallGeoFB = new THREE.BoxGeometry(24, WALL_H, WALL_T);

    this.wallMeshes = [];

    const leftWall = new THREE.Mesh(wallGeoLR, wallMat);
    leftWall.position.set(ROOM.minX, WALL_H / 2, 0);
    scene.add(leftWall); this.wallMeshes.push(leftWall);

    const rightWall = new THREE.Mesh(wallGeoLR, wallMat);
    rightWall.position.set(ROOM.maxX, WALL_H / 2, 0);
    scene.add(rightWall); this.wallMeshes.push(rightWall);

    const backWall = new THREE.Mesh(wallGeoFB, wallMat);
    backWall.position.set(0, WALL_H / 2, ROOM.minZ);
    scene.add(backWall); this.wallMeshes.push(backWall);

    const frontWall = new THREE.Mesh(wallGeoFB, wallMat);
    frontWall.position.set(0, WALL_H / 2, ROOM.maxZ);
    scene.add(frontWall); this.wallMeshes.push(frontWall);

    /* ---- emergency strips ---- */
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xff3a4a, transparent: true, opacity: 0.55 });
    const stripGeoLR = new THREE.BoxGeometry(0.05, 0.08, 32);
    const stripGeoFB = new THREE.BoxGeometry(24, 0.08, 0.05);
    for (const y of [0.05, 0.35]) {
      const sL = new THREE.Mesh(stripGeoLR, stripMat); sL.position.set(ROOM.minX + 0.28, y, 0); scene.add(sL);
      const sR = new THREE.Mesh(stripGeoLR, stripMat); sR.position.set(ROOM.maxX - 0.28, y, 0); scene.add(sR);
      const sB = new THREE.Mesh(stripGeoFB, stripMat); sB.position.set(0, y, ROOM.minZ + 0.28); scene.add(sB);
      const sF = new THREE.Mesh(stripGeoFB, stripMat); sF.position.set(0, y, ROOM.maxZ - 0.28); scene.add(sF);
    }
    this.stripMat = stripMat;

    /* ---- pipes along back wall ---- */
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x2a3a5a, metalness: 0.8, roughness: 0.35 });
    for (let i = 0; i < 3; i++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 24, 8), pipeMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0, 4.3 + i * 0.22, ROOM.minZ + 0.35);
      scene.add(pipe);
    }

    /* ---- wall signs ---- */
    const rusPanel = makeTextTexture('РУСЬ-7', { color: '#4ff0ff', fontSize: 110, height: 1.6 });
    rusPanel.position.set(0, 3.4, ROOM.minZ + 0.28);
    scene.add(rusPanel);

    const cryoPanel = makeTextTexture('КРИООТСЕК · 2', { color: '#ff3a4a', fontSize: 70, height: 1.0 });
    cryoPanel.position.set(0, 3.4, ROOM.maxZ - 0.28);
    cryoPanel.rotation.y = Math.PI;
    scene.add(cryoPanel);

    const svarogPanel = makeTextTexture('СВАРОГ', { color: '#ff8a1a', fontSize: 80, height: 1.1 });
    svarogPanel.position.set(ROOM.maxX - 0.28, 2.6, -6);
    svarogPanel.rotation.y = -Math.PI / 2;
    scene.add(svarogPanel);

    /* ---- data screen on left wall ---- */
    const screenTex = makeCanvasTexture((c, w, h) => {
      c.fillStyle = '#02060e';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#ff8a1a';
      c.lineWidth = 3;
      c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#ff8a1a';
      c.font = 'bold 26px monospace';
      c.textAlign = 'center';
      c.fillText('АВАРИЙНЫЙ РЕЖИМ', w / 2, 70);
      c.fillStyle = '#4ff0ff';
      c.font = 'bold 22px monospace';
      c.fillText('ЭКИПАЖ: 0', w / 2, 120);
      c.fillText('ВЫЖИВШИХ: 1', w / 2, 155);
      c.fillStyle = '#ff3a4a';
      c.font = 'bold 20px monospace';
      c.fillText('РЕАКТОР: 12%', w / 2, 200);
    }, 512, 256);
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), screenMat);
    screen.position.set(ROOM.minX + 0.28, 3.0, 8);
    screen.rotation.y = Math.PI / 2;
    scene.add(screen);

    /* ---- capsules ---- */
    for (let i = 0; i < CAPSULE_Z.length; i++) {
      const cap = buildCapsule(i);
      cap.position.set(CAPSULES_X, 0, CAPSULE_Z[i]);
      cap.rotation.y = -Math.PI / 2;
      scene.add(cap);

      if (i === 1) {
        const warn = makeTextTexture('НЕ ВХОДИ', { color: '#ff3a4a', fontSize: 60, height: 0.55 });
        warn.position.set(CAPSULES_X + 1.2, 1.7, CAPSULE_Z[i]);
        warn.rotation.y = Math.PI / 2;
        scene.add(warn);
      }
    }

    /* ---- pult ---- */
    const pultBase = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.0, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x0a1a30, metalness: 0.7, roughness: 0.4 })
    );
    pultBase.position.set(PULT_POS.x, 0.5, PULT_POS.z);
    scene.add(pultBase);

    const pultTex = makeCanvasTexture((c, w, h) => {
      c.fillStyle = '#04101e';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#4ff0ff';
      c.lineWidth = 3;
      c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = '#4ff0ff';
      c.font = 'bold 22px monospace';
      c.textAlign = 'center';
      c.fillText('РУСЬ-7 · ПУЛЬТ-02', w / 2, 40);
      c.fillStyle = '#ff3a4a';
      c.font = 'bold 18px monospace';
      c.fillText('СВЯЗЬ С ЗЕМЛЁЙ: ПОТЕРЯНА', w / 2, 90);
      c.fillStyle = '#88ffaa';
      c.font = 'bold 16px monospace';
      c.fillText('> инициализация пробуждения...', w / 2, 130);
      c.fillText('> Сварог: ядро активно', w / 2, 155);
      c.fillText('> Сварог: найди клубок', w / 2, 180);
    }, 512, 256);
    const pultScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 0.95),
      new THREE.MeshBasicMaterial({ map: pultTex, transparent: true })
    );
    pultScreen.position.set(PULT_POS.x - 0.51, 1.3, PULT_POS.z);
    pultScreen.rotation.y = -Math.PI / 2;
    pultScreen.rotation.z = -0.15;
    scene.add(pultScreen);

    // кнопки-индикаторы
    for (let i = 0; i < 6; i++) {
      const btn = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.03, 0.15),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x4ff0ff : 0xff3a4a })
      );
      btn.position.set(PULT_POS.x - 0.6, 1.03, PULT_POS.z - 0.4 + i * 0.16);
      scene.add(btn);
    }

    /* ---- data tablet on floor ---- */
    const tablet = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.04, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x44aaff, emissive: 0x2277ff, emissiveIntensity: 1.5 })
    );
    tablet.position.set(2.5, 0.03, 3);
    tablet.rotation.y = 0.5;
    scene.add(tablet);
    this.tablet = tablet;
    this.tabletRead = false;

    /* ---- emergency corner lights ---- */
    this.emergencyLights = [];
    const corners = [
      [ROOM.minX + 1.5, 4.2, ROOM.minZ + 1.5],
      [ROOM.maxX - 1.5, 4.2, ROOM.minZ + 1.5],
      [ROOM.minX + 1.5, 4.2, ROOM.maxZ - 1.5],
      [ROOM.maxX - 1.5, 4.2, ROOM.maxZ - 1.5],
    ];
    for (const [x, y, z] of corners) {
      const light = new THREE.PointLight(0xff2a3a, 3, 14);
      light.position.set(x, y, z);
      scene.add(light);
      this.emergencyLights.push(light);
    }

    /* ---- rift ---- */
    this.rift = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.18, 16, 48),
      new THREE.MeshStandardMaterial({ color: 0x2277ff, emissive: 0x2277ff, emissiveIntensity: 1.2 })
    );
    this.rift.position.copy(RIFT_POS);
    this.rift.rotation.x = Math.PI / 2;
    scene.add(this.rift);
    this.riftMat = this.rift.material;

    this.riftLight = new THREE.PointLight(0x44aaff, 5, 20);
    this.riftLight.position.set(RIFT_POS.x, 0.7, RIFT_POS.z);
    scene.add(this.riftLight);

    this.riftBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.05, 15, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.14, side: THREE.DoubleSide })
    );
    this.riftBeam.position.set(RIFT_POS.x, 7.5, RIFT_POS.z);
    scene.add(this.riftBeam);

    // shell (активируется при sealed)
    this.riftShell = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    this.riftShell.position.copy(RIFT_POS);
    this.riftShell.position.y = 0.7;
    scene.add(this.riftShell);

    // активационная волна (видна коротко при запечатывании)
    this.riftWave = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.5, 48),
      new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    this.riftWave.rotation.x = -Math.PI / 2;
    this.riftWave.position.copy(RIFT_POS);
    this.riftWave.position.y = 0.06;
    scene.add(this.riftWave);
    this.riftWaveT = -1;  // -1 = idle, 0..1 = animating

    /* ---- klubok ---- */
    this.klubokMesh = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xffcc66, emissive: 0xffaa33, emissiveIntensity: 2 })
    );
    this.klubokMesh.add(ball);
    const klubokLight = new THREE.PointLight(0xffcc66, 1.5, 4);
    this.klubokMesh.add(klubokLight);
    scene.add(this.klubokMesh);

    this.thread = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1, 4),
      new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.8 })
    );
    this.thread.visible = false;
    scene.add(this.thread);

    /* ---- player ---- */
    this.player = new THREE.Group();
    const playerBodyMat = new THREE.MeshStandardMaterial({
      color: 0x66ddff, emissive: 0x114466, emissiveIntensity: 1.4,
    });
    this.playerBodyMat = playerBodyMat;
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 1.1), playerBodyMat);
    bodyMesh.position.y = 1;
    this.player.add(bodyMesh);
    const playerGlow = new THREE.PointLight(0x66ddff, 1.5, 5);
    playerGlow.position.y = 1.2;
    this.player.add(playerGlow);
    // маленький "визор" спереди, чтобы видеть лицо
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.3, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x88ffff })
    );
    visor.position.set(0, 1.7, 0.56);
    this.player.add(visor);
    scene.add(this.player);

    /* ---- state ---- */
    this.pos = new THREE.Vector3(PLAYER_START.x, PLAYER_START.y, PLAYER_START.z);
    this.yaw = 0;
    this.pitch = 0.25;
    this.t = 0;

    this.klubokState = 'ground';
    this.klubokMesh.position.copy(KLUBOK_START);
    this.klubokAnim = null;

    // камера: intro pull-back при первом входе
    this.camDist = isFirst ? 2.5 : 9;
    this.lastRiftPrompt = 0;
    this.transitionReady = false;

    hint(isFirst ? 'Ты один. Криозал «Русь-7». Осмотрись' : 'Снова в Яви', 4000);
    console.log('[world3d] entered · kryoal (v4)');
  }

  _buildStars(scene) {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 0; i < 800; i++) {
      const r = 80 + Math.random() * 100;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaaccff, size: 0.6, transparent: true, opacity: 0.85 });
    scene.add(new THREE.Points(geo, mat));
  }

  updateCamera(dt) {
    const playerHead = new THREE.Vector3(this.pos.x, 1.7, this.pos.z);
    const desiredDist = 9;

    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    const dir = off.clone().normalize();

    // коллизия камеры
    const rc = new THREE.Raycaster(playerHead.clone(), dir.clone(), 0.1, desiredDist);
    const hits = rc.intersectObjects(this.wallMeshes, false);
    let wantedDist = desiredDist;
    if (hits.length > 0) {
      wantedDist = Math.max(1.5, hits[0].distance - 0.4);
    }

    // smooth: прижимаемся быстро, отъезжаем медленно
    if (this.camDist === undefined) this.camDist = wantedDist;
    const speed = wantedDist < this.camDist ? 22 : 3;
    this.camDist += (wantedDist - this.camDist) * Math.min(1, speed * dt);
    this.camDist = clamp(this.camDist, 1.2, desiredDist);

    const finalPos = playerHead.clone().add(dir.clone().multiplyScalar(this.camDist));
    finalPos.y = Math.max(0.6, finalPos.y);

    this.camera.position.copy(finalPos);
    this.camera.lookAt(playerHead);
  }

  updateThreadToKlubok() {
    const a = new THREE.Vector3(this.pos.x, 1.3, this.pos.z);
    const b = this.klubokMesh.position.clone();
    if (a.distanceTo(b) < 0.4) { this.thread.visible = false; return; }
    const mid = a.clone().add(b).multiplyScalar(0.5);
    this.thread.position.copy(mid);
    const dirVec = b.clone().sub(a);
    this.thread.scale.y = dirVec.length();
    dirVec.normalize();
    this.thread.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirVec);
    this.thread.visible = true;
    this.thread.material.color.set(0xffcc66);
  }

  updateThreadToRift() {
    const a = this.klubokMesh.position.clone();
    const b = new THREE.Vector3(RIFT_POS.x, 0.3, RIFT_POS.z);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    this.thread.position.copy(mid);
    const dirVec = b.clone().sub(a);
    this.thread.scale.y = Math.max(0.1, dirVec.length());
    dirVec.normalize();
    this.thread.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirVec);
    this.thread.visible = true;
    this.thread.material.color.set(0x44aaff);
  }

  pickupKlubok() {
    this.klubokState = 'carried';
    hint('Клубок у тебя. Целься в разлом и нажми F', 4000);
    console.log('[klubok] picked up');
  }

  throwKlubok() {
    if (this.klubokState === 'thrown') return;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 0.01) return;
    forward.normalize();

    const start = new THREE.Vector3(this.pos.x, 1.3, this.pos.z);
    const target = new THREE.Vector3(
      clamp(this.pos.x + forward.x * 10, ROOM.minX + 1, ROOM.maxX - 1),
      0.35,
      clamp(this.pos.z + forward.z * 10, ROOM.minZ + 1, ROOM.maxZ - 1)
    );

    this.klubokState = 'thrown';
    this.klubokAnim = { start: start.clone(), target, startTime: performance.now(), duration: 750 };
    console.log('[klubok] thrown →', target.x.toFixed(1), target.z.toFixed(1));
  }

  sealKlubok() {
    this.klubokState = 'sealed';
    this.riftWaveT = 0;  // запуск волны
    hint('Портал открыт. Подойди к разлому и нажми E', 5000);
    console.log('[rift] activated · klubok sealed');
  }

  updateKlubok(dt) {
    const g = this.game;

    if (this.klubokState === 'ground') {
      const d = Math.hypot(
        this.klubokMesh.position.x - this.pos.x,
        this.klubokMesh.position.z - this.pos.z
      );
      if (d < 1.8) this.pickupKlubok();
    }
    else if (this.klubokState === 'carried') {
      // klubok немного перед-сбоку от игрока
      const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      camDir.y = 0;
      if (camDir.lengthSq() > 0.001) {
        camDir.normalize();
        // игрок поворачивается в сторону камеры
        this.player.rotation.y = angleLerp(this.player.rotation.y, Math.atan2(camDir.x, camDir.z), Math.min(1, dt * 10));
        // klubok в руке справа
        const rightVec = new THREE.Vector3(camDir.z, 0, -camDir.x);
        this.klubokMesh.position.set(
          this.pos.x + camDir.x * 0.5 + rightVec.x * 0.6,
          1.2 + Math.sin(this.t * 3) * 0.05,
          this.pos.z + camDir.z * 0.5 + rightVec.z * 0.6
        );
      }
      this.updateThreadToKlubok();
      if (consumeAction('KeyF') && !g.transitioning) this.throwKlubok();
    }
    else if (this.klubokState === 'thrown' && this.klubokAnim) {
      const a = this.klubokAnim;
      const t = Math.min(1, (performance.now() - a.startTime) / a.duration);
      const e = 1 - Math.pow(1 - t, 2.5);
      const x = a.start.x + (a.target.x - a.start.x) * e;
      const z = a.start.z + (a.target.z - a.start.z) * e;
      const y = a.start.y + (a.target.y - a.start.y) * e + Math.sin(t * Math.PI) * 2.5;
      this.klubokMesh.position.set(x, y, z);
      this.updateThreadToKlubok();
      if (t >= 1) {
        this.klubokAnim = null;
        const dRift = Math.hypot(
          this.klubokMesh.position.x - RIFT_POS.x,
          this.klubokMesh.position.z - RIFT_POS.z
        );
        console.log('[klubok] landed, dist:', dRift.toFixed(2));
        if (dRift < RIFT_ACTIVATION_RADIUS) {
          this.sealKlubok();
        } else {
          this.klubokState = 'landed';
          hint('Мимо. Подойди к клубку и брось снова (F)', 4000);
        }
      }
    }
    else if (this.klubokState === 'landed') {
      const d = Math.hypot(
        this.klubokMesh.position.x - this.pos.x,
        this.klubokMesh.position.z - this.pos.z
      );
      if (d < 1.8) this.pickupKlubok();
      // если игрок прицелился и нажал F — подбор+бросок одним действием
      if (consumeAction('KeyF') && !g.transitioning) {
        this.klubokState = 'carried';
        this.throwKlubok();
      }
    }
    else if (this.klubokState === 'sealed') {
      // клубок «прилип» к разлому
      const targetX = RIFT_POS.x;
      const targetZ = RIFT_POS.z + 1.8;
      const targetY = 0.7 + Math.sin(this.t * 2.2) * 0.15;
      this.klubokMesh.position.x += (targetX - this.klubokMesh.position.x) * Math.min(1, dt * 4);
      this.klubokMesh.position.z += (targetZ - this.klubokMesh.position.z) * Math.min(1, dt * 4);
      this.klubokMesh.position.y = targetY;
      this.updateThreadToRift();
    }
  }

  updateRift(dt) {
    const sealed = this.klubokState === 'sealed';

    // базовое кольцо
    if (sealed) {
      this.riftMat.emissiveIntensity = 4 + Math.sin(this.t * 5) * 1.6;
      this.riftMat.color.set(0x66ddff);
      this.riftMat.emissive.set(0x44aaff);
      this.riftLight.intensity = 18 + Math.sin(this.t * 5) * 6;
      this.riftLight.color.set(0x66ddff);
      this.riftBeam.material.opacity = 0.45 + Math.sin(this.t * 4) * 0.12;
      this.riftBeam.material.color.set(0x66ddff);
      this.riftShell.material.opacity = 0.12 + Math.sin(this.t * 3) * 0.05;
    } else {
      this.riftMat.emissiveIntensity = 1 + Math.sin(this.t * 2) * 0.3;
      this.riftMat.color.set(0x2277ff);
      this.riftMat.emissive.set(0x2277ff);
      this.riftLight.intensity = 5 + Math.sin(this.t * 2) * 1;
      this.riftLight.color.set(0x44aaff);
      this.riftBeam.material.opacity = 0.14;
      this.riftBeam.material.color.set(0x44aaff);
      this.riftShell.material.opacity = Math.max(0, this.riftShell.material.opacity - dt * 0.5);
    }
    this.rift.rotation.z = this.t * 0.8;

    // волна активации
    if (this.riftWaveT >= 0) {
      this.riftWaveT += dt * 1.4;
      if (this.riftWaveT >= 1) {
        this.riftWaveT = -1;
        this.riftWave.material.opacity = 0;
        this.riftWave.scale.setScalar(1);
      } else {
        const e = this.riftWaveT;
        this.riftWave.material.opacity = (1 - e) * 0.9;
        this.riftWave.scale.setScalar(1 + e * 3.5);
      }
    }
  }

  handleInteraction() {
    if (this.game.transitioning) return;
    if (!consumeAction('KeyE')) return;

    // разлом активен → переход
    if (this.klubokState === 'sealed') {
      const d = Math.hypot(this.pos.x - RIFT_POS.x, this.pos.z - RIFT_POS.z);
      if (d < RIFT_INTERACT_RADIUS) {
        console.log('[input] E → collapse');
        collapseTo2D(this);
        return;
      }
    }

    // планшет
    if (!this.tabletRead && this.tablet) {
      const dTablet = Math.hypot(this.pos.x - this.tablet.position.x, this.pos.z - this.tablet.position.z);
      if (dTablet < 1.5) {
        this.tabletRead = true;
        hint('Сварог: «Криозал. Экипаж молчит. Возьми клубок — он знает путь»', 6000);
        console.log('[tablet] read');
      }
    }
  }

  update(dt) {
    this.t += dt;
    const g = this.game;

    // камера-лук
    this.yaw -= look.dx * 0.004;
    this.pitch = clamp(this.pitch + look.dy * 0.003, -0.15, 1.15);
    look.dx = 0; look.dy = 0;

    // движение
    if (!g.transitioning) {
      const { f, r } = getMoveInput();
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const move = new THREE.Vector3().addScaledVector(forward, f).addScaledVector(right, r);
      const moving = move.lengthSq() > 0.0001;
      if (moving) move.normalize();

      this.pos.addScaledVector(move, 8 * dt);
      this.pos.x = clamp(this.pos.x, ROOM.minX + PLAYER_PAD, ROOM.maxX - PLAYER_PAD);
      this.pos.z = clamp(this.pos.z, ROOM.minZ + PLAYER_PAD, ROOM.maxZ - PLAYER_PAD);

      this.player.position.set(this.pos.x, Math.sin(this.t * 9) * 0.05 * (moving ? 1 : 0), this.pos.z);
      if (moving && this.klubokState !== 'carried') {
        this.player.rotation.y = angleLerp(this.player.rotation.y, Math.atan2(move.x, move.z), Math.min(1, dt * 12));
      }
    }

    // камера с коллизией
    this.updateCamera(dt);

    // клубок
    this.updateKlubok(dt);

    // разлом
    this.updateRift(dt);

    // аварийка
    const emergencyPulse = 2.2 + Math.sin(this.t * 3.4) * 1.4;
    for (let i = 0; i < this.emergencyLights.length; i++) {
      this.emergencyLights[i].intensity = emergencyPulse + Math.sin(this.t * 3.4 + i) * 0.4;
    }
    if (this.stripMat) this.stripMat.opacity = 0.4 + Math.sin(this.t * 3.4) * 0.2;

    // планшет: подсказка при подходе
    if (!this.tabletRead && this.tablet) {
      const d = Math.hypot(this.pos.x - this.tablet.position.x, this.pos.z - this.tablet.position.z);
      if (d < 1.5 && this.t - (this.lastTabletHint || 0) > 3) {
        hint('E — прочитать планшет', 2500);
        this.lastTabletHint = this.t;
      }
    }

    // постоянная подсказка у активного разлома
    if (this.klubokState === 'sealed') {
      const d = Math.hypot(this.pos.x - RIFT_POS.x, this.pos.z - RIFT_POS.z);
      if (d < RIFT_INTERACT_RADIUS && this.t - this.lastRiftPrompt > 2.5) {
        hint('E — войти в разлом', 3000);
        this.lastRiftPrompt = this.t;
      }
    }

    // взаимодействие
    this.handleInteraction();
  }

  render() { this.game.renderer3D.render(this.scene3, this.camera); }
  resize(w, h) {
    if (!this.camera) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  exit() {
    this.scene3?.traverse(o => {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
      else o.material?.dispose?.();
      if (o.material?.map) o.material.map.dispose?.();
    });
  }
}

/* =========================================================
   WORLD 2D — НАВЬ-КРИОЗАЛ
   ========================================================= */
class World2D {
  constructor(game) { this.game = game; this.is3D = false; }

  enter() {
    look.dx = 0; look.dy = 0;
    actionBuf.KeyE = 0; actionBuf.KeyF = 0;

    const pos = this.game.state.last3DPos || { x: PLAYER_START.x, z: PLAYER_START.z };
    this.player = {
      x: clamp(pos.x, ROOM.minX + 1, ROOM.maxX - 1),
      z: clamp(pos.z, ROOM.minZ + 1, ROOM.maxZ - 1),
      r: 0.6, speed: 7, dir: 0,
    };
    this.cam = { x: this.player.x, z: this.player.z };
    this.t = 0;

    this.shadow = { x: 0, z: ROOM.minZ + 1, r: 0.7 };
    this.ghost = { angle: 0, radius: 5, cx: 0, cz: -4, x: 0, z: 0 };

    hint('Навь · стены призрачны. Иди к тени клубка (в проёме)', 5000);
    console.log('[world2d] entered · навь-криозал');
  }

  update(dt) {
    this.t += dt;
    const g = this.game;
    const p = this.player;

    if (!g.transitioning) {
      const { f, r } = getMoveInput();
      if (Math.hypot(f, r) > 0.01) {
        p.x += r * p.speed * dt;
        p.z -= f * p.speed * dt;
        p.dir = Math.atan2(-f, r);
      }
      p.x = clamp(p.x, ROOM.minX + 0.8, ROOM.maxX - 0.8);
      const inGap = p.x > -2 && p.x < 2;
      if (inGap) p.z = clamp(p.z, ROOM.minZ - 1.5, ROOM.maxZ - 0.8);
      else p.z = clamp(p.z, ROOM.minZ + 0.8, ROOM.maxZ - 0.8);

      const k = 1 - Math.pow(0.0001, dt);
      this.cam.x += (p.x - this.cam.x) * k;
      this.cam.z += (p.z - this.cam.z) * k;

      this.ghost.angle += dt * 0.4;
      this.ghost.x = this.ghost.cx + Math.cos(this.ghost.angle) * this.ghost.radius;
      this.ghost.z = this.ghost.cz + Math.sin(this.ghost.angle) * this.ghost.radius;

      const d = Math.hypot(p.x - this.shadow.x, p.z - this.shadow.z);
      if (d < 1.5 && consumeAction('KeyE')) {
        console.log('[input] E → inflate');
        inflateTo3D(this);
      }
    }
  }

  render() {
    const { ctx, w, h } = this.game;
    const camX = this.cam.x, camZ = this.cam.z;
    const scale = 26;
    const sx = x => (x - camX) * scale + w / 2;
    const sy = z => (z - camZ) * scale + h / 2;

    ctx.fillStyle = '#04060c';
    ctx.fillRect(0, 0, w, h);

    const step = scale * 2;
    ctx.strokeStyle = 'rgba(124,255,216,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const ox = ((w / 2 - camX * scale) % step + step) % step;
    const oy = ((h / 2 - camZ * scale) % step + step) % step;
    for (let x = ox - step; x <= w + step; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = oy - step; y <= h + step; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    // пол
    ctx.fillStyle = 'rgba(20,40,80,0.22)';
    const fx = sx(ROOM.minX), fy = sy(ROOM.minZ);
    const fw = (ROOM.maxX - ROOM.minX) * scale;
    const fh = (ROOM.maxZ - ROOM.minZ) * scale;
    ctx.fillRect(fx, fy, fw, fh);

    // стены с проёмом
    ctx.strokeStyle = '#7cffd8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx(ROOM.minX), sy(ROOM.minZ));
    ctx.lineTo(sx(ROOM.minX), sy(ROOM.maxZ));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx(ROOM.maxX), sy(ROOM.minZ));
    ctx.lineTo(sx(ROOM.maxX), sy(ROOM.maxZ));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx(ROOM.minX), sy(ROOM.minZ));
    ctx.lineTo(sx(-2), sy(ROOM.minZ));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx(2), sy(ROOM.minZ));
    ctx.lineTo(sx(ROOM.maxX), sy(ROOM.minZ));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx(ROOM.minX), sy(ROOM.maxZ));
    ctx.lineTo(sx(ROOM.maxX), sy(ROOM.maxZ));
    ctx.stroke();

    // проём-свечение
    ctx.strokeStyle = 'rgba(255,204,102,0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx(-2), sy(ROOM.minZ));
    ctx.lineTo(sx(2), sy(ROOM.minZ));
    ctx.stroke();

    // капсулы
    ctx.strokeStyle = 'rgba(120,180,255,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < CAPSULE_Z.length; i++) {
      const cxp = sx(CAPSULES_X + 0.5);
      const cyp = sy(CAPSULE_Z[i]);
      ctx.beginPath();
      ctx.arc(cxp, cyp, 0.85 * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = i === 1 ? 'rgba(255,80,100,0.18)' : 'rgba(80,140,220,0.18)';
      ctx.fill();
    }

    // пульт
    ctx.fillStyle = 'rgba(255,180,80,0.18)';
    ctx.strokeStyle = 'rgba(255,180,80,0.55)';
    ctx.lineWidth = 2;
    const pxp = sx(PULT_POS.x - 1.1), pyp = sy(PULT_POS.z - 0.5);
    ctx.fillRect(pxp, pyp, 2.2 * scale, 1.0 * scale);
    ctx.strokeRect(pxp, pyp, 2.2 * scale, 1.0 * scale);

    // разлом
    ctx.strokeStyle = 'rgba(80,150,255,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(sx(RIFT_POS.x), sy(RIFT_POS.z), 1.2 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // призрак
    const gx = sx(this.ghost.x), gy = sy(this.ghost.z);
    const ghostAlpha = 0.35 + Math.sin(this.t * 2.2) * 0.15;
    const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 1.4 * scale);
    gg.addColorStop(0, `rgba(180,220,255,${ghostAlpha})`);
    gg.addColorStop(1, 'rgba(180,220,255,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(gx, gy, 1.4 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(220,240,255,${ghostAlpha + 0.15})`;
    ctx.beginPath(); ctx.arc(gx, gy, 0.5 * scale, 0, Math.PI * 2); ctx.fill();

    // тень клубка
    const shx = sx(this.shadow.x), shy = sy(this.shadow.z);
    const pulse = 0.55 + Math.sin(this.t * 3) * 0.3;
    const gr = ctx.createRadialGradient(shx, shy, 0, shx, shy, this.shadow.r * scale * 2.5);
    gr.addColorStop(0, `rgba(255,204,102,${pulse})`);
    gr.addColorStop(1, 'rgba(255,204,102,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(shx, shy, this.shadow.r * scale * 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,220,140,${0.75 + pulse * 0.25})`;
    ctx.beginPath(); ctx.arc(shx, shy, this.shadow.r * scale, 0, Math.PI * 2); ctx.fill();

    // игрок
    const px = sx(this.player.x), py = sy(this.player.z);
    const pg = ctx.createRadialGradient(px, py, 0, px, py, this.player.r * scale * 2.5);
    pg.addColorStop(0, 'rgba(124,255,216,0.75)');
    pg.addColorStop(1, 'rgba(124,255,216,0)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(px, py, this.player.r * scale * 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7cffd8';
    ctx.beginPath(); ctx.arc(px, py, this.player.r * scale, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#0a2a24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(this.player.dir) * this.player.r * scale * 1.6,
               py + Math.sin(this.player.dir) * this.player.r * scale * 1.6);
    ctx.stroke();

    const nearShadow = Math.hypot(this.player.x - this.shadow.x, this.player.z - this.shadow.z) < 1.5;
    if (nearShadow) {
      ctx.fillStyle = '#7cffd8';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(input.touchMode ? 'E — вернуться' : 'E — вернуться в Явь', w / 2, 40);
    }
  }

  resize(w, h) {}
  exit() {}
}

/* =========================================================
   START
   ========================================================= */
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  game.time += dt;
  const s = game.scene;
  if (s) {
    if (!game.transitioning) s.update?.(dt);
    s.render?.();
  }
  requestAnimationFrame(frame);
}

resize();
setCanvasMode(true);
game.scene = new World3D(game);
game.scene.enter();
game.scene.resize(game.w, game.h);
requestAnimationFrame(frame);
requestAnimationFrame(() => {
  overlay.style.transition = 'opacity 0.6s ease';
  overlay.style.opacity = '0';
});

console.log('[iskra] booted, v4');