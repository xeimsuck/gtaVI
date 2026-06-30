// =====================================================================
//  VICE 3D — stylized low-poly third-person multiplayer sandbox.
//  Drive, shoot, mess around with friends. Browser + WebSocket relay.
// =====================================================================
import * as THREE from 'three';
import { makeCity, makeCar, makeChar, WORLD } from './build.js';

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
    c.speed = 0; c.vx = 0; c.vz = 0; c.colHex = colHex; c.occupant = null; c.roll = 0; c.pitch = 0;
    c.group.position.set(c.x, 0, c.z); c.group.rotation.y = c.heading;
    scene.add(c.group); cars.push(c);
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
};
const WORDER = ['pistol', 'smg', 'shotgun', 'rifle'];
const me = {
  id: null, name: 'Player', colorHex: 0x3aa0ff,
  pos: new THREE.Vector3(60, 0, 40), heading: 0, vy: 0, onGround: true,
  hp: 100, alive: true, kills: 0, inCar: null, aiming: false, walkT: 0, shootCd: 0, fp: false,
  weapon: 'pistol', ammo: { pistol: Infinity, smg: 0, shotgun: 0, rifle: 0 },
  wanted: 0, heat: 0, lastCrime: 0,
  char: null,
};
me.char = makeChar(me.colorHex); scene.add(me.char.group);
let camYaw = 0, camPitch = 0.3, camPivot = null;
const SENS = 0.0024;

function spawnMe(x, z) { me.pos.set(x, 0, z); me.alive = true; me.hp = 100; if (me.inCar) { me.inCar.occupant = null; me.inCar = null; } me.char.group.visible = true; camPivot = null; }

let fDown = false, vDown = false;
function toggleCar() {
  if (me.inCar) { const c = me.inCar; c.occupant = null; me.pos.set(c.x + Math.cos(c.heading + Math.PI / 2) * 2.4, 0, c.z + Math.sin(c.heading + Math.PI / 2) * 2.4); me.inCar = null; me.char.group.visible = true; engine(0); return; }
  let best = null, bd = 5;
  for (const c of cars) { if (c.occupant) continue; const d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (d < bd) { bd = d; best = c; } }
  if (best) { best.occupant = 'me'; me.inCar = best; me.char.group.visible = false; }
}

function driveCar(c, dt) {
  const fwd = new THREE.Vector3(Math.sin(c.heading), 0, Math.cos(c.heading));
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  let vF = c.vx * fwd.x + c.vz * fwd.z, vL = c.vx * right.x + c.vz * right.z;
  const thr = axisY(), steer = axisX(), hb = keys.has('Space');
  const accel = 34, top = 46, rev = 18;
  if (thr > 0) vF += accel * dt; else if (thr < 0) vF -= accel * 0.7 * dt;
  if (hb) vF -= vF * 2.2 * dt;
  vF -= vF * (thr === 0 ? 0.7 : 0.12) * dt;
  vF = Math.max(-rev, Math.min(top, vF));
  const grip = hb ? 1.5 : 7;
  vL -= vL * Math.min(1, grip * dt);
  c.vx = fwd.x * vF + right.x * vL; c.vz = fwd.z * vF + right.z * vL;
  const sf = Math.max(-1, Math.min(1, vF / 6));
  c.heading -= steer * 2.4 * dt * sf;
  c.speed = vF; c.drift = Math.min(1, Math.abs(vL) / 6);
  let nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
  [nx, nz] = resolve(nx, nz, 1.6);
  if (Math.hypot(nx - c.x, nz - c.z) < Math.hypot(c.vx, c.vz) * dt * 0.5) { c.vx *= 0.3; c.vz *= 0.3; }
  c.x = Math.max(2, Math.min(WORLD.SIZE - 2, nx)); c.z = Math.max(2, Math.min(WORLD.SIZE - 2, nz));
  c.roll = THREE.MathUtils.lerp(c.roll, steer * sf * 0.12, 0.2);
  c.pitch = THREE.MathUtils.lerp(c.pitch, -thr * 0.05, 0.15);
  c.group.position.set(c.x, 0, c.z);
  c.group.rotation.set(c.pitch, c.heading, c.roll);
  for (const w of c.wheels) w.rotation.x += vF * dt * 2;
}

