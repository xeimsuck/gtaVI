// =====================================================================
//  VICE 3D — stylized low-poly third-person multiplayer sandbox.
//  Drive, shoot, mess around with friends. Browser + WebSocket relay.
// =====================================================================
import * as THREE from 'three';
import { makeCity, makeCar, makeChar, makeBike, makeHeli, makeRocket, makeTank, makeBoat, makeWeaponMesh, WORLD } from './build.js';

// ---------- renderer / scene ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4e8);
scene.fog = new THREE.Fog(0x9fc4e8, 240, 1000);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 4000);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// lights — warm sun + soft sky fill (the key to a clean stylized look)
const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x8a8068, 1.2); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
sun.position.set(80, 130, 40); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 10; sun.shadow.camera.far = 420;
Object.assign(sun.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160 }); sun.shadow.bias = -0.0005;
scene.add(sun); scene.add(sun.target);
scene.add(new THREE.AmbientLight(0xaab4c4, 0.55));

// ---------- world ----------
const city = makeCity(scene, 7);
const buildings = city.buildings;
function resolve(x, z, r) {
  for (const b of buildings) {
    const hw = b.w / 2 + r, hd = b.d / 2 + r, dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      const ox = hw - Math.abs(dx), oz = hd - Math.abs(dz);
      if (ox < oz) x += dx < 0 ? -ox : ox; else z += dz < 0 ? -oz : oz;
    }
  }
  return [x, z];
}
// walkable on foot = a road/lot cell OR its beach ring (sand extends a few metres past the cell)
function onLandOrBeach(x, z) { return city.isLandCell(x, z) || city.isLandCell(x + 7, z) || city.isLandCell(x - 7, z) || city.isLandCell(x, z + 7) || city.isLandCell(x, z - 7); }
// 3D box collision for aircraft: solid only up to each building's roof. Pushes UP onto the roof (so you can land)
// when near the top, or sideways when near a wall. Above the roof there's no collision → fly over freely.
function resolveHeli(x, z, y, r) {
  let ny = y;
  for (const b of buildings) {
    const roof = b.h || 60;
    if (ny >= roof) continue;                          // above the roof — free airspace
    const hw = b.w / 2 + r, hd = b.d / 2 + r, dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      const penTop = roof - ny, penX = hw - Math.abs(dx), penZ = hd - Math.abs(dz), m = Math.min(penTop, penX, penZ);
      if (m === penTop) ny = roof;                     // rest on / ride up to the roof
      else if (m === penX) x += dx < 0 ? -penX : penX; // bounce off a wall
      else z += dz < 0 ? -penZ : penZ;
    }
  }
  return [x, z, ny];
}

// ---------- parked cars ----------
const CARC = [0xe74c3c, 0x2980b9, 0x27ae60, 0xf1c40f, 0xecf0f1, 0x34495e, 0xe67e22, 0x8e44ad];
const cars = [];
(function spawnCars() {
  const r = () => Math.random();
  for (let i = 0; i < 26; i++) {
    const sp = city.spawns[(r() * city.spawns.length) | 0] || { x: 60, z: 60 };
    const colHex = CARC[i % CARC.length];
    const c = makeCar(colHex);
    c.x = sp.x + (r() - 0.5) * 8; c.z = sp.z + 16; if (!city.isLandCell(c.x, c.z)) { c.x = sp.x; c.z = sp.z; }
    c.heading = Math.round(r() * 4) * Math.PI / 2;
    c.speed = 0; c.vx = 0; c.vz = 0; c.colHex = colHex; c.occupant = null; c.roll = 0; c.pitch = 0; c.type = 'car';
    c.group.position.set(c.x, 0, c.z); c.group.rotation.y = c.heading;
    scene.add(c.group); cars.push(c);
  }
})();
// ---------- motorcycles ----------
(function spawnBikes() {
  const r = () => Math.random();
  for (let i = 0; i < 9; i++) {
    const sp = city.spawns[(r() * city.spawns.length) | 0] || { x: 80, z: 80 };
    const colHex = CARC[(i * 3) % CARC.length];
    const b = makeBike(colHex);
    b.x = sp.x + (r() - 0.5) * 12; b.z = sp.z - 14; if (!city.isLandCell(b.x, b.z)) { b.x = sp.x; b.z = sp.z; }
    b.heading = Math.round(r() * 4) * Math.PI / 2;
    b.speed = 0; b.vx = 0; b.vz = 0; b.colHex = colHex; b.occupant = null; b.roll = 0; b.pitch = 0; b.type = 'bike';
    b.group.position.set(b.x, 0, b.z); b.group.rotation.y = b.heading;
    scene.add(b.group); cars.push(b);
  }
})();
// ---------- helicopters (on open land spawns, spread across both islands) ----------
(function spawnHelis() {
  const S = city.spawns, pts = [S[2], S[(S.length * 0.5) | 0], S[S.length - 3]].filter(Boolean);
  for (const s of pts) {
    const h = makeHeli(0x2c3e57);
    h.x = s.x; h.z = s.z; h.y = 0; h.heading = 0; h.speed = 0; h.vx = 0; h.vz = 0; h.colHex = 0x2c3e57; h.occupant = null; h.roll = 0; h.pitch = 0; h.type = 'heli'; h.rotorSpin = 0;
    h.group.position.set(h.x, 0, h.z); scene.add(h.group); cars.push(h);
  }
})();
// ---------- tanks (on open land spawns) ----------
(function spawnTanks() {
  const S = city.spawns, pts = [S[6], S[S.length - 7]].filter(Boolean);
  for (const s of pts) {
    const t = makeTank(0x5a6b3a);
    t.x = s.x; t.z = s.z; t.heading = 0; t.speed = 0; t.vx = 0; t.vz = 0; t.colHex = 0x5a6b3a; t.occupant = null; t.roll = 0; t.pitch = 0; t.type = 'tank'; t.turretYaw = 0; t.tShootCd = 0;
    t.group.position.set(t.x, 0, t.z); scene.add(t.group); cars.push(t);
  }
})();
// ---------- boats (on the water just off the beaches) ----------
(function spawnBoats() {
  const spots = [];
  for (const c of city.landCells) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const wx = c.cx + dx * WORLD.BLOCK, wz = c.cz + dz * WORLD.BLOCK;
    if (!city.isLandCell(wx, wz) && wx > 12 && wz > 12 && wx < WORLD.SIZE - 12 && wz < WORLD.SIZE - 12) spots.push({ x: wx, z: wz });
  }
  for (let i = 0; i < 7 && spots.length; i++) {
    const s = spots[(i * 13) % spots.length], col = CARC[(i * 2) % CARC.length], b = makeBoat(col);
    b.x = s.x; b.z = s.z; b.heading = 0; b.speed = 0; b.vx = 0; b.vz = 0; b.colHex = col; b.occupant = null; b.roll = 0; b.pitch = 0; b.type = 'boat';
    b.group.position.set(b.x, -0.15, b.z); scene.add(b.group); cars.push(b);
  }
})();

