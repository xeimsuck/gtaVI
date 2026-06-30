// =====================================================================
//  VICE 3D — stylized low-poly third-person multiplayer sandbox.
//  Drive, shoot, mess around with friends. Browser + WebSocket relay.
// =====================================================================
import * as THREE from 'three';
import { makeCity, makeCar, makeChar, makeBike, makeHeli, makeRocket, WORLD } from './build.js';

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
scene.fog = new THREE.Fog(0x9fc4e8, 120, 360);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1200);
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

// ---------- parked cars ----------
const CARC = [0xe74c3c, 0x2980b9, 0x27ae60, 0xf1c40f, 0xecf0f1, 0x34495e, 0xe67e22, 0x8e44ad];
const cars = [];
(function spawnCars() {
  const r = () => Math.random();
  for (let i = 0; i < 26; i++) {
    const sp = city.spawns[(r() * city.spawns.length) | 0] || { x: 60, z: 60 };
    const colHex = CARC[i % CARC.length];
    const c = makeCar(colHex);
    c.x = sp.x + (r() - 0.5) * 8; c.z = sp.z + 16; c.heading = Math.round(r() * 4) * Math.PI / 2;
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
    b.x = sp.x + (r() - 0.5) * 12; b.z = sp.z - 14; b.heading = Math.round(r() * 4) * Math.PI / 2;
    b.speed = 0; b.vx = 0; b.vz = 0; b.colHex = colHex; b.occupant = null; b.roll = 0; b.pitch = 0; b.type = 'bike';
    b.group.position.set(b.x, 0, b.z); b.group.rotation.y = b.heading;
    scene.add(b.group); cars.push(b);
  }
})();
// ---------- helicopters ----------
(function spawnHelis() {
  for (const s of [{ x: 60, z: 60 }, { x: WORLD.SIZE - 60, z: WORLD.SIZE - 60 }, { x: WORLD.SIZE / 2, z: WORLD.SIZE / 2 }]) {
    const h = makeHeli(0x2c3e57);
    h.x = s.x; h.z = s.z; h.y = 0; h.heading = 0; h.speed = 0; h.vx = 0; h.vz = 0; h.colHex = 0x2c3e57; h.occupant = null; h.roll = 0; h.pitch = 0; h.type = 'heli'; h.rotorSpin = 0;
    h.group.position.set(h.x, 0, h.z); scene.add(h.group); cars.push(h);
  }
})();

