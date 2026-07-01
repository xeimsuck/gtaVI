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
// bright shop / awning / neon-sign colours
const SHOPCOL = [0xe74c3c, 0xf39c12, 0x16a085, 0x2980b9, 0x8e44ad, 0xe84393, 0x00b894, 0xff6b6b];

export const WORLD = { BLOCK: 40, ROAD: 11, GRID: 32 };
WORLD.SIZE = WORLD.BLOCK * WORLD.GRID;   // 1280 — two big islands + a bridge, room to breathe
const SKIRT = 6;                         // bury building bottoms this far so they never float over sloped terrain

// a readable text sign (unlit canvas texture on a plane)
function makeSign(text, w, bg, fg) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 72; const x = cv.getContext('2d');
  x.fillStyle = bg || '#15181d'; x.fillRect(0, 0, 256, 72);
  x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 4; x.strokeRect(2, 2, 252, 68);
  x.fillStyle = fg || '#ffffff'; x.font = 'bold 44px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 38);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 72 / 256), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
  return m;
}
// an enterable building: 4 walls with a door gap in the front (+z), flat roof, interior floor
function makeShell(g, buildings, cx, cz, w, d, h, col, base = 0) {
  const BOX = new THREE.BoxGeometry(1, 1, 1), mat = STD(col, { roughness: 0.85 }), t = 0.7, doorW = 5;
  const wall = (x, z, sw, sh, sd) => { const b = new THREE.Mesh(BOX, mat); b.position.set(x, sh / 2 - SKIRT / 2, z); b.scale.set(sw, sh + SKIRT, sd); b.castShadow = true; b.receiveShadow = true; g.add(b); buildings.push({ x, z, w: sw, d: sd, h: sh, base }); };
  wall(cx, cz - d / 2, w, h, t);                     // back
  wall(cx - w / 2, cz, t, h, d);                     // left
  wall(cx + w / 2, cz, t, h, d);                     // right
  const seg = (w - doorW) / 2;                        // front = two pieces, door gap between
  wall(cx - (doorW / 2 + seg / 2), cz + d / 2, seg, h, t);
  wall(cx + (doorW / 2 + seg / 2), cz + d / 2, seg, h, t);
  const lint = new THREE.Mesh(BOX, mat); lint.position.set(cx, h - 0.6, cz + d / 2); lint.scale.set(doorW, 1.2, t); lint.castShadow = true; g.add(lint);
  const roof = new THREE.Mesh(BOX, STD(0x3c3f47)); roof.position.set(cx, h + 0.15, cz); roof.scale.set(w + 0.5, 0.3, d + 0.5); roof.castShadow = true; g.add(roof);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(w - 1, d - 1), STD(0x9aa0a6, { roughness: 1 })); fl.rotation.x = -Math.PI / 2; fl.position.set(cx, 0.04, cz); fl.receiveShadow = true; g.add(fl);
}
function interiorProp(g, x, z, sw, sh, sd, col) { const m = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), STD(col)); m.position.set(x, sh / 2, z); m.castShadow = true; g.add(m); }