function updatePlayer(dt) {
  // mouse look
  camYaw -= mouse.dx * SENS; camPitch = THREE.MathUtils.clamp(camPitch - mouse.dy * SENS, -0.5, 1.1);
  mouse.dx = 0; mouse.dy = 0;
  if (!me.alive) { updateCamera(dt); return; }

  me.aiming = false;
  if (me.inCar) {
    driveCar(me.inCar, dt);
    me.pos.set(me.inCar.x, 0, me.inCar.z); me.heading = me.inCar.heading;
    engine(Math.abs(me.inCar.speed) / 46);
    if (me.inCar.drift > 0.5) screech();
  } else {
    const fwd = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw)); // screen-right
    const md = new THREE.Vector3().addScaledVector(fwd, axisY()).addScaledVector(right, axisX());
    const moving = md.lengthSq() > 0.01; if (moving) md.normalize();
    me.aiming = mouse.down;
    const spd = (keys.has('ShiftLeft') && !me.aiming ? 9 : 5);
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
    for (let i = 0; i < 4; i++) if (keys.has('Digit' + (i + 1)) && (WORDER[i] === 'pistol' || me.ammo[WORDER[i]] > 0) && me.weapon !== WORDER[i]) { me.weapon = WORDER[i]; me.shootCd = 0; }
    // shoot (rising-edge for semi-auto, held for auto)
    me.shootCd -= dt;
    const w = WEAPONS[me.weapon];
    const wantFire = w.auto ? mouse.down : (mouse.down && !mouseHeld);
    if (me.aiming && locked && wantFire && me.shootCd <= 0) fire();
  }
  mouseHeld = mouse.down;
  if (keys.has('KeyF') && !fDown) { fDown = true; toggleCar(); } if (!keys.has('KeyF')) fDown = false;
  if (keys.has('KeyV') && !vDown) { vDown = true; me.fp = !me.fp; } if (!keys.has('KeyV')) vDown = false;
  updateCamera(dt);
}

function updateCamera(dt) {
  // ---- first person (on foot): rigid eye camera ----
  if (me.fp && !me.inCar) {
    const cp0 = Math.cos(camPitch), sp0 = Math.sin(camPitch);
    const look0 = new THREE.Vector3(Math.sin(camYaw) * cp0, sp0, Math.cos(camYaw) * cp0);
    const eye = new THREE.Vector3(me.pos.x, 1.62, me.pos.z).addScaledVector(look0, 0.12);
    camera.position.copy(eye);
    camera.lookAt(eye.x + look0.x, eye.y + look0.y, eye.z + look0.z);
    sun.position.set(me.pos.x + 80, 130, me.pos.z + 40); sun.target.position.set(me.pos.x, 0, me.pos.z);
    return;
  }
  const dist = me.inCar ? 11 : (me.aiming ? 5.5 : 7);
  const baseH = me.inCar ? 4.5 : 3.2;          // camera height ABOVE the player
  const headY = me.inCar ? 1.2 : 1.4;
  const right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
  const truePivot = new THREE.Vector3(me.pos.x, headY, me.pos.z).addScaledVector(right, me.inCar ? 0 : 0.55);
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
  const origin = new THREE.Vector3(me.pos.x, me.fp ? 1.6 : 1.45, me.pos.z);
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
    const car = makeCar(TCOL[i % TCOL.length]); const x = onX ? o : lane, z = onX ? lane : o;
    car.group.position.set(x, 0, z); scene.add(car.group);
    traffic.push({ car, x, z, axis: onX ? 'x' : 'z', dir: Math.random() < 0.5 ? 1 : -1, lane, speed: 8 + Math.random() * 8, turnT: 2 + Math.random() * 4 });
  }
})();
function updateTraffic(dt) {
  for (const t of traffic) {
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
    if (canShoot && d < 42 && me.alive) { addTracer(new THREE.Vector3(cp.x, 1.4, cp.z), new THREE.Vector3(me.pos.x, 1.2, me.pos.z)); if (Math.random() < 0.4) net.send({ t: 'selfhit', dmg: 4 + me.wanted * 2 }); }
  }
}

// ---------- pickups ----------
const pickups = [];
function spawnPickups() {
  const types = ['health', 'health', 'smg', 'shotgun', 'rifle'];
  for (let i = 0; i < 18; i++) {
    const sp = city.spawns[(Math.random() * city.spawns.length) | 0] || { x: 60, z: 60 };
    const type = types[i % types.length], col = type === 'health' ? 0x2ecc71 : type === 'smg' ? 0xf39c12 : type === 'shotgun' ? 0xe74c3c : 0x3498db;
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
      else { me.ammo[p.type] = (me.ammo[p.type] || 0) + (p.type === 'shotgun' ? 24 : p.type === 'rifle' ? 90 : 120); me.weapon = p.type; notice('Picked up ' + WEAPONS[p.type].name); }
    }
  }
}