// ---------- input ----------
const keys = new Set();
const mouse = { dx: 0, dy: 0, down: false, right: false };
let locked = false, captured = false, mouseHeld = false;
addEventListener('keydown', e => { if (captured) return; keys.add(e.code); if (['Tab', 'Space', 'KeyF'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => keys.delete(e.code));
canvas.addEventListener('mousedown', e => { if (captured) return; if (!locked) { canvas.requestPointerLock(); return; } if (e.button === 0) mouse.down = true; if (e.button === 2) mouse.right = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.right = false; });
addEventListener('mousemove', e => { if (locked && !captured) { mouse.dx += e.movementX; mouse.dy += e.movementY; } });
document.addEventListener('pointerlockchange', () => locked = document.pointerLockElement === canvas);
canvas.addEventListener('contextmenu', e => e.preventDefault());
const axisX = () => (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
const axisY = () => (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);

// ---------- player ----------
const WEAPONS = {
  fists: { name: 'Fists', dmg: 14, rof: 0.34, auto: false, spread: 0, pellets: 0, icon: '👊', melee: true, range: 2.6 },
  pistol: { name: 'Pistol', dmg: 18, rof: 0.30, auto: false, spread: 0.006, pellets: 1, icon: '🔫' },
  smg: { name: 'SMG', dmg: 11, rof: 0.075, auto: true, spread: 0.03, pellets: 1, icon: '🧨' },
  shotgun: { name: 'Shotgun', dmg: 8, rof: 0.7, auto: false, spread: 0.07, pellets: 7, icon: '💥' },
  rifle: { name: 'Rifle', dmg: 24, rof: 0.12, auto: true, spread: 0.015, pellets: 1, icon: '🪖' },
  sniper: { name: 'Sniper', dmg: 85, rof: 1.05, auto: false, spread: 0, pellets: 1, icon: '🎯', scope: true },
  rpg: { name: 'RPG', dmg: 120, rof: 1.1, auto: false, spread: 0, pellets: 1, icon: '🚀', rocket: true },
  homing: { name: 'Lock-On', dmg: 150, rof: 1.7, auto: false, spread: 0, pellets: 1, icon: '📡', homing: true },
};
const WORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'rpg', 'homing'];
const owns = w => w === 'fists' || w === 'pistol' || me.ammo[w] > 0;
const me = {
  id: null, name: 'Player', colorHex: 0x3aa0ff,
  pos: new THREE.Vector3(250, 0, 370), heading: 0, vy: 0, onGround: true,
  hp: 100, alive: true, kills: 0, inCar: null, aiming: false, walkT: 0, shootCd: 0, fp: false,
  weapon: 'pistol', ammo: { pistol: Infinity, smg: 0, shotgun: 0, rifle: 0, sniper: 0, rpg: 0, homing: 0 },
  wanted: 0, heat: 0, lastCrime: 0, lockTarget: null, lockT: 0, locked: false,
  look: { shirt: '#3aa0ff', skin: '#e0ac69', hair: '#20140d', pants: '#2c3e50', hat: false, gender: 'm' },
  char: null,
};
const hx2i = v => (v ? parseInt(v.slice(1), 16) : undefined);
function charFromLook(lk, fallback) { lk = lk || {}; return makeChar(hx2i(lk.shirt) ?? hx2i(fallback) ?? 0x3aa0ff, { skin: hx2i(lk.skin), hair: hx2i(lk.hair), pants: hx2i(lk.pants), hat: !!lk.hat, gender: lk.gender === 'f' ? 'f' : 'm' }); }
function buildChar() { return charFromLook(me.look); }
me.char = buildChar(); scene.add(me.char.group); me.char.setWeapon(me.weapon);
function setWeapon(kind) { me.weapon = kind; me.shootCd = 0; if (me.char && me.char.setWeapon) me.char.setWeapon(kind); }
addEventListener('wheel', e => {
  if (!playing || captured || me.inCar || !me.alive) return;
  const owned = WORDER.filter(owns); if (owned.length < 2) return;
  let idx = owned.indexOf(me.weapon); if (idx < 0) idx = 0;
  setWeapon(owned[(idx + (e.deltaY > 0 ? 1 : -1) + owned.length) % owned.length]);
}, { passive: true });
let camYaw = 0, camPitch = 0.3, camPivot = null;
const SENS = 0.0024;
// ---------- settings (persisted to localStorage) ----------
const settings = { fov: 75, sens: 1.0, invertY: false, volume: 0.8 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('viceSettings') || '{}')); } catch {}
function saveSettings() { try { localStorage.setItem('viceSettings', JSON.stringify(settings)); } catch {} }
let scoped = false;
camera.fov = settings.fov; camera.updateProjectionMatrix();

function spawnMe(x, z) { me.pos.set(x, 0, z); me.alive = true; me.hp = 100; me.wanted = 0; me.heat = 0; me.lastCrime = 0; if (me.inCar) { me.inCar.occupant = null; me.inCar = null; } me.char.group.visible = true; camPivot = null; }

let fDown = false, vDown = false, mDown = false, mapOpen = false;
function toggleCar() {
  if (me.inCar) { const c = me.inCar; c.occupant = null; const ox = Math.cos(c.heading + Math.PI / 2) * 2.6, oz = Math.sin(c.heading + Math.PI / 2) * 2.6; me.pos.set(c.x + ox, c.type === 'heli' ? c.y : 0, c.z + oz); if (c.type === 'heli') { me.vy = 0; me.onGround = c.y < 0.5; } me.inCar = null; me.char.group.visible = !me.fp; resetPose(); engine(); return; }
  let best = null, bd = 6, bestT = null;
  for (const c of cars) { if (c.occupant) continue; const d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (d < bd) { bd = d; best = c; bestT = null; } }
  for (const t of traffic) { const d = Math.hypot(t.x - me.pos.x, t.z - me.pos.z); if (d < bd) { bd = d; bestT = t; best = null; } } // jack any moving car too
  if (bestT) best = jackTraffic(bestT);
  if (best) { best.occupant = 'me'; me.inCar = best; me.char.group.visible = false; }
}
function jackTraffic(t) {
  const heading = t.axis === 'x' ? (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (t.dir > 0 ? 0 : Math.PI);
  const c = { group: t.car.group, wheels: t.car.wheels, x: t.x, z: t.z, heading, speed: 0, vx: 0, vz: 0, colHex: t.colHex || 0xcccccc, occupant: null, roll: 0, pitch: 0, type: 'car' };
  const i = traffic.indexOf(t); if (i >= 0) traffic.splice(i, 1);
  cars.push(c);
  return c;
}

function driveCar(c, dt) {
  const fwd = new THREE.Vector3(Math.sin(c.heading), 0, Math.cos(c.heading));
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  let vF = c.vx * fwd.x + c.vz * fwd.z, vL = c.vx * right.x + c.vz * right.z;
  const bike = c.type === 'bike';
  const thr = axisY(), steer = axisX(), hb = keys.has('Space');
  const accel = (me.turbo ? 72 : 34) * (bike ? 1.25 : 1), top = (me.turbo ? 92 : 46) * (bike ? 1.15 : 1), rev = 18;
  if (thr > 0) vF += accel * dt; else if (thr < 0) vF -= accel * 0.7 * dt;
  if (hb) vF -= vF * 0.8 * dt;                        // SPACE = handbrake drift: keep speed, break grip
  vF -= vF * (thr === 0 ? 0.7 : 0.12) * dt;
  vF = Math.max(-rev, Math.min(top, vF));
  const grip = hb ? 1.0 : (bike ? 8 : 7);
  vL -= vL * Math.min(1, grip * dt);
  c.vx = fwd.x * vF + right.x * vL; c.vz = fwd.z * vF + right.z * vL;
  const sf = Math.max(-1, Math.min(1, vF / 6));
  c.heading -= steer * (bike ? 2.8 : 2.4) * dt * sf;
  c.speed = vF; c.drift = Math.min(1, Math.abs(vL) / 6);
  let nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
  [nx, nz] = resolve(nx, nz, 1.6);
  if (!city.isLandCell(nx, nz)) { nx = c.x; nz = c.z; c.vx *= 0.35; c.vz *= 0.35; }   // cars/bikes can't drive on water
  if (Math.hypot(nx - c.x, nz - c.z) < Math.hypot(c.vx, c.vz) * dt * 0.5) { c.vx *= 0.3; c.vz *= 0.3; }
  c.x = Math.max(2, Math.min(WORLD.SIZE - 2, nx)); c.z = Math.max(2, Math.min(WORLD.SIZE - 2, nz));
  c.roll = THREE.MathUtils.lerp(c.roll, steer * sf * (bike ? 0.5 : 0.12), 0.2);
  c.pitch = THREE.MathUtils.lerp(c.pitch, -thr * 0.05, 0.15);
  c.group.position.set(c.x, 0, c.z);
  c.group.rotation.set(c.pitch, c.heading, c.roll);
  for (const w of c.wheels) w.rotation.x += vF * dt * 2;
}

// ---- helicopter ----
function driveHeli(c, dt) {
  c.rotorSpin = (c.rotorSpin || 0) + dt * 32;
  if (c.rotor) c.rotor.rotation.y = c.rotorSpin;
  if (c.trotor) c.trotor.rotation.x = c.rotorSpin;
  const up = (keys.has('Space') ? 1 : 0) - ((keys.has('ShiftLeft') || keys.has('ControlLeft')) ? 1 : 0);
  c.y = THREE.MathUtils.clamp((c.y || 0) + up * 15 * dt, 0, 90);
  const thr = axisY(), steer = axisX();
  c.heading -= steer * 1.5 * dt;
  const power = c.y > 1.2 ? 1 : 0.12;                 // can only really fly once off the ground
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  c.vx += (fx * thr * 30 * power - c.vx) * Math.min(1, dt * 1.6);
  c.vz += (fz * thr * 30 * power - c.vz) * Math.min(1, dt * 1.6);
  c.vx *= 1 - dt * 0.55; c.vz *= 1 - dt * 0.55;
  c.x = THREE.MathUtils.clamp(c.x + c.vx * dt, 4, WORLD.SIZE - 4);
  c.z = THREE.MathUtils.clamp(c.z + c.vz * dt, 4, WORLD.SIZE - 4);
  const before = c.x + c.z;
  [c.x, c.z, c.y] = resolveHeli(c.x, c.z, c.y, 2.2);                   // solid buildings up to the roof; land on roofs; fly over
  if (c.x + c.z !== before) { c.vx *= 0.4; c.vz *= 0.4; }
  c.pitch = THREE.MathUtils.lerp(c.pitch || 0, thr * 0.24, 0.1);       // nose dips forward when accelerating
  c.roll = THREE.MathUtils.lerp(c.roll || 0, steer * 0.36, 0.12);      // banks into the turn
  c.speed = Math.hypot(c.vx, c.vz);
  c.group.position.set(c.x, c.y, c.z);
  c.group.rotation.order = 'YXZ';                      // yaw→pitch→roll so banking looks right (no gimbal flip on turns)
  c.group.rotation.set(c.pitch, c.heading, c.roll);
}

// ---- tank: heavy pivot-steer, turret follows the camera, cannon on LMB ----
function driveTank(c, dt) {
  const thr = axisY(), steer = axisX();
  const accel = me.turbo ? 42 : 22, top = me.turbo ? 42 : 24;
  let vF = c.speed || 0;
  if (thr > 0) vF += accel * dt; else if (thr < 0) vF -= accel * 0.7 * dt;
  vF -= vF * (thr === 0 ? 1.2 : 0.25) * dt;
  vF = Math.max(-12, Math.min(top, vF));
  c.heading -= steer * 1.5 * dt;                       // pivots in place like a real tank
  c.speed = vF; c.drift = 0;
  c.vx = Math.sin(c.heading) * vF; c.vz = Math.cos(c.heading) * vF;
  let nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
  [nx, nz] = resolve(nx, nz, 1.9);
  if (!city.isLandCell(nx, nz)) { nx = c.x; nz = c.z; c.speed *= 0.3; }   // tank can't drive on water
  c.x = Math.max(2, Math.min(WORLD.SIZE - 2, nx)); c.z = Math.max(2, Math.min(WORLD.SIZE - 2, nz));
  c.pitch = THREE.MathUtils.lerp(c.pitch || 0, -thr * 0.03, 0.1);
  c.group.position.set(c.x, 0, c.z); c.group.rotation.set(c.pitch, c.heading, 0);
  for (const w of c.wheels) w.rotation.x += vF * dt * 2;
  c.turretYaw = camYaw;
  if (c.turret) c.turret.rotation.y = c.turretYaw - c.heading;
  c.tShootCd -= dt;
  if (mouse.down && c.tShootCd <= 0) { fireTankShell(c); c.tShootCd = 1.4; }
}
function fireTankShell(c) {
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const camDir = ray.ray.direction.clone();
  wray.set(camera.position, camDir); wray.far = 400;
  const cw = wray.intersectObject(city.group, true)[0];
  const aim = cw ? cw.point.clone() : camera.position.clone().addScaledVector(camDir, 300);
  const tip = new THREE.Vector3(c.x + Math.sin(c.turretYaw) * 3.8, 2.15, c.z + Math.cos(c.turretYaw) * 3.8);
  const dir = aim.clone().sub(tip).normalize();
  spawnRocket(tip, dir, { speed: 92, big: true, life: 3 });
  netRocket(tip, dir, { speed: 92, big: true });
  shake = Math.max(shake, 0.5); boom(); gun(0.6);
}

// ---- boat: only on water, gentle wake + bob ----
function driveBoat(c, dt) {
  const fwd = new THREE.Vector3(Math.sin(c.heading), 0, Math.cos(c.heading));
  const thr = axisY(), steer = axisX();
  let vF = c.speed || 0;
  const accel = me.turbo ? 60 : 30, top = me.turbo ? 72 : 42;
  if (thr > 0) vF += accel * dt; else if (thr < 0) vF -= accel * 0.6 * dt;
  vF -= vF * (thr === 0 ? 0.5 : 0.14) * dt;
  vF = Math.max(-12, Math.min(top, vF));
  const sf = Math.max(-1, Math.min(1, vF / 6));
  c.heading -= steer * 1.8 * dt * sf;
  c.speed = vF; c.vx = fwd.x * vF; c.vz = fwd.z * vF;
  let nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
  if (city.isLandCell(nx, nz)) { nx = c.x; nz = c.z; c.speed *= 0.5; c.vx = 0; c.vz = 0; }   // boats can't beach onto land
  c.x = Math.max(2, Math.min(WORLD.SIZE - 2, nx)); c.z = Math.max(2, Math.min(WORLD.SIZE - 2, nz));
  c.roll = THREE.MathUtils.lerp(c.roll || 0, steer * sf * 0.16, 0.1);
  const bob = Math.sin(performance.now() / 500 + c.x) * 0.05;
  c.group.position.set(c.x, -0.15 + bob, c.z);
  c.group.rotation.set(c.roll * 0.3, c.heading, c.roll);
  if (Math.abs(vF) > 3 && Math.random() < 0.35) addSpark(new THREE.Vector3(c.x - fwd.x * 2, -0.4, c.z - fwd.z * 2), 0xcfeeff, 1, 2);
}

// ---- vehicle impacts: run people over + crash into other cars ----
function vehicleHits(c, dt) {
  const sp = Math.hypot(c.vx, c.vz);
  if (sp > 4.5) for (const pd of peds) if (pd.alive && Math.hypot(pd.x - c.x, pd.z - c.z) < 2.2) { pd.die(); blood(new THREE.Vector3(pd.x, 1, pd.z)); crime(3); shake = Math.max(shake, 0.22); }
  if (sp > 5) for (const fc of footCops) if (fc.alive && Math.hypot(fc.x - c.x, fc.z - c.z) < 2.2) { killFootCop(fc); blood(new THREE.Vector3(fc.x, 1, fc.z)); crime(2); }
  if (sp > 4.5) for (const k of schoolKids) if (k.alive && Math.hypot(k.x - c.x, k.z - c.z) < 1.9) { k.die(); blood(new THREE.Vector3(k.x, 0.6, k.z)); crime(2); }
  if (sp > 5) for (const s of stationCops) if (s.alive && Math.hypot(s.x - c.x, s.z - c.z) < 2.2) { s.die(); blood(new THREE.Vector3(s.x, 1, s.z)); crime(2); }
  const rad = c.type === 'bike' ? 1.5 : 2.4;
  for (const o of cars) {
    if (o === c || o.type === 'heli') continue;
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz) || 1, minD = rad + (o.type === 'bike' ? 1.5 : 2.4);
    if (d < minD) { const nx = dx / d, nz = dz / d, push = minD - d; o.x += nx * push; o.z += nz * push; o.vx = (o.vx || 0) + nx * sp * 0.6; o.vz = (o.vz || 0) + nz * sp * 0.6; c.vx -= nx * sp * 0.3; c.vz -= nz * sp * 0.3; c.x -= nx * push * 0.4; c.z -= nz * push * 0.4; o.group.position.set(o.x, 0, o.z); if (sp > 6) shake = Math.max(shake, 0.3); }
  }
  for (const t of traffic) {
    const dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz) || 1, minD = rad + 2.4;
    if (d < minD) { const nx = dx / d, nz = dz / d, push = minD - d; t.x += nx * push; t.z += nz * push; t.kx = nx * sp * 1.5; t.kz = nz * sp * 1.5; t.knockT = 0.7; c.vx -= nx * sp * 0.32; c.vz -= nz * sp * 0.32; if (sp > 6) shake = Math.max(shake, 0.3); }
  }
  for (const cp of cops) {
    const dx = cp.x - c.x, dz = cp.z - c.z, d = Math.hypot(dx, dz) || 1, minD = rad + 2.4;
    if (d < minD) { const nx = dx / d, nz = dz / d, push = minD - d; cp.x += nx * push; cp.z += nz * push; cp.vx = (cp.vx || 0) + nx * sp * 0.8; cp.vz = (cp.vz || 0) + nz * sp * 0.8; c.vx -= nx * sp * 0.3; c.vz -= nz * sp * 0.3; }
  }
  c.x = THREE.MathUtils.clamp(c.x, 2, WORLD.SIZE - 2); c.z = THREE.MathUtils.clamp(c.z, 2, WORLD.SIZE - 2);
  c.group.position.x = c.x; c.group.position.z = c.z;
}

// ---- show the player as a rider sitting on a bike ----
function showRider(c) {
  me.char.group.visible = !me.fp;
  me.char.group.position.set(c.x, 0.18, c.z);
  me.char.group.rotation.set(0, c.heading, c.roll * 0.6);
  const p = me.char.parts;
  p.armL.rotation.set(-1.1, 0, 0.2); p.armR.rotation.set(-1.1, 0, -0.2);
  p.legL.rotation.set(0.5, 0, 0.28); p.legR.rotation.set(0.5, 0, -0.28);
}
function resetPose() { const p = me.char.parts; p.armL.rotation.set(0, 0, 0); p.armR.rotation.set(0, 0, 0); p.legL.rotation.set(0, 0, 0); p.legR.rotation.set(0, 0, 0); }