export function makeCity(scene, seed = 7) {
  const r = mul(seed);
  const g = new THREE.Group();
  const buildings = [];
  const spawns = [];
  const shops = [];
  const landmarks = [];
  const B = WORLD.BLOCK, RO = WORLD.ROAD, G = WORLD.GRID, S = WORLD.SIZE;

  // ----- two islands: A (start) and D (bigger) — placed side by side so the bridge is a straight road -----
  const A = { cx: 340, cz: 470, r: 215 }, D = { cx: 940, cz: 600, r: 330 };
  // downtown cores: skyscrapers cluster around these; everything else is lower + more spaced (GTA-style districts)
  const CORES = [
    { x: A.cx + 35, z: A.cz - 25, r: 145 },
    { x: D.cx - 70, z: D.cz + 45, r: 190 },
    { x: D.cx + 120, z: D.cz - 95, r: 165 },
  ];
  const downtownAt = (x, z) => { let m = 0; for (const c of CORES) m = Math.max(m, 1 - Math.hypot(x - c.x, z - c.z) / c.r); return Math.max(0, m); };
  const wob = (isl, p1, p2, p3) => a => isl.r * (0.80 + 0.13 * Math.sin(3 * a + p1) + 0.085 * Math.sin(5 * a + p2) + 0.055 * Math.sin(7 * a + p3) + 0.04 * Math.sin(2 * a));
  const wA = wob(A, 0.9, 2.1, 0.4), wD = wob(D, 0.4, 1.7, 2.3);
  const inA = (x, z) => Math.hypot(x - A.cx, z - A.cz) < wA(Math.atan2(z - A.cz, x - A.cx));
  const inD = (x, z) => Math.hypot(x - D.cx, z - D.cz) < wD(Math.atan2(z - D.cz, x - D.cx));

  // ----- bridge between the coasts -----
  const bdx = D.cx - A.cx, bdz = D.cz - A.cz, blen0 = Math.hypot(bdx, bdz), bux = bdx / blen0, buz = bdz / blen0;
  // march out from each island centre along the bridge line to the REAL (wobbled) coast, then step 10u back inside so the deck lands on solid ground
  let ta = 0; while (ta < A.r * 1.5 && inA(A.cx + bux * ta, A.cz + buz * ta)) ta += 2;
  let td = 0; while (td < D.r * 1.5 && inD(D.cx - bux * td, D.cz - buz * td)) td += 2;
  const pAx = A.cx + bux * Math.max(12, ta - 10), pAz = A.cz + buz * Math.max(12, ta - 10);
  const pDx = D.cx - bux * Math.max(12, td - 10), pDz = D.cz - buz * Math.max(12, td - 10);
  const bridgeLen = Math.hypot(pDx - pAx, pDz - pAz), bheading = Math.atan2(bux, buz), HALF = 11, perpx = -buz, perpz = bux;
  const onBridge = (x, z) => { const rx = x - pAx, rz = z - pAz, t = rx * bux + rz * buz; if (t < -3 || t > bridgeLen + 3) return false; return Math.abs(rx * perpx + rz * perpz) < HALF; };
  // a wider corridor (incl. the on-ramps into each island) that we keep clear of buildings so you can drive onto the bridge
  const bridgeCorridor = (x, z) => { const rx = x - pAx, rz = z - pAz, t = rx * bux + rz * buz; if (t < -30 || t > bridgeLen + 30) return false; return Math.abs(rx * perpx + rz * perpz) < HALF + 10; };

  const isLand = (x, z) => inA(x, z) || inD(x, z);

  // ----- terrain heightfield: 0 at the coasts, rolling hills inland (so the city isn't flat) -----
  const groundH = (x, z) => {
    const inland = Math.max(0, 1 - Math.hypot(x - A.cx, z - A.cz) / A.r, 1 - Math.hypot(x - D.cx, z - D.cz) / D.r);
    const hills = 10.0 * Math.sin(x * 0.011) * Math.cos(z * 0.010) + 7.0 * Math.cos((x + z) * 0.0075 + 1.0) + 4.0 * Math.sin(x * 0.021 + 1.7) * Math.sin(z * 0.019);
    return Math.max(0, inland * 9 + hills * inland);      // pronounced yet smooth rolling hills (0 at coast → up to ~28 inland)
  };
  // a ground tile whose every vertex follows the heightfield → adjacent tiles share edge heights → one seamless, smooth surface
  const terrainTile = (mat, cx, cz, size, yLift, segs = 4) => {
    const geo = new THREE.PlaneGeometry(size, size, segs, segs); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, groundH(cx + pos.getX(i), cz + pos.getZ(i)) + yLift);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.position.set(cx, 0, cz); m.receiveShadow = true; return m;
  };
  const conform = (obj, x, zz, gy) => { obj.position.y += groundH(x, zz) - gy; return obj; };   // drop a cell-group child onto the real ground

  // bridge deck height (shared by the deck mesh and by the walk/drive surface) — ramps from each island's terrain, arches over water
  const BR_yA = groundH(pAx, pAz), BR_yD = groundH(pDx, pDz), BR_ARCH = 3.0;
  const bridgeDeckY = (x, z) => { const u = Math.max(0, Math.min(1, ((x - pAx) * bux + (z - pAz) * buz) / bridgeLen)); return (BR_yA * (1 - u) + BR_yD * u) + Math.sin(u * Math.PI) * BR_ARCH; };

  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(S * 6, S * 6), STD(0x2d7da6, { roughness: 0.25, metalness: 0.4 }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(S / 2, -0.9, S / 2); g.add(ocean);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const asphaltMat = STD(0x40434a, { roughness: 1 }), sandMat = STD(0xddc89a, { roughness: 1 });
  const sidewalkMat = STD(0x6b6f78, { roughness: 1 }), parkMat = STD(0x4f8a46, { roughness: 1 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8b24a });
  const sandGeo = new THREE.PlaneGeometry(B * 1.22, B * 1.22), asphGeo = new THREE.PlaneGeometry(B, B), lotGeo = new THREE.PlaneGeometry(B - RO, B - RO);

  const land = []; for (let gx = 0; gx < G; gx++) { land[gx] = []; for (let gz = 0; gz < G; gz++) land[gx][gz] = isLand(gx * B + B / 2, gz * B + B / 2); }
  const isL = (gx, gz) => gx >= 0 && gz >= 0 && gx < G && gz < G && land[gx][gz];
  const landCells = [];
  for (let gx = 0; gx < G; gx++) for (let gz = 0; gz < G; gz++) if (land[gx][gz]) landCells.push({ gx, gz, cx: gx * B + B / 2, cz: gz * B + B / 2 });

  // reserve one land cell for each landmark (nearest to its target)
  const LMDEF = [
    { type: 'shop', label: 'SHOP', sbg: '#e67e22', col: 0xd98c5a, tx: A.cx + A.r * 0.35, tz: A.cz + A.r * 0.5 },
    { type: 'school', label: 'SCHOOL', sbg: '#c9a227', col: 0xe6d199, tx: A.cx - A.r * 0.55, tz: A.cz - A.r * 0.15 },
    { type: 'stunt', label: 'STUNT PARK', sbg: '#e07b2a', col: 0xcf5a2a, tx: A.cx - A.r * 0.45, tz: A.cz + A.r * 0.5 },
    { type: 'hospital', label: 'HOSPITAL', sbg: '#c0392b', col: 0xeef2f4, tx: D.cx - D.r * 0.25, tz: D.cz - D.r * 0.55 },
    { type: 'police', label: 'POLICE', sbg: '#1f2f5c', col: 0x30416e, tx: D.cx + D.r * 0.5, tz: D.cz + D.r * 0.2 },
  ];
  const lmCell = {};
  for (const lm of LMDEF) { let best = null, bd = 1e9; for (const c of landCells) { if (bridgeCorridor(c.cx, c.cz)) continue; const dd = Math.hypot(c.cx - lm.tx, c.cz - lm.tz); if (dd < bd) { bd = dd; best = c; } } if (best) lmCell[best.gx + ',' + best.gz] = lm; }

  for (const c of landCells) {
    const { gx, gz, cx, cz } = c;
    const gy = groundH(cx, cz);
    c.gy = gy;
    const cg = new THREE.Group(); cg.position.y = gy; g.add(cg);   // whole cell rides at its terrain height
    const coastal = !isL(gx - 1, gz) || !isL(gx + 1, gz) || !isL(gx, gz - 1) || !isL(gx, gz + 1);
    if (coastal) g.add(terrainTile(sandMat, cx, cz, B * 1.22, -0.05));
    g.add(terrainTile(asphaltMat, cx, cz, B, 0.005));

    if (bridgeCorridor(cx, cz)) {                       // keep the bridge on-ramp clear — road only, no buildings
      g.add(terrainTile(sidewalkMat, cx, cz, B - RO, 0.02));
      continue;
    }
    const lm = lmCell[gx + ',' + gz];
    if (lm) {
      if (lm.type === 'stunt') {                          // a cleared flat lot for the bike stunt park; ramps are placed by the client
        g.add(terrainTile(asphaltMat, cx, cz, B, 0.006));
        const s = makeSign(lm.label, (B - RO) * 0.85, lm.sbg, '#fff'); s.position.set(cx, 4.4, cz); cg.add(s);
        landmarks.push({ type: 'stunt', label: lm.label, x: cx, z: cz, gy });
        spawns.push({ x: cx, z: cz });
        continue;
      }
      g.add(terrainTile(sidewalkMat, cx, cz, B - RO, 0.02));
      const w = B - RO - 2, d = B - RO - 4, h = (lm.type === 'police' || lm.type === 'hospital') ? 12 : 8.5;
      makeShell(cg, buildings, cx, cz, w, d, h, lm.col, gy);
      const s1 = makeSign(lm.label, w * 0.8, lm.sbg, '#fff'); s1.position.set(cx, h * 0.62, cz + d / 2 + 0.06); cg.add(s1);
      const s2 = makeSign(lm.label, w * 0.9, lm.sbg, '#fff'); s2.position.set(cx, h + 1.1, cz + d / 2 - 0.2); cg.add(s2);
      const ec = lm.type === 'hospital' ? 0xc0392b : lm.type === 'police' ? 0x2244ff : lm.type === 'school' ? 0xf1c40f : 0xe67e22;
      const em = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: ec, emissive: ec, emissiveIntensity: 0.55, flatShading: true })); em.position.set(cx + w * 0.32, 2.5, cz + d / 2 + 0.2); em.scale.set(1.3, 1.3, 0.2); cg.add(em);
      if (lm.type === 'hospital') { interiorProp(cg, cx - w / 4, cz - d / 5, 1.2, 0.6, 2.4, 0xffffff); interiorProp(cg, cx + w / 4, cz - d / 5, 1.2, 0.6, 2.4, 0xffffff); }
      else if (lm.type === 'police') { interiorProp(cg, cx, cz - d / 4, w * 0.5, 0.9, 1.0, 0x394a5a); for (let k = -1; k <= 1; k += 2) interiorProp(cg, cx + k * w / 4, cz - d / 3, 0.2, h - 1.5, 2.5, 0x555555); }
      else if (lm.type === 'school') { for (let k = -1; k <= 1; k++) interiorProp(cg, cx + k * 3, cz - d / 5, 1.6, 0.7, 1.0, 0x8a6b2a); }
      else { for (let k = -1; k <= 1; k += 2) interiorProp(cg, cx + k * w / 4, cz, 1.0, h - 2, d * 0.6, 0xbfae8a); }
      landmarks.push({ type: lm.type, label: lm.label, x: cx, z: cz, gy, door: { x: cx, z: cz + d / 2 + 3 } });
      spawns.push({ x: cx, z: cz + d / 2 + 5 });
      continue;
    }

    const onIslB = inD(cx, cz);
    const dt = downtownAt(cx, cz);                        // 0 = leafy outskirts … 1 = downtown core
    const roll = r();
    const parkChance = 0.09 + (1 - dt) * 0.13;            // more greenery the further from downtown
    const plazaChance = 0.05 + (1 - dt) * 0.12;           // open breathing space so nothing is piled up
    const park = roll < parkChance;
    const plaza = !park && roll < parkChance + plazaChance;
    const shop = !park && !plaza && dt < 0.5 && r() < 0.17;
    g.add(terrainTile(park ? parkMat : sidewalkMat, cx, cz, B - RO, 0.02));

    if (park) {
      if (r() < 0.5) { const hx = cx + (r() - 0.5) * 10, hz = cz + (r() - 0.5) * 10; cg.add(conform(makeHill(hx, hz, 7 + r() * 6, 2.5 + r() * 2.5), hx, hz, gy)); }
      const nT = 3 + (r() * 4 | 0);
      for (let i = 0; i < nT; i++) { const tx = cx + (r() - 0.5) * (B - RO) * 0.75, tz = cz + (r() - 0.5) * (B - RO) * 0.75; cg.add(conform(makeTree(tx, tz, r), tx, tz, gy)); }
      if (r() < 0.5) { const bx = cx + (r() - 0.5) * 8, bz = cz + (r() - 0.5) * 8; cg.add(conform(makeBench(bx, bz), bx, bz, gy)); }
      spawns.push({ x: cx, z: cz });
    } else if (plaza) {                                    // open square: a couple trees, otherwise room to move
      for (let i = 0; i < 2; i++) if (r() < 0.7) { const tx = cx + (r() - 0.5) * (B - RO) * 0.7, tz = cz + (r() - 0.5) * (B - RO) * 0.7; cg.add(conform(makeTree(tx, tz, r), tx, tz, gy)); }
      if (r() < 0.5) { const bx = cx + (r() - 0.5) * 10, bz = cz + (r() - 0.5) * 10; cg.add(conform(makeBench(bx, bz), bx, bz, gy)); }
      spawns.push({ x: cx, z: cz });
    } else if (shop) {
      const w = (B - RO) * 0.8, d = (B - RO) * 0.8, h = 6 + r() * 3, col = FACADES[(r() * FACADES.length) | 0], awnCol = SHOPCOL[(r() * SHOPCOL.length) | 0];
      const m = new THREE.Mesh(boxGeo, STD(col)); m.position.set(cx, h / 2 - SKIRT / 2, cz); m.scale.set(w, h + SKIRT, d); m.castShadow = true; m.receiveShadow = true; cg.add(m);
      const awn = new THREE.Mesh(boxGeo, STD(awnCol, { roughness: 0.6 })); awn.position.set(cx, 2.5, cz + d / 2 + 0.4); awn.scale.set(w * 0.86, 0.4, 1.2); awn.castShadow = true; cg.add(awn);
      const sign = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: awnCol, emissive: awnCol, emissiveIntensity: 0.85, flatShading: true })); sign.position.set(cx, h + 0.7, cz + d / 2 - 0.1); sign.scale.set(w * 0.72, 1.2, 0.3); cg.add(sign);
      buildings.push({ x: cx, z: cz, w, d, h, base: gy }); shops.push({ x: cx, z: cz, color: awnCol });
      spawns.push({ x: cx, z: cz + d / 2 + 4 });
    } else {
      // buildings: footprint AND height scale with downtown value → towers cluster in the core, low-rise + gaps out in the burbs
      const inner = (B - RO) * (0.52 + dt * 0.32);
      const rot = onIslB ? (r() - 0.5) * 0.8 : (r() - 0.5) * 0.25;
      const place = (ox, oz, w, d) => {
        const h = 6 + Math.pow(r(), 1.5) * (7 + dt * dt * (onIslB ? 95 : 68));
        const m = new THREE.Mesh(boxGeo, STD(FACADES[(r() * FACADES.length) | 0])); m.position.set(cx + ox, h / 2 - SKIRT / 2, cz + oz); m.scale.set(w, h + SKIRT, d); m.rotation.y = rot; m.castShadow = true; m.receiveShadow = true; cg.add(m);
        const roof = new THREE.Mesh(boxGeo, STD(0x3c3f47)); roof.position.set(cx + ox, h + 0.4, cz + oz); roof.scale.set(w * 0.96, 0.8, d * 0.96); roof.rotation.y = rot; roof.castShadow = true; cg.add(roof);
        if (h > 16) { const band = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x223, emissive: 0x335, emissiveIntensity: 0.5, flatShading: true })); band.position.set(cx + ox, h * 0.6, cz + oz); band.scale.set(w * 0.82, h * 0.5, d * 0.82); band.rotation.y = rot; cg.add(band); }
        const cc = Math.abs(Math.cos(rot)), ss = Math.abs(Math.sin(rot));
        buildings.push({ x: cx + ox, z: cz + oz, w: w * cc + d * ss, d: w * ss + d * cc, h: h + 1, base: gy });
      };
      if (dt < 0.32) {                                     // residential: a single small house, set back, with a yard tree
        const w = inner * (0.5 + r() * 0.22);
        place((r() - 0.5) * 5, (r() - 0.5) * 5, w, w * (0.85 + r() * 0.3));
        if (r() < 0.6) { const tx = cx + (r() - 0.5) * (B - RO) * 0.7, tz = cz + (B - RO) * 0.3; cg.add(conform(makeTree(tx, tz, r), tx, tz, gy)); }
      } else {
        const style = r();
        if (style < 0.5) place(0, 0, inner * (0.7 + r() * 0.25), inner * (0.7 + r() * 0.25));
        else if (style < 0.8) { const w = inner * 0.44; place(-inner * 0.24, 0, w, inner * 0.86); place(inner * 0.24, 0, w, inner * 0.86); }
        else { const w = inner * 0.42, d = inner * 0.42; for (const sx of [-1, 1]) for (const sz of [-1, 1]) place(sx * inner * 0.24, sz * inner * 0.24, w, d); }
      }
    }
    if (!park && !plaza) {
      if (r() < 0.35) { const lx = cx + (B - RO) / 2 + 2.2, lz = cz - 7; cg.add(conform(makeLamp(lx, lz), lx, lz, gy)); }
      if (r() < 0.2) { const hx = cx - (B - RO) / 2 - 1.6, hz = cz + 6; cg.add(conform(makeHydrant(hx, hz), hx, hz, gy)); }
    }
    if (coastal) { for (let i = 0; i < 2; i++) { const tx = cx + (r() - 0.5) * B * 0.8, tz = cz + (r() - 0.5) * B * 0.8; cg.add(conform(makeTree(tx, tz, r), tx, tz, gy)); } if (r() < 0.55) { const rx = cx + (r() - 0.5) * B, rz = cz + (r() - 0.5) * B; cg.add(conform(makeRock(rx, rz, 0.9 + r() * 1.6, r), rx, rz, gy)); } }
  }
  // mountains rising from the sea, off the outer coasts — scenery so the world isn't flat
  for (const M of [{ x: 90, z: 170 }, { x: 150, z: 980 }, { x: 1190, z: 230 }, { x: 1200, z: 1060 }, { x: 660, z: 1190 }, { x: 430, z: 80 }, { x: 90, z: 660 }, { x: 1160, z: 900 }]) {
    if (!isLand(M.x, M.z)) g.add(makeMountain(M.x, M.z, 45 + r() * 35, 60 + r() * 60));
  }

  for (let gx = 1; gx < G; gx++) for (let gz = 0; gz < G; gz++) if (land[gx - 1][gz] && land[gx][gz]) for (let t = -B / 2; t < B / 2; t += 8) { const zz = gz * B + B / 2 + t + 2, a = new THREE.Mesh(boxGeo, lineMat); a.position.set(gx * B, groundH(gx * B, zz) + 0.05, zz); a.scale.set(0.4, 0.02, 3); g.add(a); }
  for (let gz = 1; gz < G; gz++) for (let gx = 0; gx < G; gx++) if (land[gx][gz - 1] && land[gx][gz]) for (let t = -B / 2; t < B / 2; t += 8) { const xx = gx * B + B / 2 + t + 2, b = new THREE.Mesh(boxGeo, lineMat); b.position.set(xx, groundH(xx, gz * B) + 0.05, gz * B); b.scale.set(3, 0.02, 0.4); g.add(b); }

  // ----- bridge deck (ramps up from each island's terrain, arches over the water) -----
  (function bridge() {
    const deckMat = STD(0x3a3d44, { roughness: 1 }), railMat = STD(0x9aa0a6), towerMat = STD(0xb23a3a, { roughness: 0.6 });
    const deckY = u => bridgeDeckY(pAx + bux * u * bridgeLen, pAz + buz * u * bridgeLen);
    const seg = 8, over = 5, n = Math.ceil((bridgeLen + over * 2) / seg);
    for (let i = 0; i < n; i++) {
      const t = -over + (i + 0.5) * seg, u = t / bridgeLen, x = pAx + bux * t, z = pAz + buz * t, y = deckY(u) + 0.06;
      const deck = new THREE.Mesh(boxGeo, deckMat); deck.position.set(x, y, z); deck.scale.set(HALF * 2, 0.35, seg + 0.5); deck.rotation.y = bheading; deck.receiveShadow = true; g.add(deck);
      if (i % 2 === 0) { const dash = new THREE.Mesh(boxGeo, lineMat); dash.position.set(x, y + 0.18, z); dash.scale.set(0.4, 0.02, 3); dash.rotation.y = bheading; g.add(dash); }
      for (const sd of [-1, 1]) { const rail = new THREE.Mesh(boxGeo, railMat); rail.position.set(x + perpx * HALF * sd, y + 0.55, z + perpz * HALF * sd); rail.scale.set(0.3, 1.1, seg + 0.5); rail.rotation.y = bheading; g.add(rail); }
    }
    for (const tt of [0.3, 0.7]) {
      const t = bridgeLen * tt, x = pAx + bux * t, z = pAz + buz * t, by = deckY(tt);
      for (const sd of [-1, 1]) {
        const tx = x + perpx * HALF * sd, tz = z + perpz * HALF * sd;
        const tower = new THREE.Mesh(boxGeo, towerMat); tower.position.set(tx, by + 11, tz); tower.scale.set(1.3, 22, 1.3); tower.castShadow = true; g.add(tower);
        const cross = new THREE.Mesh(boxGeo, towerMat); cross.position.set(tx, by + 20, tz); cross.scale.set(1.1, 1.4, 1.1); g.add(cross);
        for (const eu of [0, 1]) {
          const et = eu * bridgeLen, ex = pAx + bux * et + perpx * HALF * sd, ez = pAz + buz * et + perpz * HALF * sd;
          g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(tx, by + 21, tz), new THREE.Vector3(ex, deckY(eu) + 0.7, ez)]), new THREE.LineBasicMaterial({ color: 0x2a2d33 })));
        }
      }
    }
  })();

  const isLandCell = (x, z) => { const gx = Math.floor(x / B), gz = Math.floor(z / B); if (gx >= 0 && gz >= 0 && gx < G && gz < G && land[gx][gz]) return true; return onBridge(x, z); };
  if (!spawns.length) spawns.push({ x: A.cx, z: A.cz });
  scene.add(g);
  // ground height for gameplay: terrain on land, but flat (0) on the bridge deck so vehicles sit on it
  const groundAt = (x, z) => (onBridge(x, z) && !isLand(x, z)) ? bridgeDeckY(x, z) + 0.2 : groundH(x, z);
  return { group: g, buildings, spawns, shops, landmarks, isLand, isLandCell, groundH: groundAt, land, landCells, islands: { A, D }, bridge: { ax: pAx, az: pAz, bx: pDx, bz: pDz } };
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
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.54, 1.9), new THREE.MeshStandardMaterial({ color: 0x22323f, roughness: 0.12, metalness: 0.5, transparent: true, opacity: 0.4 }));
  glass.position.set(0, 1.2, -0.15); g.add(glass);   // see-through so you can shoot the driver
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