// ---------- remote players ----------
const remotes = new Map();
function addRemote(o) {
  if (o.id === me.id || remotes.has(o.id)) return;
  const char = makeChar(parseInt((o.color || '#3aa0ff').slice(1), 16));
  const car = makeCar(parseInt((o.cc || '#cccccc').slice(1), 16));
  scene.add(char.group); scene.add(car.group); car.group.visible = false;
  const tag = makeTag(o.name, o.color);
  scene.add(tag);
  remotes.set(o.id, { id: o.id, name: o.name, color: o.color, char, car, tag, x: o.x, z: o.y, a: o.a, dx: o.x, dz: o.y, da: o.a, inCar: !!o.car, alive: o.alive !== false, kills: o.kills | 0, walkT: 0 });
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
    r.x = o.x; r.z = o.y; r.a = o.a; r.inCar = !!o.car; r.alive = o.alive !== false; r.kills = o.kills | 0; r.name = o.name; r.car.colHex = o.cc;
  }
}
function updateRemotes(dt) {
  for (const r of remotes.values()) {
    r.dx = THREE.MathUtils.lerp(r.dx, r.x, Math.min(1, dt * 12)); r.dz = THREE.MathUtils.lerp(r.dz, r.z, Math.min(1, dt * 12));
    let d = r.a - r.da; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; r.da += d * Math.min(1, dt * 12);
    const moved = Math.hypot(r.x - r.dx, r.z - r.dz);
    if (r.inCar) { r.car.group.visible = r.alive; r.char.group.visible = false; r.car.group.position.set(r.dx, 0, r.dz); r.car.group.rotation.y = r.da; }
    else { r.car.group.visible = false; r.char.group.visible = r.alive; r.char.group.position.set(r.dx, 0, r.dz); r.char.group.rotation.y = r.da; r.walkT += dt * 6; r.char.setPose(r.walkT, moved > 0.02, false); }
    r.tag.visible = r.alive; r.tag.position.set(r.dx, (r.inCar ? 2.4 : 2.3), r.dz);
  }
}

// ---------- net ----------
class Net { constructor() { this.ws = null; this.q = []; this.open = false; } connect() { const p = location.protocol === 'https:' ? 'wss' : 'ws'; this.ws = new WebSocket(`${p}://${location.host}/ws`); this.ws.onopen = () => { this.open = true; this.q.forEach(m => this.ws.send(m)); this.q = []; }; this.ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); }; this.ws.onclose = () => { this.open = false; setTimeout(() => this.connect(), 1200); }; this.ws.onerror = () => { try { this.ws.close(); } catch {} }; } send(o) { const s = JSON.stringify(o); if (this.open) this.ws.send(s); else this.q.push(s); } }
const net = new Net();
function onMsg(m) {
  switch (m.t) {
    case 'init': me.id = m.id; if (m.you) me.pos.set(m.you.x, 0, m.you.y); for (const o of m.players) addRemote(o); break;
    case 'spawn': addRemote(m.p); break;
    case 'leave': { const r = remotes.get(m.id); if (r) { scene.remove(r.char.group); scene.remove(r.car.group); scene.remove(r.tag); remotes.delete(m.id); } break; }
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
function netTick(dt) { sendAcc += dt; if (sendAcc > 1 / 15 && me.id) { sendAcc = 0; net.send({ t: 'state', x: me.pos.x, y: me.pos.z, a: me.heading, car: me.inCar ? 1 : 0, cc: '#' + (me.inCar ? me.inCar.colHex : 0xcccccc).toString(16).padStart(6, '0') }); } }

// ---------- audio ----------
let AC = null, eng = null;
function aInit() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); }
function gun(v = 1) { if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(); o.type = 'square'; o.frequency.setValueAtTime(300, AC.currentTime); o.frequency.exponentialRampToValueAtTime(70, AC.currentTime + 0.09); g.gain.value = 0.12 * v; g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.1); o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.1); }
function screech() { if (!AC || screech._t && AC.currentTime - screech._t < 0.2) return; screech._t = AC.currentTime; const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sawtooth'; o.frequency.value = 900; g.gain.value = 0.04; g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.2); o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.2); }
function engine(level) { if (!AC) return; if (level > 0.01 && !eng) { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sawtooth'; o.frequency.value = 60; g.gain.value = 0; o.connect(g); g.connect(AC.destination); o.start(); eng = { o, g }; } if (eng) { eng.o.frequency.value = 55 + level * 130; eng.g.gain.value = level > 0.01 ? 0.04 + level * 0.05 : 0; } }

// ---------- HUD ----------
const $ = id => document.getElementById(id);
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
  let near = false; if (!me.inCar) for (const c of cars) if (!c.occupant && Math.hypot(c.x - me.pos.x, c.z - me.pos.z) < 5) { near = true; break; }
  const hint = $('hint'); hint.style.display = (me.inCar || near) ? 'block' : 'none'; hint.textContent = me.inCar ? 'F — exit car' : 'F — enter car';
  if (keys.has('Tab')) { renderScores(); $('scores').classList.add('show'); } else $('scores').classList.remove('show');
}
function renderScores() { const rows = [{ name: me.name, kills: me.kills, color: '#' + me.colorHex.toString(16).padStart(6, '0'), me: 1 }, ...[...remotes.values()].map(r => ({ name: r.name, kills: r.kills, color: r.color }))]; rows.sort((a, b) => b.kills - a.kills); $('scores').innerHTML = '<div class="sh">SCORES</div>' + rows.map(r => `<div class="sr${r.me ? ' me' : ''}"><span style="color:${r.color}">${esc(r.name)}</span><span>${r.kills}</span></div>`).join(''); }

// chat
const chat = $('chatinput');
addEventListener('keydown', e => { if (e.code === 'Enter' && !captured && playing) { captured = true; chat.classList.add('show'); chat.focus(); document.exitPointerLock(); e.preventDefault(); } });
chat.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { const v = chat.value.trim(); if (v) net.send({ t: 'chat', m: v }); chat.value = ''; captured = false; chat.classList.remove('show'); chat.blur(); } else if (e.key === 'Escape') { chat.value = ''; captured = false; chat.classList.remove('show'); chat.blur(); } });