// ---------- input ----------
const keys = new Set();
const mouse = { dx: 0, dy: 0, down: false };
let locked = false, captured = false, mouseHeld = false;
addEventListener('keydown', e => { if (captured) return; keys.add(e.code); if (['Tab', 'Space', 'KeyF'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => keys.delete(e.code));
canvas.addEventListener('mousedown', e => { if (captured) return; if (!locked) { canvas.requestPointerLock(); return; } if (e.button === 0) mouse.down = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
addEventListener('mousemove', e => { if (locked && !captured) { mouse.dx += e.movementX; mouse.dy += e.movementY; } });
document.addEventListener('pointerlockchange', () => locked = document.pointerLockElement === canvas);
canvas.addEventListener('contextmenu', e => e.preventDefault());
const axisX = () => (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
const axisY = () => (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);

// ---------- player ----------
const WEAPONS = {
  pistol: { name: 'Pistol', dmg: 18, rof: 0.30, auto: false, spread: 0.006, pellets: 1, icon: '🔫' },
  smg: { name: 'SMG', dmg: 11, rof: 0.075, auto: true, spread: 0.03, pellets: 1, icon: '🧨' },
  shotgun: { name: 'Shotgun', dmg: 8, rof: 0.7, auto: false, spread: 0.07, pellets: 7, icon: '💥' },
  rifle: { name: 'Rifle', dmg: 24, rof: 0.12, auto: true, spread: 0.015, pellets: 1, icon: '🪖' },
  rpg: { name: 'RPG', dmg: 120, rof: 1.1, auto: false, spread: 0, pellets: 1, icon: '🚀', rocket: true },
};
const WORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'rpg'];
const me = {
  id: null, name: 'Player', colorHex: 0x3aa0ff,
  pos: new THREE.Vector3(60, 0, 40), heading: 0, vy: 0, onGround: true,
  hp: 100, alive: true, kills: 0, inCar: null, aiming: false, walkT: 0, shootCd: 0, fp: false,
  weapon: 'pistol', ammo: { pistol: Infinity, smg: 0, shotgun: 0, rifle: 0, rpg: 0 },
  wanted: 0, heat: 0, lastCrime: 0,
  look: { shirt: '#3aa0ff', skin: '#e0ac69', hair: '#20140d', pants: '#2c3e50', hat: false },
  char: null,
};
const hx2i = v => (v ? parseInt(v.slice(1), 16) : undefined);
function charFromLook(lk, fallback) { lk = lk || {}; return makeChar(hx2i(lk.shirt) ?? hx2i(fallback) ?? 0x3aa0ff, { skin: hx2i(lk.skin), hair: hx2i(lk.hair), pants: hx2i(lk.pants), hat: !!lk.hat }); }
function buildChar() { return charFromLook(me.look); }
me.char = buildChar(); scene.add(me.char.group);
let camYaw = 0, camPitch = 0.3, camPivot = null;
const SENS = 0.0024;

function spawnMe(x, z) { me.pos.set(x, 0, z); me.alive = true; me.hp = 100; if (me.inCar) { me.inCar.occupant = null; me.inCar = null; } me.char.group.visible = true; camPivot = null; }

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
  c.pitch = THREE.MathUtils.lerp(c.pitch || 0, -thr * 0.22, 0.1);
  c.roll = THREE.MathUtils.lerp(c.roll || 0, -steer * 0.3, 0.1);
  c.speed = Math.hypot(c.vx, c.vz);
  c.group.position.set(c.x, c.y, c.z);
  c.group.rotation.set(c.pitch, c.heading, c.roll);
}

// ---- vehicle impacts: run people over + crash into other cars ----
function vehicleHits(c, dt) {
  const sp = Math.hypot(c.vx, c.vz);
  if (sp > 4.5) for (const pd of peds) if (pd.alive && Math.hypot(pd.x - c.x, pd.z - c.z) < 2.2) { pd.die(); blood(new THREE.Vector3(pd.x, 1, pd.z)); crime(3); shake = Math.max(shake, 0.22); }
  const rad = c.type === 'bike' ? 1.5 : 2.4;
  for (const o of cars) {
    if (o === c || o.type === 'heli') continue;
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz) || 1, minD = rad + (o.type === 'bike' ? 1.5 : 2.4);
    if (d < minD) { const nx = dx / d, nz = dz / d, push = minD - d; o.x += nx * push; o.z += nz * push; o.vx = (o.vx || 0) + nx * sp * 0.6; o.vz = (o.vz || 0) + nz * sp * 0.6; c.vx -= nx * sp * 0.3; c.vz -= nz * sp * 0.3; c.x -= nx * push * 0.4; c.z -= nz * push * 0.4; o.group.position.set(o.x, 0, o.z); if (sp > 6) { shake = Math.max(shake, 0.3); screech(); } }
  }
  for (const t of traffic) {
    const dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz) || 1, minD = rad + 2.4;
    if (d < minD) { const nx = dx / d, nz = dz / d, push = minD - d; t.x += nx * push; t.z += nz * push; t.kx = nx * sp * 1.5; t.kz = nz * sp * 1.5; t.knockT = 0.7; c.vx -= nx * sp * 0.32; c.vz -= nz * sp * 0.32; if (sp > 6) { shake = Math.max(shake, 0.3); screech(); } }
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
  // mouse look
  camYaw -= mouse.dx * SENS; camPitch = THREE.MathUtils.clamp(camPitch - mouse.dy * SENS, -0.5, 1.1);
  mouse.dx = 0; mouse.dy = 0;
  if (!me.alive) { updateCamera(dt); return; }

  me.aiming = false;
  if (me.inCar) {
    const v = me.inCar;
    if (v.type === 'heli') {
      driveHeli(v, dt);
      me.pos.set(v.x, v.y, v.z); me.heading = v.heading;
      me.char.group.visible = false;
    } else {
      driveCar(v, dt);
      vehicleHits(v, dt);
      me.pos.set(v.x, 0, v.z); me.heading = v.heading;
      if (v.drift > 0.5) screech();
      if (v.type === 'bike') showRider(v); else me.char.group.visible = false;
    }
  } else {
    const fwd = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw)); // screen-right
    const md = new THREE.Vector3().addScaledVector(fwd, axisY()).addScaledVector(right, axisX());
    const moving = md.lengthSq() > 0.01; if (moving) md.normalize();
    me.aiming = mouse.down;
    const spd = (keys.has('ShiftLeft') && !me.aiming ? 9 : 5) * (me.turbo ? 2.2 : 1);
    me.pos.addScaledVector(md, spd * dt);
    // jump/gravity
    if (me.onGround && keys.has('Space')) { me.vy = 8; me.onGround = false; }
    me.vy -= 24 * dt; me.pos.y += me.vy * dt; if (me.pos.y <= 0) { me.pos.y = 0; me.vy = 0; me.onGround = true; }
    const [rx, rz] = resolve(me.pos.x, me.pos.z, 0.5); me.pos.x = rx; me.pos.z = rz;
    me.pos.x = THREE.MathUtils.clamp(me.pos.x, 2, WORLD.SIZE - 2); me.pos.z = THREE.MathUtils.clamp(me.pos.z, 2, WORLD.SIZE - 2);
    if (me.aiming) me.heading = camYaw; else if (moving) me.heading = Math.atan2(md.x, md.z);
    me.char.group.position.copy(me.pos); me.char.group.rotation.y = me.heading;
    me.char.group.visible = me.alive && !me.fp;
    me.walkT += dt * (moving ? (keys.has('ShiftLeft') ? 1.5 : 1) : 0);
    me.char.setPose(me.walkT, moving, me.aiming);
    engine(0);
    // weapon switch (1-4, only owned)
    for (let i = 0; i < WORDER.length; i++) if (keys.has('Digit' + (i + 1)) && (WORDER[i] === 'pistol' || me.ammo[WORDER[i]] > 0) && me.weapon !== WORDER[i]) { me.weapon = WORDER[i]; me.shootCd = 0; }
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
}

function updateCamera(dt) {
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
  const heli = me.inCar && me.inCar.type === 'heli';
  const dist = me.inCar ? (heli ? 17 : 11) : (me.aiming ? 5.5 : 7);
  const baseH = me.inCar ? (heli ? 7 : 4.5) : 3.2;          // camera height ABOVE the player
  const headY = me.inCar ? 1.2 : 1.4;
  const right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
  const truePivot = new THREE.Vector3(me.pos.x, me.pos.y + headY, me.pos.z).addScaledVector(right, me.inCar ? 0 : 0.55);
  if (!camPivot || camPivot.distanceToSquared(truePivot) > 400) camPivot = truePivot.clone();
  camPivot.x = THREE.MathUtils.lerp(camPivot.x, truePivot.x, 0.5);
  camPivot.z = THREE.MathUtils.lerp(camPivot.z, truePivot.z, 0.5);
  camPivot.y = THREE.MathUtils.lerp(camPivot.y, truePivot.y, 0.2);
  // ease the camera behind the car automatically
  if (me.inCar) { let d = me.inCar.heading - camYaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; camYaw += d * Math.min(1, dt * 2); }
  // position: behind (horizontal) and above; keep out of buildings
  const back = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  const desired = camPivot.clone().addScaledVector(back, -dist); desired.y = camPivot.y + baseH;
  const [rx, rz] = resolve(desired.x, desired.z, 1.0); desired.x = rx; desired.z = rz;
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
  for (const rp of remotes.values()) if (rp.alive) test(new THREE.Vector3(rp.dx, rp.inCar ? 1.0 : 1.2, rp.dz), rp.inCar ? 2.2 : 1.0, 'player', rp);
  for (const pd of peds) if (pd.alive) test(new THREE.Vector3(pd.x, 1.0, pd.z), 0.95, 'ped', pd);
  for (const cp of cops) test(new THREE.Vector3(cp.x, 1.2, cp.z), 2.2, 'cop', cp);
  wray.set(origin, dir); wray.far = bestT;
  const wh = wray.intersectObject(city.group, true)[0];
  if (wh && wh.distance < bestT) best = { type: 'wall', point: wh.point };
  return best;
}
function fire() {
  const w = WEAPONS[me.weapon];
  if (me.ammo[me.weapon] <= 0) { me.shootCd = 0.25; gun(0.3); return; }
  if (me.ammo[me.weapon] !== Infinity) me.ammo[me.weapon]--;
  // crosshair target = where the camera centre-ray hits the world
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const camDir = ray.ray.direction.clone();
  wray.set(camera.position, camDir); wray.far = 300;
  const cw = wray.intersectObject(city.group, true)[0];
  const aim = cw ? cw.point.clone() : camera.position.clone().addScaledVector(camDir, 250);
  const origin = new THREE.Vector3(me.pos.x, me.pos.y + (me.fp ? 1.6 : 1.45), me.pos.z);
  if (w.rocket) { fireRocket(origin, aim); me.shootCd = w.rof; shake = Math.max(shake, 0.3); gun(); net.send({ t: 'shot', x: origin.x, y: origin.z, a: camYaw }); return; }
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
      else if (hit.type === 'cop') { blood(end); hit.ref.hp -= w.dmg; crime(1); if (hit.ref.hp <= 0) { killCop(hit.ref); crime(3); } any = true; }
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

// ---------- rockets (RPG) ----------
const rockets = [];
function fireRocket(origin, aim) {
  const dir = aim.clone().sub(origin).normalize();
  const mesh = makeRocket(); mesh.position.copy(origin).addScaledVector(dir, 1.4); scene.add(mesh);
  rockets.push({ mesh, pos: mesh.position.clone(), dir, speed: 58, life: 4 });
}
function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const rk = rockets[i]; rk.life -= dt;
    rk.pos.addScaledVector(rk.dir, rk.speed * dt);
    rk.mesh.position.copy(rk.pos); rk.mesh.lookAt(rk.pos.clone().add(rk.dir));
    if (Math.random() < 0.8) addSpark(rk.pos.clone(), 0x888888, 1, 1.2);
    let hit = rk.life <= 0 || rk.pos.y <= 0.25;
    const at = (x, y, z, r) => rk.pos.distanceToSquared(new THREE.Vector3(x, y, z)) < r * r;
    if (!hit) for (const pd of peds) if (pd.alive && at(pd.x, 1, pd.z, 2)) { hit = true; break; }
    if (!hit) for (const cp of cops) if (at(cp.x, 1.2, cp.z, 2.5)) { hit = true; break; }
    if (!hit) for (const o of cars) if (o.occupant !== 'me' && o.type !== 'heli' && at(o.x, 1, o.z, 2.6)) { hit = true; break; }
    if (!hit) for (const t of traffic) if (at(t.x, 1, t.z, 2.6)) { hit = true; break; }
    if (!hit) for (const rp of remotes.values()) if (rp.alive && at(rp.dx, 1.2, rp.dz, 2)) { hit = true; break; }
    if (!hit && rk.pos.y < 28 && insideBuilding(rk.pos.x, rk.pos.z)) hit = true;
    if (hit) { explode(rk.pos.clone()); scene.remove(rk.mesh); rockets.splice(i, 1); }
  }
}
function explode(p) {
  const R = 9;
  addSpark(p, 0xffaa33, 28, 17); addSpark(p, 0x552200, 16, 8); addSpark(p, 0xffe066, 14, 11);
  const fl = new THREE.PointLight(0xffaa44, 9, 34); fl.position.copy(p); scene.add(fl); setTimeout(() => scene.remove(fl), 130);
  shake = Math.max(shake, 0.6); boom(p);
  for (const pd of peds) if (pd.alive && Math.hypot(pd.x - p.x, pd.z - p.z) < R) { pd.die(); crime(2); }
  for (const cp of [...cops]) if (Math.hypot(cp.x - p.x, cp.z - p.z) < R) { cp.hp -= 120; crime(1); if (cp.hp <= 0) killCop(cp); }
  for (const t of [...traffic]) if (Math.hypot(t.x - p.x, t.z - p.z) < R) { scene.remove(t.car.group); traffic.splice(traffic.indexOf(t), 1); }
  for (const o of [...cars]) { if (o.occupant === 'me' || o.type === 'heli') continue; if (Math.hypot(o.x - p.x, o.z - p.z) < R) { scene.remove(o.group); cars.splice(cars.indexOf(o), 1); } }
  for (const rp of remotes.values()) if (rp.alive && Math.hypot(rp.dx - p.x, rp.dz - p.z) < R) net.send({ t: 'hit', id: rp.id, dmg: 45 });
  if (!me.god && me.pos.distanceTo(p) < R * 0.6) net.send({ t: 'selfhit', dmg: 20 });
}

function insideBuilding(x, z) { for (const b of buildings) if (Math.abs(x - b.x) < b.w / 2 + 0.4 && Math.abs(z - b.z) < b.d / 2 + 0.4) return true; return false; }

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
  if (x < 4 || z < 4 || x > WORLD.SIZE - 4 || z > WORLD.SIZE - 4 || insideBuilding(x, z)) return false;
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
    if (!insideBuilding(nx, p.z)) p.x = nx; else p.heading += 1.6;
    if (!insideBuilding(p.x, nz)) p.z = nz; else p.heading += 1.6;
    if (p.x < 3 || p.x > WORLD.SIZE - 3 || p.z < 3 || p.z > WORLD.SIZE - 3) p.heading += Math.PI;
    p.x = THREE.MathUtils.clamp(p.x, 3, WORLD.SIZE - 3); p.z = THREE.MathUtils.clamp(p.z, 3, WORLD.SIZE - 3);
    p.char.group.position.set(p.x, 0, p.z); p.char.group.rotation.y = p.heading; p.char.setPose(p.walkT, true, false);
  }
  let guard = 0; while (peds.filter(p => p.alive).length < 22 && guard++ < 6) if (!spawnPed()) break;
}