// ---------- boat ----------
export function makeBoat(color = 0xe8e8e8) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 3.6), STD(color, { roughness: 0.5 })); hull.position.y = 0.35; hull.castShadow = true; g.add(hull);
  const bow = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 1.1), STD(color)); bow.position.set(0, 0.46, 2.1); bow.rotation.x = -0.36; bow.castShadow = true; g.add(bow);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.15, 2.4), STD(0x9a7a55)); deck.position.set(0, 0.62, -0.2); g.add(deck);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.5), STD(0x2a2a2a)); seat.position.set(0, 0.78, -1.0); g.add(seat);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.8), STD(0x2a3550, { roughness: 0.3, metalness: 0.3 })); cabin.position.set(0, 1.05, -0.9); cabin.castShadow = true; g.add(cabin);
  const wind = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.42, 0.08), STD(0x16242e, { metalness: 0.4 })); wind.position.set(0, 1.12, -0.5); wind.rotation.x = -0.3; g.add(wind);
  return { group: g, wheels: [] };
}

// ---------- parachute ----------
export function makeParachute() {
  const g = new THREE.Group();
  const cols = [0xe74c3c, 0xf1c40f, 0xffffff, 0x2980b9];
  for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(1.9, 6, 6, i / 4 * Math.PI * 2, Math.PI / 2, 0, Math.PI / 2), STD(cols[i], { side: THREE.DoubleSide, roughness: 0.8 })); seg.scale.y = 0.62; seg.castShadow = true; g.add(seg); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(a) * 1.6, -0.05, Math.sin(a) * 1.6), new THREE.Vector3(0, -2.7, 0)]), new THREE.LineBasicMaterial({ color: 0x222222 }))); }
  return g;
}

