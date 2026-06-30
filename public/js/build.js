// =====================================================================
//  Mesh factories for a STYLIZED low-poly 3D city. Flat shading + a
//  cohesive palette + good proportions is what makes simple geometry
//  read as an intentional art style instead of "ugly boxes".
// =====================================================================
import * as THREE from 'three';

function mul(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const STD = (color, o = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.78, metalness: 0.0, ...o });

// cohesive warm-pastel facade palette (Vice-ish but tasteful)
const FACADES = [0xd98c8c, 0xe0b07e, 0xa9c2d4, 0xc7b3da, 0x9fc7a6, 0xe6d199, 0xc2b2a2, 0xbf8aa0, 0x86a6c0, 0xd9a679];

export const WORLD = { BLOCK: 40, ROAD: 11, GRID: 12 };
WORLD.SIZE = WORLD.BLOCK * WORLD.GRID;

export function makeCity(scene, seed = 7) {
  const r = mul(seed);
  const g = new THREE.Group();
  const buildings = [];   // {x,z,w,d} footprints for collision
  const spawns = [];
  const B = WORLD.BLOCK, RO = WORLD.ROAD, G = WORLD.GRID, S = WORLD.SIZE;

  // ISLAND: ocean all around, a sand island, the city on top
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(S * 6, S * 6), STD(0x2d7da6, { roughness: 0.25, metalness: 0.4 }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(S / 2, -0.6, S / 2); g.add(ocean);
  const beach = 24;
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(S + beach * 2, S + beach * 2), STD(0xddc89a, { roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(S / 2, -0.03, S / 2); sand.receiveShadow = true; g.add(sand);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(S, S), STD(0x40434a, { roughness: 1 }));
  road.rotation.x = -Math.PI / 2; road.position.set(S / 2, 0, S / 2); road.receiveShadow = true; g.add(road);
  // palms along the beach
  for (let i = 0; i < 56; i++) {
    const side = i % 4, t = (Math.floor(i / 4) / 14) * S, off = 6 + Math.random() * (beach - 9);
    let x, z;
    if (side === 0) { x = t; z = -off; } else if (side === 1) { x = t; z = S + off; } else if (side === 2) { x = -off; z = t; } else { x = S + off; z = t; }
    g.add(makeTree(x, z, Math.random));
  }

  // lot tiles (sidewalk) so the gaps read as a road grid; lane lines
  const lotGeo = new THREE.PlaneGeometry(B - RO, B - RO);
  const lotMat = STD(0x6b6f78, { roughness: 1 });
  const parkMat = STD(0x4f8a46, { roughness: 1 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8b24a });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  for (let gx = 0; gx < G; gx++) for (let gz = 0; gz < G; gz++) {
    const cx = gx * B + B / 2, cz = gz * B + B / 2;
    const park = r() < 0.12;
    const lot = new THREE.Mesh(lotGeo, park ? parkMat : lotMat);
    lot.rotation.x = -Math.PI / 2; lot.position.set(cx, 0.02, cz); lot.receiveShadow = true; g.add(lot);
    if (park) {
      for (let i = 0; i < 4; i++) g.add(makeTree(cx + (r() - 0.5) * (B - RO) * 0.7, cz + (r() - 0.5) * (B - RO) * 0.7, r));
      spawns.push({ x: cx, z: cz });
      continue;
    }
    // buildings
    const downtown = 1 - Math.hypot(cx - S / 2, cz - S / 2) / (S * 0.7);
    const inner = (B - RO) * 0.84;
    const place = (ox, oz, w, d) => {
      let h = 7 + Math.pow(r(), 1.7) * (12 + Math.max(0, downtown) * 60);
      const col = FACADES[(r() * FACADES.length) | 0];
      const m = new THREE.Mesh(boxGeo, STD(col));
      m.position.set(cx + ox, h / 2, cz + oz); m.scale.set(w, h, d); m.castShadow = true; m.receiveShadow = true; g.add(m);
      // darker roof slab + a window band
      const roof = new THREE.Mesh(boxGeo, STD(0x3c3f47)); roof.position.set(cx + ox, h + 0.4, cz + oz); roof.scale.set(w * 0.96, 0.8, d * 0.96); roof.castShadow = true; g.add(roof);
      if (h > 12) { const band = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x223, emissive: 0x335, emissiveIntensity: 0.5, flatShading: true })); band.position.set(cx + ox, h * 0.6, cz + oz + d / 2 + 0.05); band.scale.set(w * 0.8, h * 0.5, 0.1); g.add(band); }
      buildings.push({ x: cx + ox, z: cz + oz, w, d });
    };
    const style = r();
    if (style < 0.5) place(0, 0, inner * (0.7 + r() * 0.25), inner * (0.7 + r() * 0.25));
    else if (style < 0.8) { const w = inner * 0.44; place(-inner * 0.24, 0, w, inner * 0.86); place(inner * 0.24, 0, w, inner * 0.86); }
    else { const w = inner * 0.42, d = inner * 0.42; for (const sx of [-1, 1]) for (const sz of [-1, 1]) place(sx * inner * 0.24, sz * inner * 0.24, w, d); }
    // street props on the sidewalk edges
    if (r() < 0.6) g.add(makeLamp(cx + (B - RO) / 2 + 2.2, cz - 7));
    if (r() < 0.3) g.add(makeHydrant(cx - (B - RO) / 2 - 1.6, cz + 6));
    if (r() < 0.2) g.add(makeBench(cx + 6, cz + (B - RO) / 2 + 2.2));
  }

  // dashed lane lines along road centre-lines
  for (let i = 1; i < G; i++) {
    for (let t = 0; t < S; t += 8) {
      const a = new THREE.Mesh(boxGeo, lineMat); a.position.set(i * B, 0.04, t + 2); a.scale.set(0.4, 0.02, 3); g.add(a);
      const b = new THREE.Mesh(boxGeo, lineMat); b.position.set(t + 2, 0.04, i * B); b.scale.set(3, 0.02, 0.4); g.add(b);
    }
  }

  scene.add(g);
  return { group: g, buildings, spawns };
}