function updatePlayer(dt) {
  // mouse look (sensitivity + invert-Y + scope zoom, all from settings)
  scoped = !me.inCar && me.alive && mouse.right && !!WEAPONS[me.weapon].scope;
  document.body.classList.toggle('scoped', scoped); $('scope').classList.toggle('show', scoped);
  const sens = SENS * settings.sens * (scoped ? 0.4 : 1);
  camYaw -= mouse.dx * sens; camPitch = THREE.MathUtils.clamp(camPitch - mouse.dy * sens * (settings.invertY ? -1 : 1), -0.5, 1.1);
  mouse.dx = 0; mouse.dy = 0;
  if (!me.alive) { updateCamera(dt); return; }

  me.aiming = false;
  if (me.inCar) {
    const v = me.inCar;
    if (v.type === 'heli') {
      driveHeli(v, dt);
      me.pos.set(v.x, v.y, v.z); me.heading = v.heading;
      me.char.group.visible = false;
    } else if (v.type === 'tank') {
      driveTank(v, dt);
      vehicleHits(v, dt);
      me.pos.set(v.x, 0, v.z); me.heading = v.heading;
      me.char.group.visible = false;
    } else if (v.type === 'boat') {
      driveBoat(v, dt);
      me.pos.set(v.x, 0, v.z); me.heading = v.heading;
      me.char.group.visible = false;
    } else {
      driveCar(v, dt);
      vehicleHits(v, dt);
      me.pos.set(v.x, 0, v.z); me.heading = v.heading;
      if (v.type === 'bike') showRider(v); else me.char.group.visible = false;
    }
  } else {
    const swimming = me.swimming = !onLandOrBeach(me.pos.x, me.pos.z);   // only deep water, not the beach
    const fwd = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw)); // screen-right
    const md = new THREE.Vector3().addScaledVector(fwd, axisY()).addScaledVector(right, axisX());
    const moving = md.lengthSq() > 0.01; if (moving) md.normalize();
    me.aiming = mouse.down && !swimming;               // no shooting while swimming
    const spd = swimming ? 4.2 : (keys.has('ShiftLeft') && !me.aiming ? 9 : 5) * (me.turbo ? 2.2 : 1);
    me.pos.addScaledVector(md, spd * dt);
    if (!swimming) {                                   // land/beach: jump + gravity, normal speed
      if (me.onGround && keys.has('Space')) { me.vy = 8; me.onGround = false; }
      me.vy -= 24 * dt; me.pos.y += me.vy * dt; if (me.pos.y <= 0) { me.pos.y = 0; me.vy = 0; me.onGround = true; }
    } else {                                            // deep water: swim (submerged, no jump), splash
      me.vy = 0; me.onGround = false;
      me.pos.y = THREE.MathUtils.lerp(me.pos.y, -0.95 + Math.sin(performance.now() / 320) * 0.07, Math.min(1, dt * 6));
      if (moving && Math.random() < 0.35) addSpark(new THREE.Vector3(me.pos.x, -0.5, me.pos.z), 0xcfeeff, 1, 2.5);
    }
    const [rx, rz] = resolve(me.pos.x, me.pos.z, 0.5); me.pos.x = rx; me.pos.z = rz;
    me.pos.x = THREE.MathUtils.clamp(me.pos.x, 2, WORLD.SIZE - 2); me.pos.z = THREE.MathUtils.clamp(me.pos.z, 2, WORLD.SIZE - 2);
    if (me.aiming) me.heading = camYaw; else if (moving) me.heading = Math.atan2(md.x, md.z);
    me.char.group.position.copy(me.pos); me.char.group.visible = me.alive && !me.fp;
    if (swimming) {                                    // prone swim stroke, low in the water
      me.char.group.rotation.set(0.7, me.heading, 0);
      me.walkT += dt * 5; const s = Math.sin(me.walkT), p = me.char.parts;
      p.armL.rotation.set(-1.7 + s * 0.9, 0, 0.25); p.armR.rotation.set(-1.7 - s * 0.9, 0, -0.25);
      p.legL.rotation.set(0.2 + s * 0.4, 0, 0); p.legR.rotation.set(0.2 - s * 0.4, 0, 0);
    } else {
      me.char.group.rotation.set(0, me.heading, 0);
      me.walkT += dt * (moving ? (keys.has('ShiftLeft') ? 1.5 : 1) : 0);
      me.char.setPose(me.walkT, moving, me.aiming);
      if (me.punchT > 0) { me.punchT -= dt; me.char.parts.armR.rotation.set(-1.5, 0, 0); }
    }
    engine(0);
    // weapon switch (number keys, only owned)
    for (let i = 0; i < WORDER.length; i++) if (keys.has('Digit' + (i + 1)) && owns(WORDER[i]) && me.weapon !== WORDER[i]) setWeapon(WORDER[i]);
    // shoot (rising-edge for semi-auto, held for auto)
    me.shootCd -= dt;
    const w = WEAPONS[me.weapon];
    const wantFire = w.auto ? mouse.down : (mouse.down && !mouseHeld);
    if (me.aiming && locked && wantFire && me.shootCd <= 0) fire();
  }
  mouseHeld = mouse.down;
  if (keys.has('KeyF') && !fDown) { fDown = true; toggleCar(); } if (!keys.has('KeyF')) fDown = false;
  if (keys.has('KeyV') && !vDown) { vDown = true; me.fp = !me.fp; } if (!keys.has('KeyV')) vDown = false;
  if (keys.has('KeyM') && !mDown) { mDown = true; toggleMap(); } if (!keys.has('KeyM')) mDown = false;
  updateCamera(dt);
  updateLockOn(dt);
}

function updateCamera(dt) {
  const targetFov = scoped ? 24 : settings.fov;   // smooth zoom for the sniper scope
  if (Math.abs(camera.fov - targetFov) > 0.03) { camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }
  // ---- first person (on foot): rigid eye camera ----
  if (me.fp && !me.inCar) {
    const cp0 = Math.cos(camPitch), sp0 = Math.sin(camPitch);
    const look0 = new THREE.Vector3(Math.sin(camYaw) * cp0, sp0, Math.cos(camYaw) * cp0);
    const eye = new THREE.Vector3(me.pos.x, me.pos.y + 1.62, me.pos.z).addScaledVector(look0, 0.12);
    camera.position.copy(eye);
    camera.lookAt(eye.x + look0.x, eye.y + look0.y, eye.z + look0.z);
    sun.position.set(me.pos.x + 80, 130, me.pos.z + 40); sun.target.position.set(me.pos.x, 0, me.pos.z);
    return;
  }
  const heli = me.inCar && me.inCar.type === 'heli', tank = me.inCar && me.inCar.type === 'tank';
  const dist = me.inCar ? (heli ? 17 : tank ? 13 : 11) : (me.aiming ? 5.5 : 7);
  const baseH = me.inCar ? (heli ? 7 : tank ? 5.5 : 4.5) : 3.2;          // camera height ABOVE the player
  const headY = me.inCar ? 1.2 : 1.4;
  const right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
  const truePivot = new THREE.Vector3(me.pos.x, me.pos.y + headY, me.pos.z).addScaledVector(right, me.inCar ? 0 : 0.55);
  if (!camPivot || camPivot.distanceToSquared(truePivot) > 400) camPivot = truePivot.clone();
  camPivot.x = THREE.MathUtils.lerp(camPivot.x, truePivot.x, 0.5);
  camPivot.z = THREE.MathUtils.lerp(camPivot.z, truePivot.z, 0.5);
  camPivot.y = THREE.MathUtils.lerp(camPivot.y, truePivot.y, 0.2);
  // ease the camera behind the car automatically
  if (me.inCar && !tank) { let d = me.inCar.heading - camYaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; camYaw += d * Math.min(1, dt * 2); }
  // position: behind (horizontal) and above; keep out of buildings
  const back = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  const desired = camPivot.clone().addScaledVector(back, -dist); desired.y = camPivot.y + baseH;
  if (desired.y < buildingTopAt(desired.x, desired.z) + 2) { const [rx, rz] = resolve(desired.x, desired.z, 1.0); desired.x = rx; desired.z = rz; }
  camera.position.lerp(desired, me.inCar ? 0.18 : 0.4);
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 2); }
  // look: aim direction (mouse pitch) with a slight downward bias so the player stays in frame
  const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
  const look = new THREE.Vector3(Math.sin(camYaw) * cp, sp - 0.1, Math.cos(camYaw) * cp).normalize();
  camera.lookAt(camera.position.x + look.x * 6, camera.position.y + look.y * 6, camera.position.z + look.z * 6);
  sun.position.set(me.pos.x + 80, 130, me.pos.z + 40); sun.target.position.set(me.pos.x, 0, me.pos.z);
}
let shake = 0;

// ---------- shooting ----------
const ray = new THREE.Raycaster(); ray.far = 300;
const tracers = []; // {line, life}
const wray = new THREE.Raycaster();
function castHit(origin, dir, range) {
  let bestT = range, best = null;
  const test = (c, rad, type, ref) => { const t = c.clone().sub(origin).dot(dir); if (t < 0 || t > bestT) return; const cl = origin.clone().addScaledVector(dir, t); if (cl.distanceTo(c) < rad) { bestT = t; best = { type, ref, point: cl }; } };
  for (const rp of remotes.values()) if (rp.alive) { const vt = rp.vt | 0, oy = vt === 3 ? (rp.dvy || 0) + 1.4 : (vt ? 1.1 : 1.2); test(new THREE.Vector3(rp.dx, oy, rp.dz), 1.0, 'player', rp); } // person-sized hitbox at the seat, not the whole vehicle
  for (const pd of peds) if (pd.alive) test(new THREE.Vector3(pd.x, 1.0, pd.z), 0.95, 'ped', pd);
  for (const fc of footCops) if (fc.alive) test(new THREE.Vector3(fc.x, 1.1, fc.z), 0.95, 'footcop', fc);
  for (const cp of cops) test(new THREE.Vector3(cp.x, 1.2, cp.z), 2.4, 'cop', cp);
  for (const k of schoolKids) if (k.alive) test(new THREE.Vector3(k.x, 0.7, k.z), 0.72, 'kid', k);
  for (const s of stationCops) if (s.alive) test(new THREE.Vector3(s.x, 1.1, s.z), 0.95, 'scop', s);
  for (const b of barrels) if (b.alive) test(new THREE.Vector3(b.x, 0.6, b.z), 0.75, 'barrel', b);
  wray.set(origin, dir); wray.far = bestT;
  const wh = wray.intersectObject(city.group, true)[0];
  if (wh && wh.distance < bestT) best = { type: 'wall', point: wh.point };
  return best;
}
function meleeAttack(w) {
  me.shootCd = w.rof; me.punchT = 0.18; swish();
  const origin = new THREE.Vector3(me.pos.x, me.pos.y + 1.2, me.pos.z), dir = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  const hit = castHit(origin, dir, w.range);
  if (!hit) return;
  if (hit.type === 'player') { net.send({ t: 'hit', id: hit.ref.id, dmg: w.dmg }); blood(hit.point); hitMark(); }
  else if (hit.type === 'ped') { hit.ref.die(); blood(hit.point); crime(1); hitMark(); }
  else if (hit.type === 'footcop') { hit.ref.hp -= w.dmg; crime(1); if (hit.ref.hp <= 0) killFootCop(hit.ref); hitMark(); }
  else if (hit.type === 'cop') { hit.ref.hp -= w.dmg; crime(1); if (hit.ref.hp <= 0) { killCop(hit.ref); crime(2); } hitMark(); }
  else if (hit.type === 'kid') { hit.ref.die(); blood(hit.point); crime(1); hitMark(); }
  else if (hit.type === 'scop') { hit.ref.hp -= w.dmg; crime(1); if (hit.ref.hp <= 0) hit.ref.die(); hitMark(); }
  else if (hit.type === 'barrel') { explodeBarrel(hit.ref); hitMark(); }
  else { addSpark(hit.point, 0xcccccc, 4, 4); }   // wall/other: little impact puff
}
function fire() {
  const w = WEAPONS[me.weapon];
  if (w.melee) { meleeAttack(w); return; }
  if (me.ammo[me.weapon] <= 0) { me.shootCd = 0.25; gun(0.3); return; }
  if (me.ammo[me.weapon] !== Infinity) me.ammo[me.weapon]--;
  // crosshair target = where the camera centre-ray hits the world
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const camDir = ray.ray.direction.clone();
  wray.set(camera.position, camDir); wray.far = 300;
  const cw = wray.intersectObject(city.group, true)[0];
  const aim = cw ? cw.point.clone() : camera.position.clone().addScaledVector(camDir, 250);
  const origin = new THREE.Vector3(me.pos.x, me.pos.y + (me.fp ? 1.6 : 1.45), me.pos.z);
  if (w.rocket) { fireRocket(origin, aim); me.shootCd = w.rof; shake = Math.max(shake, 0.3); gun(); return; }
  if (w.homing) { if (me.locked && me.lockTarget && targetPos(me.lockTarget)) fireHoming(origin, aim, me.lockTarget); else fireRocket(origin, aim); clearLock(); me.shootCd = w.rof; shake = Math.max(shake, 0.3); gun(); return; }
  let any = false;
  for (let p = 0; p < w.pellets; p++) {
    const dir = aim.clone().sub(origin).normalize();
    if (w.spread) { dir.x += (Math.random() - 0.5) * w.spread; dir.y += (Math.random() - 0.5) * w.spread; dir.z += (Math.random() - 0.5) * w.spread; dir.normalize(); }
    const hit = castHit(origin, dir, 250);
    const end = hit ? hit.point : origin.clone().addScaledVector(dir, 200);
    addTracer(origin.clone().addScaledVector(dir, 1.0), end);
    if (hit) {
      if (hit.type === 'player') { net.send({ t: 'hit', id: hit.ref.id, dmg: w.dmg }); blood(end); any = true; }
      else if (hit.type === 'ped') { blood(end); hit.ref.die(); crime(2); any = true; }
      else if (hit.type === 'footcop') { blood(end); hit.ref.hp -= w.dmg; crime(1); if (hit.ref.hp <= 0) { killFootCop(hit.ref); crime(2); } any = true; }
      else if (hit.type === 'cop') { blood(end); hit.ref.hp -= w.dmg; crime(1); if (hit.ref.hp <= 0) { killCop(hit.ref); crime(3); } any = true; }
      else if (hit.type === 'kid') { blood(end); hit.ref.die(); crime(2); any = true; }
      else if (hit.type === 'scop') { blood(end); hit.ref.hp -= w.dmg; crime(1); if (hit.ref.hp <= 0) { hit.ref.die(); crime(2); } any = true; }
      else if (hit.type === 'barrel') { explodeBarrel(hit.ref); any = true; }
      else muzzle(end);
    }
  }
  if (any) hitMark();
  muzzle(origin.clone().addScaledVector(aim.clone().sub(origin).normalize(), 1.0));
  net.send({ t: 'shot', x: origin.x, y: origin.z, a: camYaw });
  shake = Math.max(shake, w.pellets > 1 ? 0.22 : 0.12); gun(); me.shootCd = w.rof;
  for (const pd of peds) if (pd.alive && Math.hypot(pd.x - me.pos.x, pd.z - me.pos.z) < 26) pd.flee();
}
function addTracer(a, b) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfff2a0 }));
  scene.add(line); tracers.push({ line, life: 0.06 });
}
const sparks = [];
function muzzle(p) { addSpark(p, 0xfff0a0, 6, 8); }
function blood(p) { addSpark(p, 0xc0392b, 10, 6); }
function addSpark(p, color, n, sp) { for (let i = 0; i < n; i++) { const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color })); m.position.copy(p); const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI; m.userData.v = new THREE.Vector3(Math.sin(e) * Math.cos(a), Math.cos(e), Math.sin(e) * Math.sin(a)).multiplyScalar(sp); m.userData.life = 0.4; scene.add(m); sparks.push(m); } }
const sparkGeo = new THREE.SphereGeometry(0.08, 5, 4);
function updateFx(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].life -= dt; if (tracers[i].life <= 0) { scene.remove(tracers[i].line); tracers[i].line.geometry.dispose(); tracers.splice(i, 1); } }
  for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.userData.life -= dt; if (s.userData.life <= 0) { scene.remove(s); sparks.splice(i, 1); continue; } s.userData.v.y -= 14 * dt; s.position.addScaledVector(s.userData.v, dt); }
}