// ---------- traffic ----------
const traffic = [];
const TCOL = [0xe74c3c, 0x2980b9, 0x27ae60, 0xf1c40f, 0xecf0f1, 0x34495e, 0xe67e22, 0x8e44ad];
(function spawnTraffic() {
  for (let i = 0; i < 12; i++) {
    const onX = Math.random() < 0.5, lane = Math.max(1, (Math.random() * (WORLD.GRID - 1) | 0)) * WORLD.BLOCK, o = Math.random() * WORLD.SIZE;
    const colHex = TCOL[i % TCOL.length]; const car = makeCar(colHex); const x = onX ? o : lane, z = onX ? lane : o;
    car.group.position.set(x, 0, z); scene.add(car.group);
    traffic.push({ car, colHex, x, z, axis: onX ? 'x' : 'z', dir: Math.random() < 0.5 ? 1 : -1, lane, speed: 8 + Math.random() * 8, turnT: 2 + Math.random() * 4 });
  }
})();
function updateTraffic(dt) {
  for (const t of traffic) {
    if (t.knockT > 0) {                                // got hit — tumble out before resuming the lane
      t.knockT -= dt; t.x = THREE.MathUtils.clamp(t.x + t.kx * dt, 4, WORLD.SIZE - 4); t.z = THREE.MathUtils.clamp(t.z + t.kz * dt, 4, WORLD.SIZE - 4);
      t.kx *= 0.9; t.kz *= 0.9; t.car.group.position.set(t.x, 0, t.z); t.car.group.rotation.y += dt * 4;
      if (t.knockT <= 0) t.lane = Math.round((t.axis === 'x' ? t.z : t.x) / WORLD.BLOCK) * WORLD.BLOCK;
      continue;
    }
    t.turnT -= dt;
    if (Math.hypot(t.x - me.pos.x, t.z - me.pos.z) > 150) { const a = Math.random() * Math.PI * 2, nx = me.pos.x + Math.cos(a) * 95, nz = me.pos.z + Math.sin(a) * 95, onX = Math.random() < 0.5; t.axis = onX ? 'x' : 'z'; t.lane = Math.round((onX ? nz : nx) / WORLD.BLOCK) * WORLD.BLOCK; t.x = onX ? nx : t.lane; t.z = onX ? t.lane : nz; t.dir = Math.random() < 0.5 ? 1 : -1; }
    if (t.turnT <= 0) { t.turnT = 3 + Math.random() * 4; if (Math.random() < 0.5) { t.axis = t.axis === 'x' ? 'z' : 'x'; t.lane = Math.round((t.axis === 'x' ? t.z : t.x) / WORLD.BLOCK) * WORLD.BLOCK; t.dir = Math.random() < 0.5 ? 1 : -1; } }
    if (t.axis === 'x') { t.x += t.dir * t.speed * dt; t.z = t.lane; if (t.x < 4 || t.x > WORLD.SIZE - 4) { t.dir *= -1; t.x = THREE.MathUtils.clamp(t.x, 4, WORLD.SIZE - 4); } t.car.group.rotation.y = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { t.z += t.dir * t.speed * dt; t.x = t.lane; if (t.z < 4 || t.z > WORLD.SIZE - 4) { t.dir *= -1; t.z = THREE.MathUtils.clamp(t.z, 4, WORLD.SIZE - 4); } t.car.group.rotation.y = t.dir > 0 ? 0 : Math.PI; }
    t.lane = THREE.MathUtils.clamp(t.lane, WORLD.BLOCK, WORLD.SIZE - WORLD.BLOCK);
    t.car.group.position.set(t.x, 0, t.z);
    for (const w of t.car.wheels) w.rotation.x += t.speed * dt * 2;
  }
}

// ---------- cops + wanted ----------
const cops = []; let copShoot = 0;
function spawnCop() { const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 30, x = me.pos.x + Math.cos(a) * d, z = me.pos.z + Math.sin(a) * d; const car = makeCar(0x1a2740, true); car.group.position.set(x, 0, z); scene.add(car.group); cops.push({ car, x, z, heading: 0, vx: 0, vz: 0, hp: 60 }); }
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
    if (insideBuilding(nx, cp.z)) { cp.vx *= -0.3; nx = cp.x; } if (insideBuilding(cp.x, nz)) { cp.vz *= -0.3; nz = cp.z; }
    cp.x = THREE.MathUtils.clamp(nx, 3, WORLD.SIZE - 3); cp.z = THREE.MathUtils.clamp(nz, 3, WORLD.SIZE - 3); cp.heading = Math.atan2(dx, dz);
    cp.car.group.position.set(cp.x, 0, cp.z); cp.car.group.rotation.y = cp.heading;
    for (const w of cp.car.wheels) w.rotation.x += d * dt * 0.1;
    if (cp.car.lightbar) { const f = Math.sin(performance.now() / 120) > 0; cp.car.lightbar.userData.red.material.emissiveIntensity = f ? 2 : 0.2; cp.car.lightbar.userData.blue.material.emissiveIntensity = f ? 0.2 : 2; }
    if (canShoot && d < 42 && me.alive) { addTracer(new THREE.Vector3(cp.x, 1.4, cp.z), new THREE.Vector3(me.pos.x, 1.2, me.pos.z)); if (Math.random() < 0.4 && !me.god) net.send({ t: 'selfhit', dmg: 4 + me.wanted * 2 }); }
  }
}

