import * as THREE from 'three';

/* =========================================================
   БАЗА
   ========================================================= */
const D2 = document.getElementById('c2d');
const D3 = document.getElementById('c3d');
const ctx = D2.getContext('2d');
const overlay = document.getElementById('overlay');
const hintEl = document.getElementById('hint');
const hudEl = document.getElementById('hud');

const renderer3D = new THREE.WebGLRenderer({ canvas: D3, antialias: true });

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

const game = {
  ctx, w: innerWidth, h: innerHeight,
  renderer3D,
  scene: null,
  time: 0,
  transitioning: false,
  goTo(factory) { transitionTo(factory); },
};

/* ---------- ввод ---------- */
const keys = Object.create(null);
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });

const mouse = { dx: 0, dy: 0, down: false, px: 0, py: 0 };
D3.addEventListener('pointerdown', e => {
  mouse.down = true; mouse.px = e.clientX; mouse.py = e.clientY;
  D3.setPointerCapture(e.pointerId);
});
D3.addEventListener('pointerup', () => { mouse.down = false; });
D3.addEventListener('pointermove', e => {
  if (!mouse.down) return;
  mouse.dx += e.clientX - mouse.px;
  mouse.dy += e.clientY - mouse.py;
  mouse.px = e.clientX; mouse.py = e.clientY;
});
D3.addEventListener('pointercancel', () => { mouse.down = false; });

/* ---------- resize ---------- */
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

/* ---------- подсказки ---------- */
let hintTimer = null;
function hint(text, ms = 2800) {
  hintEl.textContent = text;
  hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.remove('show'), ms);
}

/* =========================================================
   ПЕРЕКЛЮЧЕНИЕ 2D <-> 3D
   ========================================================= */
function setCanvasMode(is3D) {
  D2.style.opacity = is3D ? '0' : '1';
  D3.style.opacity = is3D ? '1' : '0';
  D3.style.pointerEvents = is3D ? 'auto' : 'none';
  mouse.dx = mouse.dy = 0;
  mouse.down = false;
  hudEl.textContent = is3D
    ? '3D · WASD — движение · зажать мышь — камера'
    : '2D · WASD / стрелки — движение';
}

function fade(to, ms = 600) {
  overlay.style.transitionDuration = ms + 'ms';
  overlay.style.opacity = to;
  return new Promise(r => setTimeout(r, ms + 60));
}

async function transitionTo(factory) {
  if (game.transitioning) return;
  game.transitioning = true;

  await fade(1);
  game.scene?.exit?.();
  game.scene = factory(game);
  setCanvasMode(!!game.scene.is3D);
  game.scene.enter?.();
  game.scene.resize?.(game.w, game.h);
  await fade(0);

  game.transitioning = false;
}

/* =========================================================
   СЦЕНА 2D — вид сверху
   ========================================================= */
class World2D {
  constructor(game) {
    this.game = game;
    this.is3D = false;
    this.player = { x: 0, y: 0, r: 16, speed: 300, dir: 0 };
    this.portal = { x: 460, y: -200, r: 50 };
    this.cam = { x: 0, y: 0 };
    this.t = 0;

    // декоративные кристаллы (детерминированный "рандом")
    let seed = 20240517;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    this.decor = [];
    for (let i = 0; i < 90; i++) {
      this.decor.push({
        x: (rnd() - 0.5) * 2600,
        y: (rnd() - 0.5) * 2600,
        s: 5 + rnd() * 16,
        p: rnd() * 6.28,
      });
    }
  }

  enter() {
    hint('2D · дойди до синего портала →');
  }

  update(dt) {
    this.t += dt;
    const p = this.player;

    let dx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    let dy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len; dy /= len;
      p.x += dx * p.speed * dt;
      p.y += dy * p.speed * dt;
      p.dir = Math.atan2(dy, dx);
    }

    const k = 1 - Math.pow(0.0001, dt);
    this.cam.x += (p.x - this.cam.x) * k;
    this.cam.y += (p.y - this.cam.y) * k;

