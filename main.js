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
const dialogueEl = document.getElementById('dialogue');
const dialogueSpeakerEl = dialogueEl.querySelector('.dialogue-speaker');
const dialogueTextEl = dialogueEl.querySelector('.dialogue-text');

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
const DOMOVOI_POS = { x: PULT_POS.x - 1.3, y: 1.5, z: PULT_POS.z };
const ISKRA_2D_POS = { x: -8, z: -12 };

/* ---------- slavic palette ---------- */
const C = {
  gold: 0xd4a843,
  goldBright: 0xffdd66,
  red: 0xc02030,
  redBright: 0xff3a4a,
  malachite: 0x2a6b4f,
  coal: 0x0a0a14,
  iron: 0x1a1a24,
  cyan: 0x4ff0ff,
  moon: 0xc8d4e0,
};

/* =========================================================
   SLAVIC TEXTURES (canvas generators)
   ========================================================= */
function makeCanvasTexture(renderFn, w = 512, h = 512) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c2 = cv.getContext('2d');
  renderFn(c2, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  tex.anisotropy = 4;
  return tex;
}

/* Оберег-рамка: используется по краям грамот/экранов */
function drawOrnamentBorder(c, w, h, color = '#d4a843', inset = 8) {
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  c.strokeRect(inset, inset, w - inset * 2, h - inset * 2);

  // угловые ромбы
  const d = 6;
  const corners = [[inset, inset], [w - inset, inset], [inset, h - inset], [w - inset, h - inset]];
  c.fillStyle = '#c02030';
  for (const [x, y] of corners) {
    c.beginPath();
    c.moveTo(x, y - d);
    c.lineTo(x + d, y);
    c.lineTo(x, y + d);
    c.lineTo(x - d, y);
    c.closePath();
    c.fill();
  }
}

/* Зигзаг-оберег (символ воды) */
function drawZigzag(c, x1, y, x2, amp = 4, step = 10, color = '#d4a843') {
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x1, y);
  let sign = -1;
  for (let x = x1 + step; x <= x2; x += step) {
    c.lineTo(x, y + sign * amp);
    sign = -sign;
  }
  c.stroke();
}

/* Сварга (вращающийся крест) — рисуется как 8-лучевая звезда */
function drawSvarog(c, cx, cy, r, color = '#d4a843') {
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  c.stroke();
  c.fillStyle = color;
  c.beginPath();
  c.arc(cx, cy, 3, 0, Math.PI * 2);
  c.fill();
}

/* Ромб с точкой (символ зерна/жизни) */
function drawDiamond(c, cx, cy, r, color = '#c02030') {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(cx, cy - r);
  c.lineTo(cx + r, cy);
  c.lineTo(cx, cy + r);
  c.lineTo(cx - r, cy);
  c.closePath();
  c.fill();
  c.fillStyle = '#0a0a14';
  c.beginPath();
  c.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
  c.fill();
}

/* Текстура стены: тёмный камень + резьба + неоновая подсветка */
function makeWallTexture(seed = 1) {
  return makeCanvasTexture((c, w, h) => {
    // фон — тёмный камень с шумом
    c.fillStyle = '#0a1020';
    c.fillRect(0, 0, w, h);
    let s = seed * 1000;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < 400; i++) {
      const x = rnd() * w, y = rnd() * h;
      c.fillStyle = `rgba(${20 + rnd() * 20}, ${30 + rnd() * 30}, ${50 + rnd() * 40}, ${0.15 + rnd() * 0.2})`;
      c.fillRect(x, y, 2 + rnd() * 4, 1 + rnd() * 3);
    }

    // горизонтальные полосы камня
    c.strokeStyle = 'rgba(60, 90, 140, 0.25)';
    c.lineWidth = 1;
    for (let y = 40; y < h; y += 80) {
      c.beginPath();
      c.moveTo(0, y);
      for (let x = 0; x < w; x += 20) {
        c.lineTo(x + 20, y + (rnd() - 0.5) * 4);
      }
      c.stroke();
    }

    // неоновая резьба — ромбы и сварги по сетке
    const gridSize = 128;
    for (let gy = 0; gy < h; gy += gridSize) {
      for (let gx = 0; gx < w; gx += gridSize) {
        const cx = gx + gridSize / 2;
        const cy = gy + gridSize / 2;
        const kind = Math.floor(rnd() * 4);
        const col = kind === 0 ? 'rgba(79,240,255,0.7)' : kind === 1 ? 'rgba(212,168,67,0.6)' : 'rgba(192,32,48,0.55)';
        if (kind === 0) drawSvarog(c, cx, cy, 24, col);
        else if (kind === 1) {
          c.strokeStyle = col;
          c.lineWidth = 1.5;
          c.beginPath();
          c.arc(cx, cy, 22, 0, Math.PI * 2);
          c.stroke();
          drawSvarog(c, cx, cy, 14, col);
        }
        else if (kind === 2) drawDiamond(c, cx, cy, 16, col);
        else {
          c.strokeStyle = col;
          c.lineWidth = 1.5;
          c.strokeRect(cx - 20, cy - 20, 40, 40);
          c.strokeRect(cx - 14, cy - 14, 28, 28);
        }
      }
    }

    // горизонтальная золотая нить-оберег
    c.strokeStyle = 'rgba(212,168,67,0.35)';
    c.lineWidth = 2;
    for (let y of [10, h - 10]) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
  }, 512, 512);
}

/* Текстура пола: половицы с золотыми прожилками */
function makeFloorTexture() {
  return makeCanvasTexture((c, w, h) => {
    c.fillStyle = '#0a0e1a';
    c.fillRect(0, 0, w, h);

    // половицы
    const plankH = 32;
    for (let y = 0; y < h; y += plankH) {
      // сама доска
      c.fillStyle = y % (plankH * 2) === 0 ? '#0f1525' : '#0d1220';
      c.fillRect(0, y, w, plankH);

      // прожилки
      let s = y * 17 + 3;
      const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      for (let i = 0; i < 12; i++) {
        const x1 = rnd() * w;
        c.strokeStyle = `rgba(${80 + rnd() * 60}, ${60 + rnd() * 40}, ${30 + rnd() * 20}, ${0.2 + rnd() * 0.2})`;
        c.lineWidth = 0.5 + rnd() * 1;
        c.beginPath();
        c.moveTo(x1, y + rnd() * plankH);
        c.lineTo(x1 + 20 + rnd() * 60, y + rnd() * plankH);
        c.stroke();
      }

      // золотая нить по краю доски
      c.strokeStyle = 'rgba(212,168,67,0.2)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();

      // редкие ромбы-обереги
      if (y % (plankH * 4) === 0) {
        for (let x = 64; x < w; x += 160) {
          drawDiamond(c, x, y + plankH / 2, 6, 'rgba(192,32,48,0.5)');
        }
      }
    }
  }, 512, 512);
}

/* Текстура для экрана пульта (кибер-лубок) */
function makePultScreenTexture() {
  return makeCanvasTexture((c, w, h) => {
    // фон
    const grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#04101e');
    grad.addColorStop(1, '#081828');
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);

    // оберег-рамка
    drawOrnamentBorder(c, w, h, '#d4a843', 10);

    // заголовок
    c.fillStyle = '#4ff0ff';
    c.font = 'bold 22px monospace';
    c.textAlign = 'center';
    c.fillText('РУСЬ · КОВЧЕГ 7', w / 2, 44);
    drawZigzag(c, 30, 60, w - 30, 3, 8, '#d4a843');

    // строки статуса
    c.font = 'bold 15px monospace';
    c.textAlign = 'left';
    c.fillStyle = '#ff3a4a';
    c.fillText('> СВЯЗЬ С ЗЕМЛЁЙ: ПОТЕРЯНА', 30, 100);
    c.fillStyle = '#88ffaa';
    c.fillText('> Сварог: ядро активно', 30, 128);
    c.fillStyle = '#4ff0ff';
    c.fillText('> пробуждение... 01', 30, 156);
    c.fillText('> ищи домового', 30, 184);

    // маленькая сварга в углу
    drawSvarog(c, w - 50, h - 50, 22, 'rgba(212,168,67,0.6)');
  }, 512, 256);
}