// ---------- pickups ----------
const pickups = [];
function spawnPickups() {
  const types = ['health', 'health', 'smg', 'shotgun', 'rifle', 'rpg'];
  for (let i = 0; i < 18; i++) {
    const sp = city.spawns[(Math.random() * city.spawns.length) | 0] || { x: 60, z: 60 };
    const type = types[i % types.length], col = type === 'health' ? 0x2ecc71 : type === 'smg' ? 0xf39c12 : type === 'shotgun' ? 0xe74c3c : type === 'rpg' ? 0x9b59b6 : 0x3498db;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.45, flatShading: true }));
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
      else { me.ammo[p.type] = (me.ammo[p.type] || 0) + (p.type === 'shotgun' ? 24 : p.type === 'rifle' ? 90 : p.type === 'rpg' ? 5 : 120); me.weapon = p.type; notice('Picked up ' + WEAPONS[p.type].name); }
    }
  }
}

// ---------- remote players ----------
const remotes = new Map();
function addRemote(o) {
  if (o.id === me.id || remotes.has(o.id)) return;
  const ccHex = parseInt((o.cc || '#cccccc').slice(1), 16);
  const char = charFromLook(o.look, o.color);
  const car = makeCar(ccHex), bike = makeBike(ccHex), heli = makeHeli();
  scene.add(char.group); scene.add(car.group); scene.add(bike.group); scene.add(heli.group);
  car.group.visible = false; bike.group.visible = false; heli.group.visible = false;
  const tag = makeTag(o.name, o.color); scene.add(tag);
  remotes.set(o.id, { id: o.id, name: o.name, color: o.color, char, car, bike, heli, tag, x: o.x, z: o.y, a: o.a, dx: o.x, dz: o.y, da: o.a, vt: o.vt | 0, vy: o.vy || 0, dvy: 0, inCar: !!o.car, alive: o.alive !== false, kills: o.kills | 0, walkT: 0 });
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
    r.x = o.x; r.z = o.y; r.a = o.a; r.inCar = !!o.car; r.vt = o.vt | 0; r.vy = o.vy || 0; r.alive = o.alive !== false; r.kills = o.kills | 0; r.name = o.name; r.car.colHex = o.cc;
  }
}
function updateRemotes(dt) {
  for (const r of remotes.values()) {
    r.dx = THREE.MathUtils.lerp(r.dx, r.x, Math.min(1, dt * 12)); r.dz = THREE.MathUtils.lerp(r.dz, r.z, Math.min(1, dt * 12));
    r.dvy = THREE.MathUtils.lerp(r.dvy || 0, r.vy || 0, Math.min(1, dt * 8));
    let d = r.a - r.da; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; r.da += d * Math.min(1, dt * 12);
    const moved = Math.hypot(r.x - r.dx, r.z - r.dz), vt = r.vt | 0, p = r.char.parts;
    r.car.group.visible = vt === 1 && r.alive; r.bike.group.visible = vt === 2 && r.alive; r.heli.group.visible = vt === 3 && r.alive;
    if (vt === 1) { r.car.group.position.set(r.dx, 0, r.dz); r.car.group.rotation.y = r.da; r.char.group.visible = false; }
    else if (vt === 3) { r.heli.group.position.set(r.dx, r.dvy, r.dz); r.heli.group.rotation.y = r.da; if (r.heli.rotor) r.heli.rotor.rotation.y += dt * 32; r.char.group.visible = false; }
    else if (vt === 2) { r.bike.group.position.set(r.dx, 0, r.dz); r.bike.group.rotation.y = r.da; r.char.group.visible = r.alive; r.char.group.position.set(r.dx, 0.18, r.dz); r.char.group.rotation.set(0, r.da, 0); p.armL.rotation.set(-1.1, 0, 0.2); p.armR.rotation.set(-1.1, 0, -0.2); p.legL.rotation.set(0.5, 0, 0.28); p.legR.rotation.set(0.5, 0, -0.28); }
    else { r.char.group.visible = r.alive; r.char.group.position.set(r.dx, 0, r.dz); r.char.group.rotation.set(0, r.da, 0); p.legL.rotation.z = 0; p.legR.rotation.z = 0; r.walkT += dt * 6; r.char.setPose(r.walkT, moved > 0.02, false); }
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
    case 'leave': { const r = remotes.get(m.id); if (r) { scene.remove(r.char.group); scene.remove(r.car.group); scene.remove(r.bike.group); scene.remove(r.heli.group); scene.remove(r.tag); remotes.delete(m.id); } break; }
    case 'snap': applySnap(m.players); break;
    case 'shot': peerShot(m); break;
    case 'hp': me.hp = m.hp; flash(); shake = Math.max(shake, 0.25); break;
    case 'dead': if (m.id === me.id) { me.alive = false; me.char.group.visible = false; $('dead').classList.add('show'); } break;
    case 'resp': spawnMe(m.x, m.y); $('dead').classList.remove('show'); break;
    case 'kill': notice(`${m.killer} 💀 ${m.victim}`); break;
    case 'kills': me.kills = m.n; break;
    case 'chat': addChat(m.name, m.m, m.color); break;
    case 'notice': notice(m.m); break;
  }
}
function peerShot(m) { const a = new THREE.Vector3(m.x, 1.4, m.y); const b = a.clone().add(new THREE.Vector3(Math.sin(m.a), 0, Math.cos(m.a)).multiplyScalar(40)); addTracer(a, b); muzzle(a); if (a.distanceTo(me.pos) < 80) gun(0.4); }
let sendAcc = 0;
function netTick(dt) { sendAcc += dt; if (sendAcc > 1 / 15 && me.id) { sendAcc = 0; const vt = me.inCar ? (me.inCar.type === 'bike' ? 2 : me.inCar.type === 'heli' ? 3 : 1) : 0; net.send({ t: 'state', x: me.pos.x, y: me.pos.z, a: me.heading, car: me.inCar ? 1 : 0, vt, vy: vt === 3 ? me.pos.y : 0, cc: '#' + (me.inCar ? me.inCar.colHex : 0xcccccc).toString(16).padStart(6, '0') }); } }