    const d = Math.hypot(p.x - this.portal.x, p.y - this.portal.y);
    if (d < this.portal.r * 0.65) this.game.goTo(g => new World3D(g));
  }

  render() {
    const { ctx, w, h } = this.game;
    const camX = this.cam.x, camY = this.cam.y;
    const sx = x => x - camX + w / 2;
    const sy = y => y - camY + h / 2;

    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, w, h);

    // сетка
    const step = 80;
    ctx.strokeStyle = 'rgba(64,130,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const ox = ((w / 2 - camX) % step + step) % step;
    const oy = ((h / 2 - camY) % step + step) % step;
    for (let x = ox - step; x <= w + step; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = oy - step; y <= h + step; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    // кристаллы
    for (const c of this.decor) {
      const X = sx(c.x), Y = sy(c.y);
      if (X < -60 || X > w + 60 || Y < -60 || Y > h + 60) continue;
      const a = 0.25 + Math.sin(this.t * 1.6 + c.p) * 0.15;
      ctx.fillStyle = `rgba(90,170,255,${a})`;
      ctx.beginPath();
      ctx.moveTo(X, Y - c.s);
      ctx.lineTo(X + c.s * 0.6, Y);
      ctx.lineTo(X, Y + c.s);
      ctx.lineTo(X - c.s * 0.6, Y);
      ctx.closePath();
      ctx.fill();
    }

    // портал
    const px = sx(this.portal.x), py = sy(this.portal.y);
    const pulse = 1 + Math.sin(this.t * 2.6) * 0.07;
    const R = this.portal.r * pulse;

    const g = ctx.createRadialGradient(px, py, 0, px, py, R * 2.6);
    g.addColorStop(0, 'rgba(170,230,255,0.95)');
    g.addColorStop(0.35, 'rgba(60,150,255,0.5)');
    g.addColorStop(1, 'rgba(20,60,180,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, R * 2.6, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#9fdcff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = 'rgba(159,220,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, R * (1.3 + Math.sin(this.t * 2) * 0.1), this.t, this.t + 4.2);
    ctx.stroke();

    // игрок
    const X = sx(this.player.x), Y = sy(this.player.y);
    const pg = ctx.createRadialGradient(X, Y, 0, X, Y, 46);
    pg.addColorStop(0, 'rgba(120,255,220,0.55)');
    pg.addColorStop(1, 'rgba(120,255,220,0)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(X, Y, 46, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#7cffd8';
    ctx.beginPath(); ctx.arc(X, Y, this.player.r, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#0a2a24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(X, Y);
    ctx.lineTo(X + Math.cos(this.player.dir) * this.player.r * 1.6,
               Y + Math.sin(this.player.dir) * this.player.r * 1.6);
    ctx.stroke();
  }
}

/* =========================================================
   СЦЕНА 3D — третье лицо
   ========================================================= */
class World3D {
  constructor(game) {
    this.game = game;
    this.is3D = true;
    this.t = 0;
  }

  enter() {
    const g = this.game;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070d);
    scene.fog = new THREE.FogExp2(0x05070d, 0.016);
    this.scene3 = scene;

    this.camera = new THREE.PerspectiveCamera(60, g.w / g.h, 0.1, 1000);
    this.camera.position.set(0, 6, 16);

    scene.add(new THREE.HemisphereLight(0x88bbff, 0x0a1020, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(8, 16, 10);
    scene.add(dir);

    // пол-сетка
    const grid = new THREE.GridHelper(200, 100, 0x2a6cff, 0x0e1c3a);
    grid.material.transparent = true;
    grid.material.opacity = 0.85;
    scene.add(grid);

    // «деревья»-коробки
    let seed = 777;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 45; i++) {
      const hgt = 2 + rnd() * 7;
      const m = new THREE.Mesh(
        boxGeo,
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(0.58 + rnd() * 0.1, 0.55, 0.12 + rnd() * 0.1),
          emissive: 0x0a1a33,
          roughness: 0.9,
        })
      );
      m.scale.set(1 + rnd() * 2.5, hgt, 1 + rnd() * 2.5);
      m.position.set((rnd() - 0.5) * 80, hgt / 2, (rnd() - 0.5) * 80);
      if (m.position.length() < 12) continue;
      scene.add(m);
    }

    // игрок
    this.player = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x66ddff, emissive: 0x114466, emissiveIntensity: 1.4 })
    );
    body.position.y = 1;
    this.player.add(body);
    scene.add(this.player);

    // портал назад
    this.portal = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, 0.28, 20, 64),
      new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x2277ff, emissiveIntensity: 2.5 })
    );
    this.portal.position.set(0, 2.2, -16);
    scene.add(this.portal);

    this.portalLight = new THREE.PointLight(0x44aaff, 30, 40);
    this.portalLight.position.copy(this.portal.position);
    scene.add(this.portalLight);

    this.pos = new THREE.Vector3(0, 0, 8);
    this.yaw = 0;
    this.pitch = 0.25;
    this.t = 0;

    hint('3D · найди кольцо и войди в него ←');
  }

  resize(w, h) {
    if (!this.camera) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;

    // камера мышью
    this.yaw -= mouse.dx * 0.004;
    this.pitch = clamp(this.pitch + mouse.dy * 0.003, -0.15, 1.15);
    mouse.dx = 0; mouse.dy = 0;

    // движение относительно камеры
    const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3().addScaledVector(forward, f).addScaledVector(right, r);
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize();

    const speed = 8;
    this.pos.addScaledVector(move, speed * dt);
    this.pos.x = clamp(this.pos.x, -44, 44);
    this.pos.z = clamp(this.pos.z, -44, 44);

    this.player.position.set(
      this.pos.x,
      Math.sin(this.t * 9) * 0.05 * (moving ? 1 : 0),
      this.pos.z
    );
    if (moving) {
      this.player.rotation.y = angleLerp(
        this.player.rotation.y,
        Math.atan2(move.x, move.z),
        Math.min(1, dt * 12)
      );
    }

    // камера-орбита
    const dist = 9;
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    ).multiplyScalar(dist);
    const target = new THREE.Vector3(this.pos.x, 1.7, this.pos.z).add(off);
    this.camera.position.lerp(target, 1 - Math.pow(0.0005, dt));
    this.camera.lookAt(this.pos.x, 1.7, this.pos.z);

    // анимация портала
    this.portal.rotation.z += dt * 1.4;
    this.portal.rotation.y = Math.sin(this.t * 0.9) * 0.35;
    this.portalLight.intensity = 26 + Math.sin(this.t * 3.2) * 12;

    // вход в портал
    const d = Math.hypot(this.pos.x - this.portal.position.x, this.pos.z - this.portal.position.z);
    if (d < 2.2) this.game.goTo(g => new World2D(g));
  }

  render() {
    this.game.renderer3D.render(this.scene3, this.camera);
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
   СТАРТ
   ========================================================= */
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  game.time += dt;

  const s = game.scene;
  if (s) {
    s.update?.(dt);
    s.render?.();
  }
  requestAnimationFrame(frame);
}

resize();
setCanvasMode(false);
game.scene = new World2D(game);
game.scene.enter();
requestAnimationFrame(frame);
requestAnimationFrame(() => { overlay.style.opacity = '0'; });