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

/* ---------------------------------------------------------
   INPUT
   --------------------------------------------------------- */
const keys = Object.create(null);
const look = { dx: 0, dy: 0 };
const input = { moveX: 0, moveY: 0, joyActive: false, touchMode: false };

/* ---------- action buffer (one-shot, fixes fast taps) ---------- */
const actionBuf = Object.create(null);
function pressAction(code) { actionBuf[code] = (actionBuf[code] || 0) + 1; }
function consumeAction(code) {
  if (actionBuf[code] > 0) { actionBuf[code]--; return true; }
  return false;
}

/* ---------- keyboard ---------- */
addEventListener('keydown', e => {
  if (!keys[e.code]) pressAction(e.code);
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE','KeyF'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });

/* ---------- unified movement ---------- */
function getMoveInput() {
  let f = 0, r = 0;
  if (input.joyActive) {
    f = input.moveY;
    r = input.moveX;
  } else {
    f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  }
  const len = Math.hypot(f, r);
  if (len > 1) { f /= len; r /= len; }
  return { f, r };
}

/* ---------- look drag (mouse + touch) ---------- */
let lookPointerId = null;
let lookLastX = 0, lookLastY = 0;

D3.addEventListener('pointerdown', e => {
  if (lookPointerId !== null) return;
  lookPointerId = e.pointerId;
  lookLastX = e.clientX;
  lookLastY = e.clientY;
  try { D3.setPointerCapture(e.pointerId); } catch {}
});
D3.addEventListener('pointermove', e => {
  if (e.pointerId !== lookPointerId) return;
  look.dx += e.clientX - lookLastX;
  look.dy += e.clientY - lookLastY;
  lookLastX = e.clientX;
  lookLastY = e.clientY;
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
  return ('ontouchstart' in window) ||
         (navigator.maxTouchPoints > 0) ||
         matchMedia('(any-pointer: coarse)').matches;
}

function setupTouchUI() {
  if (!mobileUI) { console.warn('[touch] #mobile-ui not found'); return; }
  const show = detectTouch();
  input.touchMode = show;
  mobileUI.classList.toggle('visible', show);
  console.log('[touch] enabled =', show);
}

/* ---------- joystick ---------- */
const joyBase = document.getElementById('joystick-base');
const joyThumb = document.getElementById('joystick-thumb');
const JOY_RADIUS = 38;
let joyPointerId = null;
let joyCenterX = 0, joyCenterY = 0;

if (joyBase && joyThumb) {
  joyBase.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    if (joyPointerId !== null) return;
    joyPointerId = e.pointerId;
    try { joyBase.setPointerCapture(e.pointerId); } catch {}
    const rect = joyBase.getBoundingClientRect();
    joyCenterX = rect.left + rect.width / 2;
    joyCenterY = rect.top + rect.height / 2;
    input.joyActive = true;
    updateJoystick(e.clientX, e.clientY);
    console.log('[joy] down', e.pointerType, 'id', e.pointerId);
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
    input.moveX = 0;
    input.moveY = 0;
    joyThumb.style.transform = 'translate(-50%, -50%)';
    console.log('[joy] up');
  };
  joyBase.addEventListener('pointerup', endJoy);
  joyBase.addEventListener('pointercancel', endJoy);

  function updateJoystick(x, y) {
    let dx = x - joyCenterX;
    let dy = y - joyCenterY;
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
} else {
  console.warn('[touch] joystick elements not found');
}

/* ---------- action buttons ---------- */
document.querySelectorAll('.action-btn').forEach(btn => {
  const action = btn.dataset.action;
  const key = 'Key' + action;

  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    try { btn.setPointerCapture(e.pointerId); } catch {}
    pressAction(key);         // ← one-shot buffer
    keys[key] = true;
    btn.classList.add('active');
    console.log('[btn] down', key, e.pointerType);
  });
  const release = () => {
    keys[key] = false;
    btn.classList.remove('active');
  };
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
  state: { last3DPos: { x: 0, z: 8 }, hasKlubok: false },
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
  console.log('[transition] collapse done, in 2D');
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
  const endFogDensity = 0.015;
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
  console.log('[transition] inflate done, in 3D');
}

/* =========================================================
   WORLD 3D
   ========================================================= */
class World3D {
  constructor(game) { this.game = game; this.is3D = true; }

  enter() {
    look.dx = 0; look.dy = 0;
    actionBuf.KeyE = 0; actionBuf.KeyF = 0;   // сброс буфера

    const g = this.game;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070d);
    scene.fog = new THREE.FogExp2(0x05070d, 0.015);
    this.scene3 = scene;

    this.camera = new THREE.PerspectiveCamera(60, g.w / g.h, 0.1, 200);
    this.camera.position.set(0, 6, 16);
    this.camera.lookAt(0, 1.7, 8);

    scene.add(new THREE.HemisphereLight(0x88bbff, 0x0a1020, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(8, 16, 10);
    scene.add(dir);

    const grid = new THREE.GridHelper(200, 100, 0x2a6cff, 0x0e1c3a);
    grid.material.transparent = true;
    grid.material.opacity = 0.7;
    scene.add(grid);

    let seed = 777;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 35; i++) {
      const hgt = 2 + rnd() * 7;
      const x = (rnd() - 0.5) * 80;
      const z = (rnd() - 0.5) * 80;
      if (Math.hypot(x, z) < 15) continue;
      if (Math.abs(x) < 4 && z < 0 && z > -18) continue;
      const m = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.58 + rnd() * 0.1, 0.55, 0.12 + rnd() * 0.1),
        emissive: 0x0a1a33, roughness: 0.9,
      }));
      m.scale.set(1 + rnd() * 2.5, hgt, 1 + rnd() * 2.5);
      m.position.set(x, hgt / 2, z);
      scene.add(m);
    }

    this.player = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x66ddff, emissive: 0x114466, emissiveIntensity: 1.4 })
    );
    body.position.y = 1;
    this.player.add(body);
    scene.add(this.player);

    this.rift = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.18, 16, 48),
      new THREE.MeshStandardMaterial({ color: 0x2277ff, emissive: 0x2277ff, emissiveIntensity: 1.2 })
    );
    this.rift.position.set(0, 0.15, -10);
    this.rift.rotation.x = Math.PI / 2;
    scene.add(this.rift);
    this.riftMat = this.rift.material;

    this.riftLight = new THREE.PointLight(0x44aaff, 5, 20);
    this.riftLight.position.set(0, 0.7, -10);
    scene.add(this.riftLight);

    this.riftBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.05, 15, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.14, side: THREE.DoubleSide })
    );
    this.riftBeam.position.set(0, 7.5, -10);
    scene.add(this.riftBeam);

    this.klubokMesh = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xffcc66, emissive: 0xffaa33, emissiveIntensity: 2 })
    );
    this.klubokMesh.add(ball);
    scene.add(this.klubokMesh);

    this.thread = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1, 4),
      new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.8 })
    );
    this.thread.visible = false;
    scene.add(this.thread);

    this.pos = new THREE.Vector3(0, 0, 8);
    this.yaw = 0;
    this.pitch = 0.25;
    this.t = 0;

    this.klubokState = 'ground';
    this.klubokMesh.position.set(2, 0.35, 5);
    this.klubokAnim = null;

    hint('Найди клубок рядом (жёлтый шар). Двигайся и крути камеру', 5000);
    console.log('[world3d] entered');
  }

  updateThreadPosition() {
    const a = new THREE.Vector3(this.pos.x, 1.3, this.pos.z);
    const b = this.klubokMesh.position.clone();
    if (a.distanceTo(b) < 0.3) { this.thread.visible = false; return; }
    this.thread.visible = true;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    this.thread.position.copy(mid);
    const dirVec = b.clone().sub(a);
    this.thread.scale.y = dirVec.length();
    dirVec.normalize();
    this.thread.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirVec);
  }

  throwKlubok() {
    if (this.klubokState === 'thrown') return;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 0.01) return;
    forward.normalize();
    const start = new THREE.Vector3(this.pos.x, 1.3, this.pos.z);
    const target = new THREE.Vector3(this.pos.x + forward.x * 15, 0.35, this.pos.z + forward.z * 15);
    this.klubokState = 'thrown';
    this.klubokAnim = { start: start.clone(), target, startTime: performance.now(), duration: 750 };
    console.log('[klubok] thrown');
  }

  update(dt) {
    this.t += dt;
    const g = this.game;

    this.yaw -= look.dx * 0.004;
    this.pitch = clamp(this.pitch + look.dy * 0.003, -0.15, 1.15);
    look.dx = 0; look.dy = 0;

    if (!g.transitioning) {
      const { f, r } = getMoveInput();
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const move = new THREE.Vector3().addScaledVector(forward, f).addScaledVector(right, r);
      const moving = move.lengthSq() > 0.0001;
      if (moving) move.normalize();
      this.pos.addScaledVector(move, 8 * dt);
      this.pos.x = clamp(this.pos.x, -44, 44);
      this.pos.z = clamp(this.pos.z, -44, 44);
      this.player.position.set(this.pos.x, Math.sin(this.t * 9) * 0.05 * (moving ? 1 : 0), this.pos.z);
      if (moving) {
        this.player.rotation.y = angleLerp(this.player.rotation.y, Math.atan2(move.x, move.z), Math.min(1, dt * 12));
      }
    }

    const dist = 9;
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    ).multiplyScalar(dist);
    const camTarget = new THREE.Vector3(this.pos.x, 1.7, this.pos.z).add(off);
    this.camera.position.lerp(camTarget, 1 - Math.pow(0.0005, dt));
    this.camera.lookAt(this.pos.x, 1.7, this.pos.z);

    if (this.klubokState === 'ground') {
      const d = Math.hypot(this.klubokMesh.position.x - this.pos.x, this.klubokMesh.position.z - this.pos.z);
      if (d < 2) {
        this.klubokState = 'carried';
        hint('Клубок у тебя. Брось его вперёд (F)', 4000);
        console.log('[klubok] picked up');
      }
    }
    else if (this.klubokState === 'carried') {
      this.klubokMesh.position.set(this.pos.x + 0.8, 1.2, this.pos.z + 0.4);
      this.updateThreadPosition();
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
      this.updateThreadPosition();
      if (t >= 1) { this.klubokState = 'landed'; this.klubokAnim = null; this.checkKlubokLanding(); }
    }
    else if (this.klubokState === 'landed') {
      this.updateThreadPosition();
      const d = Math.hypot(this.klubokMesh.position.x - this.pos.x, this.klubokMesh.position.z - this.pos.z);
      if (d < 2) {
        this.klubokState = 'carried';
        hint('Клубок снова у тебя. Брось вперёд (F)', 2500);
        console.log('[klubok] re-picked');
      }
      if (consumeAction('KeyF') && !g.transitioning) {
        this.klubokState = 'carried';
        this.throwKlubok();
      }
    }

    const klubokNearRift = Math.hypot(
      this.klubokMesh.position.x - this.rift.position.x,
      this.klubokMesh.position.z - this.rift.position.z
    ) < 4 && this.klubokState === 'landed';

    this.riftMat.emissiveIntensity = klubokNearRift
      ? 3 + Math.sin(this.t * 6) * 1.5
      : 1 + Math.sin(this.t * 2) * 0.3;
    this.riftLight.intensity = klubokNearRift
      ? 15 + Math.sin(this.t * 6) * 5
      : 5 + Math.sin(this.t * 2) * 1;
    this.rift.rotation.z = this.t * 0.8;
    this.riftBeam.material.opacity = klubokNearRift ? 0.35 : 0.14;

    if (!g.transitioning && consumeAction('KeyE')) {
      const playerNearKlubok = Math.hypot(
        this.klubokMesh.position.x - this.pos.x,
        this.klubokMesh.position.z - this.pos.z
      ) < 3;
      if (klubokNearRift && playerNearKlubok) {
        console.log('[input] E → collapse');
        collapseTo2D(this);
      }
    }
  }

  checkKlubokLanding() {
    const d = Math.hypot(
      this.klubokMesh.position.x - this.rift.position.x,
      this.klubokMesh.position.z - this.rift.position.z
    );
    console.log('[klubok] landed, dist:', d.toFixed(2));
    if (d < 4) {
      hint('Разлом активирован! Подойди к клубку и нажми E', 5000);
      console.log('[rift] activated');
    } else {
      hint('Мимо. Брось снова (F) или подойди к клубку', 4000);
    }
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
    });
  }
}