// ---------- landscape (decorative) ----------
export function makeHill(x, z, rad, h) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), STD(0x4f8a46, { flatShading: true }));
  m.scale.y = h / rad; m.position.set(x, -0.06, z); m.receiveShadow = true; m.castShadow = true; return m;
}
export function makeRock(x, z, size, r) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), STD(0x8a8f96, { flatShading: true }));
  m.position.set(x, size * 0.45, z); m.rotation.set(r() * 3, r() * 3, r() * 3); m.scale.set(1, 0.6 + r() * 0.4, 1); m.castShadow = true; return m;
}
export function makeMountain(x, z, rad, h) {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), STD(0x6f7360, { flatShading: true })); cone.position.y = h / 2; cone.castShadow = true; cone.receiveShadow = true; g.add(cone);
  const snow = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.36, h * 0.3, 7), STD(0xeef3f7, { flatShading: true })); snow.position.y = h * 0.85; g.add(snow);
  g.position.set(x, 0, z); return g;
}

// ---------- tank ----------
export function makeTank(color = 0x5a6b3a) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.85, 4.5), STD(color, { roughness: 0.75, metalness: 0.2 }));
  hull.position.y = 0.9; hull.castShadow = true; g.add(hull);
  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 1.1), STD(color)); glacis.position.set(0, 0.72, 2.2); glacis.rotation.x = -0.5; g.add(glacis);
  const wheels = [];
  for (const x of [-1.4, 1.4]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 4.7), STD(0x1a1c1f, { roughness: 1 })); track.position.set(x, 0.5, 0); track.castShadow = true; g.add(track);
    for (let i = 0; i < 5; i++) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.55, 10), STD(0x2a2d31)); w.rotation.z = Math.PI / 2; w.position.set(x, 0.45, -1.8 + i * 0.9); g.add(w); wheels.push(w); }
  }
  const turret = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.72, 2.3), STD(color, { roughness: 0.65 })); dome.castShadow = true; turret.add(dome);
  const bevel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.9), STD(color)); bevel.position.set(0, 0, 1.3); turret.add(bevel);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 3.2, 10), STD(0x2f3a22)); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, 2.9); turret.add(barrel);
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.16, 10), STD(0x3a4a2a)); hatch.position.set(0, 0.42, -0.5); turret.add(hatch);
  turret.position.set(0, 1.9, -0.2); g.add(turret);
  return { group: g, turret, barrel, wheels };
}