// ---------- rockets (RPG / tank / homing) — networked so everyone sees them ----------
const rockets = [];
function spawnRocket(origin, dir, opts = {}) {
  const mesh = makeRocket(); if (opts.big) mesh.scale.set(1.8, 1.8, 1.8);
  mesh.position.copy(origin).addScaledVector(dir, 1.4); scene.add(mesh);
  const rk = { mesh, pos: mesh.position.clone(), dir: dir.clone().normalize(), speed: opts.speed || 58, life: opts.life || 4, big: !!opts.big, ghost: !!opts.ghost, homing: !!opts.homing, target: opts.target || null };
  rockets.push(rk); return rk;
}
function netRocket(origin, dir, opts = {}) { net.send({ t: 'rocket', x: origin.x, y: origin.y, z: origin.z, dx: dir.x, dy: dir.y, dz: dir.z, speed: opts.speed || 58, big: opts.big ? 1 : 0 }); }
function fireRocket(origin, aim) { const dir = aim.clone().sub(origin).normalize(); spawnRocket(origin, dir, { speed: 58 }); netRocket(origin, dir, { speed: 58 }); }
function fireHoming(origin, aim, target) { const dir = aim.clone().sub(origin).normalize(); spawnRocket(origin, dir, { speed: 40, life: 6, homing: true, target }); netRocket(origin, dir, { speed: 40 }); }
function targetAlive(t) {                                // a lock target is valid only while it's still in its live array
  if (!t || t.alive === false) return false;
  if (t.id !== undefined) return remotes.has(t.id);      // remote player
  return traffic.includes(t) || cars.includes(t) || cops.includes(t);
}
function targetPos(t) {
  if (!targetAlive(t)) return null;
  const x = t.dx !== undefined ? t.dx : t.x, z = t.dz !== undefined ? t.dz : t.z;
  if (x === undefined || z === undefined) return null;
  const y = t.type === 'heli' ? (t.y || 0) + 1 : ((t.vt | 0) === 3 ? (t.dvy || 0) + 1 : 1.2);
  return new THREE.Vector3(x, y, z);
}
function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const rk = rockets[i]; rk.life -= dt;
    if (rk.homing && rk.target) { const tp = targetPos(rk.target); if (tp) rk.dir.lerp(tp.clone().sub(rk.pos).normalize(), Math.min(1, dt * 9)).normalize(); }
    rk.pos.addScaledVector(rk.dir, rk.speed * dt);
    rk.mesh.position.copy(rk.pos); rk.mesh.lookAt(rk.pos.clone().add(rk.dir));
    if (Math.random() < 0.85) addSpark(rk.pos.clone(), rk.homing ? 0xffcc55 : 0x9a9a9a, 1, 1.2);
    let hit = rk.life <= 0 || rk.pos.y <= 0.25 || rk.pos.y < buildingTopAt(rk.pos.x, rk.pos.z);
    if (!hit && !rk.ghost) {            // only the shooter's rocket resolves damage (authoritative)
      const at = (x, y, z, r) => rk.pos.distanceToSquared(new THREE.Vector3(x, y, z)) < r * r;
      for (const pd of peds) if (pd.alive && at(pd.x, 1, pd.z, 2)) { hit = true; break; }
      if (!hit) for (const cp of cops) if (at(cp.x, 1.2, cp.z, 2.5)) { hit = true; break; }
      if (!hit) for (const o of cars) if (o.occupant !== 'me' && o.type !== 'heli' && at(o.x, 1, o.z, 2.6)) { hit = true; break; }
      if (!hit) for (const t of traffic) if (at(t.x, 1, t.z, 2.6)) { hit = true; break; }
      if (!hit) for (const rp of remotes.values()) if (rp.alive && at(rp.dx, (rp.vt | 0) === 3 ? (rp.dvy || 0) + 1 : 1.2, rp.dz, 2.2)) { hit = true; break; }
    }
    if (hit) { explode(rk.pos.clone(), rk.big ? 13 : 9, rk.ghost); scene.remove(rk.mesh); rockets.splice(i, 1); }
  }
}
function explode(p, R = 9, visual = false) {
  addSpark(p, 0xffaa33, 28, 17); addSpark(p, 0x552200, 16, 8); addSpark(p, 0xffe066, 14, 11);
  const fl = new THREE.PointLight(0xffaa44, 9, 34); fl.position.copy(p); scene.add(fl); setTimeout(() => scene.remove(fl), 130);
  shake = Math.max(shake, 0.6); boom(p);
  if (visual) return;                  // network-spawned rocket: FX only, damage is authoritative on the shooter
  for (const pd of peds) if (pd.alive && Math.hypot(pd.x - p.x, pd.z - p.z) < R) { pd.die(); crime(2); }
  for (const fc of [...footCops]) if (fc.alive && Math.hypot(fc.x - p.x, fc.z - p.z) < R) { killFootCop(fc); crime(1); }
  for (const k of schoolKids) if (k.alive && Math.hypot(k.x - p.x, k.z - p.z) < R) { k.die(); crime(1); }
  for (const s of stationCops) if (s.alive && Math.hypot(s.x - p.x, s.z - p.z) < R) { s.die(); crime(1); }
  for (const cp of [...cops]) if (Math.hypot(cp.x - p.x, cp.z - p.z) < R) { cp.hp -= 120; crime(1); if (cp.hp <= 0) killCop(cp); }
  for (const t of [...traffic]) if (Math.hypot(t.x - p.x, t.z - p.z) < R) { scene.remove(t.car.group); traffic.splice(traffic.indexOf(t), 1); }
  for (const o of [...cars]) { if (o.occupant === 'me' || o.type === 'heli') continue; if (Math.hypot(o.x - p.x, o.z - p.z) < R) { scene.remove(o.group); cars.splice(cars.indexOf(o), 1); } }
  for (const rp of remotes.values()) if (rp.alive && Math.hypot(rp.dx - p.x, rp.dz - p.z) < R) net.send({ t: 'hit', id: rp.id, dmg: 45 });
  if (!me.god && me.pos.distanceTo(p) < R * 0.6) net.send({ t: 'selfhit', dmg: 20 });
  for (const b of barrels) if (b.alive && Math.hypot(b.x - p.x, b.z - p.z) < R) setTimeout(() => explodeBarrel(b), 100);   // explosions set off barrels
}

// ---------- lock-on for the homing launcher ----------
const LOCK_TIME = 2.2;
function homingTargets() {
  const list = [];
  for (const t of traffic) list.push(t);
  for (const c of cars) if (c.occupant !== 'me') list.push(c);
  for (const cp of cops) list.push(cp);
  for (const rp of remotes.values()) if (rp.alive && (rp.vt | 0) > 0) list.push(rp);   // players in a vehicle
  return list;
}
function bestHomingTarget() {
  const eye = camera.position, camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
  let best = null, bestDot = 0.986;                    // ~9.5° cone around the crosshair
  for (const t of homingTargets()) {
    const tp = targetPos(t); if (!tp) continue;
    const to = tp.clone().sub(eye), dist = to.length(); if (dist > 170 || dist < 4) continue;
    const dot = to.normalize().dot(camDir);
    if (dot > bestDot) { bestDot = dot; best = t; }
  }
  return best;
}
function clearLock() { me.lockTarget = null; me.lockT = 0; me.locked = false; }
function updateLockOn(dt) {
  if (me.weapon !== 'homing' || me.inCar || !me.alive) { clearLock(); hideLockHud(); return; }
  if (me.lockTarget && !targetPos(me.lockTarget)) clearLock();       // target disappeared
  if (!me.locked) {
    const best = bestHomingTarget();
    if (mouse.right && best) {                                       // hold RMB on a vehicle to acquire
      if (me.lockTarget !== best) { me.lockTarget = best; me.lockT = 0; }
      me.lockT += dt;
      if (me.lockT >= LOCK_TIME) { me.locked = true; gun(0.25); }
    } else clearLock();                                              // released RMB / lost target before lock
  }
  updateLockHud();
}
function updateLockHud() {
  const el = $('lockon'); if (!el) return;
  const tp = me.lockTarget && targetPos(me.lockTarget);
  if (!tp) { el.classList.remove('show'); return; }
  const v = tp.clone().project(camera);
  if (v.z > 1) { el.classList.remove('show'); return; }
  el.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
  el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
  el.classList.add('show'); el.classList.toggle('locked', me.locked);
  el.textContent = me.locked ? '🔒 LOCKED' : 'LOCKING ' + Math.min(99, Math.round(me.lockT / LOCK_TIME * 100)) + '%';
}
function hideLockHud() { const el = $('lockon'); if (el) el.classList.remove('show'); }

function insideBuilding(x, z) { for (const b of buildings) if (Math.abs(x - b.x) < b.w / 2 + 0.4 && Math.abs(z - b.z) < b.d / 2 + 0.4) return true; return false; }
// tallest building roof at (x,z), or 0 — lets aircraft fly OVER roofs instead of hitting an infinite hitbox
function buildingTopAt(x, z) { let top = 0; for (const b of buildings) if (Math.abs(x - b.x) < b.w / 2 + 0.4 && Math.abs(z - b.z) < b.d / 2 + 0.4) top = Math.max(top, b.h || 60); return top; }

// ---------- explosive barrels (deterministic positions = same for all players) ----------
const barrels = [];
(function spawnBarrels() {
  const geo = new THREE.CylinderGeometry(0.4, 0.4, 1.0, 10), mat = new THREE.MeshStandardMaterial({ color: 0xcc3322, roughness: 0.6, flatShading: true }), ring = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.6, flatShading: true });
  for (let i = 0; i < 32; i++) {
    const sp = city.spawns[(i * 5) % city.spawns.length] || { x: 100, z: 100 };
    const x = sp.x + ((i * 37) % 26 - 13), z = sp.z + ((i * 53) % 26 - 13);
    if (!city.isLandCell(x, z) || insideBuilding(x, z)) continue;
    const m = new THREE.Mesh(geo, mat); m.position.set(x, 0.5, z); m.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 10), ring); band.position.y = 0.1; m.add(band);
    scene.add(m); barrels.push({ x, z, mesh: m, alive: true, respawnAt: 0 });
  }
})();
function explodeBarrel(b) {
  if (!b.alive) return;
  b.alive = false; b.mesh.visible = false; b.respawnAt = performance.now() + 22000;
  explode(new THREE.Vector3(b.x, 0.6, b.z), 8);
  for (const o of barrels) if (o.alive && o !== b && Math.hypot(o.x - b.x, o.z - b.z) < 8.5) setTimeout(() => explodeBarrel(o), 110);   // chain reaction
}
function updateBarrels() { const now = performance.now(); for (const b of barrels) if (!b.alive && now > b.respawnAt) { b.alive = true; b.mesh.visible = true; } }

// ---------- crime / wanted ----------
function crime(amount) {
  me.heat += amount; me.lastCrime = performance.now();
  const w = Math.min(5, Math.floor(me.heat / 6));
  if (w !== me.wanted) { me.wanted = w; if (w > me.wanted - 1 && w > 0) notice('★'.repeat(w) + ' WANTED'); }
}
function updateWanted(dt) {
  if (me.heat > 0 && performance.now() - me.lastCrime > 8000) { me.heat = Math.max(0, me.heat - dt * 3); me.wanted = Math.min(5, Math.floor(me.heat / 6)); }
}

// ---------- pedestrians ----------
const peds = [];
const PED_COLORS = [0x9b6b4a, 0x3a5a8c, 0x6a8c3a, 0x8c3a3a, 0x555555, 0xb0a18a, 0x5a3a6a, 0xccaa99, 0x3aa0ff, 0xe0b07e];
function spawnPed() {
  const ang = Math.random() * Math.PI * 2, d = 22 + Math.random() * 55;
  const x = me.pos.x + Math.cos(ang) * d, z = me.pos.z + Math.sin(ang) * d;
  if (x < 4 || z < 4 || x > WORLD.SIZE - 4 || z > WORLD.SIZE - 4 || !city.isLandCell(x, z) || insideBuilding(x, z)) return false;
  const ch = makeChar(PED_COLORS[(Math.random() * PED_COLORS.length) | 0]); ch.group.position.set(x, 0, z); scene.add(ch.group);
  peds.push({
    char: ch, x, z, heading: Math.random() * Math.PI * 2, speed: 1.4 + Math.random(), state: 'wander', fleeT: 0, retarget: 0, walkT: 0, alive: true, removeAt: 0,
    flee() { this.state = 'flee'; this.fleeT = 4; this.speed = 5; },
    die() { this.alive = false; this.char.group.rotation.z = Math.PI / 2; this.char.group.position.y = 0.3; this.removeAt = performance.now() + 9000; },
  });
  return true;
}
function updatePeds(dt) {
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i];
    if (!p.alive) { if (performance.now() > p.removeAt) { scene.remove(p.char.group); peds.splice(i, 1); } continue; }
    if (Math.hypot(p.x - me.pos.x, p.z - me.pos.z) > 115) { scene.remove(p.char.group); peds.splice(i, 1); continue; }
    p.retarget -= dt; p.walkT += dt * 6;
    if (p.state === 'flee') { p.fleeT -= dt; p.heading = Math.atan2(p.x - me.pos.x, p.z - me.pos.z); if (p.fleeT <= 0) { p.state = 'wander'; p.speed = 1.4 + Math.random(); } }
    else if (p.retarget <= 0) { p.retarget = 2 + Math.random() * 4; p.heading += (Math.random() - 0.5) * 2; }
    const nx = p.x + Math.sin(p.heading) * p.speed * dt, nz = p.z + Math.cos(p.heading) * p.speed * dt;
    if (!insideBuilding(nx, p.z) && city.isLandCell(nx, p.z)) p.x = nx; else p.heading += 2.3;   // stay on land
    if (!insideBuilding(p.x, nz) && city.isLandCell(p.x, nz)) p.z = nz; else p.heading += 2.3;
    if (p.x < 3 || p.x > WORLD.SIZE - 3 || p.z < 3 || p.z > WORLD.SIZE - 3) p.heading += Math.PI;
    p.x = THREE.MathUtils.clamp(p.x, 3, WORLD.SIZE - 3); p.z = THREE.MathUtils.clamp(p.z, 3, WORLD.SIZE - 3);
    p.char.group.position.set(p.x, 0, p.z); p.char.group.rotation.y = p.heading; p.char.setPose(p.walkT, true, false);
  }
  let guard = 0; while (peds.filter(p => p.alive).length < 22 && guard++ < 6) if (!spawnPed()) break;
}