/* =========================================================
   WORLD 2D
   ========================================================= */
class World2D {
  constructor(game) { this.game = game; this.is3D = false; }

  enter() {
    look.dx = 0; look.dy = 0;
    actionBuf.KeyE = 0; actionBuf.KeyF = 0;

    const pos = this.game.state.last3DPos || { x: 0, z: 8 };
    this.player = { x: pos.x, z: pos.z, r: 0.6, speed: 7, dir: 0 };
    this.cam = { x: this.player.x, z: this.player.z };
    this.t = 0;
    this.shadow = { x: this.player.x + 3, z: this.player.z - 3, r: 0.7 };
    this.returnRift = { x: 0, z: -10, r: 1.5 };

    hint('Ты в Нави. Иди к тени клубка (жёлтая точка). E — вернуться в Явь', 5000);
    console.log('[world2d] entered');
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
      const k = 1 - Math.pow(0.0001, dt);
      this.cam.x += (p.x - this.cam.x) * k;
      this.cam.z += (p.z - this.cam.z) * k;

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
    const scale = 30;
    const sx = x => (x - camX) * scale + w / 2;
    const sy = z => (z - camZ) * scale + h / 2;

    ctx.fillStyle = '#06080f';
    ctx.fillRect(0, 0, w, h);

    const step = scale * 2;
    ctx.strokeStyle = 'rgba(124,255,216,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const ox = ((w / 2 - camX * scale) % step + step) % step;
    const oy = ((h / 2 - camZ * scale) % step + step) % step;
    for (let x = ox - step; x <= w + step; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = oy - step; y <= h + step; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    const rx = sx(this.returnRift.x), ry = sy(this.returnRift.z);
    ctx.strokeStyle = 'rgba(80,150,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rx, ry, this.returnRift.r * scale, 0, Math.PI * 2);
    ctx.stroke();

    const shx = sx(this.shadow.x), shy = sy(this.shadow.z);
    const pulse = 0.55 + Math.sin(this.t * 3) * 0.3;
    const gr = ctx.createRadialGradient(shx, shy, 0, shx, shy, this.shadow.r * scale * 2.5);
    gr.addColorStop(0, `rgba(255,204,102,${pulse})`);
    gr.addColorStop(1, 'rgba(255,204,102,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(shx, shy, this.shadow.r * scale * 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,220,140,${0.75 + pulse * 0.25})`;
    ctx.beginPath(); ctx.arc(shx, shy, this.shadow.r * scale, 0, Math.PI * 2); ctx.fill();

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

console.log('[iskra] booted, v2');