// ---------- audio ----------
let AC = null, eng = null;
function aInit() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); }
function gun(v = 1) { if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(); o.type = 'square'; o.frequency.setValueAtTime(300, AC.currentTime); o.frequency.exponentialRampToValueAtTime(70, AC.currentTime + 0.09); g.gain.value = 0.12 * v; g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.1); o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.1); }
function screech() { if (!AC || screech._t && AC.currentTime - screech._t < 0.2) return; screech._t = AC.currentTime; const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sawtooth'; o.frequency.value = 900; g.gain.value = 0.04; g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.2); o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.2); }
function engine() { if (eng) { try { eng.g.gain.value = 0; eng.o.stop(); } catch {} eng = null; } } // engine sound removed
function boom() { if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(130, AC.currentTime); o.frequency.exponentialRampToValueAtTime(28, AC.currentTime + 0.45); g.gain.value = 0.3; g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.55); o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.55); const n = AC.createOscillator(), ng = AC.createGain(); n.type = 'square'; n.frequency.value = 70; ng.gain.value = 0.14; ng.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.28); n.connect(ng); ng.connect(AC.destination); n.start(); n.stop(AC.currentTime + 0.28); }

// ---------- HUD ----------
const $ = id => document.getElementById(id);
// ---- map (M) ----
const mapcv = document.getElementById('map'), mctx = mapcv.getContext('2d');
function toggleMap() { mapOpen = !mapOpen; $('map').classList.toggle('show', mapOpen); $('maphint').classList.toggle('show', mapOpen); if (mapOpen) { mapcv.width = innerWidth; mapcv.height = innerHeight; document.exitPointerLock(); } }
addEventListener('keydown', e => { if (e.code === 'Escape' && mapOpen) toggleMap(); });
function drawMap() {
  const W = mapcv.width, H = mapcv.height, S = WORLD.SIZE, margin = 70;
  const scale = Math.min(W - margin * 2, H - margin * 2) / S;
  const ox = (W - S * scale) / 2, oy = (H - S * scale) / 2;
  const tx = wx => ox + wx * scale, tz = wz => oy + wz * scale;
  mctx.fillStyle = 'rgba(8,12,18,.92)'; mctx.fillRect(0, 0, W, H);
  mctx.fillStyle = '#1c5e7a'; mctx.fillRect(ox - 50, oy - 50, S * scale + 100, S * scale + 100);
  mctx.fillStyle = '#cbb98a'; mctx.fillRect(ox - 22 * scale, oy - 22 * scale, (S + 44) * scale, (S + 44) * scale);
  mctx.fillStyle = '#2b2e36'; mctx.fillRect(ox, oy, S * scale, S * scale);
  mctx.strokeStyle = 'rgba(255,255,255,.06)'; mctx.lineWidth = 1;
  for (let g = 0; g <= WORLD.GRID; g++) { const c = g * WORLD.BLOCK; mctx.beginPath(); mctx.moveTo(tx(c), oy); mctx.lineTo(tx(c), oy + S * scale); mctx.stroke(); mctx.beginPath(); mctx.moveTo(ox, tz(c)); mctx.lineTo(ox + S * scale, tz(c)); mctx.stroke(); }
  mctx.fillStyle = '#565b6b'; for (const b of buildings) mctx.fillRect(tx(b.x - b.w / 2), tz(b.z - b.d / 2), Math.max(1, b.w * scale), Math.max(1, b.d * scale));
  mctx.fillStyle = '#dfe4ec'; for (const c of cars) if (!c.occupant) mctx.fillRect(tx(c.x) - 2, tz(c.z) - 2, 4, 4);
  mctx.fillStyle = '#aab2c0'; for (const t of traffic) mctx.fillRect(tx(t.x) - 2, tz(t.z) - 2, 4, 4);
  mctx.fillStyle = '#7aa86a'; for (const p of peds) if (p.alive) mctx.fillRect(tx(p.x) - 1.5, tz(p.z) - 1.5, 3, 3);
  mctx.fillStyle = '#3a7bff'; for (const c of cops) { mctx.beginPath(); mctx.arc(tx(c.x), tz(c.z), 4, 0, Math.PI * 2); mctx.fill(); }
  for (const r of remotes.values()) { if (!r.alive) continue; mctx.fillStyle = r.color || '#fff'; mctx.beginPath(); mctx.arc(tx(r.dx), tz(r.dz), 5, 0, Math.PI * 2); mctx.fill(); }
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
  $('wammo').textContent = me.ammo[me.weapon] === Infinity ? '∞' : (me.ammo[me.weapon] | 0);
  const sc = $('stars').children; for (let i = 0; i < sc.length; i++) sc[i].classList.toggle('on', i < me.wanted);
  let near = false;
  if (!me.inCar) { for (const c of cars) if (!c.occupant && Math.hypot(c.x - me.pos.x, c.z - me.pos.z) < 6) { near = true; break; } if (!near) for (const t of traffic) if (Math.hypot(t.x - me.pos.x, t.z - me.pos.z) < 6) { near = true; break; } }
  const hint = $('hint'); hint.style.display = (me.inCar || near) ? 'block' : 'none'; hint.textContent = me.inCar ? 'F — exit car' : 'F — enter car';
  if (keys.has('Tab')) { renderScores(); $('scores').classList.add('show'); } else $('scores').classList.remove('show');
}
function renderScores() { const rows = [{ name: me.name, kills: me.kills, color: '#' + me.colorHex.toString(16).padStart(6, '0'), me: 1 }, ...[...remotes.values()].map(r => ({ name: r.name, kills: r.kills, color: r.color }))]; rows.sort((a, b) => b.kills - a.kills); $('scores').innerHTML = '<div class="sh">SCORES</div>' + rows.map(r => `<div class="sr${r.me ? ' me' : ''}"><span style="color:${r.color}">${esc(r.name)}</span><span>${r.kills}</span></div>`).join(''); }

