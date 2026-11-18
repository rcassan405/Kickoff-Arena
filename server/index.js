import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createMatch, addPlayer, stepMatch, resetPositions, normalizePlayerNumber, STADIUMS } from '../public/physics.js';

const app = express();
const http = createServer(app);
const io = new Server(http);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rooms = new Map();
const bySocket = new Map();

app.use(express.static(path.join(root, 'public')));
app.get('/api/rooms', (_, res) => res.json([...rooms.values()].map(r => ({
  code: r.code, name: r.name, count: r.match.players.length,
  maxPlayers: r.maxPlayers, stadium: r.stadium, public: r.public
}))));

function code() {
  let value;
  do value = Math.random().toString(36).slice(2, 7).toUpperCase();
  while (rooms.has(value));
  return value;
}

function roster(r) {
  return r.match.players.map(({ id, name, number, team, x, y, vx, vy }) => ({ id, name, number, team, x, y, vx, vy }));
}

function snapshot(r) {
  const m = r.match;
  return {
    field: m.field,
    players: m.players.map(({ input, ...p }) => p),
    ball: m.ball, score: m.score, time: m.time,
    paused: m.paused, over: m.over, stadium: r.stadium, events: m.events, teamsLocked: m.teamsLocked, kickRate: m.kickRate
  };
}

function announce(r, text) {
  io.to(r.code).emit('chat', { system: true, text });
}

function join(s, r, o, ack) {
  s.join(r.code);
  const host = r.match.players.length === 0;
  const name = String(o.playerName || 'Player').trim().slice(0, 18) || 'Player';
  addPlayer(r.match, s.id, name, r.match.teamsLocked ? 2 : r.match.players.length % 2, o.number);
  bySocket.set(s.id, { r, name, host });
  ack({ code: r.code, host, stadium: r.stadium });
  io.to(r.code).emit('roster', roster(r));
  announce(r, host ? `${name} inició el partido` : `${name} entró a la sala`);
}

