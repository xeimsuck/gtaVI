// =====================================================================
//  Vice Top-Down — simple browser multiplayer (GTA 1/2 style, top view).
//  One small authoritative relay server: serves the client and syncs
//  players, shots and health over WebSocket on a single port.
// =====================================================================
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;
const OWNER_KEY = process.env.OWNER_KEY || 'vice';

const app = express();
app.use(express.static(PUBLIC, { extensions: ['html'] }));
app.get('/health', (_q, r) => r.json({ ok: true, players: players.size }));
app.get('/info', (_q, r) => r.json({ name: 'Vice Top-Down', players: players.size }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const players = new Map();
let NID = 1;
const SPAWNS = [];
for (let i = 0; i < 24; i++) SPAWNS.push({ x: 300 + (i % 6) * 240, y: 300 + ((i / 6) | 0) * 240 });
const spawn = () => SPAWNS[(Math.random() * SPAWNS.length) | 0];

function send(p, o) { try { p.ws.send(JSON.stringify(o)); } catch {} }
function bcast(o, except) { const s = JSON.stringify(o); for (const p of players.values()) { if (p.id === except) continue; try { p.ws.send(s); } catch {} } }

wss.on('connection', (ws) => {
  const id = 'p' + (NID++);
  const s = spawn();
  const p = { id, ws, name: 'Player', color: '#ff4d6d', x: s.x, y: s.y, a: 0, car: 0, cc: '#cccccc', hp: 100, alive: true, kills: 0, deaths: 0, owner: false, respawnAt: 0, joined: false, isAlive: true };
  players.set(id, p);
  ws.on('pong', () => { p.isAlive = true; });

  ws.on('message', (raw) => {
    if (raw.length > 4096) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join') {
      p.name = String(m.name || 'Player').slice(0, 14).replace(/[<>&]/g, '') || 'Player';
      p.color = /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#ff4d6d';
      p.joined = true;                                   // only now is this socket a real player in the world
      send(p, { t: 'init', id, you: ent(p), players: [...players.values()].filter(o => o.id !== id && o.joined).map(ent) });
      bcast({ t: 'spawn', p: ent(p) }, id);
    } else if (m.t === 'state') {
      p.x = +m.x || 0; p.y = +m.y || 0; p.a = +m.a || 0;
      p.car = m.car ? 1 : 0; p.cc = /^#[0-9a-f]{6}$/i.test(m.cc) ? m.cc : p.cc;
    } else if (m.t === 'shot') {
      if (!p.alive) return;
      bcast({ t: 'shot', id, x: +m.x, y: +m.y, a: +m.a }, id);
    } else if (m.t === 'hit') {
      if (!p.alive) return;
      const v = players.get(String(m.id));
      if (!v || !v.alive || v.id === id) return;
      const dx = v.x - p.x, dy = v.y - p.y;
      if (dx * dx + dy * dy > 1400 * 1400) return;        // plausibility
      const dmg = Math.min(40, Math.max(1, +m.dmg || 12));
      v.hp -= dmg;
      send(v, { t: 'hp', hp: v.hp, by: id });
      if (v.hp <= 0) {
        v.alive = false; v.deaths++; v.respawnAt = Date.now() + 3000;
        p.kills++;
        bcast({ t: 'kill', killer: p.name, victim: v.name });
        bcast({ t: 'dead', id: v.id });
        send(p, { t: 'kills', n: p.kills });
      }
    } else if (m.t === 'respawn') {
      if (p.alive) return; const sp = spawn();
      p.alive = true; p.hp = 100; p.x = sp.x; p.y = sp.y;
      send(p, { t: 'resp', x: p.x, y: p.y });
    } else if (m.t === 'chat') {
      const txt = String(m.m || '').slice(0, 160); if (!txt.trim()) return;
      bcast({ t: 'chat', name: p.name, m: txt, color: p.color });
    } else if (m.t === 'selfhit') {
      if (!p.alive) return;
      const now = Date.now(); if (now - (p._lastSelf || 0) < 280) return; p._lastSelf = now;
      p.hp -= Math.min(20, Math.max(1, +m.dmg || 4)); send(p, { t: 'hp', hp: p.hp });
      if (p.hp <= 0) { p.alive = false; p.deaths++; p.respawnAt = Date.now() + 3000; bcast({ t: 'kill', killer: 'the cops', victim: p.name }); bcast({ t: 'dead', id: p.id }); }
    } else if (m.t === 'heal') {
      if (!p.alive) return;
      const now = Date.now(); if (now - (p._lastHeal || 0) < 900) return; p._lastHeal = now;
      p.hp = Math.min(100, p.hp + Math.min(40, Math.max(1, +m.amount || 40))); send(p, { t: 'hp', hp: p.hp });
    } else if (m.t === 'cheat') {
      if (String(m.key) === OWNER_KEY) { p.hp = 100; p.alive = true; send(p, { t: 'hp', hp: 100 }); send(p, { t: 'notice', m: 'God refill' }); }
    }
  });

  ws.on('close', () => { players.delete(id); bcast({ t: 'leave', id }); });
  ws.on('error', () => { players.delete(id); bcast({ t: 'leave', id }); });
});

function ent(p) { return { id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, a: p.a, car: p.car, cc: p.cc, hp: p.hp, alive: p.alive, kills: p.kills }; }

// 20 Hz snapshot — only joined players exist in the world
setInterval(() => {
  const now = Date.now();
  for (const p of players.values()) if (!p.alive && p.respawnAt && now > p.respawnAt) { const sp = spawn(); p.alive = true; p.hp = 100; p.x = sp.x; p.y = sp.y; send(p, { t: 'resp', x: p.x, y: p.y }); }
  const live = [...players.values()].filter(p => p.joined);
  if (!live.length) return;
  const snap = JSON.stringify({ t: 'snap', players: live.map(p => ({ id: p.id, x: p.x, y: p.y, a: p.a, car: p.car, cc: p.cc, alive: p.alive, name: p.name, color: p.color, kills: p.kills })) });
  for (const p of live) { try { p.ws.send(snap); } catch {} }
}, 50);

// heartbeat: terminate dead sockets (browsers auto-reply to pings even when backgrounded)
setInterval(() => {
  for (const p of players.values()) {
    if (p.isAlive === false) { try { p.ws.terminate(); } catch {} players.delete(p.id); bcast({ t: 'leave', id: p.id }); continue; }
    p.isAlive = false; try { p.ws.ping(); } catch {}
  }
}, 12000);

server.listen(PORT, () => {
  console.log('=================================');
  console.log('  VICE TOP-DOWN  ·  http://localhost:' + PORT);
  console.log('  Share the URL with friends.');
  console.log('=================================');
});