// chat
const chat = $('chatinput');
addEventListener('keydown', e => { if (e.code === 'Enter' && !captured && playing) { captured = true; chat.classList.add('show'); chat.focus(); document.exitPointerLock(); e.preventDefault(); } });
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
function enterVehicle(c) { if (me.inCar) { me.inCar.occupant = null; } c.occupant = 'me'; me.inCar = c; me.char.group.visible = c.type === 'bike' && !me.fp; }
function applyCheat(raw) {
  const cmd = String(raw || '').trim().toLowerCase(); if (!cmd) return;
  switch (cmd) {
    case 'help': case '?': notice('health · guns · rpg · god · wanted · stars · car · bike · heli · speed · boom'); break;
    case 'health': case 'hp': case 'heal': me.hp = 100; me.alive = true; net.send({ t: 'cheat', key: OWNER_KEY }); notice('❤ Full health'); break;
    case 'guns': case 'weapons': for (const w of WORDER) me.ammo[w] = w === 'pistol' ? Infinity : 999; notice('🔫 All weapons + ammo'); break;
    case 'ammo': for (const w of WORDER) if (me.ammo[w] !== Infinity) me.ammo[w] = 999; notice('Ammo refilled'); break;
    case 'god': case 'godmode': me.god = !me.god; notice('🛡 God mode ' + (me.god ? 'ON' : 'OFF')); break;
    case 'wanted': case 'clean': case 'lawful': me.wanted = 0; me.heat = 0; notice('Wanted cleared'); break;
    case 'stars': case 'star': case 'heat': me.heat = 36; me.wanted = 5; me.lastCrime = performance.now(); notice('★★★★★ 5 stars'); break;
    case 'car': case 'vehicle': case 'spawncar': enterVehicle(giveCar()); notice('🚗 Car spawned'); break;
    case 'bike': case 'moto': case 'motorcycle': enterVehicle(giveBike()); notice('🏍 Bike spawned'); break;
    case 'heli': case 'helicopter': case 'chopper': enterVehicle(giveHeli()); notice('🚁 Heli — Space up, Shift down, W fwd'); break;
    case 'rpg': case 'rocket': case 'launcher': me.ammo.rpg = Math.max(me.ammo.rpg, 10); me.weapon = 'rpg'; notice('🚀 RPG +10'); break;
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
function rebuildMe() { const vis = me.char ? me.char.group.visible : true; if (me.char) scene.remove(me.char.group); me.char = buildChar(); me.char.group.position.copy(me.pos); me.char.group.visible = vis; scene.add(me.char.group); }
$('play').onclick = () => { me.name = ($('name').value || 'Player').slice(0, 14); aInit(); net.connect(); net.send({ t: 'join', name: me.name, color: me.look.shirt, look: me.look }); $('menu').style.display = 'none'; $('hud').style.display = 'block'; playing = true; };
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') $('play').click(); });
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
  if (playing) { updatePlayer(dt); updatePeds(dt); updateTraffic(dt); updateCops(dt); updatePickups(dt); updateWanted(dt); updateRemotes(dt); updateRockets(dt); updateFx(dt); netTick(dt); updateHud(); if (mapOpen) drawMap(); }
  else { menuA += dt * 0.1; camera.position.set(WORLD.SIZE / 2 + Math.cos(menuA) * 90, 70, WORLD.SIZE / 2 + Math.sin(menuA) * 90); camera.lookAt(WORLD.SIZE / 2, 8, WORLD.SIZE / 2); updateFx(dt); }
  renderer.render(scene, camera);
  if (!playing) renderPreview(dt);
}
spawnPickups();
loop();
window.__G = { me, cars, remotes, peds, traffic, cops, pickups, keys, scene, camera, renderer, WEAPONS, updatePlayer, updatePeds, updateCops, toggleCar, fire, driveCar, driveHeli, vehicleHits, crime, toggleMap, drawMap, mapcv, applyCheat, giveCar, giveBike, giveHeli, enterVehicle, rockets, updateRockets, fireRocket, explode, updateRemotes, render: () => renderer.render(scene, camera) };