// ---------- held weapon models (barrel points +z) ----------
export function makeWeaponMesh(kind) {
  if (!kind || kind === 'fists') return null;
  const g = new THREE.Group();
  const metal = STD(0x24272e, { roughness: 0.5, metalness: 0.4 }), wood = STD(0x5a3a22, { roughness: 0.85 });
  const add = (w, h, d, z, y = 0, m = metal) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(0, y, z); g.add(b); return b; };
  if (kind === 'pistol') { add(0.08, 0.13, 0.26, 0.06); add(0.07, 0.15, 0.1, -0.04, -0.11); }
  else if (kind === 'smg') { add(0.09, 0.14, 0.5, 0.12); add(0.07, 0.16, 0.1, -0.02, -0.11); add(0.06, 0.12, 0.16, -0.02, -0.2); }
  else if (kind === 'shotgun') { add(0.09, 0.12, 0.66, 0.2); add(0.08, 0.13, 0.28, -0.16, -0.02, wood); }
  else if (kind === 'rifle') { add(0.08, 0.12, 0.7, 0.2); add(0.07, 0.15, 0.1, -0.05, -0.11); add(0.06, 0.1, 0.24, -0.2, -0.02, wood); }
  else if (kind === 'sniper') { add(0.08, 0.12, 0.86, 0.26); add(0.07, 0.15, 0.1, -0.05, -0.11); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 8), metal); s.rotation.x = Math.PI / 2; s.position.set(0, 0.12, 0.16); g.add(s); }
  else if (kind === 'rpg' || kind === 'homing') { const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.95, 10), metal); tube.rotation.x = Math.PI / 2; tube.position.z = 0.35; g.add(tube); if (kind === 'homing') { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.16), metal); fin.position.set(0, 0.1, 0.75); g.add(fin); } }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- character ----------
