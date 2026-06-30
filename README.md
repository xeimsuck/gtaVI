# 🚙 VICE 3D

A stylized **low-poly 3D** third-person multiplayer sandbox in the browser — drive cars,
shoot, and mess around with friends. No downloads: friends just open a link.

Not photoreal GTA VI (that needs a real engine + an art team) — but a real, clean 3D game
that runs anywhere and loads instantly. Flat-shaded low-poly look with proper lighting.

---

## ▶️ Run locally
```bash
npm install
npm start
```
Open **http://localhost:3000**. Open a second tab to test multiplayer.

## ⚡ Fastest way to play with friends — Cloudflare Tunnel
No hosting account, no deploy. One command shares your local game with a public link:
```bash
npm install      # once
npm run share
```
Wait ~5 seconds and copy the line that looks like:
```
https://something-random.trycloudflare.com
```
**Send that link to your friends** — they open it in a browser and you're all in the same city.
Keep the terminal open while you play; press **Ctrl+C** to stop.

Notes:
- The link is random and changes every time you run `npm run share` (free quick tunnel).
- Your PC must stay on with the terminal running while friends play.
- Cloudflare Tunnel needs **outbound port 7844**. Many **VPNs block it** (you'll see
  `QUIC connection failed` / `Error 1033`). Fixes, in order:
  1. **Disconnect the VPN**, then `npm run share` again — usually the whole problem.
  2. Use a tunnel over port **443** instead (works on locked-down networks/VPNs):
     ```bash
     npm run share:lt
     ```
     This prints a `https://xxxxx.loca.lt` link. The first visitor sees a one-time page
     asking for a "tunnel password" — that's **your public IP** (get it at
     https://loca.lt/mytunnelpassword); paste it, click submit, done.
  3. **Deploy** (below) — runs on a host, so your PC/VPN/network don't matter at all and the
     link is permanent.

## ☁️ Deploy & invite friends
One Node server on one port, so hosting is trivial:
- **Render**: push to GitHub → New + → **Blueprint** → pick the repo (`render.yaml`) → public URL.
- **Docker / Railway / Fly / VPS**: `docker build -t vice . && docker run -p 80:3000 vice`.

Then **send friends the URL** — they open it and you're in the same city.

---

## 🎮 Controls
| | |
|---|---|
| Move / drive | **W A S D** |
| Look (mouse) | click to lock the cursor |
| Aim + shoot | **hold Left Mouse** |
| Enter / exit car | **F** |
| Run | **Shift** |
| Handbrake / drift | **Space** (in car) |
| Chat | **Enter** |
| Scoreboard | **Tab** (hold) |

## ✨ What's in it
- Stylized low-poly 3D city — flat-shaded buildings, roads with lane lines, parks, trees
- Third-person character with walk animation
- Smooth arcade **driving** (accelerate, steer, handbrake drift) + low-poly cars
- **Shooting** — raycast aim, tracers, hit detection, blood, recoil shake
- **Multiplayer**: other players (names above them), kill feed, scoreboard, chat, respawn
- Tiny + dependency-light (Three.js only, no models to download)

## 🧱 Files
```
server/index.js   — relay server (serves client + WebSocket sync)
public/index.html — shell + Three.js import map
public/js/build.js — mesh factories (city, cars, characters — the "art")
public/js/main.js  — game (scene, camera, driving, shooting, net, HUD)
public/css/style.css
public/vendor/three.module.js
```