// ---------- menu ----------
let playing = false;
const COLORS = ['#3aa0ff', '#ff4d6d', '#36c2bd', '#9b59ff', '#ff8a3c', '#2ecc71', '#ffd83a', '#ffffff'];
(function () { const w = $('colors'); COLORS.forEach((c, i) => { const d = document.createElement('div'); d.className = 'sw' + (i === 0 ? ' on' : ''); d.style.background = c; d.onclick = () => { w.querySelectorAll('.sw').forEach(s => s.classList.remove('on')); d.classList.add('on'); me.colorHex = parseInt(c.slice(1), 16); rebuildMe(c); }; w.appendChild(d); }); })();
function rebuildMe(c) { scene.remove(me.char.group); me.char = makeChar(parseInt(c.slice(1), 16)); me.char.group.position.copy(me.pos); scene.add(me.char.group); }
$('play').onclick = () => { me.name = ($('name').value || 'Player').slice(0, 14); aInit(); net.connect(); net.send({ t: 'join', name: me.name, color: '#' + me.colorHex.toString(16).padStart(6, '0') }); $('menu').style.display = 'none'; $('hud').style.display = 'block'; playing = true; };
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') $('play').click(); });
function poll() { fetch('/info').then(r => r.json()).then(d => $('online').textContent = d.players).catch(() => {}); }
poll(); setInterval(() => { if (!playing) poll(); }, 4000);

// ---------- loop ----------
const clock = new THREE.Clock();
let menuA = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  if (playing) { updatePlayer(dt); updatePeds(dt); updateTraffic(dt); updateCops(dt); updatePickups(dt); updateWanted(dt); updateRemotes(dt); updateFx(dt); netTick(dt); updateHud(); }
  else { menuA += dt * 0.1; camera.position.set(WORLD.SIZE / 2 + Math.cos(menuA) * 90, 70, WORLD.SIZE / 2 + Math.sin(menuA) * 90); camera.lookAt(WORLD.SIZE / 2, 8, WORLD.SIZE / 2); updateFx(dt); }
  renderer.render(scene, camera);
}
spawnPickups();
loop();
window.__G = { me, cars, remotes, peds, traffic, cops, pickups, keys, scene, camera, renderer, WEAPONS, updatePlayer, updatePeds, updateCops, toggleCar, fire, driveCar, crime, render: () => renderer.render(scene, camera) };