export const SKIN = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5a3a1a];
export const HAIR = [0x20140d, 0x4a2f1a, 0x8a6b2a, 0xc9a23a, 0xb0b0b0, 0x222222, 0xaa3322, 0x6a3aa0];
// shirt = main shirt colour. opts: { skin, hair, pants, hat } (any may be omitted)
export function makeChar(shirt = 0x3aa0ff, opts = {}) {
  const g = new THREE.Group();
  const preset = opts.preset, fox = preset === 'fox';
  const fem = fox ? false : (opts.gender === 'f');
  if (fox) shirt = 0xdf6b2e;
  const skin = fox ? 0xdf6b2e : (opts.skin != null ? opts.skin : SKIN[(Math.random() * SKIN.length) | 0]);
  const pants = fox ? 0xc85a24 : (opts.pants != null ? opts.pants : 0x2c3e50);
  const hairCol = fox ? 0x8a3f16 : (opts.hair != null ? opts.hair : 0x20140d);
  const limb = (w, h, d, c) => { const grp = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), STD(c)); m.position.y = -h / 2; m.castShadow = true; grp.add(m); return grp; };
  const shW = fem ? 0.46 : 0.55, hipW = fem ? 0.52 : 0.5, armW = fem ? 0.13 : 0.15, legW = fem ? 0.17 : 0.19, armX = fem ? 0.31 : 0.36;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(shW, 0.75, 0.30), STD(shirt)); torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
  if (fem) { const chest = new THREE.Mesh(new THREE.BoxGeometry(shW * 0.82, 0.17, 0.16), STD(shirt)); chest.position.set(0, 1.19, 0.17); g.add(chest); }
  if (fox) { const belly = new THREE.Mesh(new THREE.BoxGeometry(shW * 0.6, 0.55, 0.06), STD(0xf6ece0)); belly.position.set(0, 1.12, 0.16); g.add(belly); }
  const hips = new THREE.Mesh(new THREE.BoxGeometry(hipW, 0.28, 0.32), STD(pants)); hips.position.y = 0.74; g.add(hips);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), STD(skin));
  head.position.y = 1.72; head.castShadow = true; g.add(head);
  if (fox) {
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 4), STD(0xdf6b2e)); ear.position.set(sx * 0.12, 2.02, -0.02); ear.rotation.z = sx * -0.22; ear.castShadow = true; g.add(ear);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), STD(0x241610)); tip.position.set(sx * 0.145, 2.16, -0.02); tip.rotation.z = sx * -0.22; g.add(tip);
    }
    const muz = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.18), STD(0xf6ece0)); muz.position.set(0, 1.65, 0.18); g.add(muz);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.08), STD(0x1a1210)); nose.position.set(0, 1.69, 0.28); g.add(nose);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.95, 6), STD(0xdf6b2e)); tail.position.set(0, 0.82, -0.42); tail.rotation.x = -2.35; tail.castShadow = true; g.add(tail);
    const ttip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 6), STD(0xf6ece0)); ttip.position.set(0, 0.5, -0.78); ttip.rotation.x = -2.35; g.add(ttip);
  } else if (opts.hat) {
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.4), STD(hairCol)); crown.position.y = 1.96; crown.castShadow = true; g.add(crown);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.26), STD(hairCol)); brim.position.set(0, 1.9, 0.3); g.add(brim);
  } else {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.14, 0.37), STD(hairCol)); hair.position.y = 1.9; hair.castShadow = true; g.add(hair);
    if (fem) { const pony = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.52, 0.18), STD(hairCol)); pony.position.set(0, 1.55, -0.21); pony.castShadow = true; g.add(pony); }
  }
  const armL = limb(armW, 0.66, armW, shirt); armL.position.set(-armX, 1.5, 0); g.add(armL);
  const armR = limb(armW, 0.66, armW, shirt); armR.position.set(armX, 1.5, 0); g.add(armR);
  const legL = limb(legW, 0.74, 0.2, pants); legL.position.set(-0.13, 0.74, 0); g.add(legL);
  const legR = limb(legW, 0.74, 0.2, pants); legR.position.set(0.13, 0.74, 0); g.add(legR);
  const heldMount = new THREE.Group(); heldMount.position.set(0.30, 1.32, 0.24); g.add(heldMount);   // right-hand weapon
  return {
    group: g, parts: { armL, armR, legL, legR },
    setWeapon(kind) { while (heldMount.children.length) heldMount.remove(heldMount.children[0]); const m = makeWeaponMesh(kind); if (m) heldMount.add(m); },
    setPose(t, moving, aiming) {
      const s = moving ? Math.sin(t * 9) * 0.8 : 0;
      legL.rotation.x = s; legR.rotation.x = -s;
      if (aiming) { armR.rotation.set(-Math.PI / 2 + 0.1, 0, 0); armL.rotation.set(-Math.PI / 2 + 0.3, 0, 0.2); }
      else { armL.rotation.set(-s * 0.7, 0, 0); armR.rotation.set(s * 0.7, 0, 0); }
    },
  };
}