io.on('connection', s => {
  s.on('createRoom', (o = {}, ack = () => {}) => {
    const c = code();
    const r = {
      code: c,
      name: String(o.name || 'Room').trim().slice(0, 24) || 'Room',
      password: String(o.password || '').slice(0, 40),
      public: o.public !== false,
      maxPlayers: 12,
      stadium: STADIUMS[o.stadium] ? o.stadium : 'Classic',
      match: createMatch(o.stadium, o)
    };
    rooms.set(c, r);
    join(s, r, o, ack);
  });

  s.on('joinRoom', (o = {}, ack = () => {}) => {
    const r = rooms.get(String(o.code || '').trim().toUpperCase());
    if (!r) return ack({ error: 'Sala no encontrada' });
    if (r.password && r.password !== o.password) return ack({ error: 'Contraseña incorrecta' });
    if (r.match.players.length >= r.maxPlayers) return ack({ error: 'Sala llena' });
    join(s, r, o, ack);
  });

  s.on('input', v => {
    const x = bySocket.get(s.id);
    if (!x || !v || typeof v !== 'object') return;
    const p = x.r.match.players.find(q => q.id === s.id);
    if (!p) return;
    const axis = n => Number.isFinite(Number(n)) ? Math.max(-1, Math.min(1, Number(n))) : 0;
    p.input = p.team === 2 ? { x: 0, y: 0, kick: false } : { x: axis(v.x), y: axis(v.y), kick: v.kick === true };
  });

  s.on('team', t => {
    const x = bySocket.get(s.id);
    const p = x?.r.match.players.find(q => q.id === s.id);
    if (x?.r.match.teamsLocked && !x.host) return;
    if (p) {
      const previousTeam = p.team;
      p.team = [0, 1, 2].includes(t) ? t : 0;
      p.vx = p.vy = 0;
      p.input = { x: 0, y: 0, kick: false };
      p.kickSpent = p.kickReady = p.kickHeld = false;
      p.x = x.r.match.field.width * (p.team === 1 ? .72 : .28);
      p.y = x.r.match.field.height / 2;
      io.to(x.r.code).emit('roster', roster(x.r));
      if (previousTeam !== p.team) announce(x.r, `${p.name} cambió a ${['Rojo', 'Azul', 'Espectadores'][p.team]}`);
    }
  });

  s.on('number', value => {
    const x = bySocket.get(s.id);
    const p = x?.r.match.players.find(q => q.id === s.id);
    if (!p) return;
    p.number = normalizePlayerNumber(value, p.number || '1');
    io.to(x.r.code).emit('roster', roster(x.r));
    announce(x.r, `${p.name} cambió su número a ${p.number}`);
  });

  s.on('kickRate', value => {
    const x = bySocket.get(s.id);
    if (!x?.host) return;
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < .08 || rate > .6) return;
    x.r.match.kickRate = rate;
    announce(x.r, `${x.name} ajustó la frecuencia de chute a ${rate.toFixed(2)} s`);
  });

  s.on('assignTeam', ({ playerId, team } = {}) => {
    const x = bySocket.get(s.id);
    if (!x?.host || ![0, 1, 2].includes(team)) return;
    const target = x.r.match.players.find(p => p.id === playerId);
    if (!target) return;
    const previousTeam = target.team;
    target.team = team;
    target.input = { x: 0, y: 0, kick: false };
    target.vx = target.vy = 0;
    target.kickSpent = target.kickReady = target.kickHeld = false;
    target.x = x.r.match.field.width * (team === 1 ? .72 : .28);
    target.y = x.r.match.field.height / 2;
    io.to(x.r.code).emit('roster', roster(x.r));
    if (previousTeam !== team) announce(x.r, `${target.name} fue movido a ${['Rojo', 'Azul', 'Espectadores'][team]} por ${x.name}`);
  });

  s.on('chat', msg => {
    const x = bySocket.get(s.id);
    const text = String(msg ?? '').trim().slice(0, 200);
    if (x && text) io.to(x.r.code).emit('chat', { name: x.name, text });
  });

  s.on('admin', action => {
    const x = bySocket.get(s.id);
    if (!x?.host) return;
    if (action === 'pause') { x.r.match.paused = !x.r.match.paused; announce(x.r, `${x.name} ${x.r.match.paused ? 'paró' : 'reanudo'} el juego`); }
    if (action === 'teamsLock') { x.r.match.teamsLocked = !x.r.match.teamsLocked; announce(x.r, `${x.name} ${x.r.match.teamsLocked ? 'bloqueó' : 'desbloqueó'} los equipos`); }
    if (action === 'powerShots') { x.r.match.events.powerShots = !x.r.match.events.powerShots; announce(x.r, `${x.name} ${x.r.match.events.powerShots ? 'activó' : 'desactivó'} los tiros potentes`); }
    if (action === 'curveShots') { x.r.match.events.curveShots = !x.r.match.events.curveShots; announce(x.r, `${x.name} ${x.r.match.events.curveShots ? 'activó' : 'desactivó'} los tiros con efecto`); }
    if (action === 'fastPitch') { x.r.match.events.fastPitch = !x.r.match.events.fastPitch; announce(x.r, `${x.name} ${x.r.match.events.fastPitch ? 'activó' : 'desactivó'} el campo rápido`); }
    if (action === 'giantBall') { x.r.match.events.giantBall = !x.r.match.events.giantBall; announce(x.r, `${x.name} ${x.r.match.events.giantBall ? 'activó' : 'desactivó'} el balón gigante`); }
    if (action === 'superBounce') { x.r.match.events.superBounce = !x.r.match.events.superBounce; announce(x.r, `${x.name} ${x.r.match.events.superBounce ? 'activó' : 'desactivó'} el rebote fuerte`); }
    if (action === 'reverseControls') { x.r.match.events.reverseControls = !x.r.match.events.reverseControls; announce(x.r, `${x.name} ${x.r.match.events.reverseControls ? 'activó' : 'desactivó'} los controles inversos`); }
    if (action === 'reset') {
      resetPositions(x.r.match);
      x.r.match.paused = false;
      x.r.match.over = false;
      x.r.match.score = [0, 0];
      x.r.match.time = x.r.match.duration;
      announce(x.r, `${x.name} reinició el partido`);
    }
  });

  s.on('disconnect', () => {
    const x = bySocket.get(s.id);
    if (!x) return;
    const { r } = x;
    r.match.players = r.match.players.filter(p => p.id !== s.id);
    bySocket.delete(s.id);
    if (!r.match.players.length) {
      rooms.delete(r.code);
      return;
    }
    io.to(r.code).emit('roster', roster(r));
    announce(r, `${x.name} salió de la sala`);
    if (x.host) {
      const next = r.match.players[0];
      const meta = bySocket.get(next.id);
      if (meta) {
        meta.host = true;
        io.to(next.id).emit('host', true);
        announce(r, `${meta.name} ahora es anfitrión`);
      }
    }
  });
});

setInterval(() => {
  for (const r of rooms.values()) {
    const wasOver = r.match.over;
    if (stepMatch(r.match, 1 / 30) === 'goal') announce(r, `¡Gol! Rojo ${r.match.score[0]} – Azul ${r.match.score[1]}`);
    if (!wasOver && r.match.over) announce(r, 'Partida terminada');
    io.to(r.code).emit('state', snapshot(r));
  }
}, 1000 / 30);

const port = Number(process.env.PORT) || 3000;
http.listen(port, () => console.log(`Kickoff Arena: http://localhost:${port}`));