function makeLamp(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 5, 6), STD(0x3a3d44)); pole.position.y = 2.5; pole.castShadow = true; g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.15), STD(0x3a3d44)); arm.position.set(0.5, 4.9, 0); g.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.4), new THREE.MeshStandardMaterial({ color: 0x4a4030, emissive: 0xffd27a, emissiveIntensity: 0.7 })); head.position.set(1.0, 4.8, 0); g.add(head);
  g.position.set(x, 0, z); return g;
}
function makeHydrant(x, z) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.8, 8), STD(0xc0392b)); m.position.set(x, 0.4, z); m.castShadow = true; return m; }
function makeBench(x, z) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.6), STD(0x7a5a36)); seat.position.y = 0.5; seat.castShadow = true; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.12), STD(0x7a5a36)); back.position.set(0, 0.8, -0.24); g.add(back);
  g.position.set(x, 0, z); return g;
}
function makeTree(x, z, r) {
  const t = new THREE.Group();
  const h = 2.5 + r() * 1.5;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, h, 6), STD(0x6b4a2a));
  trunk.position.y = h / 2; trunk.castShadow = true; t.add(trunk);
  const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 + r() * 0.5, 0), STD(0x3f7d36));
  leaf.position.y = h + 0.6; leaf.castShadow = true; t.add(leaf);
  t.position.set(x, 0, z);
  return t;
}

// ---------- car ----------
export function makeCar(color = 0xd23b3b, police = false) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.2), STD(color, { roughness: 0.5, metalness: 0.2 }));
  body.position.y = 0.65; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.0), STD(color, { roughness: 0.5, metalness: 0.2 }));
  cabin.position.set(0, 1.15, -0.15); cabin.castShadow = true; g.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, 1.85), STD(0x16242e, { roughness: 0.2, metalness: 0.4 }));
  glass.position.set(0, 1.18, -0.15); g.add(glass);
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.1), new THREE.MeshStandardMaterial({ color: 0xfff6cf, emissive: 0xfff0b0, emissiveIntensity: 0.8 }));
  hl.position.set(0, 0.62, 2.1); g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.1), new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.6 }));
  tl.position.set(0, 0.62, -2.1); g.add(tl);
  const wheels = [];
  const wgeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12); wgeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-1.0, 1.3], [1.0, 1.3], [-1.0, -1.3], [1.0, -1.3]]) {
    const w = new THREE.Mesh(wgeo, STD(0x14151a)); w.position.set(x, 0.42, z); w.castShadow = true; g.add(w); wheels.push(w);
  }
  let lightbar = null;
  if (police) {
    lightbar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0xff0000, emissiveIntensity: 1.5 }));
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshStandardMaterial({ color: 0x000044, emissive: 0x2244ff, emissiveIntensity: 1.5 }));
    red.position.x = -0.3; blue.position.x = 0.3; lightbar.add(red, blue);
    lightbar.position.set(0, 1.5, -0.1); lightbar.userData = { red, blue }; g.add(lightbar);
  }
  return { group: g, wheels, lightbar };
}

// ---------- motorcycle ----------
export function makeBike(color = 0x202225) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 1.9), STD(color, { roughness: 0.45, metalness: 0.35 }));
  body.position.y = 0.72; body.castShadow = true; g.add(body);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.32, 0.7), STD(color, { roughness: 0.4, metalness: 0.35 }));
  tank.position.set(0, 0.9, 0.12); g.add(tank);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.85), STD(0x111316)); seat.position.set(0, 0.98, -0.5); g.add(seat);
  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.07, 0.07), STD(0x33363c)); bars.position.set(0, 1.06, 0.78); g.add(bars);
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), STD(0x33363c)); fork.position.set(0, 0.72, 0.86); fork.rotation.x = 0.35; g.add(fork);
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.1), new THREE.MeshStandardMaterial({ color: 0xfff6cf, emissive: 0xfff0b0, emissiveIntensity: 0.8 })); hl.position.set(0, 0.92, 1.0); g.add(hl);
  const wheels = [];
  const wgeo = new THREE.CylinderGeometry(0.44, 0.44, 0.18, 16); wgeo.rotateZ(Math.PI / 2);
  for (const z of [0.98, -0.98]) { const w = new THREE.Mesh(wgeo, STD(0x14151a)); w.position.set(0, 0.44, z); w.castShadow = true; g.add(w); wheels.push(w); }
  return { group: g, wheels, lightbar: null };
}