// ---------- traffic ----------
const traffic = [];
const TCOL = [0xe74c3c, 0x2980b9, 0x27ae60, 0xf1c40f, 0xecf0f1, 0x34495e, 0xe67e22, 0x8e44ad];
let tcolI = 0;
function spawnOneTraffic(nearPlayer) {
  let onX, lane, o, x, z, tries = 0;
  do {
    onX = Math.random() < 0.5; lane = Math.max(1, (Math.random() * (WORLD.GRID - 1) | 0)) * WORLD.BLOCK;
    o = nearPlayer ? (me.pos.x + me.pos.z) / 2 + (Math.random() - 0.5) * 180 : Math.random() * WORLD.SIZE;
    o = THREE.MathUtils.clamp(o, 4, WORLD.SIZE - 4); x = onX ? o : lane; z = onX ? lane : o;
  } while (!city.isLandCell(x, z) && tries++ < 12);
  if (!city.isLandCell(x, z)) return false;
  const colHex = TCOL[tcolI++ % TCOL.length], car = makeCar(colHex);
  car.group.position.set(x, 0, z); scene.add(car.group);
  traffic.push({ car, colHex, x, z, axis: onX ? 'x' : 'z', dir: Math.random() < 0.5 ? 1 : -1, lane, speed: 8 + Math.random() * 8, turnT: 2 + Math.random() * 4 });
  return true;
}
(function spawnTraffic() { for (let i = 0; i < 12; i++) spawnOneTraffic(false); })();
function updateTraffic(dt) {
  for (const t of traffic) {
    if (t.knockT > 0) {                                // got hit — tumble out before resuming the lane
      t.knockT -= dt; t.x = THREE.MathUtils.clamp(t.x + t.kx * dt, 4, WORLD.SIZE - 4); t.z = THREE.MathUtils.clamp(t.z + t.kz * dt, 4, WORLD.SIZE - 4);
      t.kx *= 0.9; t.kz *= 0.9; t.car.group.position.set(t.x, 0, t.z); t.car.group.rotation.y += dt * 4;
      if (t.knockT <= 0) t.lane = Math.round((t.axis === 'x' ? t.z : t.x) / WORLD.BLOCK) * WORLD.BLOCK;
      continue;
    }
    t.turnT -= dt;
    if (Math.hypot(t.x - me.pos.x, t.z - me.pos.z) > 150) { const a = Math.random() * Math.PI * 2, nx = me.pos.x + Math.cos(a) * 95, nz = me.pos.z + Math.sin(a) * 95, onX = Math.random() < 0.5; if (city.isLandCell(nx, nz)) { t.axis = onX ? 'x' : 'z'; t.lane = Math.round((onX ? nz : nx) / WORLD.BLOCK) * WORLD.BLOCK; t.x = onX ? nx : t.lane; t.z = onX ? t.lane : nz; t.dir = Math.random() < 0.5 ? 1 : -1; } }
    if (t.turnT <= 0) { t.turnT = 3 + Math.random() * 4; if (Math.random() < 0.5) { t.axis = t.axis === 'x' ? 'z' : 'x'; t.lane = Math.round((t.axis === 'x' ? t.z : t.x) / WORLD.BLOCK) * WORLD.BLOCK; t.dir = Math.random() < 0.5 ? 1 : -1; } }
    if (t.axis === 'x') { t.x += t.dir * t.speed * dt; t.z = t.lane; if (t.x < 4 || t.x > WORLD.SIZE - 4 || !city.isLandCell(t.x, t.z)) { t.dir *= -1; t.x = THREE.MathUtils.clamp(t.x - t.dir * 0.5, 4, WORLD.SIZE - 4); } t.car.group.rotation.y = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { t.z += t.dir * t.speed * dt; t.x = t.lane; if (t.z < 4 || t.z > WORLD.SIZE - 4 || !city.isLandCell(t.x, t.z)) { t.dir *= -1; t.z = THREE.MathUtils.clamp(t.z - t.dir * 0.5, 4, WORLD.SIZE - 4); } t.car.group.rotation.y = t.dir > 0 ? 0 : Math.PI; }
    t.lane = THREE.MathUtils.clamp(t.lane, WORLD.BLOCK, WORLD.SIZE - WORLD.BLOCK);
    t.car.group.position.set(t.x, 0, t.z);
    for (const w of t.car.wheels) w.rotation.x += t.speed * dt * 2;
  }
  let g = 0; while (traffic.length < 12 && g++ < 3) if (!spawnOneTraffic(true)) break;   // refill destroyed/jacked traffic
}

// ---------- cops + wanted ----------
// clear line of sight? sample the segment; blocked if it crosses any building
function losClear(ax, az, bx, bz) {
  const dist = Math.hypot(bx - ax, bz - az), steps = Math.max(2, Math.ceil(dist / 1.5));
  for (let i = 0; i <= steps; i++) { const t = i / steps; if (insideBuilding(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
  return true;
}
const cops = []; let copShoot = 0;
function spawnCop() { const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 30, x = me.pos.x + Math.cos(a) * d, z = me.pos.z + Math.sin(a) * d; if (!city.isLandCell(x, z) || insideBuilding(x, z)) return; const car = makeCar(0x1a2740, true); car.group.position.set(x, 0, z); scene.add(car.group); cops.push({ car, x, z, heading: 0, vx: 0, vz: 0, hp: 60 }); }
function killCop(cp) { scene.remove(cp.car.group); const i = cops.indexOf(cp); if (i >= 0) cops.splice(i, 1); }
function updateCops(dt) {
  const want = Math.min(5, me.wanted);
  if (cops.length < want) spawnCop(); else if (cops.length > want) { const c = cops.pop(); if (c) scene.remove(c.car.group); }
  copShoot += dt; const canShoot = copShoot > 1.2; if (canShoot) copShoot = 0;
  for (const cp of cops) {
    const dx = me.pos.x - cp.x, dz = me.pos.z - cp.z, d = Math.hypot(dx, dz) || 1;
    const speed = d > 12 ? 18 : 0;
    cp.vx += ((dx / d) * speed - cp.vx) * Math.min(1, dt * 3); cp.vz += ((dz / d) * speed - cp.vz) * Math.min(1, dt * 3);
    let nx = cp.x + cp.vx * dt, nz = cp.z + cp.vz * dt;
    if (insideBuilding(nx, cp.z) || !city.isLandCell(nx, cp.z)) { cp.vx *= -0.3; nx = cp.x; } if (insideBuilding(cp.x, nz) || !city.isLandCell(cp.x, nz)) { cp.vz *= -0.3; nz = cp.z; }
    cp.x = THREE.MathUtils.clamp(nx, 3, WORLD.SIZE - 3); cp.z = THREE.MathUtils.clamp(nz, 3, WORLD.SIZE - 3); cp.heading = Math.atan2(dx, dz);
    cp.car.group.position.set(cp.x, 0, cp.z); cp.car.group.rotation.y = cp.heading;
    for (const w of cp.car.wheels) w.rotation.x += d * dt * 0.1;
    if (cp.car.lightbar) { const f = Math.sin(performance.now() / 120) > 0; cp.car.lightbar.userData.red.material.emissiveIntensity = f ? 2 : 0.2; cp.car.lightbar.userData.blue.material.emissiveIntensity = f ? 0.2 : 2; }
    if (canShoot && d < 42 && me.alive && losClear(cp.x, cp.z, me.pos.x, me.pos.z)) { addTracer(new THREE.Vector3(cp.x, 1.4, cp.z), new THREE.Vector3(me.pos.x, 1.2, me.pos.z)); gun(0.3); if (Math.random() < 0.4 && !me.god) net.send({ t: 'selfhit', dmg: 4 + me.wanted * 2 }); }
  }
}

// ---------- foot police (officers on foot, appear from 2 stars) ----------
const footCops = [];
function spawnFootCop() {
  const a = Math.random() * Math.PI * 2, d = 26 + Math.random() * 22, x = me.pos.x + Math.cos(a) * d, z = me.pos.z + Math.sin(a) * d;
  if (x < 4 || z < 4 || x > WORLD.SIZE - 4 || z > WORLD.SIZE - 4 || insideBuilding(x, z) || !city.isLandCell(x, z)) return;
  const ch = makeChar(0x22336b, { skin: undefined, hair: 0x0d1526, pants: 0x10131c, hat: true }); // navy uniform + cap
  ch.group.position.set(x, 0, z); scene.add(ch.group);
  footCops.push({ char: ch, x, z, heading: 0, hp: 40, walkT: 0, shootCd: 0.6 + Math.random(), alive: true, removeAt: 0 });
}
function killFootCop(fc) { fc.alive = false; fc.char.group.rotation.z = Math.PI / 2; fc.char.group.position.y = 0.3; fc.removeAt = performance.now() + 9000; }
function updateFootCops(dt) {
  const want = me.wanted >= 2 ? Math.min(7, (me.wanted - 1) * 2) : 0;
  if (footCops.filter(f => f.alive).length < want) spawnFootCop();
  for (let i = footCops.length - 1; i >= 0; i--) {
    const fc = footCops[i];
    if (!fc.alive) { if (performance.now() > fc.removeAt) { scene.remove(fc.char.group); footCops.splice(i, 1); } continue; }
    if (me.wanted === 0 || Math.hypot(fc.x - me.pos.x, fc.z - me.pos.z) > 130) { scene.remove(fc.char.group); footCops.splice(i, 1); continue; }
    const dx = me.pos.x - fc.x, dz = me.pos.z - fc.z, d = Math.hypot(dx, dz) || 1; fc.heading = Math.atan2(dx, dz);
    const step = (d > 13 ? 6.5 : 0) * dt;                 // close in, then hold to shoot
    const nx = fc.x + (dx / d) * step, nz = fc.z + (dz / d) * step;
    if (!insideBuilding(nx, fc.z) && city.isLandCell(nx, fc.z)) fc.x = nx; if (!insideBuilding(fc.x, nz) && city.isLandCell(fc.x, nz)) fc.z = nz;
    fc.x = THREE.MathUtils.clamp(fc.x, 3, WORLD.SIZE - 3); fc.z = THREE.MathUtils.clamp(fc.z, 3, WORLD.SIZE - 3);
    fc.char.group.position.set(fc.x, 0, fc.z); fc.char.group.rotation.y = fc.heading;
    fc.walkT += dt * 7; fc.char.setPose(fc.walkT, d > 13, true);
    fc.shootCd -= dt;
    if (fc.shootCd <= 0 && d < 40 && me.alive && losClear(fc.x, fc.z, me.pos.x, me.pos.z)) {
      fc.shootCd = 0.9 + Math.random() * 0.7;
      addTracer(new THREE.Vector3(fc.x, 1.4, fc.z), new THREE.Vector3(me.pos.x, 1.2, me.pos.z)); gun(0.3);
      if (Math.random() < 0.55 && !me.god) net.send({ t: 'selfhit', dmg: 3 + me.wanted });
    }
  }
}

// ---------- pickups ----------
const pickups = [];
function makePickupMesh(type, col) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.055, 6, 18), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, flatShading: true }));
  ring.rotation.x = Math.PI / 2; g.add(ring);
  if (type === 'health') {                              // green medkit cross
    const mat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x2ecc71, emissiveIntensity: 0.55, flatShading: true });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.18), mat); a.position.y = 0.55; g.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.52, 0.18), mat); b.position.y = 0.55; g.add(b);
  } else {                                              // the actual weapon model, faintly glowing
    const wm = makeWeaponMesh(type);
    if (wm) { wm.scale.set(1.7, 1.7, 1.7); wm.position.set(0, 0.6, 0); wm.rotation.set(0, Math.PI / 2, 0.15); wm.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(col); o.material.emissiveIntensity = 0.28; } }); g.add(wm); }
  }
  return g;
}
function spawnPickups() {
  const types = ['health', 'health', 'smg', 'shotgun', 'rifle', 'sniper', 'rpg', 'homing'];
  for (let i = 0; i < 22; i++) {
    const sp = city.spawns[(Math.random() * city.spawns.length) | 0] || { x: 60, z: 60 };
    const type = types[i % types.length], col = type === 'health' ? 0x2ecc71 : type === 'smg' ? 0xf39c12 : type === 'shotgun' ? 0xe74c3c : type === 'rpg' ? 0x9b59b6 : type === 'sniper' ? 0x1abc9c : type === 'homing' ? 0xff7043 : 0x3498db;
    const mesh = makePickupMesh(type, col);
    const x = sp.x + (Math.random() - 0.5) * 18, z = sp.z + (Math.random() - 0.5) * 18; mesh.position.set(x, 1, z); scene.add(mesh);
    pickups.push({ x, z, type, mesh, taken: false, respawnAt: 0 });
  }
}
function updatePickups(dt) {
  const now = performance.now();
  for (const p of pickups) {
    if (p.taken) { if (now > p.respawnAt) { p.taken = false; p.mesh.visible = true; } continue; }
    p.mesh.rotation.y += dt * 2; p.mesh.position.y = 1 + Math.sin(now / 400) * 0.15;
    if (me.alive && Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < 1.9) {
      p.taken = true; p.mesh.visible = false; p.respawnAt = now + 25000;
      if (p.type === 'health') { net.send({ t: 'heal', amount: 40 }); notice('+40 health'); }
      else { me.ammo[p.type] = (me.ammo[p.type] || 0) + (p.type === 'shotgun' ? 24 : p.type === 'rifle' ? 90 : p.type === 'rpg' ? 5 : p.type === 'homing' ? 4 : p.type === 'sniper' ? 12 : 120); setWeapon(p.type); notice('Picked up ' + WEAPONS[p.type].name); }
    }
  }
}