/* Текстура экрана на стене (аварийный режим) */
function makeWallScreenTexture() {
  return makeCanvasTexture((c, w, h) => {
    c.fillStyle = '#02060e';
    c.fillRect(0, 0, w, h);
    drawOrnamentBorder(c, w, h, '#d4a843', 8);

    c.fillStyle = '#ff8a1a';
    c.font = 'bold 24px monospace';
    c.textAlign = 'center';
    c.fillText('АВАРИЙНЫЙ РЕЖИМ', w / 2, 66);
    drawZigzag(c, 40, 82, w - 40, 3, 8, '#d4a843');

    c.fillStyle = '#4ff0ff';
    c.font = 'bold 18px monospace';
    c.fillText('ЭКИПАЖ: 0', w / 2, 118);
    c.fillText('ВЫЖИВШИХ: 1', w / 2, 148);
    c.fillStyle = '#ff3a4a';
    c.fillText('РЕАКТОР: 12%', w / 2, 178);

    drawSvarog(c, 30, h - 30, 16, 'rgba(212,168,67,0.5)');
    drawSvarog(c, w - 30, h - 30, 16, 'rgba(212,168,67,0.5)');
  }, 512, 256);
}

/* Текстура капсулы — резная колыбель */
function makeCapsuleTexture(index, isWarning = false) {
  return makeCanvasTexture((c, w, h) => {
    // фон — дерево+металл
    c.fillStyle = isWarning ? '#1a0e10' : '#0e1220';
    c.fillRect(0, 0, w, h);

    // волокна
    let s = index * 71 + 3;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < 60; i++) {
      c.strokeStyle = `rgba(${60 + rnd() * 40}, ${40 + rnd() * 30}, ${20 + rnd() * 20}, 0.3)`;
      c.lineWidth = 0.5 + rnd();
      c.beginPath();
      const y = rnd() * h;
      c.moveTo(0, y);
      c.bezierCurveTo(w * 0.3, y + (rnd() - 0.5) * 20, w * 0.7, y + (rnd() - 0.5) * 20, w, y);
      c.stroke();
    }

    // резной орнамент — вертикальные ряды
    const ornamentColor = isWarning ? '#ff3a4a' : '#d4a843';
    for (let y = 30; y < h - 30; y += 60) {
      for (let x = 30; x < w - 30; x += 60) {
        drawDiamond(c, x, y, 8, ornamentColor);
      }
    }

    // крупная руна-оберег в центре (по индексу)
    const runes = ['ᚱ', 'ᚨ', 'ᛞ', 'ᛊ', 'ᛉ'];
    c.font = 'bold 100px monospace';
    c.fillStyle = ornamentColor;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.globalAlpha = 0.55;
    c.fillText(runes[index % runes.length], w / 2, h / 2);
    c.globalAlpha = 1;

    // рамка
    drawOrnamentBorder(c, w, h, ornamentColor, 12);
  }, 256, 512);
}

/* =========================================================
   DIALOGUE
   ========================================================= */
const dialogue = {
  active: false,
  lines: [],
  index: 0,
  onComplete: null,
};

function startDialogue(speaker, lines, onComplete = null) {
  if (dialogue.active) return;
  dialogue.active = true;
  dialogue.lines = lines;
  dialogue.index = 0;
  dialogue.onComplete = onComplete;
  dialogueSpeakerEl.textContent = speaker;
  dialogueTextEl.textContent = lines[0];
  dialogueEl.classList.remove('dialogue-hidden');
  console.log('[dialogue] start', speaker);
}

function advanceDialogue() {
  if (!dialogue.active) return;
  dialogue.index++;
  if (dialogue.index >= dialogue.lines.length) {
    closeDialogue();
    return;
  }
  dialogueTextEl.textContent = dialogue.lines[dialogue.index];
}

function closeDialogue() {
  if (!dialogue.active) return;
  dialogue.active = false;
  dialogueEl.classList.add('dialogue-hidden');
  const cb = dialogue.onComplete;
  dialogue.onComplete = null;
  if (cb) cb();
}

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
  if (dialogue.active) return { f: 0, r: 0 };
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
    flags: {
      metDomovoi: false,
      iskraFound: false,
      iskraMaterialized: false,
      domovoiSecond: false,
    },
  },
};
// ===== SAVE / LOAD (простая версия, без Proxy) =====
const SAVE_KEY = 'iskra.save.v1';

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1,
      flags: game.state.flags,
    }));
  } catch (e) {
    console.warn('[save] failed', e);
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && data.v === 1 && data.flags) {
      Object.assign(game.state.flags, data.flags);
    }
  } catch (e) {
    console.warn('[save] load failed', e);
  }
}

window.iskraReset = function () {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  location.reload();
};

loadGame();
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
}

function refreshHUD() {
  const is3D = game.scene?.is3D;
  let text;
  if (input.touchMode) {
    text = is3D
      ? '⚔ ЯВЬ · джойстик — ходьба · F — клубок · E — действие'
      : '◐ НАВЬ · джойстик — ходьба · E — действие';
  } else {
    text = is3D
      ? '⚔ ЯВЬ · WASD · мышь — камера · F — клубок · E — действие'
      : '◐ НАВЬ · WASD — движение · E — действие';
  }
  if (game.state.flags.iskraMaterialized) text += ' · ✦ Искра';
  hudEl.textContent = text;
}

function setCanvasMode(is3D) {
  D2.style.opacity = is3D ? '0' : '1';
  D3.style.opacity = is3D ? '1' : '0';
  D3.style.pointerEvents = is3D ? 'auto' : 'none';
  look.dx = 0; look.dy = 0;
  lookPointerId = null;
  refreshHUD();
}

/* =========================================================
   3D BUILDERS — SLAVIC STYLE
   ========================================================= */
function buildWallMesh(w, h, d, texture) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    map: texture || null,
    color: texture ? 0xffffff : C.iron,
    emissive: 0x0a0a14,
    emissiveIntensity: 0.4,
    roughness: 0.8,
    metalness: 0.4,
  });
  return new THREE.Mesh(geo, mat);
}