// ---------- helicopter ----------
export function makeHeli(color = 0x2c3e57) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 3.2), STD(color, { roughness: 0.5, metalness: 0.25 }));
  body.position.y = 1.5; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.15, 1.3), STD(0x16242e, { roughness: 0.2, metalness: 0.45 }));
  nose.position.set(0, 1.55, 1.9); g.add(nose);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 3.2), STD(color)); tail.position.set(0, 1.95, -2.9); tail.castShadow = true; g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.0, 0.7), STD(color)); fin.position.set(0, 2.4, -4.3); g.add(fin);
  for (const x of [-0.85, 0.85]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.6), STD(0x222428)); skid.position.set(x, 0.25, 0.2); g.add(skid);
    for (const z of [0.7, -0.4]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), STD(0x222428)); leg.position.set(x, 0.55, z); g.add(leg); }
  }
  const rotor = new THREE.Group();
  rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.35, 8), STD(0x111316)));
  for (let i = 0; i < 2; i++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 0.42), STD(0x15171c)); blade.rotation.y = i * Math.PI / 2; rotor.add(blade); }
  rotor.position.set(0, 2.95, 0); g.add(rotor);
  const trotor = new THREE.Group();
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.7, 0.22), STD(0x15171c)); b.rotation.z = i * Math.PI / 2; trotor.add(b); }
  trotor.position.set(0.35, 1.95, -4.4); g.add(trotor);
  return { group: g, rotor, trotor, wheels: [] };
}

// ---------- rocket (RPG projectile) ----------
export function makeRocket() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.75, 8), STD(0x556070, { metalness: 0.4 })); b.rotation.x = Math.PI / 2; g.add(b);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.32, 8), new THREE.MeshStandardMaterial({ color: 0xcc3322, emissive: 0x551100, emissiveIntensity: 0.6, flatShading: true })); tip.rotation.x = Math.PI / 2; tip.position.z = 0.52; g.add(tip);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.2), STD(0x333)); fin.position.z = -0.3; g.add(fin);
  const fin2 = fin.clone(); fin2.rotation.z = Math.PI / 2; g.add(fin2);
  return g;
}

// ---------- character ----------
export const SKIN = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5a3a1a];
export const HAIR = [0x20140d, 0x4a2f1a, 0x8a6b2a, 0xc9a23a, 0xb0b0b0, 0x222222, 0xaa3322, 0x6a3aa0];
// shirt = main shirt colour. opts: { skin, hair, pants, hat } (any may be omitted)
export function makeChar(shirt = 0x3aa0ff, opts = {}) {
  const g = new THREE.Group();
  const skin = opts.skin != null ? opts.skin : SKIN[(Math.random() * SKIN.length) | 0];
  const pants = opts.pants != null ? opts.pants : 0x2c3e50;
  const hairCol = opts.hair != null ? opts.hair : 0x20140d;
  const limb = (w, h, d, c) => { const grp = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), STD(c)); m.position.y = -h / 2; m.castShadow = true; grp.add(m); return grp; };
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), STD(shirt)); torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.32), STD(pants)); hips.position.y = 0.74; g.add(hips);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), STD(skin)); head.position.y = 1.72; head.castShadow = true; g.add(head);
  if (opts.hat) {
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.4), STD(hairCol)); crown.position.y = 1.96; crown.castShadow = true; g.add(crown);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.26), STD(hairCol)); brim.position.set(0, 1.9, 0.3); g.add(brim);
  } else {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.36), STD(hairCol)); hair.position.y = 1.9; hair.castShadow = true; g.add(hair);
  }
  const armL = limb(0.15, 0.66, 0.15, shirt); armL.position.set(-0.36, 1.5, 0); g.add(armL);
  const armR = limb(0.15, 0.66, 0.15, shirt); armR.position.set(0.36, 1.5, 0); g.add(armR);
  const legL = limb(0.19, 0.74, 0.2, pants); legL.position.set(-0.14, 0.74, 0); g.add(legL);
  const legR = limb(0.19, 0.74, 0.2, pants); legR.position.set(0.14, 0.74, 0); g.add(legR);
  return {
    group: g, parts: { armL, armR, legL, legR },
    setPose(t, moving, aiming) {
      const s = moving ? Math.sin(t * 9) * 0.8 : 0;
      legL.rotation.x = s; legR.rotation.x = -s;
      if (aiming) { armR.rotation.set(-Math.PI / 2 + 0.1, 0, 0); armL.rotation.set(-Math.PI / 2 + 0.3, 0, 0.2); }
      else { armL.rotation.set(-s * 0.7, 0, 0); armR.rotation.set(s * 0.7, 0, 0); }
    },
  };
}