// ---------- landmark life: police-station cops/cars + school kids (all killable) ----------
const stationCops = [], schoolKids = [];
function spawnKid(school) {
  const ch = makeChar(PED_COLORS[(Math.random() * PED_COLORS.length) | 0]); ch.group.scale.set(0.6, 0.6, 0.6);
  const x = school.x + (Math.random() - 0.5) * 24, z = school.z + 18 + (Math.random() - 0.5) * 16; ch.group.position.set(x, 0, z); scene.add(ch.group);
  schoolKids.push({ char: ch, x, z, heading: Math.random() * 6.28, speed: 2.6 + Math.random() * 1.6, walkT: 0, retarget: 0, alive: true, removeAt: 0,
    die() { this.alive = false; this.char.group.rotation.set(0, this.heading, Math.PI / 2); this.char.group.position.y = 0.18; this.removeAt = performance.now() + 9000; } });
}
function spawnStationCop(police) {
  const ch = makeChar(0x22336b, { hair: 0x0d1526, pants: 0x10131c, hat: true }); ch.setWeapon('pistol');
  const x = police.x + (Math.random() - 0.5) * 22, z = police.z + 14 + Math.random() * 10; ch.group.position.set(x, 0, z); scene.add(ch.group);
  stationCops.push({ char: ch, x, z, hx: x, hz: z, tx: x, tz: z, heading: 0, walkT: 0, retarget: 0, hp: 40, alive: true, removeAt: 0,
    die() { this.alive = false; this.char.group.rotation.set(0, this.heading, Math.PI / 2); this.char.group.position.y = 0.3; this.removeAt = performance.now() + 10000; } });
}
(function spawnLandmarkLife() {
  const police = city.landmarks.find(l => l.type === 'police'), school = city.landmarks.find(l => l.type === 'school');
  if (police) {
    for (let i = 0; i < 4; i++) {
      const c = makeCar(0x1a2740, true); c.x = police.x - 15 + (i % 2) * 30; c.z = police.z + 16 + ((i / 2) | 0) * 6;
      if (!city.isLandCell(c.x, c.z)) { c.x = police.x + (i - 1.5) * 6; c.z = police.z + 10; }
      c.heading = Math.PI; c.speed = 0; c.vx = 0; c.vz = 0; c.colHex = 0x1a2740; c.occupant = null; c.roll = 0; c.pitch = 0; c.type = 'car';
      c.group.position.set(c.x, 0, c.z); c.group.rotation.y = c.heading; scene.add(c.group); cars.push(c);
    }
    for (let i = 0; i < 5; i++) spawnStationCop(police);
  }
  if (school) for (let i = 0; i < 11; i++) spawnKid(school);
})();
function updateStationCops(dt) {
  const police = city.landmarks.find(l => l.type === 'police');
  for (let i = stationCops.length - 1; i >= 0; i--) {
    const s = stationCops[i];
    if (!s.alive) { if (performance.now() > s.removeAt) { scene.remove(s.char.group); stationCops.splice(i, 1); if (police) spawnStationCop(police); } continue; }
    s.retarget -= dt;
    if (s.retarget <= 0) { s.retarget = 2 + Math.random() * 3; s.tx = s.hx + (Math.random() - 0.5) * 20; s.tz = s.hz + (Math.random() - 0.5) * 12; }
    const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz), moving = d > 0.4;
    if (moving) { s.x += dx / d * 1.6 * dt; s.z += dz / d * 1.6 * dt; s.heading = Math.atan2(dx, dz); }
    s.char.group.position.set(s.x, 0, s.z); s.char.group.rotation.y = s.heading; s.walkT += dt * 6; s.char.setPose(s.walkT, moving, false);
  }
}
function updateSchoolKids(dt) {
  const school = city.landmarks.find(l => l.type === 'school'); if (!school) return;
  const cx = school.x, cz = school.z + 16;
  for (let i = schoolKids.length - 1; i >= 0; i--) {
    const k = schoolKids[i];
    if (!k.alive) { if (performance.now() > k.removeAt) { scene.remove(k.char.group); schoolKids.splice(i, 1); spawnKid(school); } continue; }
    k.retarget -= dt; k.walkT += dt * 10;
    if (k.retarget <= 0) { k.retarget = 0.8 + Math.random() * 1.8; k.heading += (Math.random() - 0.5) * 3; }
    const nx = k.x + Math.sin(k.heading) * k.speed * dt, nz = k.z + Math.cos(k.heading) * k.speed * dt;
    if (Math.hypot(nx - cx, nz - cz) > 22 || insideBuilding(nx, nz)) k.heading += Math.PI + (Math.random() - 0.5);
    else { k.x = nx; k.z = nz; }
    k.char.group.position.set(k.x, 0, k.z); k.char.group.rotation.y = k.heading; k.char.setPose(k.walkT, true, false);
  }
}

// ---------- remote players ----------
const remotes = new Map();
function disposeGroup(g) { g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } } }); }
function addRemote(o) {
  if (o.id === me.id || remotes.has(o.id)) return;
  const ccHex = parseInt((o.cc || '#cccccc').slice(1), 16);
  const char = charFromLook(o.look, o.color);
  const car = makeCar(ccHex), bike = makeBike(ccHex), heli = makeHeli(), tank = makeTank(), boat = makeBoat(ccHex);
  scene.add(char.group); scene.add(car.group); scene.add(bike.group); scene.add(heli.group); scene.add(tank.group); scene.add(boat.group);
  car.group.visible = false; bike.group.visible = false; heli.group.visible = false; tank.group.visible = false; boat.group.visible = false;
  const tag = makeTag(o.name, o.color); scene.add(tag);
  const wi = o.wi == null ? 1 : o.wi | 0; char.setWeapon(WORDER[wi] || 'pistol');
  remotes.set(o.id, { id: o.id, name: o.name, color: o.color, char, car, bike, heli, tank, boat, tag, ccHex, x: o.x, z: o.y, a: o.a, dx: o.x, dz: o.y, da: o.a, vt: o.vt | 0, vy: o.vy || 0, tu: o.tu || 0, wi, dvy: 0, inCar: !!o.car, alive: o.alive !== false, kills: o.kills | 0, walkT: 0 });
}
function makeTag(name, color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d');
  x.font = 'bold 30px Arial'; x.textAlign = 'center'; x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.8)'; x.strokeText(name, 128, 34); x.fillStyle = color || '#fff'; x.fillText(name, 128, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true })); s.scale.set(3, 0.75, 1); return s;
}
function applySnap(list) {
  for (const o of list) {
    if (o.id === me.id) { me.kills = o.kills | 0; continue; }
    let r = remotes.get(o.id); if (!r) { addRemote(o); r = remotes.get(o.id); }
    r.x = o.x; r.z = o.y; r.a = o.a; r.inCar = !!o.car; r.vt = o.vt | 0; r.vy = o.vy || 0; r.tu = o.tu || 0; r.vx = o.vx || 0; r.vz = o.vz || 0; r.alive = o.alive !== false; r.kills = o.kills | 0; r.name = o.name;
    const cch = parseInt((o.cc || '#cccccc').slice(1), 16);
    if (cch !== r.ccHex) { r.ccHex = cch; const vis = r.car.group.visible; scene.remove(r.car.group); disposeGroup(r.car.group); r.car = makeCar(cch); r.car.group.visible = vis; scene.add(r.car.group); }
    if (o.wi != null && o.wi !== r.wi) { r.wi = o.wi | 0; r.char.setWeapon(WORDER[r.wi] || 'pistol'); }
  }
}
function updateRemotes(dt) {
  for (const r of remotes.values()) {
    r.x += (r.vx || 0) * dt; r.z += (r.vz || 0) * dt;    // dead reckoning: extrapolate target between snapshots
    r.dx = THREE.MathUtils.lerp(r.dx, r.x, Math.min(1, dt * 16)); r.dz = THREE.MathUtils.lerp(r.dz, r.z, Math.min(1, dt * 16));
    r.dvy = THREE.MathUtils.lerp(r.dvy || 0, r.vy || 0, Math.min(1, dt * 8));
    let d = r.a - r.da; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; r.da += d * Math.min(1, dt * 14);
    const moved = Math.hypot(r.vx || 0, r.vz || 0) > 0.35, vt = r.vt | 0, p = r.char.parts;
    r.car.group.visible = vt === 1 && r.alive; r.bike.group.visible = vt === 2 && r.alive; r.heli.group.visible = vt === 3 && r.alive; r.tank.group.visible = vt === 4 && r.alive; r.boat.group.visible = vt === 5 && r.alive;
    if (vt === 1) { r.car.group.position.set(r.dx, 0, r.dz); r.car.group.rotation.y = r.da; r.char.group.visible = false; }
    else if (vt === 5) { r.boat.group.position.set(r.dx, -0.15, r.dz); r.boat.group.rotation.y = r.da; r.char.group.visible = false; }
    else if (vt === 4) { r.tank.group.position.set(r.dx, 0, r.dz); r.tank.group.rotation.y = r.da; if (r.tank.turret) r.tank.turret.rotation.y = (r.tu || 0) - r.da; r.char.group.visible = false; }
    else if (vt === 3) { r.heli.group.position.set(r.dx, r.dvy, r.dz); r.heli.group.rotation.y = r.da; if (r.heli.rotor) r.heli.rotor.rotation.y += dt * 32; r.char.group.visible = false; }
    else if (vt === 2) { r.bike.group.position.set(r.dx, 0, r.dz); r.bike.group.rotation.y = r.da; r.char.group.visible = r.alive; r.char.group.position.set(r.dx, 0.18, r.dz); r.char.group.rotation.set(0, r.da, 0); p.armL.rotation.set(-1.1, 0, 0.2); p.armR.rotation.set(-1.1, 0, -0.2); p.legL.rotation.set(0.5, 0, 0.28); p.legR.rotation.set(0.5, 0, -0.28); }
    else { r.char.group.visible = r.alive; r.char.group.position.set(r.dx, 0, r.dz); r.char.group.rotation.set(0, r.da, 0); p.legL.rotation.z = 0; p.legR.rotation.z = 0; r.walkT += dt * 6; r.char.setPose(r.walkT, moved, false); }
    r.tag.visible = r.alive; r.tag.position.set(r.dx, (vt === 3 ? r.dvy + 2.6 : vt ? 2.4 : 2.3), r.dz);
  }
}

// ---------- net ----------
class Net { constructor() { this.ws = null; this.q = []; this.open = false; } connect() { const p = location.protocol === 'https:' ? 'wss' : 'ws'; this.ws = new WebSocket(`${p}://${location.host}/ws`); this.ws.onopen = () => { this.open = true; this.q.forEach(m => this.ws.send(m)); this.q = []; }; this.ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); }; this.ws.onclose = () => { this.open = false; setTimeout(() => this.connect(), 1200); }; this.ws.onerror = () => { try { this.ws.close(); } catch {} }; } send(o) { const s = JSON.stringify(o); if (this.open) this.ws.send(s); else this.q.push(s); } }
const net = new Net();
function onMsg(m) {
  switch (m.t) {
    case 'init': me.id = m.id; if (m.you) me.pos.set(m.you.x, 0, m.you.y); for (const o of m.players) addRemote(o); break;
    case 'spawn': addRemote(m.p); break;
    case 'leave': { const r = remotes.get(m.id); if (r) { for (const grp of [r.char.group, r.car.group, r.bike.group, r.heli.group, r.tank.group, r.boat.group, r.tag]) { scene.remove(grp); disposeGroup(grp); } remotes.delete(m.id); } break; }
    case 'snap': applySnap(m.players); break;
    case 'shot': peerShot(m); break;
    case 'rocket': { const o = new THREE.Vector3(m.x, m.y, m.z), d = new THREE.Vector3(m.dx, m.dy, m.dz); if (d.lengthSq() > 0.0001) spawnRocket(o, d, { speed: m.speed || 58, big: !!m.big, ghost: true }); break; }
    case 'hp': me.hp = m.hp; flash(); shake = Math.max(shake, 0.25); break;
    case 'dead': if (m.id === me.id) { me.alive = false; if (me.inCar) { me.inCar.occupant = null; me.inCar = null; } me.char.group.visible = false; me.wanted = 0; me.heat = 0; me.lastCrime = 0; $('dead').classList.add('show'); } break;
    case 'resp': spawnMe(m.x, m.y); $('dead').classList.remove('show'); break;
    case 'kill': notice(`${m.killer} 💀 ${m.victim}`); break;
    case 'kills': me.kills = m.n; break;
    case 'chat': addChat(m.name, m.m, m.color); break;
    case 'notice': notice(m.m); break;
  }
}
function peerShot(m) { const a = new THREE.Vector3(m.x, 1.4, m.y); const b = a.clone().add(new THREE.Vector3(Math.sin(m.a), 0, Math.cos(m.a)).multiplyScalar(40)); addTracer(a, b); muzzle(a); if (a.distanceTo(me.pos) < 80) gun(0.4); }
let sendAcc = 0;
function vtypeCode(v) { return !v ? 0 : v.type === 'bike' ? 2 : v.type === 'heli' ? 3 : v.type === 'tank' ? 4 : v.type === 'boat' ? 5 : 1; }
function netTick(dt) {
  sendAcc += dt;
  if (sendAcc > 1 / 20 && me.id) {
    const interval = Math.max(1 / 60, sendAcc); sendAcc = 0;
    const vx = (me.pos.x - (me._px ?? me.pos.x)) / interval, vz = (me.pos.z - (me._pz ?? me.pos.z)) / interval;
    me._px = me.pos.x; me._pz = me.pos.z;
    const vt = vtypeCode(me.inCar);
    net.send({ t: 'state', x: me.pos.x, y: me.pos.z, a: me.heading, car: me.inCar ? 1 : 0, vt, vy: vt === 3 ? me.pos.y : 0, tu: vt === 4 ? camYaw : 0, wi: WORDER.indexOf(me.weapon), vx, vz, cc: '#' + (me.inCar ? me.inCar.colHex : 0xcccccc).toString(16).padStart(6, '0') });
  }
}

