const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 3001);
const TICK_MS = 50;
const WIDTH = 1000;
const HEIGHT = 620;
const MAX_PLAYERS = 10;
const MODES = new Set(["gemas", "fute", "combate"]);
const CHARACTERS = [
  { id: "tavares", name: "Tavares", className: "Destruidor", hp: 7300, speed: 190, range: 290, damage: 600, reload: 520, color: "#35d5ff", superDamage: 390, superRange: 360 },
  { id: "galhardo", name: "Galhardo", className: "Suporte", hp: 6600, speed: 180, range: 220, damage: 560, reload: 650, color: "#a8f05a", superDamage: 0, superRange: 180 },
  { id: "giovanne", name: "Giovanne", className: "Tanque", hp: 9800, speed: 170, range: 115, damage: 1250, reload: 800, color: "#ff8746", superDamage: 1450, superRange: 220 },
  { id: "honda", name: "Honda", className: "Atirador", hp: 5200, speed: 185, range: 340, damage: 1450, reload: 1050, color: "#ffcf4a", superDamage: 1100, superRange: 390 },
  { id: "berbas", name: "Berbas", className: "Destruidor", hp: 6100, speed: 185, range: 260, damage: 800, reload: 700, color: "#c99bff", superDamage: 1250, superRange: 250 },
  { id: "le", name: "Lê", className: "Atirador", hp: 5600, speed: 180, range: 330, damage: 1250, reload: 950, color: "#ff7ba5", superDamage: 1550, superRange: 350 },
  { id: "tsen", name: "Tsen", className: "Controle", hp: 6400, speed: 180, range: 245, damage: 850, reload: 720, color: "#5ce1c5", superDamage: 1100, superRange: 190 },
  { id: "isaac", name: "Isaac", className: "Suporte", hp: 6700, speed: 180, range: 225, damage: 620, reload: 630, color: "#d8edff", superDamage: 0, superRange: 180 },
  { id: "joao", name: "João", className: "Controle", hp: 7200, speed: 175, range: 230, damage: 900, reload: 700, color: "#e6b44a", superDamage: 1250, superRange: 210 },
  { id: "freitas", name: "Freitas", className: "Lançador", hp: 5900, speed: 175, range: 280, damage: 1000, reload: 850, color: "#f58b54", superDamage: 1300, superRange: 230 },
  { id: "thiago", name: "Thiago", className: "Tanque", hp: 9500, speed: 165, range: 120, damage: 1350, reload: 850, color: "#86a8ff", superDamage: 1500, superRange: 220 }
];
const CHARACTER_MAP = new Map(CHARACTERS.map(c => [c.id, c]));
const rooms = new Map();
const clients = new Map();

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}
function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}
function playerCount(room) { return room.players.size; }
function makeRoom(hostId, mode, bots) {
  const code = roomCode();
  const room = { code, mode: MODES.has(mode) ? mode : "gemas", hostId, bots: !!bots, state: "lobby", players: new Map(), entities: [], gems: [], ball: null, score: [0, 0], startedAt: 0, lastBroadcast: 0 };
  rooms.set(code, room);
  return room;
}
function getPlayerRoom(playerId) {
  for (const room of rooms.values()) if (room.players.has(playerId)) return room;
  return null;
}
function sendRoom(room, type, extra = {}) {
  const data = { type, room: room.code, mode: room.mode, state: room.state, hostId: room.hostId, players: [...room.players.values()].map(publicPlayer), ...extra };
  for (const p of room.players.values()) send(p.ws, data);
}
function publicPlayer(p) {
  return { id: p.id, name: p.name, characterId: p.characterId, team: p.team, bot: p.bot, ready: p.ready, x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, super: p.super, hyper: p.hyper, hyperActiveUntil: p.hyperActiveUntil, gems: p.gems, goals: p.goals, alive: p.alive, facing: p.facing, kills: p.kills };
}
function addPlayer(room, ws, data, isBot = false) {
  const id = isBot ? "bot_" + crypto.randomBytes(4).toString("hex") : crypto.randomUUID();
  const char = CHARACTER_MAP.get(data.characterId) || CHARACTERS[0];
  const p = {
    id, ws, name: String(data.name || (isBot ? "Bot" : "Jogador")).slice(0, 18),
    characterId: char.id, team: room.mode === "combate" ? null : room.players.size % 2,
    bot: isBot, ready: isBot, x: 120 + Math.random() * 760, y: 90 + Math.random() * 440,
    hp: char.hp, maxHp: char.hp, speed: char.speed, super: 0, hyper: 0, hyperActiveUntil: 0,
    gems: 0, goals: 0, alive: true, facing: 0, kills: 0,
    input: { up: false, down: false, left: false, right: false, attack: false, super: false, hyper: false, aimX: WIDTH / 2, aimY: HEIGHT / 2 },
    lastAttack: 0, lastSuper: 0, respawnAt: 0, invulnerableUntil: 0
  };
  room.players.set(id, p);
  if (!isBot) clients.set(ws, { id, room: room.code });
  return p;
}
function resetPlayer(p, index, count) {
  const char = CHARACTER_MAP.get(p.characterId) || CHARACTERS[0];
  p.maxHp = char.hp; p.hp = char.hp; p.speed = char.speed; p.super = 0; p.hyper = 0; p.hyperActiveUntil = 0;
  p.gems = 0; p.goals = 0; p.kills = 0; p.alive = true; p.respawnAt = 0; p.lastAttack = 0; p.lastSuper = 0;
  p.x = p.team === 1 ? WIDTH - 110 : 110;
  p.y = 110 + (index / Math.max(1, count - 1)) * 400;
  p.invulnerableUntil = Date.now() + 1400;
}
function startGame(room) {
  room.state = "playing";
  room.score = [0, 0];
  room.entities = [];
  room.gems = [];
  room.ball = { x: WIDTH / 2, y: HEIGHT / 2, carrierId: null };
  room.startedAt = Date.now();
  [...room.players.values()].forEach((p, i, arr) => resetPlayer(p, i, arr.length));
  if (room.mode === "gemas") {
    for (let i = 0; i < 5; i++) room.gems.push({ id: crypto.randomUUID(), x: WIDTH / 2 + (Math.random() - 0.5) * 100, y: HEIGHT / 2 + (Math.random() - 0.5) * 100 });
  }
  sendRoom(room, "match-start", { width: WIDTH, height: HEIGHT, score: room.score, gems: room.gems, ball: room.ball });
}
function endGame(room, winner) {
  room.state = "results";
  sendRoom(room, "results", { winner, score: room.score, players: [...room.players.values()].map(publicPlayer) });
}
function addProjectile(room, p, x, y, damage, speed, radius = 8, kind = "shot", life = 1100) {
  const dx = x - p.x, dy = y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  room.entities.push({ id: crypto.randomUUID(), ownerId: p.id, team: p.team, x: p.x, y: p.y, vx: dx / len * speed, vy: dy / len * speed, damage, radius, kind, expires: Date.now() + life });
}
function doAttack(room, p, now) {
  const char = CHARACTER_MAP.get(p.characterId) || CHARACTERS[0];
  const boosted = p.hyperActiveUntil > now;
  if (p.input.attack && now - p.lastAttack >= char.reload * (boosted ? 0.8 : 1)) {
    p.lastAttack = now;
    const damage = Math.round(char.damage * (boosted ? 1.18 : 1));
    if (p.characterId === "tavares") {
      for (let i = -2; i <= 2; i++) {
        const angle = Math.atan2(p.input.aimY - p.y, p.input.aimX - p.x) + i * 0.095;
        addProjectile(room, p, p.x + Math.cos(angle) * 100, p.y + Math.sin(angle) * 100, damage, 460, 7, "ricochet", 1300);
      }
    } else if (p.characterId === "freitas") {
      addProjectile(room, p, p.input.aimX, p.input.aimY, damage, 290, 15, "splash", 850);
    } else {
      const count = p.characterId === "berbas" ? 3 : 1;
      const base = Math.atan2(p.input.aimY - p.y, p.input.aimX - p.x);
      for (let i = 0; i < count; i++) {
        const angle = base + (i - (count - 1) / 2) * 0.13;
        addProjectile(room, p, p.x + Math.cos(angle) * 30, p.y + Math.sin(angle) * 30, Math.round(damage / (count === 3 ? 1 : 1)), 480, 8, "shot", char.range / 480 * 1000);
      }
    }
  }
  if (p.input.hyper && p.hyper >= 100 && p.hyperActiveUntil < now) {
    p.hyper = 0;
    p.hyperActiveUntil = now + 7000;
    p.input.hyper = false;
  }
  if (p.input.super && p.super >= 100 && now - p.lastSuper > 500) {
    p.lastSuper = now; p.super = 0; p.input.super = false;
    const angle = Math.atan2(p.input.aimY - p.y, p.input.aimX - p.x);
    const isSupport = p.characterId === "galhardo" || p.characterId === "isaac";
    if (isSupport) {
      for (const target of room.players.values()) {
        if (target.team === p.team && target.alive && Math.hypot(target.x - p.x, target.y - p.y) < 180) target.hp = Math.min(target.maxHp, target.hp + (p.hyperActiveUntil > now ? 2200 : 1500));
      }
      p.hp = Math.min(p.maxHp, p.hp + 1200);
    } else if (p.characterId === "giovanne" || p.characterId === "thiago") {
      p.x = Math.max(35, Math.min(WIDTH - 35, p.x + Math.cos(angle) * 180));
      p.y = Math.max(35, Math.min(HEIGHT - 35, p.y + Math.sin(angle) * 180));
      for (const target of room.players.values()) if (target.team !== p.team && target.alive && Math.hypot(target.x - p.x, target.y - p.y) < 95) hurt(room, p, target, 1400);
    } else if (p.characterId === "honda" || p.characterId === "le") {
      addProjectile(room, p, p.input.aimX, p.input.aimY, char.superDamage, 650, 13, "super", 1300);
    } else {
      const count = p.characterId === "tavares" ? 12 : 5;
      for (let i = 0; i < count; i++) {
        const a = angle + (i - (count - 1) / 2) * (p.characterId === "tavares" ? 0.07 : 0.16);
        addProjectile(room, p, p.x + Math.cos(a) * 25, p.y + Math.sin(a) * 25, char.superDamage, 520, 9, "super", 1000);
      }
    }
    p.hyperActiveUntil = Math.max(0, p.hyperActiveUntil);
  }
}
function hurt(room, attacker, target, damage) {
  if (!target.alive || target.invulnerableUntil > Date.now()) return;
  target.hp -= damage;
  if (attacker && attacker.id !== target.id) { attacker.super = Math.min(100, attacker.super + 12); attacker.hyper = Math.min(100, attacker.hyper + 14); }
  if (target.hp <= 0) {
    target.hp = 0; target.alive = false; target.respawnAt = Date.now() + 2400;
    if (attacker && attacker.id !== target.id) attacker.kills++;
    if (room.mode === "combate") {
      const alive = [...room.players.values()].filter(p => p.alive);
      if (alive.length <= 1) endGame(room, alive[0] ? alive[0].name : "Empate");
    }
  }
}
function nearestEnemy(room, p) {
  let best = null, bestD = Infinity;
  for (const q of room.players.values()) {
    if (q.id === p.id || !q.alive || (room.mode !== "combate" && q.team === p.team)) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}
function botThink(room, p, now) {
  const enemy = nearestEnemy(room, p);
  p.input.attack = false; p.input.super = false; p.input.hyper = false;
  if (!enemy) return;
  const dx = enemy.x - p.x, dy = enemy.y - p.y, d = Math.hypot(dx, dy) || 1;
  const char = CHARACTER_MAP.get(p.characterId) || CHARACTERS[0];
  const range = char.range * 0.72;
  const objective = room.mode === "gemas" && room.gems.length ? room.gems[0] : room.mode === "fute" ? room.ball : null;
  if (objective && room.mode !== "combate" && p.team !== null && p.team === 0 && Math.random() < 0.28) {
    p.input.aimX = enemy.x; p.input.aimY = enemy.y;
  } else {
    p.input.aimX = enemy.x; p.input.aimY = enemy.y;
  }
  if (d > range * 0.8) { p.input.right = dx > 0; p.input.left = dx < 0; p.input.down = dy > 0; p.input.up = dy < 0; }
  else { p.input.right = false; p.input.left = false; p.input.down = false; p.input.up = false; p.input.attack = true; }
  if (p.super >= 100 && d < 300) p.input.super = true;
  if (p.hyper >= 100) p.input.hyper = true;
}
function updateRoom(room, now) {
  if (room.state !== "playing") return;
  const players = [...room.players.values()];
  if (room.bots) {
    const targetCount = room.mode === "combate" ? 6 : Math.min(6, Math.max(2, players.filter(p => !p.bot).length * 2));
    while (room.players.size < targetCount && room.players.size < MAX_PLAYERS) {
      const bot = addPlayer(room, null, { name: "Bot " + (room.players.size + 1), characterId: CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id }, true);
      bot.team = room.mode === "combate" ? null : room.players.size % 2;
      resetPlayer(bot, room.players.size - 1, targetCount);
    }
  }
  for (const p of players) {
    if (p.bot && p.alive) botThink(room, p, now);
    if (!p.alive) {
      if (room.mode !== "combate" && now >= p.respawnAt) {
        p.alive = true; p.hp = p.maxHp; p.x = p.team === 1 ? WIDTH - 110 : 110; p.y = 100 + Math.random() * 420; p.invulnerableUntil = now + 1200;
      }
      continue;
    }
    const inp = p.input;
    const dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const dy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    const mag = Math.hypot(dx, dy) || 1;
    const boost = p.hyperActiveUntil > now ? 1.15 : 1;
    p.x = Math.max(30, Math.min(WIDTH - 30, p.x + dx / mag * p.speed * boost * TICK_MS / 1000));
    p.y = Math.max(30, Math.min(HEIGHT - 30, p.y + dy / mag * p.speed * boost * TICK_MS / 1000));
    if (p.hyperActiveUntil && now >= p.hyperActiveUntil) p.hyperActiveUntil = 0;
    doAttack(room, p, now);
  }
  for (const e of [...room.entities]) {
    e.x += e.vx * TICK_MS / 1000; e.y += e.vy * TICK_MS / 1000;
    if (e.x < 12 || e.x > WIDTH - 12) { if (e.kind === "ricochet") e.vx *= -1; else e.expires = now; }
    if (e.y < 12 || e.y > HEIGHT - 12) { if (e.kind === "ricochet") e.vy *= -1; else e.expires = now; }
    const owner = room.players.get(e.ownerId);
    for (const target of players) {
      if (!target.alive || target.id === e.ownerId || (room.mode !== "combate" && owner && target.team === owner.team)) continue;
      if (Math.hypot(target.x - e.x, target.y - e.y) < e.radius + 17) {
        hurt(room, owner, target, e.damage);
        if (e.kind === "splash") {
          for (const near of players) if (near.id !== target.id && near.alive && near.team !== (owner && owner.team) && Math.hypot(near.x - e.x, near.y - e.y) < 65) hurt(room, owner, near, Math.round(e.damage * 0.5));
        }
        e.expires = now; break;
      }
    }
    if (e.expires <= now) room.entities.splice(room.entities.indexOf(e), 1);
  }
  if (room.mode === "gemas") {
    if (room.gems.length < 5 && Math.random() < 0.025) room.gems.push({ id: crypto.randomUUID(), x: WIDTH / 2 + (Math.random() - 0.5) * 150, y: HEIGHT / 2 + (Math.random() - 0.5) * 150 });
    for (const p of players) if (p.alive) {
      const i = room.gems.findIndex(g => Math.hypot(g.x - p.x, g.y - p.y) < 26);
      if (i >= 0) { room.gems.splice(i, 1); p.gems++; p.super = Math.min(100, p.super + 8); }
      if (p.gems >= 5) endGame(room, p.name);
    }
  }
  if (room.mode === "fute" && room.ball) {
    for (const p of players) if (p.alive && Math.hypot(p.x - room.ball.x, p.y - room.ball.y) < 27) room.ball.carrierId = p.id;
    const carrier = players.find(p => p.id === room.ball.carrierId && p.alive);
    if (carrier) {
      room.ball.x = carrier.x + Math.cos(carrier.facing) * 22; room.ball.y = carrier.y + Math.sin(carrier.facing) * 22;
      if (carrier.input.attack) {
        const goalX = carrier.team === 0 ? WIDTH - 12 : 12;
        if (Math.abs(carrier.x - goalX) < 200 && Math.abs(carrier.y - HEIGHT / 2) < 120) {
          room.score[carrier.team]++; room.ball = { x: WIDTH / 2, y: HEIGHT / 2, carrierId: null };
          if (room.score[carrier.team] >= 3) endGame(room, carrier.team === 0 ? "Time azul" : "Time vermelho");
        } else if (Math.random() < 0.15) room.ball.carrierId = null;
      }
    }
  }
  if (now - room.startedAt > 180000 && room.state === "playing") endGame(room, room.mode === "combate" ? "Tempo esgotado" : (room.score[0] >= room.score[1] ? "Time azul" : "Time vermelho"));
  if (room.state === "playing" && now - room.lastBroadcast > 90) {
    room.lastBroadcast = now;
    sendRoom(room, "state", { width: WIDTH, height: HEIGHT, entities: room.entities, gems: room.gems, ball: room.ball, score: room.score, timeLeft: Math.max(0, 180 - Math.floor((now - room.startedAt) / 1000)), players: [...room.players.values()].map(publicPlayer) });
  }
}
const CLIENT_DIR = path.join(__dirname, "..", "client");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
  }
  const requestedPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.resolve(CLIENT_DIR, "." + requestedPath);
  if (!filePath.startsWith(CLIENT_DIR + path.sep) && filePath !== path.join(CLIENT_DIR, "index.html")) {
    res.writeHead(403); return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("Not found"); }
    res.writeHead(200, { "content-type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream", "x-content-type-options": "nosniff" });
    res.end(data);
  });
});
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });
wss.on("connection", ws => {
  send(ws, { type: "hello", characters: CHARACTERS, modes: [...MODES], maxPlayers: MAX_PLAYERS });
  ws.on("message", raw => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return send(ws, { type: "error", message: "Mensagem inválida." }); }
    const client = clients.get(ws);
    if (data.type === "create") {
      if (client) leave(ws);
      const room = makeRoom(null, data.mode, data.bots);
      const p = addPlayer(room, ws, data);
      room.hostId = p.id;
      send(ws, { type: "created", room: room.code, playerId: p.id, mode: room.mode });
      sendRoom(room, "lobby");
    } else if (data.type === "join") {
      const code = String(data.code || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || room.state !== "lobby") return send(ws, { type: "error", message: "Sala não encontrada ou partida já começou." });
      if (room.players.size >= MAX_PLAYERS) return send(ws, { type: "error", message: "Sala cheia (máximo de 10)." });
      if (client) leave(ws);
      const p = addPlayer(room, ws, data);
      send(ws, { type: "joined", room: room.code, playerId: p.id, mode: room.mode });
      sendRoom(room, "lobby");
    } else if (data.type === "ready") {
      const room = client && rooms.get(client.room); const p = room && room.players.get(client.id);
      if (!p || room.state !== "lobby") return;
      p.ready = true; sendRoom(room, "lobby");
    } else if (data.type === "start") {
      const room = client && rooms.get(client.room);
      if (!room || room.hostId !== client.id || room.state !== "lobby") return;
      const humans = [...room.players.values()].filter(p => !p.bot);
      if (room.mode !== "combate" && humans.length < 2 && !room.bots) return send(ws, { type: "error", message: "Convide pelo menos mais uma pessoa ou ative bots." });
      startGame(room);
    } else if (data.type === "input") {
      const room = client && rooms.get(client.room); const p = room && room.players.get(client.id);
      if (!p || room.state !== "playing" || !data.input || typeof data.input !== "object") return;
      const i = data.input;
      for (const k of ["up", "down", "left", "right", "attack", "super", "hyper"]) if (typeof i[k] === "boolean") p.input[k] = i[k];
      if (Number.isFinite(i.aimX)) p.input.aimX = Math.max(0, Math.min(WIDTH, i.aimX));
      if (Number.isFinite(i.aimY)) p.input.aimY = Math.max(0, Math.min(HEIGHT, i.aimY));
      p.facing = Math.atan2(p.input.aimY - p.y, p.input.aimX - p.x);
    } else if (data.type === "rematch") {
      const room = client && rooms.get(client.room);
      if (room && room.state === "results" && room.hostId === client.id) startGame(room);
    } else if (data.type === "leave") leave(ws);
  });
  ws.on("close", () => leave(ws));
  ws.on("error", () => leave(ws));
});
function leave(ws) {
  const client = clients.get(ws); if (!client) return;
  const room = rooms.get(client.room);
  clients.delete(ws);
  if (!room) return;
  room.players.delete(client.id);
  if (room.hostId === client.id) room.hostId = room.players.keys().next().value || null;
  if (!room.players.size) rooms.delete(room.code);
  else sendRoom(room, "lobby");
}
setInterval(() => { const now = Date.now(); for (const room of rooms.values()) updateRoom(room, now); }, TICK_MS);
server.listen(PORT, "0.0.0.0", () => console.log("SENAI BRAWL server listening on " + PORT));