function buildCapsule(index) {
  const group = new THREE.Group();
  const isWarning = index === 1;

  // Основание — резной камень
  const baseMat = new THREE.MeshStandardMaterial({
    color: C.coal,
    metalness: 0.6,
    roughness: 0.5,
    emissive: isWarning ? 0x200810 : 0x0a0a14,
    emissiveIntensity: 0.4,
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 0.3, 8), baseMat);
  base.position.y = 0.15;
  group.add(base);

  // Тело капсулы — сужается к изножью (как люлька/гроб)
  const capsuleTex = makeCapsuleTexture(index, isWarning);
  const glassMat = new THREE.MeshPhysicalMaterial({
    map: capsuleTex,
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    metalness: 0.2,
    roughness: 0.3,
    side: THREE.DoubleSide,
    emissive: isWarning ? 0x330810 : 0x0a1a30,
    emissiveIntensity: 0.5,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.6, 2.6, 12, 1, true), glassMat);
  body.position.y = 1.5;
  group.add(body);

  // Внутренний силуэт
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x040814, roughness: 0.95 });
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 2.2, 8), innerMat);
  inner.position.y = 1.5;
  group.add(inner);

  // Верх — резной купол
  const domeMat = new THREE.MeshStandardMaterial({
    color: C.coal,
    metalness: 0.7,
    roughness: 0.4,
    emissive: 0x0a0a14,
    emissiveIntensity: 0.5,
  });
  const dome = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.6, 8), domeMat);
  dome.position.y = 3.1;
  group.add(dome);

  // Кольцо-оберег внизу (красное или золотое)
  const ringColor = isWarning ? C.redBright : C.gold;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.045, 6, 32),
    new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.9 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.31;
  group.add(ring);

  // Свечение под капсулой
  const glow = new THREE.PointLight(isWarning ? 0xff3a4a : 0xd4a843, 1.8, 4.5);
  glow.position.y = 0.5;
  group.add(glow);

  // Вертикальные золотые полоски-оберег по бокам
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 2.2, 0.04),
      new THREE.MeshBasicMaterial({ color: isWarning ? C.redBright : C.gold, transparent: true, opacity: 0.6 })
    );
    stripe.position.set(Math.cos(a) * 0.75, 1.5, Math.sin(a) * 0.75);
    group.add(stripe);
  }

  return group;
}

function buildDomovoi() {
  const group = new THREE.Group();

  // Тело — резная сфера
  const bodyTex = makeCanvasTexture((c, w, h) => {
    c.fillStyle = '#0e1220';
    c.fillRect(0, 0, w, h);
    // волокна
    for (let i = 0; i < 40; i++) {
      c.strokeStyle = `rgba(212,168,67,${0.15 + Math.random() * 0.15})`;
      c.lineWidth = 1;
      c.beginPath();
      const x = Math.random() * w;
      c.moveTo(x, 0);
      c.bezierCurveTo(x + 20, h * 0.3, x - 20, h * 0.7, x, h);
      c.stroke();
    }
    // узоры
    for (let i = 0; i < 6; i++) {
      drawDiamond(c, Math.random() * w, Math.random() * h, 8, 'rgba(192,32,48,0.5)');
    }
  }, 256, 256);

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 20, 16),
    new THREE.MeshStandardMaterial({
      map: bodyTex,
      color: 0xffffff,
      metalness: 0.5,
      roughness: 0.55,
      emissive: 0x0a0a14,
      emissiveIntensity: 0.4,
    })
  );
  body.scale.set(1, 1.1, 0.95);
  group.add(body);

  // Глаза — светящиеся циан
  const eyeGeo = new THREE.SphereGeometry(0.08, 12, 12);
  const eyeMat = new THREE.MeshBasicMaterial({ color: C.cyan });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.14, 0.12, 0.36);
  group.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.14, 0.12, 0.36);
  group.add(eyeR);

  // Борода — 4 золотистых цилиндра
  const beardMat = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.3, roughness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const beard = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.25, 6), beardMat);
    beard.position.set(-0.12 + i * 0.08, -0.15, 0.38);
    beard.rotation.x = 0.15;
    beard.rotation.z = (i - 1.5) * 0.08;
    group.add(beard);
  }

  // Шапка-конус с меховой опушкой
  const hatMat = new THREE.MeshStandardMaterial({
    color: C.coal, metalness: 0.4, roughness: 0.7,
    emissive: 0x0a0a14, emissiveIntensity: 0.3,
  });
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 8), hatMat);
  hat.position.y = 0.55;
  group.add(hat);

  // меховая опушка шапки
  const furMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, metalness: 0.2, roughness: 0.9 });
  const fur = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.06, 8, 20), furMat);
  fur.rotation.x = Math.PI / 2;
  fur.position.y = 0.32;
  group.add(fur);

  // Золотой оберег на груди
  const amulet = new THREE.Mesh(
    new THREE.CircleGeometry(0.1, 8),
    new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0.85 })
  );
  amulet.position.set(0, -0.05, 0.38);
  group.add(amulet);

  // Крылья
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x0f1e35, metalness: 0.6, roughness: 0.5,
    emissive: 0x050a15, emissiveIntensity: 0.5,
  });
  const wingGeo = new THREE.BoxGeometry(0.14, 0.42, 0.05);
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(-0.36, -0.06, -0.02);
  wingL.rotation.z = 0.35;
  group.add(wingL);
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.set(0.36, -0.06, -0.02);
  wingR.rotation.z = -0.35;
  group.add(wingR);

  // Свечение
  const glow = new THREE.PointLight(C.cyan, 1.2, 3.5);
  glow.position.z = 0.3;
  group.add(glow);

  return group;
}

/* =========================================================
   TRANSITIONS
   ========================================================= */
async function collapseTo2D(world3d) {
  if (game.transitioning) return;
  game.transitioning = true;
  closeDialogue();

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
}

async function inflateTo3D(world2d) {
  if (game.transitioning) return;
  game.transitioning = true;

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
}