// ---------- audio (routed through a master gain = volume setting) ----------
let AC = null, eng = null, master = null;
function aInit() { if (!AC) { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = settings.volume; master.connect(AC.destination); } }
function gun(v = 1) { if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(); o.type = 'square'; o.frequency.setValueAtTime(300, AC.currentTime); o.frequency.exponentialRampToValueAtTime(70, AC.currentTime + 0.09); g.gain.value = 0.12 * v; g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.1); o.connect(g); g.connect(master); o.start(); o.stop(AC.currentTime + 0.1); }
function screech() { if (!AC || screech._t && AC.currentTime - screech._t < 0.2) return; screech._t = AC.currentTime; const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sawtooth'; o.frequency.value = 900; g.gain.value = 0.04; g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.2); o.connect(g); g.connect(master); o.start(); o.stop(AC.currentTime + 0.2); }
function engine() { if (eng) { try { eng.g.gain.value = 0; eng.o.stop(); } catch {} eng = null; } } // engine sound removed
function swish() { if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(560, AC.currentTime); o.frequency.exponentialRampToValueAtTime(120, AC.currentTime + 0.08); g.gain.value = 0.09; g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.09); o.connect(g); g.connect(master); o.start(); o.stop(AC.currentTime + 0.09); }
function boom() { if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(130, AC.currentTime); o.frequency.exponentialRampToValueAtTime(28, AC.currentTime + 0.45); g.gain.value = 0.3; g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.55); o.connect(g); g.connect(master); o.start(); o.stop(AC.currentTime + 0.55); const n = AC.createOscillator(), ng = AC.createGain(); n.type = 'square'; n.frequency.value = 70; ng.gain.value = 0.14; ng.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.28); n.connect(ng); ng.connect(master); n.start(); n.stop(AC.currentTime + 0.28); }

// ---------- HUD ----------
const $ = id => document.getElementById(id);
// ---- map (M) ----
const mapcv = document.getElementById('map'), mctx = mapcv.getContext('2d');
// ---- always-on minimap (player-centred, north-up) ----
const minicv = document.getElementById('minimap'), minictx = minicv.getContext('2d');
function drawMinimap() {
  const W = minicv.width, H = minicv.height, R = 74, scale = W / (R * 2), px = me.pos.x, pz = me.pos.z;
  const tx = wx => (wx - px) * scale + W / 2, tz = wz => (wz - pz) * scale + H / 2;
  minictx.clearRect(0, 0, W, H);
  minictx.save();
  minictx.beginPath(); minictx.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2); minictx.clip();
  minictx.fillStyle = '#123a52'; minictx.fillRect(0, 0, W, H);
  const B = WORLD.BLOCK, cell = B * scale;
  minictx.fillStyle = '#cbb98a'; for (const c of city.landCells) if (Math.abs(c.cx - px) < R + B && Math.abs(c.cz - pz) < R + B) minictx.fillRect(tx(c.cx) - cell * 0.61, tz(c.cz) - cell * 0.61, cell * 1.22, cell * 1.22);
  minictx.fillStyle = '#2b2e36'; for (const c of city.landCells) if (Math.abs(c.cx - px) < R + B && Math.abs(c.cz - pz) < R + B) minictx.fillRect(tx(c.cx) - cell / 2, tz(c.cz) - cell / 2, cell + 0.5, cell + 0.5);
  minictx.fillStyle = '#565b6b'; for (const b of buildings) if (Math.abs(b.x - px) < R && Math.abs(b.z - pz) < R) minictx.fillRect(tx(b.x - b.w / 2), tz(b.z - b.d / 2), Math.max(1, b.w * scale), Math.max(1, b.d * scale));
  const dot = (x, z, col, s) => { if (Math.abs(x - px) > R || Math.abs(z - pz) > R) return; minictx.fillStyle = col; minictx.beginPath(); minictx.arc(tx(x), tz(z), s, 0, Math.PI * 2); minictx.fill(); };
  for (const c of cars) if (!c.occupant) dot(c.x, c.z, '#dfe4ec', 1.7);
  for (const t of traffic) dot(t.x, t.z, '#aab2c0', 1.7);
  for (const p of peds) if (p.alive) dot(p.x, p.z, '#7aa86a', 1.4);
  for (const pk of pickups) if (!pk.taken) dot(pk.x, pk.z, pk.type === 'health' ? '#2ecc71' : '#ffd83a', 1.6);
  for (const b of barrels) if (b.alive) dot(b.x, b.z, '#ff7a2a', 1.4);
  for (const c of cops) dot(c.x, c.z, '#3a7bff', 2.2);
  for (const f of footCops) if (f.alive) dot(f.x, f.z, '#66aaff', 1.6);
  for (const r of remotes.values()) if (r.alive) dot(r.dx, r.dz, r.color || '#fff', 2.4);
  minictx.strokeStyle = '#6b6f78'; minictx.lineWidth = Math.max(2, 13 * scale); minictx.beginPath(); minictx.moveTo(tx(city.bridge.ax), tz(city.bridge.az)); minictx.lineTo(tx(city.bridge.bx), tz(city.bridge.bz)); minictx.stroke();
  for (const l of city.landmarks) { if (Math.abs(l.x - px) > R || Math.abs(l.z - pz) > R) continue; const col = l.type === 'hospital' ? '#e74c3c' : l.type === 'police' ? '#3a7bff' : l.type === 'school' ? '#f1c40f' : '#e67e22'; minictx.fillStyle = col; minictx.beginPath(); minictx.arc(tx(l.x), tz(l.z), 4, 0, Math.PI * 2); minictx.fill(); minictx.fillStyle = '#000'; minictx.font = 'bold 9px Arial'; minictx.textAlign = 'center'; minictx.textBaseline = 'middle'; minictx.fillText(l.label[0], tx(l.x), tz(l.z)); }
  minictx.save(); minictx.translate(W / 2, H / 2); minictx.rotate(Math.atan2(Math.cos(me.heading), Math.sin(me.heading)));
  minictx.fillStyle = '#ffef99'; minictx.strokeStyle = '#000'; minictx.lineWidth = 1;
  minictx.beginPath(); minictx.moveTo(7, 0); minictx.lineTo(-5, 5); minictx.lineTo(-2, 0); minictx.lineTo(-5, -5); minictx.closePath(); minictx.fill(); minictx.stroke();
  minictx.restore();
  minictx.restore();
}
function toggleMap() { mapOpen = !mapOpen; $('map').classList.toggle('show', mapOpen); $('maphint').classList.toggle('show', mapOpen); if (mapOpen) { mapcv.width = innerWidth; mapcv.height = innerHeight; document.exitPointerLock(); } else if (playing && !captured) { canvas.requestPointerLock(); } }
addEventListener('keydown', e => { if (e.code === 'Escape' && mapOpen) toggleMap(); });
function drawMap() {
  const W = mapcv.width, H = mapcv.height, S = WORLD.SIZE, margin = 70;
  const scale = Math.min(W - margin * 2, H - margin * 2) / S;
  const ox = (W - S * scale) / 2, oy = (H - S * scale) / 2;
  const tx = wx => ox + wx * scale, tz = wz => oy + wz * scale;
  mctx.fillStyle = '#123a52'; mctx.fillRect(0, 0, W, H);                       // ocean fills the whole map
  const B = WORLD.BLOCK, cell = B * scale;
  mctx.fillStyle = '#cbb98a'; for (const c of city.landCells) mctx.fillRect(tx(c.cx) - cell * 0.61, tz(c.cz) - cell * 0.61, cell * 1.22, cell * 1.22);  // beach
  mctx.fillStyle = '#2b2e36'; for (const c of city.landCells) mctx.fillRect(tx(c.cx) - cell / 2, tz(c.cz) - cell / 2, cell + 0.5, cell + 0.5);          // roads/asphalt
  mctx.fillStyle = '#565b6b'; for (const b of buildings) mctx.fillRect(tx(b.x - b.w / 2), tz(b.z - b.d / 2), Math.max(1, b.w * scale), Math.max(1, b.d * scale));
  for (const s of city.shops) { mctx.fillStyle = '#' + s.color.toString(16).padStart(6, '0'); mctx.fillRect(tx(s.x) - 2.5, tz(s.z) - 2.5, 5, 5); }  // shops = bright markers
  mctx.fillStyle = '#ff7a2a'; for (const b of barrels) if (b.alive) mctx.fillRect(tx(b.x) - 1.5, tz(b.z) - 1.5, 3, 3);
  mctx.fillStyle = '#dfe4ec'; for (const c of cars) if (!c.occupant) mctx.fillRect(tx(c.x) - 2, tz(c.z) - 2, 4, 4);
  mctx.fillStyle = '#aab2c0'; for (const t of traffic) mctx.fillRect(tx(t.x) - 2, tz(t.z) - 2, 4, 4);
  mctx.fillStyle = '#7aa86a'; for (const p of peds) if (p.alive) mctx.fillRect(tx(p.x) - 1.5, tz(p.z) - 1.5, 3, 3);
  mctx.fillStyle = '#3a7bff'; for (const c of cops) { mctx.beginPath(); mctx.arc(tx(c.x), tz(c.z), 4, 0, Math.PI * 2); mctx.fill(); }
  mctx.fillStyle = '#66aaff'; for (const f of footCops) if (f.alive) { mctx.beginPath(); mctx.arc(tx(f.x), tz(f.z), 2.5, 0, Math.PI * 2); mctx.fill(); }
  for (const r of remotes.values()) { if (!r.alive) continue; mctx.fillStyle = r.color || '#fff'; mctx.beginPath(); mctx.arc(tx(r.dx), tz(r.dz), 5, 0, Math.PI * 2); mctx.fill(); }
  // bridge
  mctx.strokeStyle = '#6b6f78'; mctx.lineWidth = Math.max(2, 13 * scale); mctx.beginPath(); mctx.moveTo(tx(city.bridge.ax), tz(city.bridge.az)); mctx.lineTo(tx(city.bridge.bx), tz(city.bridge.bz)); mctx.stroke();
  // named landmarks
  for (const l of city.landmarks) {
    const col = l.type === 'hospital' ? '#e74c3c' : l.type === 'police' ? '#3a7bff' : l.type === 'school' ? '#f1c40f' : '#e67e22';
    mctx.fillStyle = col; mctx.beginPath(); mctx.arc(tx(l.x), tz(l.z), 6, 0, Math.PI * 2); mctx.fill();
    mctx.font = 'bold 13px Arial'; mctx.textAlign = 'left'; mctx.textBaseline = 'middle'; mctx.lineWidth = 3; mctx.strokeStyle = 'rgba(0,0,0,.75)';
    mctx.strokeText(l.label, tx(l.x) + 9, tz(l.z)); mctx.fillStyle = '#fff'; mctx.fillText(l.label, tx(l.x) + 9, tz(l.z));
  }
  const a = Math.atan2(Math.cos(me.heading), Math.sin(me.heading));
  mctx.save(); mctx.translate(tx(me.pos.x), tz(me.pos.z)); mctx.rotate(a);
  mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.moveTo(9, 0); mctx.lineTo(-6, 6); mctx.lineTo(-3, 0); mctx.lineTo(-6, -6); mctx.closePath(); mctx.fill();
  mctx.restore();
}
function flash() { document.body.classList.add('hurt'); setTimeout(() => document.body.classList.remove('hurt'), 120); }
function hitMark() { const h = $('hitmark'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); }
function notice(t) { const e = $('notice'); e.textContent = t; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2200); }
function addChat(name, msg, color) { const log = $('chatlog'); const d = document.createElement('div'); d.innerHTML = `<b style="color:${color}">${esc(name)}</b>: ${esc(msg)}`; log.appendChild(d); while (log.children.length > 8) log.removeChild(log.firstChild); d.classList.add('fresh'); setTimeout(() => d.classList.remove('fresh'), 7000); }
function esc(s) { return String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
function updateHud() {
  $('hp').style.width = THREE.MathUtils.clamp(me.hp, 0, 100) + '%';
  $('kills').textContent = 'Kills: ' + me.kills;
  const w = WEAPONS[me.weapon];
  $('wicon').textContent = w.icon; $('wname').textContent = w.name;
  $('wammo').textContent = w.melee ? '∞' : me.ammo[me.weapon] === Infinity ? '∞' : (me.ammo[me.weapon] | 0);
  const sc = $('stars').children; for (let i = 0; i < sc.length; i++) sc[i].classList.toggle('on', i < me.wanted);
  let near = false;
  if (!me.inCar) { for (const c of cars) if (!c.occupant && Math.hypot(c.x - me.pos.x, c.z - me.pos.z) < 6) { near = true; break; } if (!near) for (const t of traffic) if (Math.hypot(t.x - me.pos.x, t.z - me.pos.z) < 6) { near = true; break; } }
  const hint = $('hint'); hint.style.display = (me.inCar || near) ? 'block' : 'none'; hint.textContent = me.inCar ? 'F — exit vehicle' : 'F — enter vehicle';
  if (keys.has('Tab')) { renderScores(); $('scores').classList.add('show'); } else $('scores').classList.remove('show');
}
function renderScores() { const rows = [{ name: me.name, kills: me.kills, color: '#' + me.colorHex.toString(16).padStart(6, '0'), me: 1 }, ...[...remotes.values()].map(r => ({ name: r.name, kills: r.kills, color: r.color }))]; rows.sort((a, b) => b.kills - a.kills); $('scores').innerHTML = '<div class="sh">SCORES</div>' + rows.map(r => `<div class="sr${r.me ? ' me' : ''}"><span style="color:${r.color}">${esc(r.name)}</span><span>${r.kills}</span></div>`).join(''); }

// chat
const chat = $('chatinput');
addEventListener('keydown', e => { if (e.code === 'Enter' && !captured && playing) { captured = true; keys.clear(); chat.classList.add('show'); chat.focus(); document.exitPointerLock(); e.preventDefault(); } });
chat.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { const v = chat.value.trim(); if (v) net.send({ t: 'chat', m: v }); chat.value = ''; captured = false; chat.classList.remove('show'); chat.blur(); } else if (e.key === 'Escape') { chat.value = ''; captured = false; chat.classList.remove('show'); chat.blur(); } });

// ---- cheat console (open with ` or / ) ----
const OWNER_KEY = 'vice';
const cheatIn = $('cheat');
addEventListener('keydown', e => { if ((e.code === 'Backquote' || e.code === 'Slash') && !captured && playing) { captured = true; keys.clear(); cheatIn.classList.add('show'); cheatIn.focus(); document.exitPointerLock(); e.preventDefault(); } });
cheatIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { applyCheat(cheatIn.value); cheatIn.value = ''; captured = false; cheatIn.classList.remove('show'); cheatIn.blur(); } else if (e.key === 'Escape') { cheatIn.value = ''; captured = false; cheatIn.classList.remove('show'); cheatIn.blur(); } });
function giveCar() {
  const colHex = 0x0d0f12, c = makeCar(colHex);
  c.x = me.pos.x + Math.sin(me.heading + Math.PI / 2) * 3; c.z = me.pos.z + Math.cos(me.heading + Math.PI / 2) * 3;
  c.heading = me.heading; c.speed = 0; c.vx = 0; c.vz = 0; c.colHex = colHex; c.occupant = null; c.roll = 0; c.pitch = 0; c.type = 'car';
  c.group.position.set(c.x, 0, c.z); c.group.rotation.y = c.heading; scene.add(c.group); cars.push(c); return c;
}
function giveBike() {
  const colHex = 0x111316, b = makeBike(colHex);
  b.x = me.pos.x + Math.sin(me.heading + Math.PI / 2) * 2.5; b.z = me.pos.z + Math.cos(me.heading + Math.PI / 2) * 2.5;
  b.heading = me.heading; b.speed = 0; b.vx = 0; b.vz = 0; b.colHex = colHex; b.occupant = null; b.roll = 0; b.pitch = 0; b.type = 'bike';
  b.group.position.set(b.x, 0, b.z); b.group.rotation.y = b.heading; scene.add(b.group); cars.push(b); return b;
}
function giveHeli() {
  const h = makeHeli(0x2c3e57);
  h.x = me.pos.x + Math.sin(me.heading) * 6; h.z = me.pos.z + Math.cos(me.heading) * 6; h.y = 0;
  h.heading = me.heading; h.speed = 0; h.vx = 0; h.vz = 0; h.colHex = 0x2c3e57; h.occupant = null; h.roll = 0; h.pitch = 0; h.type = 'heli'; h.rotorSpin = 0;
  h.group.position.set(h.x, 0, h.z); scene.add(h.group); cars.push(h); return h;
}
function giveTank() {
  const t = makeTank(0x5a6b3a);
  t.x = me.pos.x + Math.sin(me.heading) * 7; t.z = me.pos.z + Math.cos(me.heading) * 7;
  t.heading = me.heading; t.speed = 0; t.vx = 0; t.vz = 0; t.colHex = 0x5a6b3a; t.occupant = null; t.roll = 0; t.pitch = 0; t.type = 'tank'; t.turretYaw = me.heading; t.tShootCd = 0;
  t.group.position.set(t.x, 0, t.z); t.group.rotation.y = t.heading; scene.add(t.group); cars.push(t); return t;
}
function giveBoat() {
  const col = 0xe8e8e8, b = makeBoat(col);
  b.x = me.pos.x + Math.sin(me.heading) * 4; b.z = me.pos.z + Math.cos(me.heading) * 4;
  b.heading = me.heading; b.speed = 0; b.vx = 0; b.vz = 0; b.colHex = col; b.occupant = null; b.roll = 0; b.pitch = 0; b.type = 'boat';
  b.group.position.set(b.x, -0.15, b.z); scene.add(b.group); cars.push(b); return b;
}
function enterVehicle(c) { if (me.inCar) { me.inCar.occupant = null; } c.occupant = 'me'; me.inCar = c; me.char.group.visible = c.type === 'bike' && !me.fp; }
function applyCheat(raw) {
  const cmd = String(raw || '').trim().toLowerCase(); if (!cmd) return;
  switch (cmd) {
    case 'help': case '?': notice('health · guns · rpg · homing · sniper · god · car · bike · heli · tank · boat · speed · boom'); break;
    case 'health': case 'hp': case 'heal': me.hp = 100; me.alive = true; net.send({ t: 'cheat', key: OWNER_KEY }); notice('❤ Full health'); break;
    case 'guns': case 'weapons': for (const w of WORDER) me.ammo[w] = w === 'pistol' ? Infinity : 999; notice('🔫 All weapons + ammo'); break;
    case 'ammo': for (const w of WORDER) if (me.ammo[w] !== Infinity) me.ammo[w] = 999; notice('Ammo refilled'); break;
    case 'god': case 'godmode': me.god = !me.god; notice('🛡 God mode ' + (me.god ? 'ON' : 'OFF')); break;
    case 'wanted': case 'clean': case 'lawful': me.wanted = 0; me.heat = 0; notice('Wanted cleared'); break;
    case 'stars': case 'star': case 'heat': me.heat = 36; me.wanted = 5; me.lastCrime = performance.now(); notice('★★★★★ 5 stars'); break;
    case 'car': case 'vehicle': case 'spawncar': enterVehicle(giveCar()); notice('🚗 Car spawned'); break;
    case 'bike': case 'moto': case 'motorcycle': enterVehicle(giveBike()); notice('🏍 Bike spawned'); break;
    case 'heli': case 'helicopter': case 'chopper': enterVehicle(giveHeli()); notice('🚁 Heli — Space up, Shift down, W fwd'); break;
    case 'boat': case 'ship': case 'jetski': enterVehicle(giveBoat()); notice('🚤 Boat spawned (drives on water)'); break;
    case 'rpg': case 'rocket': case 'launcher': me.ammo.rpg = Math.max(me.ammo.rpg, 10); setWeapon('rpg'); notice('🚀 RPG +10'); break;
    case 'sniper': case 'snipe': me.ammo.sniper = Math.max(me.ammo.sniper, 20); setWeapon('sniper'); notice('🎯 Sniper +20 (hold RMB to scope)'); break;
    case 'homing': case 'lockon': case 'lock': me.ammo.homing = Math.max(me.ammo.homing, 10); setWeapon('homing'); notice('📡 Lock-On +10 (hold RMB on a vehicle to lock)'); break;
    case 'tank': enterVehicle(giveTank()); notice('🛡 Tank — LMB fires, RMB aims turret'); break;
    case 'speed': case 'fast': case 'turbo': me.turbo = !me.turbo; notice('💨 Speed boost ' + (me.turbo ? 'ON' : 'OFF')); break;
    case 'boom': case 'kaboom': case 'nuke': { let n = 0; for (const t of [...traffic]) if (Math.hypot(t.x - me.pos.x, t.z - me.pos.z) < 30) { scene.remove(t.car.group); traffic.splice(traffic.indexOf(t), 1); n++; } for (const pd of peds) if (pd.alive && Math.hypot(pd.x - me.pos.x, pd.z - me.pos.z) < 30) { pd.die(); n++; } notice('💥 Boom! (' + n + ')'); break; }
    default: notice("Unknown cheat: " + cmd + "  (type help)"); break;
  }
}

// ---------- menu / customization ----------
let playing = false;
const PAL = {
  shirt: ['#3aa0ff', '#ff4d6d', '#36c2bd', '#9b59ff', '#ff8a3c', '#2ecc71', '#ffd83a', '#ffffff', '#111416'],
  skin: ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5a3a1a'],
  hair: ['#20140d', '#4a2f1a', '#8a6b2a', '#c9a23a', '#b0b0b0', '#222222', '#aa3322', '#6a3aa0'],
  pants: ['#2c3e50', '#1a1a1a', '#5b3a2a', '#3a5a3a', '#7a6a4a', '#8a3a4a', '#cfd2d6'],
};
function buildSwatches(containerId, palette, key) {
  const w = $(containerId); if (!w) return;
  palette.forEach(c => {
    const d = document.createElement('div'); d.className = 'sw' + (c === me.look[key] ? ' on' : ''); d.style.background = c;
    d.onclick = () => { w.querySelectorAll('.sw').forEach(s => s.classList.remove('on')); d.classList.add('on'); me.look[key] = c; if (key === 'shirt') me.colorHex = parseInt(c.slice(1), 16); rebuildMe(); };
    w.appendChild(d);
  });
}
buildSwatches('colors', PAL.shirt, 'shirt');
buildSwatches('skincolors', PAL.skin, 'skin');
buildSwatches('haircolors', PAL.hair, 'hair');
buildSwatches('pantscolors', PAL.pants, 'pants');
if ($('hattoggle')) $('hattoggle').onclick = () => { me.look.hat = !me.look.hat; $('hattoggle').classList.toggle('on', me.look.hat); $('hattoggle').textContent = me.look.hat ? '🧢 Cap: ON' : '🧢 Cap: OFF'; rebuildMe(); };
if ($('gendersel')) $('gendersel').querySelectorAll('button').forEach(b => b.onclick = () => { me.look.gender = b.dataset.g; $('gendersel').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); rebuildMe(); });
function rebuildMe() { const vis = me.char ? me.char.group.visible : true; if (me.char) scene.remove(me.char.group); me.char = buildChar(); me.char.setWeapon(me.weapon); me.char.group.position.copy(me.pos); me.char.group.visible = vis; scene.add(me.char.group); }
$('play').onclick = () => { me.name = ($('name').value || 'Player').slice(0, 14); aInit(); net.connect(); net.send({ t: 'join', name: me.name, color: me.look.shirt, look: me.look }); $('menu').style.display = 'none'; $('hud').style.display = 'block'; playing = true; };
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') $('play').click(); });

// ---------- settings panel ----------
const sPanel = $('settings');
function syncSettingsUI() {
  $('fovSlider').value = settings.fov; $('fovVal').textContent = settings.fov;
  $('sensSlider').value = settings.sens; $('sensVal').textContent = (+settings.sens).toFixed(2);
  $('volSlider').value = settings.volume; $('volVal').textContent = Math.round(settings.volume * 100) + '%';
  $('invertY').checked = settings.invertY;
}
function openSettings() { syncSettingsUI(); sPanel.classList.add('show'); if (playing) { captured = true; keys.clear(); document.exitPointerLock(); } }
function closeSettings() { sPanel.classList.remove('show'); if (playing) { captured = false; if (!mapOpen) canvas.requestPointerLock(); } }
$('fovSlider').oninput = e => { settings.fov = +e.target.value; $('fovVal').textContent = settings.fov; saveSettings(); };
$('sensSlider').oninput = e => { settings.sens = +e.target.value; $('sensVal').textContent = settings.sens.toFixed(2); saveSettings(); };
$('volSlider').oninput = e => { settings.volume = +e.target.value; $('volVal').textContent = Math.round(settings.volume * 100) + '%'; if (master) master.gain.value = settings.volume; saveSettings(); };
$('invertY').onchange = e => { settings.invertY = e.target.checked; saveSettings(); };
$('settingsClose').onclick = closeSettings;
$('gear').onclick = openSettings;
$('menuSettings').onclick = openSettings;
addEventListener('keydown', e => { if (e.code === 'KeyO' && !captured && playing) { e.preventDefault(); openSettings(); } else if (e.code === 'Escape' && sPanel.classList.contains('show')) { closeSettings(); } });
function poll() { fetch('/info').then(r => r.json()).then(d => $('online').textContent = d.players).catch(() => {}); }
poll(); setInterval(() => { if (!playing) poll(); }, 4000);

// ---------- loop ----------
const clock = new THREE.Clock();
let menuA = 0;
const previewCam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
let previewRot = 0;
function renderPreview(dt) {                            // rotating live character preview on the menu
  if (!me.char) return;
  previewRot += dt * 0.7; me.char.group.rotation.y = previewRot;
  const cx = me.pos.x, cz = me.pos.z;
  previewCam.position.set(cx, 1.5, cz + 4.4); previewCam.lookAt(cx, 1.0, cz);
  const boxW = Math.min(340, innerWidth * 0.4), boxH = Math.min(540, innerHeight * 0.72), by = (innerHeight - boxH) / 2, bx = innerWidth - boxW - 26;
  previewCam.aspect = boxW / boxH; previewCam.updateProjectionMatrix();
  renderer.setScissorTest(true);
  renderer.setViewport(bx, by, boxW, boxH); renderer.setScissor(bx, by, boxW, boxH);
  renderer.render(scene, previewCam);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
}
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  if (playing) { updatePlayer(dt); updatePeds(dt); updateTraffic(dt); updateCops(dt); updateFootCops(dt); updateStationCops(dt); updateSchoolKids(dt); updatePickups(dt); updateBarrels(); updateWanted(dt); updateRemotes(dt); updateRockets(dt); updateFx(dt); netTick(dt); updateHud(); if (mapOpen) drawMap(); else drawMinimap(); }
  else { menuA += dt * 0.1; camera.position.set(WORLD.SIZE / 2 + Math.cos(menuA) * 90, 70, WORLD.SIZE / 2 + Math.sin(menuA) * 90); camera.lookAt(WORLD.SIZE / 2, 8, WORLD.SIZE / 2); updateFx(dt); }
  renderer.render(scene, camera);
  if (!playing) renderPreview(dt);
}
spawnPickups();
loop();
window.__G = { me, cars, remotes, peds, traffic, cops, pickups, keys, scene, camera, renderer, WEAPONS, updatePlayer, updatePeds, updateCops, toggleCar, fire, driveCar, driveHeli, vehicleHits, crime, toggleMap, drawMap, mapcv, applyCheat, giveCar, giveBike, giveHeli, giveTank, giveBoat, enterVehicle, driveTank, driveBoat, fireTankShell, footCops, updateFootCops, losClear, settings, city, buildings, castHit, mouse, onMsg, updateCamera, rockets, updateRockets, fireRocket, fireHoming, spawnRocket, explode, targetPos, bestHomingTarget, updateLockOn, clearLock, homingTargets, updateRemotes, barrels, explodeBarrel, setWeapon, meleeAttack, WORDER, owns, stationCops, schoolKids, drawMinimap, buildingTopAt, driveHeli, updatePickups, updateTraffic, pickups, targetAlive, render: () => renderer.render(scene, camera) };