/* =========================================================
   WORLD 3D — КРИОЗАЛ (славянская стилизация)
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
    scene.background = new THREE.Color(0x04060c);
    scene.fog = new THREE.FogExp2(0x04060c, 0.018);
    this.scene3 = scene;

    this.camera = new THREE.PerspectiveCamera(60, g.w / g.h, 0.1, 300);
    this.camera.position.set(0, 6, 16);
    this.camera.lookAt(0, 1.7, 8);

    /* ---- lighting ---- */
    scene.add(new THREE.HemisphereLight(0x88bbff, 0x0a0a14, 0.45));
    const mainDir = new THREE.DirectionalLight(0xd4b890, 0.55);
    mainDir.position.set(5, 15, 10);
    scene.add(mainDir);
    scene.add(new THREE.AmbientLight(0x1a1a24, 0.45));

    /* ---- stars ---- */
    this._buildStars(scene);

    /* ---- floor с половицами ---- */
    const floorTex = makeFloorTexture();
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(4, 5);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 32),
      new THREE.MeshStandardMaterial({
        map: floorTex,
        color: 0xffffff,
        roughness: 0.85,
        metalness: 0.3,
        emissive: 0x0a0a14,
        emissiveIntensity: 0.2,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    /* ---- walls с резьбой ---- */
    const wallTexA = makeWallTexture(1);
    const wallTexB = makeWallTexture(2);
    wallTexA.wrapS = wallTexA.wrapT = THREE.RepeatWrapping;
    wallTexB.wrapS = wallTexB.wrapT = THREE.RepeatWrapping;
    wallTexA.repeat.set(4, 1);
    wallTexB.repeat.set(3, 1);

    const wallGeoLR = new THREE.BoxGeometry(WALL_T, WALL_H, 32);
    const wallGeoFB = new THREE.BoxGeometry(24, WALL_H, WALL_T);

    const wallMatA = new THREE.MeshStandardMaterial({
      map: wallTexA, roughness: 0.8, metalness: 0.4,
      emissive: 0x0a0a14, emissiveIntensity: 0.4,
    });
    const wallMatB = new THREE.MeshStandardMaterial({
      map: wallTexB, roughness: 0.8, metalness: 0.4,
      emissive: 0x0a0a14, emissiveIntensity: 0.4,
    });

    this.wallMeshes = [];

    const leftWall = new THREE.Mesh(wallGeoLR, wallMatA);
    leftWall.position.set(ROOM.minX, WALL_H / 2, 0);
    scene.add(leftWall); this.wallMeshes.push(leftWall);

    const rightWall = new THREE.Mesh(wallGeoLR, wallMatB);
    rightWall.position.set(ROOM.maxX, WALL_H / 2, 0);
    scene.add(rightWall); this.wallMeshes.push(rightWall);

    const backWall = new THREE.Mesh(wallGeoFB, wallMatB);
    backWall.position.set(0, WALL_H / 2, ROOM.minZ);
    scene.add(backWall); this.wallMeshes.push(backWall);

    const frontWall = new THREE.Mesh(wallGeoFB, wallMatA);
    frontWall.position.set(0, WALL_H / 2, ROOM.maxZ);
    scene.add(frontWall); this.wallMeshes.push(frontWall);

    /* ---- обережные пояса (красные полосы) ---- */
    const stripMat = new THREE.MeshBasicMaterial({ color: C.red, transparent: true, opacity: 0.55 });
    const stripGeoLR = new THREE.BoxGeometry(0.06, 0.1, 32);
    const stripGeoFB = new THREE.BoxGeometry(24, 0.1, 0.06);
    for (const y of [0.1, 0.4]) {
      const sL = new THREE.Mesh(stripGeoLR, stripMat); sL.position.set(ROOM.minX + 0.28, y, 0); scene.add(sL);
      const sR = new THREE.Mesh(stripGeoLR, stripMat); sR.position.set(ROOM.maxX - 0.28, y, 0); scene.add(sR);
      const sB = new THREE.Mesh(stripGeoFB, stripMat); sB.position.set(0, y, ROOM.minZ + 0.28); scene.add(sB);
      const sF = new THREE.Mesh(stripGeoFB, stripMat); sF.position.set(0, y, ROOM.maxZ - 0.28); scene.add(sF);
    }
    this.stripMat = stripMat;

    /* ---- трубы ---- */
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, metalness: 0.8, roughness: 0.45 });
    for (let i = 0; i < 3; i++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 24, 8), pipeMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0, 4.3 + i * 0.22, ROOM.minZ + 0.35);
      scene.add(pipe);
    }

    /* ---- надписи (вязь) ---- */
    const rusPanel = makeTextTexture('РУСЬ · КОВЧЕГ 7', { color: '#d4a843', fontSize: 100, height: 1.5 });
    rusPanel.position.set(0, 3.6, ROOM.minZ + 0.28);
    scene.add(rusPanel);

    const cryoPanel = makeTextTexture('СОН-ПАЛАТА · 2', { color: '#ff3a4a', fontSize: 70, height: 1.0 });
    cryoPanel.position.set(0, 3.6, ROOM.maxZ - 0.28);
    cryoPanel.rotation.y = Math.PI;
    scene.add(cryoPanel);

    const svarogPanel = makeTextTexture('СВАРОГ', { color: '#ff8a1a', fontSize: 80, height: 1.1 });
    svarogPanel.position.set(ROOM.maxX - 0.28, 2.6, -6);
    svarogPanel.rotation.y = -Math.PI / 2;
    scene.add(svarogPanel);

    /* ---- экран на стене ---- */
    const wallScreenTex = makeWallScreenTexture();
    const wallScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.2),
      new THREE.MeshBasicMaterial({ map: wallScreenTex })
    );
    wallScreen.position.set(ROOM.minX + 0.28, 3.0, 8);
    wallScreen.rotation.y = Math.PI / 2;
    scene.add(wallScreen);

    /* ---- капсулы (сон-колыбели) ---- */
    for (let i = 0; i < CAPSULE_Z.length; i++) {
      const cap = buildCapsule(i);
      cap.position.set(CAPSULES_X, 0, CAPSULE_Z[i]);
      cap.rotation.y = -Math.PI / 2;
      scene.add(cap);

      if (i === 1) {
        const warn = makeTextTexture('НЕ ВХОДИ', { color: '#ff3a4a', fontSize: 56, height: 0.5 });
        warn.position.set(CAPSULES_X + 1.2, 1.7, CAPSULE_Z[i]);
        warn.rotation.y = Math.PI / 2;
        scene.add(warn);
      }
    }

    /* ---- ПЕЧЬ-ПУЛЬТ ---- */
    // Основание печи — массивный блок
    const pultBaseMat = new THREE.MeshStandardMaterial({
      color: 0x1a1410,
      metalness: 0.5,
      roughness: 0.75,
      emissive: 0x0a0a08,
      emissiveIntensity: 0.3,
    });
    const pultBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 1.4), pultBaseMat);
    pultBase.position.set(PULT_POS.x, 0.7, PULT_POS.z);
    scene.add(pultBase);

    // Свод печи (скруглённый верх)
    const archMat = new THREE.MeshStandardMaterial({
      color: 0x1a1410, metalness: 0.5, roughness: 0.7,
    });
    const arch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 1.2, 16, 1, false, 0, Math.PI),
      archMat
    );
    arch.rotation.z = Math.PI / 2;
    arch.rotation.y = Math.PI / 2;
    arch.position.set(PULT_POS.x, 1.4, PULT_POS.z);
    scene.add(arch);

    // Устье — экран
    const pultTex = makePultScreenTexture();
    const pultScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.9),
      new THREE.MeshBasicMaterial({ map: pultTex, transparent: true })
    );
    pultScreen.position.set(PULT_POS.x - 0.71, 1.15, PULT_POS.z);
    pultScreen.rotation.y = -Math.PI / 2;
    scene.add(pultScreen);

    // Свечение устья
    const pultGlow = new THREE.PointLight(C.goldBright, 2.5, 5);
    pultGlow.position.set(PULT_POS.x - 0.6, 1.15, PULT_POS.z);
    scene.add(pultGlow);
    this.pultGlow = pultGlow;

    // резной наличник вокруг устья
    const nalichnikMat = new THREE.MeshStandardMaterial({
      color: 0x2a1a10, metalness: 0.6, roughness: 0.6,
      emissive: C.gold, emissiveIntensity: 0.1,
    });
    for (let i = 0; i < 8; i++) {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.08),
        nalichnikMat
      );
      block.position.set(
        PULT_POS.x - 0.72,
        0.7 + (i < 4 ? 0 : 0.9),
        PULT_POS.z - 0.8 + (i % 4) * 0.53
      );
      scene.add(block);
    }

    // Кнопки-угли
    for (let i = 0; i < 4; i++) {
      const btn = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.03, 0.12),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? C.gold : C.redBright })
      );
      btn.position.set(PULT_POS.x - 0.6, 0.72, PULT_POS.z - 0.3 + i * 0.2);
      scene.add(btn);
    }

    /* ---- планшет ---- */
    const tablet = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.04, 0.35),
      new THREE.MeshStandardMaterial({
        color: 0xd4a843,
        emissive: 0xffbb33,
        emissiveIntensity: 1.8,
      })
    );
    tablet.position.set(2.5, 0.03, 3);
    tablet.rotation.y = 0.5;
    scene.add(tablet);
    this.tablet = tablet;
    this.tabletRead = false;

    /* ---- аварийные огни в углах ---- */
    this.emergencyLights = [];
    const corners = [
      [ROOM.minX + 1.5, 4.2, ROOM.minZ + 1.5],
      [ROOM.maxX - 1.5, 4.2, ROOM.minZ + 1.5],
      [ROOM.minX + 1.5, 4.2, ROOM.maxZ - 1.5],
      [ROOM.maxX - 1.5, 4.2, ROOM.maxZ - 1.5],
    ];
    for (const [x, y, z] of corners) {
      const light = new THREE.PointLight(0xff2a3a, 2.5, 14);
      light.position.set(x, y, z);
      scene.add(light);
      this.emergencyLights.push(light);
    }

    /* ---- РАЗЛОМ — КАЛИНОВ МОСТ (огненное кольцо с рунами) ---- */
    this.rift = new THREE.Group();
    this.rift.position.copy(RIFT_POS);

    // Основное кольцо — огненное
    const riftRingMat = new THREE.MeshBasicMaterial({
      color: 0xff8844,
      transparent: true,
      opacity: 0.9,
    });
    this.riftRing = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.15, 12, 48), riftRingMat);
    this.riftRing.rotation.x = Math.PI / 2;
    this.rift.add(this.riftRing);
    this.riftMat = riftRingMat;

    // Руны по кругу (8 плоскостей с текстурами рун)
    this.runeMeshes = [];
    const runes = ['ᚱ', 'ᚨ', 'ᛞ', 'ᛊ', 'ᛉ', 'ᛏ', 'ᛒ', 'ᚦ'];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const runeTex = makeCanvasTexture((c, w, h) => {
        c.clearRect(0, 0, w, h);
        c.fillStyle = '#ff8844';
        c.font = 'bold 64px monospace';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(runes[i], w / 2, h / 2);
      }, 64, 64);
      const runeMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.35, 0.35),
        new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, opacity: 0.85 })
      );
      runeMesh.position.set(Math.cos(a) * 1.55, 0.02, Math.sin(a) * 1.55);
      runeMesh.rotation.x = -Math.PI / 2;
      this.rift.add(runeMesh);
      this.runeMeshes.push(runeMesh);
    }

    // Внутренний диск — тёмный
    const riftInner = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 32),
      new THREE.MeshBasicMaterial({ color: 0x1a0808, transparent: true, opacity: 0.6 })
    );
    riftInner.rotation.x = -Math.PI / 2;
    riftInner.position.y = 0.01;
    this.rift.add(riftInner);

    scene.add(this.rift);

    // Свет разлома
    this.riftLight = new THREE.PointLight(0xff8844, 4, 18);
    this.riftLight.position.set(RIFT_POS.x, 0.7, RIFT_POS.z);
    scene.add(this.riftLight);

    // Столб огня
    this.riftBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.1, 14, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
    );
    this.riftBeam.position.set(RIFT_POS.x, 7, RIFT_POS.z);
    scene.add(this.riftBeam);

    // Сфера-оболочка
    this.riftShell = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 24, 12),
      new THREE.MeshBasicMaterial({ color: 0xffaa66, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    this.riftShell.position.set(RIFT_POS.x, 0.7, RIFT_POS.z);
    scene.add(this.riftShell);

    // Волна активации
    this.riftWave = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.5, 48),
      new THREE.MeshBasicMaterial({ color: 0xffaa66, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    this.riftWave.rotation.x = -Math.PI / 2;
    this.riftWave.position.set(RIFT_POS.x, 0.06, RIFT_POS.z);
    scene.add(this.riftWave);
    this.riftWaveT = -1;

    /* ---- КЛУБОК ---- */
    this.klubokMesh = new THREE.Group();
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xd4a843,
      emissive: 0xffaa33,
      emissiveIntensity: 2.2,
      roughness: 0.6,
      metalness: 0.2,
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 20, 16), ballMat);
    this.klubokMesh.add(ball);

    // Обмотка-нити
    for (let i = 0; i < 3; i++) {
      const thread = new THREE.Mesh(
        new THREE.TorusGeometry(0.36, 0.02, 6, 24),
        new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0.7 })
      );
      thread.rotation.x = Math.PI / 2 + i * 0.5;
      thread.rotation.y = i * 1.1;
      this.klubokMesh.add(thread);
    }

    const klubokLight = new THREE.PointLight(0xffcc66, 1.8, 4.5);
    this.klubokMesh.add(klubokLight);
    scene.add(this.klubokMesh);

    // Нить от клубка к игроку
    this.thread = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1, 4),
      new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.8 })
    );
    this.thread.visible = false;
    scene.add(this.thread);

    /* ---- ДОМОВОЙ ---- */
    this.domovoi = buildDomovoi();
    this.domovoi.position.set(DOMOVOI_POS.x, DOMOVOI_POS.y, DOMOVOI_POS.z);
    this.domovoi.rotation.y = -Math.PI / 2;
    scene.add(this.domovoi);

    /* ---- ИСКРА (если материализована) ---- */
    this.iskraMesh = null;
    if (g.state.flags.iskraMaterialized) {
      this.iskraMesh = new THREE.Group();
      const iskraBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 14, 14),
        new THREE.MeshStandardMaterial({
          color: 0xffffff, emissive: 0xffcc66, emissiveIntensity: 5,
        })
      );
      this.iskraMesh.add(iskraBall);

      // сварга-оберег вокруг искры
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const ray = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.04, 0.4),
          new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.7 })
        );
        ray.position.set(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25);
        ray.rotation.y = a;
        this.iskraMesh.add(ray);
      }

      const iskraLight = new THREE.PointLight(0xffcc66, 2.5, 4);
      this.iskraMesh.add(iskraLight);
      scene.add(this.iskraMesh);
    }

    /* ---- ИГРОК ---- */
    this.player = new THREE.Group();
    const playerBodyMat = new THREE.MeshStandardMaterial({
      color: 0x66ddff,
      emissive: 0x114466,
      emissiveIntensity: 1.4,
    });
    this.playerBodyMat = playerBodyMat;
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 1.1), playerBodyMat);
    bodyMesh.position.y = 1;
    this.player.add(bodyMesh);

    // визор
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.3, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x88ffff })
    );
    visor.position.set(0, 1.7, 0.56);
    this.player.add(visor);

    // свечение
    const playerGlow = new THREE.PointLight(0x66ddff, 1.5, 5);
    playerGlow.position.y = 1.2;
    this.player.add(playerGlow);

    // "свеча" над головой (дух)
    const candle = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdd66 })
    );
    candle.position.y = 2.3;
    this.player.add(candle);
    this.playerCandle = candle;

    scene.add(this.player);

    /* ---- state ---- */
    this.pos = new THREE.Vector3(PLAYER_START.x, PLAYER_START.y, PLAYER_START.z);
    this.yaw = 0;
    this.pitch = 0.25;
    this.t = 0;

    this.klubokState = 'ground';
    this.klubokMesh.position.copy(KLUBOK_START);
    this.klubokAnim = null;

    this.camDist = isFirst ? 2.5 : 9;
    this.lastRiftPrompt = 0;
    this.lastDomovoiHint = 0;
    this.lastTabletHint = 0;

    hint(isFirst ? 'Сон-палата «Русь-Ковчег 7». Осмотрись' : 'Снова в Яви', 4000);
    console.log('[world3d] entered · v6 slavic');
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
    const mat = new THREE.PointsMaterial({ color: 0xd4b890, size: 0.6, transparent: true, opacity: 0.8 });
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

    const rc = new THREE.Raycaster(playerHead.clone(), dir.clone(), 0.1, desiredDist);
    const hits = rc.intersectObjects(this.wallMeshes, false);
    let wantedDist = desiredDist;
    if (hits.length > 0) wantedDist = Math.max(1.5, hits[0].distance - 0.4);

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
    this.thread.material.color.set(0xffaa44);
  }

  pickupKlubok() {
    this.klubokState = 'carried';
    hint('Клубок-путеводитель у тебя. Целься в разлом и нажми F', 4000);
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
  }

  sealKlubok() {
    this.klubokState = 'sealed';
    this.riftWaveT = 0;
    hint('Калинов мост открыт. Подойди к разлому и нажми E', 5000);
  }

  updateKlubok(dt) {
    const g = this.game;
    const blocked = dialogue.active;

    if (this.klubokState === 'ground') {
      const d = Math.hypot(
        this.klubokMesh.position.x - this.pos.x,
        this.klubokMesh.position.z - this.pos.z
      );
      if (d < 1.8) this.pickupKlubok();
    }
    else if (this.klubokState === 'carried') {
      const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      camDir.y = 0;
      if (camDir.lengthSq() > 0.001) {
        camDir.normalize();
        this.player.rotation.y = angleLerp(this.player.rotation.y, Math.atan2(camDir.x, camDir.z), Math.min(1, dt * 10));
        const rightVec = new THREE.Vector3(camDir.z, 0, -camDir.x);
        this.klubokMesh.position.set(
          this.pos.x + camDir.x * 0.5 + rightVec.x * 0.6,
          1.2 + Math.sin(this.t * 3) * 0.05,
          this.pos.z + camDir.z * 0.5 + rightVec.z * 0.6
        );
      }
      this.updateThreadToKlubok();
      if (!blocked && consumeAction('KeyF') && !g.transitioning) this.throwKlubok();
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
      if (!blocked && consumeAction('KeyF') && !g.transitioning) {
        this.klubokState = 'carried';
        this.throwKlubok();
      }
    }
    else if (this.klubokState === 'sealed') {
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

    if (sealed) {
      this.riftMat.color.set(0xffcc66);
      this.riftMat.opacity = 0.9 + Math.sin(this.t * 5) * 0.1;
      this.riftLight.intensity = 16 + Math.sin(this.t * 5) * 5;
      this.riftLight.color.set(0xffcc66);
      this.riftBeam.material.opacity = 0.5 + Math.sin(this.t * 4) * 0.12;
      this.riftBeam.material.color.set(0xffcc66);
      this.riftShell.material.opacity = 0.15 + Math.sin(this.t * 3) * 0.06;
    } else {
      this.riftMat.color.set(0xff8844);
      this.riftMat.opacity = 0.7 + Math.sin(this.t * 2) * 0.15;
      this.riftLight.intensity = 4 + Math.sin(this.t * 2) * 1;
      this.riftLight.color.set(0xff8844);
      this.riftBeam.material.opacity = 0.18;
      this.riftBeam.material.color.set(0xffaa44);
      this.riftShell.material.opacity = Math.max(0, this.riftShell.material.opacity - dt * 0.5);
    }
    this.riftRing.rotation.z = this.t * 0.6;

    // руны пульсируют
    for (let i = 0; i < this.runeMeshes.length; i++) {
      this.runeMeshes[i].material.opacity = 0.6 + Math.sin(this.t * 3 + i) * 0.3;
    }

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

  updateDomovoi(dt) {
    if (!this.domovoi) return;
    this.domovoi.position.y = DOMOVOI_POS.y + Math.sin(this.t * 2) * 0.08;
    this.domovoi.rotation.z = Math.sin(this.t * 1.3) * 0.05;
    const dx = this.pos.x - this.domovoi.position.x;
    const dz = this.pos.z - this.domovoi.position.z;
    const targetAngle = Math.atan2(dx, dz);
    this.domovoi.rotation.y = angleLerp(this.domovoi.rotation.y, targetAngle, Math.min(1, dt * 2));
  }

  updateIskra(dt) {
    if (!this.iskraMesh) return;
    const offset = new THREE.Vector3(
      Math.sin(this.t * 1.5) * 0.6,
      1.6 + Math.sin(this.t * 2.2) * 0.12,
      Math.cos(this.t * 1.5) * 0.6
    );
    this.iskraMesh.position.set(this.pos.x + offset.x, offset.y, this.pos.z + offset.z);
    this.iskraMesh.rotation.y = this.t * 1.2;
  }

  startDomovoiDialogue() {
    const flags = this.game.state.flags;

    if (flags.iskraFound && !flags.domovoiSecond) {
      flags.domovoiSecond = true;
      flags.metDomovoi = true;
      startDialogue('ДОМОВОЙ', [
        'Ты нашёл искру. Не думал, что получится с первого раза.',
        'Она — часть чьей-то души. Чья — не знаю. Но в Яви она обретает форму.',
        'Дальше — Печь. В реакторе. Там ты узнаешь правду.',
      ], () => {
        hint('Уровень 1 пройден. Дальше — Печь', 6000);
      });
      return;
    }

    if (!flags.metDomovoi) {
      flags.metDomovoi = true;
      startDialogue('ДОМОВОЙ', [
        'Живой?.. Живой!.. Значит, ещё не всё потеряно.',
        'Экипаж в Нави. Все. Их души застряли между мирами.',
        'Я — домовой ковчега. Сварог-ИИ разбудил тебя не случайно.',
        'Возьми клубок-путеводитель у печи. Брось в разлом — он откроет дорогу.',
        'В Нави есть то, чего нет в Яви. Найди искру — она покажет путь.',
      ], () => {
        hint('Клубок — у печи справа. Разлом — в центре', 5000);
      });
      return;
    }

    startDialogue('ДОМОВОЙ', [
      'Искра ждёт в Нави. Не возвращайся без неё.',
    ]);
  }

  handleInteraction() {
    if (this.game.transitioning) return;
    if (dialogue.active) return;
    if (!consumeAction('KeyE')) return;

    if (this.domovoi) {
      const d = Math.hypot(
        this.pos.x - this.domovoi.position.x,
        this.pos.z - this.domovoi.position.z
      );
      if (d < 2.5) {
        this.startDomovoiDialogue();
        return;
      }
    }

    if (this.klubokState === 'sealed') {
      const d = Math.hypot(this.pos.x - RIFT_POS.x, this.pos.z - RIFT_POS.z);
      if (d < RIFT_INTERACT_RADIUS) {
        collapseTo2D(this);
        return;
      }
    }

    if (!this.tabletRead && this.tablet) {
      const d = Math.hypot(this.pos.x - this.tablet.position.x, this.pos.z - this.tablet.position.z);
      if (d < 1.5) {
        this.tabletRead = true;
        hint('Сварог: «Сон-палата. Экипаж молчит. Найди домового у печи»', 6000);
        return;
      }
    }
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
      this.pos.x = clamp(this.pos.x, ROOM.minX + PLAYER_PAD, ROOM.maxX - PLAYER_PAD);
      this.pos.z = clamp(this.pos.z, ROOM.minZ + PLAYER_PAD, ROOM.maxZ - PLAYER_PAD);

      this.player.position.set(this.pos.x, Math.sin(this.t * 9) * 0.05 * (moving ? 1 : 0), this.pos.z);
      if (moving && this.klubokState !== 'carried' && !dialogue.active) {
        this.player.rotation.y = angleLerp(this.player.rotation.y, Math.atan2(move.x, move.z), Math.min(1, dt * 12));
      }

      // свеча над головой мерцает
      if (this.playerCandle) {
        this.playerCandle.scale.setScalar(0.9 + Math.sin(this.t * 8) * 0.1);
      }
    }

    this.updateCamera(dt);
    this.updateKlubok(dt);
    this.updateRift(dt);
    this.updateDomovoi(dt);
    this.updateIskra(dt);

    const emergencyPulse = 2 + Math.sin(this.t * 3.4) * 1.2;
    for (let i = 0; i < this.emergencyLights.length; i++) {
      this.emergencyLights[i].intensity = emergencyPulse + Math.sin(this.t * 3.4 + i) * 0.4;
    }
    if (this.stripMat) this.stripMat.opacity = 0.4 + Math.sin(this.t * 3.4) * 0.15;

    // подсказки
    if (!this.tabletRead && this.tablet && !dialogue.active) {
      const d = Math.hypot(this.pos.x - this.tablet.position.x, this.pos.z - this.tablet.position.z);
      if (d < 1.5 && this.t - this.lastTabletHint > 3) {
        hint('E — прочитать планшет', 2500);
        this.lastTabletHint = this.t;
      }
    }
    if (this.domovoi && !dialogue.active) {
      const d = Math.hypot(this.pos.x - this.domovoi.position.x, this.pos.z - this.domovoi.position.z);
      if (d < 2.5 && this.t - this.lastDomovoiHint > 3) {
        hint('E — поговорить с домовым', 2500);
        this.lastDomovoiHint = this.t;
      }
    }
    if (this.klubokState === 'sealed' && !dialogue.active) {
      const d = Math.hypot(this.pos.x - RIFT_POS.x, this.pos.z - RIFT_POS.z);
      if (d < RIFT_INTERACT_RADIUS && this.t - this.lastRiftPrompt > 2.5) {
        hint('E — войти в разлом', 3000);
        this.lastRiftPrompt = this.t;
      }
    }

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
   WORLD 2D — НАВЬ-КРИОЗАЛ (славянская стилизация)
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

    this.iskra = null;
    if (!this.game.state.flags.iskraFound) {
      this.iskra = { x: ISKRA_2D_POS.x, z: ISKRA_2D_POS.z, r: 0.4, t: 0 };
    }

    hint(this.iskra
      ? 'Навь · стены призрачны. Найди искру в дальнем углу'
      : 'Навь · искры больше нет. Иди к тени клубка', 5000);
    console.log('[world2d] entered · nav slavic');
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

      if (this.iskra) {
        this.iskra.t += dt;
        const dIskra = Math.hypot(p.x - this.iskra.x, p.z - this.iskra.z);
        if (dIskra < 1.5 && consumeAction('KeyE')) {
          this.iskra = null;
          this.game.state.flags.iskraFound = true;
          hint('Искра в руках. Вернись в Явь через проём', 5000);
        }
      }

      const d = Math.hypot(p.x - this.shadow.x, p.z - this.shadow.z);
      if (d < 1.5 && consumeAction('KeyE')) {
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

    // фон — глубокий чёрный с лёгким синим
    ctx.fillStyle = '#04060c';
    ctx.fillRect(0, 0, w, h);

    // половицы пола
    const plankStep = scale * 1.5;
    ctx.strokeStyle = 'rgba(212,168,67,0.08)';
    ctx.lineWidth = 1;
    for (let y = (camZ * scale) % plankStep; y < h; y += plankStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // пол — тёмный прямоугольник
    ctx.fillStyle = 'rgba(20, 25, 40, 0.55)';
    const fx = sx(ROOM.minX), fy = sy(ROOM.minZ);
    const fw = (ROOM.maxX - ROOM.minX) * scale;
    const fh = (ROOM.maxZ - ROOM.minZ) * scale;
    ctx.fillRect(fx, fy, fw, fh);

    // === ЧАСТОКОЛ — стены ===
    const drawPicket = (x1, z1, x2, z2, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';

      const xStart = sx(x1), yStart = sy(z1);
      const xEnd = sx(x2), yEnd = sy(z2);
      ctx.beginPath();
      ctx.moveTo(xStart, yStart);
      ctx.lineTo(xEnd, yEnd);
      ctx.stroke();

      // зубцы
      const segments = Math.floor(Math.hypot(xEnd - xStart, yEnd - yStart) / (scale * 0.8));
      const dx = (xEnd - xStart) / segments;
      const dy = (yEnd - yStart) / segments;
      const toothH = 6;
      const nx = -(yEnd - yStart) / Math.hypot(xEnd - xStart, yEnd - yStart) * toothH;
      const ny = (xEnd - xStart) / Math.hypot(xEnd - xStart, yEnd - yStart) * toothH;

      ctx.fillStyle = color;
      for (let i = 0; i <= segments; i++) {
        const px = xStart + dx * i;
        const py = yStart + dy * i;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + nx, py + ny);
        ctx.lineTo(px + dx, py + dy);
        ctx.closePath();
        ctx.fill();
      }
    };

    const wallColor = '#c8a860';
    // левая
    drawPicket(ROOM.minX, ROOM.minZ, ROOM.minX, ROOM.maxZ, wallColor);
    // правая
    drawPicket(ROOM.maxX, ROOM.minZ, ROOM.maxX, ROOM.maxZ, wallColor);
    // дальняя — с проёмом
    drawPicket(ROOM.minX, ROOM.minZ, -2, ROOM.minZ, wallColor);
    drawPicket(2, ROOM.minZ, ROOM.maxX, ROOM.minZ, wallColor);
    // ближняя
    drawPicket(ROOM.minX, ROOM.maxZ, ROOM.maxX, ROOM.maxZ, wallColor);

    // проём — свечение
    ctx.strokeStyle = 'rgba(255,204,102,0.5)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx(-2), sy(ROOM.minZ));
    ctx.lineTo(sx(2), sy(ROOM.minZ));
    ctx.stroke();

    // капсулы — стилизованные сварги
    for (let i = 0; i < CAPSULE_Z.length; i++) {
      const cxp = sx(CAPSULES_X + 0.5);
      const cyp = sy(CAPSULE_Z[i]);

      ctx.strokeStyle = i === 1 ? 'rgba(192,32,48,0.7)' : 'rgba(212,168,67,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cxp, cyp, 0.85 * scale, 0, Math.PI * 2);
      ctx.stroke();

      // сварга внутри
      ctx.strokeStyle = i === 1 ? 'rgba(255,80,100,0.8)' : 'rgba(212,168,67,0.8)';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + this.t * 0.2;
        ctx.beginPath();
        ctx.moveTo(cxp, cyp);
        ctx.lineTo(cxp + Math.cos(a) * 0.5 * scale, cyp + Math.sin(a) * 0.5 * scale);
        ctx.stroke();
      }
    }

    // печь-пульт — прямоугольник с орнаментом
    const pxp = sx(PULT_POS.x - 1.2), pyp = sy(PULT_POS.z - 0.7);
    ctx.fillStyle = 'rgba(60, 30, 10, 0.6)';
    ctx.fillRect(pxp, pyp, 2.4 * scale, 1.4 * scale);
    ctx.strokeStyle = 'rgba(212,168,67,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(pxp, pyp, 2.4 * scale, 1.4 * scale);
    // ромбы на пульте
    ctx.fillStyle = 'rgba(192,32,48,0.7)';
    for (let k = 0; k < 3; k++) {
      const dxx = pxp + (k + 1) * (2.4 * scale / 4);
      drawDiamond(ctx, dxx, pyp + 0.7 * scale, 6, 'rgba(192,32,48,0.8)');
    }

    // РАЗЛОМ — огненное кольцо с рунами
    const rx = sx(RIFT_POS.x), ry = sy(RIFT_POS.z);
    const riftPulse = 0.6 + Math.sin(this.t * 3) * 0.25;
    // аура
    const rg = ctx.createRadialGradient(rx, ry, 0, rx, ry, 2.2 * scale);
    rg.addColorStop(0, `rgba(255,136,68,${riftPulse * 0.5})`);
    rg.addColorStop(0.5, `rgba(255,136,68,${riftPulse * 0.2})`);
    rg.addColorStop(1, 'rgba(255,136,68,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(rx, ry, 2.2 * scale, 0, Math.PI * 2); ctx.fill();
    // кольцо
    ctx.strokeStyle = `rgba(255,170,80,${0.7 + riftPulse * 0.3})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(rx, ry, 1.2 * scale, 0, Math.PI * 2);
    ctx.stroke();
    // руны вокруг
    ctx.fillStyle = 'rgba(255,220,140,0.85)';
    ctx.font = `${Math.floor(scale * 0.45)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const runes2d = ['ᚱ', 'ᚨ', 'ᛞ', 'ᛊ', 'ᛉ', 'ᛏ', 'ᛒ', 'ᚦ'];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + this.t * 0.3;
      const rx2 = rx + Math.cos(a) * 1.55 * scale;
      const ry2 = ry + Math.sin(a) * 1.55 * scale;
      ctx.fillText(runes2d[i], rx2, ry2);
    }

    // ПРИЗРАК — душа в саване
    const gx = sx(this.ghost.x), gy = sy(this.ghost.z);
    const ghostAlpha = 0.35 + Math.sin(this.t * 2.2) * 0.15;
    // ореол
    const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 1.4 * scale);
    gg.addColorStop(0, `rgba(200,220,255,${ghostAlpha})`);
    gg.addColorStop(1, 'rgba(200,220,255,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(gx, gy, 1.4 * scale, 0, Math.PI * 2); ctx.fill();
    // фигура в саване (треугольник)
    ctx.fillStyle = `rgba(220,240,255,${ghostAlpha + 0.2})`;
    ctx.beginPath();
    ctx.moveTo(gx, gy - 0.6 * scale);
    ctx.lineTo(gx + 0.4 * scale, gy + 0.4 * scale);
    ctx.lineTo(gx - 0.4 * scale, gy + 0.4 * scale);
    ctx.closePath();
    ctx.fill();
    // голова
    ctx.beginPath();
    ctx.arc(gx, gy - 0.35 * scale, 0.18 * scale, 0, Math.PI * 2);
    ctx.fill();

    // ИСКРА — звезда-оберег
    if (this.iskra) {
      const ix = sx(this.iskra.x), iy = sy(this.iskra.z);
      const iskraPulse = 0.7 + Math.sin(this.t * 4) * 0.3;
      const radius = 1.6 * scale * iskraPulse;

      // аура
      const ig = ctx.createRadialGradient(ix, iy, 0, ix, iy, radius);
      ig.addColorStop(0, `rgba(255,255,255,${0.95})`);
      ig.addColorStop(0.25, `rgba(255,220,140,${0.7 * iskraPulse})`);
      ig.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = ig;
      ctx.beginPath(); ctx.arc(ix, iy, radius, 0, Math.PI * 2); ctx.fill();

      // сварга-оберег — 8 лучей
      ctx.strokeStyle = `rgba(255,240,200,${0.9 * iskraPulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + this.t * 0.8;
        const r1 = 0.35 * scale;
        const r2 = 0.9 * scale * iskraPulse;
        ctx.moveTo(ix + Math.cos(a) * r1, iy + Math.sin(a) * r1);
        ctx.lineTo(ix + Math.cos(a) * r2, iy + Math.sin(a) * r2);
      }
      ctx.stroke();

      // ядро
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ix, iy, 0.22 * scale, 0, Math.PI * 2); ctx.fill();

      // подсказка
      const dIskra = Math.hypot(this.player.x - this.iskra.x, this.player.z - this.iskra.z);
      if (dIskra < 1.5) {
        ctx.fillStyle = '#ffdd66';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('E — взять искру', w / 2, 66);
      }
    }

    // ТЕНЬ КЛУБКА — пульсирующий клубок с обмоткой
    const shx = sx(this.shadow.x), shy = sy(this.shadow.z);
    const pulse = 0.55 + Math.sin(this.t * 3) * 0.3;
    // аура
    const gr = ctx.createRadialGradient(shx, shy, 0, shx, shy, this.shadow.r * scale * 2.5);
    gr.addColorStop(0, `rgba(255,204,102,${pulse})`);
    gr.addColorStop(1, 'rgba(255,204,102,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(shx, shy, this.shadow.r * scale * 2.5, 0, Math.PI * 2); ctx.fill();
    // сам клубок
    ctx.fillStyle = `rgba(255,220,140,${0.75 + pulse * 0.25})`;
    ctx.beginPath(); ctx.arc(shx, shy, this.shadow.r * scale, 0, Math.PI * 2); ctx.fill();
    // обмотка
    ctx.strokeStyle = `rgba(120,80,20,${0.6 + pulse * 0.2})`;
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.ellipse(shx, shy, this.shadow.r * scale * 0.9, this.shadow.r * scale * 0.5, k * Math.PI / 3 + this.t * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ИГРОК — дух-свеча
    const px = sx(this.player.x), py = sy(this.player.z);
    // аура
    const pg = ctx.createRadialGradient(px, py, 0, px, py, this.player.r * scale * 2.5);
    pg.addColorStop(0, 'rgba(124,255,216,0.7)');
    pg.addColorStop(1, 'rgba(124,255,216,0)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(px, py, this.player.r * scale * 2.5, 0, Math.PI * 2); ctx.fill();
    // тело
    ctx.fillStyle = '#7cffd8';
    ctx.beginPath(); ctx.arc(px, py, this.player.r * scale, 0, Math.PI * 2); ctx.fill();
    // направление
    ctx.strokeStyle = '#0a2a24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(this.player.dir) * this.player.r * scale * 1.6,
               py + Math.sin(this.player.dir) * this.player.r * scale * 1.6);
    ctx.stroke();
    // свеча над головой
    const candleFlame = 0.5 + Math.sin(this.t * 8) * 0.2;
    const flameGrad = ctx.createRadialGradient(px, py - this.player.r * scale * 1.8, 0, px, py - this.player.r * scale * 1.8, 0.4 * scale * candleFlame);
    flameGrad.addColorStop(0, 'rgba(255,240,180,0.95)');
    flameGrad.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.arc(px, py - this.player.r * scale * 1.8, 0.4 * scale * candleFlame, 0, Math.PI * 2);
    ctx.fill();

    // подсказка у тени
    const nearShadow = Math.hypot(this.player.x - this.shadow.x, this.player.z - this.shadow.z) < 1.5;
    if (nearShadow) {
      ctx.fillStyle = '#ffdd66';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('E — вернуться в Явь', w / 2, 40);
    }
  }

  resize(w, h) {}
  exit() {}
}

/* =========================================================
   ISKRA MATERIALIZATION
   ========================================================= */
function checkIskraMaterialization() {
  const flags = game.state.flags;
  if (flags.iskraFound && !flags.iskraMaterialized) {
    flags.iskraMaterialized = true;
    hint('Искра обрела форму в Яви. Поговори с домовым', 5000);
    refreshHUD();
  }
}

/* =========================================================
   START
   ========================================================= */
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  game.time += dt;

  if (dialogue.active && consumeAction('KeyE')) {
    advanceDialogue();
  }

  const s = game.scene;
  if (s) {
    if (!game.transitioning) {
      if (s.is3D) checkIskraMaterialization();
      s.update?.(dt);
    }
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

console.log('[iskra] booted, v6 · slavic');