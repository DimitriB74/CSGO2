// =============================================================================
//  Point d'entrée : serveur HTTP (fichiers du client) + WebSocket (le jeu).
//
//  Un seul processus, une seule adresse. C'est ce qui permet de déployer sur
//  Render, Railway ou Fly en tant que service web unique, sans serveur de jeu
//  séparé ni port à ouvrir.
// =============================================================================

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { ROUND, SNAPSHOT_RATE, TICK_DT, TICK_RATE } from '../shared/constants.js';
import { MAP } from '../shared/map.js';
import { GEAR, WEAPONS } from '../shared/weapons.js';
import { World } from './world.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = process.env.PORT || 3000;

// -----------------------------------------------------------------------------
//  Fichiers statiques
// -----------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function serveFile(res, relativePath) {
  // normalize + préfixe vérifié : personne ne remonte hors du dossier du projet.
  const full = join(ROOT, normalize(relativePath).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(ROOT)) {
    res.writeHead(403).end('Interdit');
    return;
  }
  try {
    const info = await stat(full);
    if (!info.isFile()) throw new Error('pas un fichier');
    const body = await readFile(full);
    res.writeHead(200, {
      'Content-Type': MIME[extname(full)] || 'application/octet-stream',
      'Cache-Control': extname(full) === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('Introuvable');
  }
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let path = decodeURIComponent(url.pathname);

  if (path === '/' ) path = '/client/index.html';
  else if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: world.players().length, tick: world.tickCount }));
    return;
  } else if (path.startsWith('/shared/') || path.startsWith('/client/')) {
    // chemins déjà corrects
  } else {
    path = `/client${path}`;
  }

  serveFile(res, path);
});

// -----------------------------------------------------------------------------
//  Le monde
// -----------------------------------------------------------------------------

const world = new World();
const clients = new Map(); // playerId → socket

/** On maintient dix joueurs : les places libres sont prises par des bots. */
function ensureBots() {
  const humans = world.players().filter((p) => !p.isBot);
  const bots = world.players().filter((p) => p.isBot);
  const wanted = Math.max(0, ROUND.teamSize * 2 - humans.length);

  if (bots.length < wanted) {
    for (let i = bots.length; i < wanted; i++) {
      world.addPlayer({ name: BOT_NAMES[i % BOT_NAMES.length], isBot: true });
    }
  } else if (bots.length > wanted) {
    // On retire en priorité les bots de l'équipe la plus nombreuse.
    const extra = bots.length - wanted;
    for (let i = 0; i < extra; i++) {
      const sorted = world.players().filter((p) => p.isBot);
      if (sorted.length === 0) break;
      sorted.sort((a, b) => world.players(b.team).length - world.players(a.team).length);
      world.removePlayer(sorted[0].id);
    }
  }
}

const BOT_NAMES = [
  'Sable', 'Ancre', 'Quartz', 'Bitume', 'Névé',
  'Silex', 'Cobalt', 'Fanal', 'Bourrache', 'Zéphyr',
  'Cargo', 'Talus', 'Bruine', 'Étier', 'Grésil',
];

/** Envoyé une seule fois à la connexion : tout ce qui ne change jamais. */
function buildInitMessage(player) {
  const weapons = {};
  for (const [id, w] of Object.entries(WEAPONS)) {
    weapons[id] = {
      id, name: w.name, category: w.category, team: w.team, price: w.price,
      magazine: w.magazine, reserve: w.reserve, baseDamage: w.baseDamage,
      rpm: w.rpm, fireMode: w.fireMode, scoped: w.scoped, scopedFov: w.scopedFov,
      speedFactor: w.speedFactor, killReward: w.killReward, pellets: w.pellets,
      armorPenetration: w.armorPenetration, headMultiplier: w.headMultiplier,
    };
  }

  return {
    t: 'init',
    id: player.id,
    team: player.team,
    spawnYaw: player.yaw,
    respawnSeq: player.respawnSeq,
    tickRate: TICK_RATE,
    snapshotRate: SNAPSHOT_RATE,
    map: {
      name: MAP.name,
      geometry: MAP.geometry,
      sites: MAP.sites,
      buyZones: MAP.buyZones,
      bounds: MAP.bounds,
      callouts: MAP.callouts,
    },
    weapons,
    gear: Object.values(GEAR),
  };
}

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (socket) => {
  let player = null;

  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // message illisible : on ignore, jamais de plantage du serveur
    }

    if (msg.t === 'join') {
      if (player) return;

      const name = String(msg.name || 'Joueur').slice(0, 16).trim() || 'Joueur';
      player = world.addPlayer({ name, isBot: false });
      clients.set(player.id, socket);
      ensureBots();

      // On le fait apparaître AVANT d'envoyer l'init : le message porte ainsi
      // déjà la bonne orientation de départ, et le client vise correctement dès
      // sa première image, sans attendre le premier instantané.
      world.spawnLate(player);

      socket.send(JSON.stringify(buildInitMessage(player)));
      world.announce(`${player.name} rejoint la partie`);
      return;
    }

    if (!player) return;

    switch (msg.t) {
      case 'input': {
        // Le serveur ne fait confiance à rien : chaque champ est borné.
        world.setInput(player, {
          rs: msg.rs | 0,
          mx: clampAxis(msg.mx),
          mz: clampAxis(msg.mz),
          yaw: Number.isFinite(msg.yaw) ? msg.yaw : player.yaw,
          pitch: Number.isFinite(msg.pitch) ? Math.max(-89, Math.min(89, msg.pitch)) : player.pitch,
          btn: (msg.btn | 0) & 0x7f,
          slot: Math.max(0, Math.min(3, msg.slot | 0)),
          seq: msg.seq | 0,
        });

        // Mesure de latence : le client renvoie l'horodatage du dernier
        // instantané reçu. L'aller-retour divisé par deux donne le sens unique.
        if (Number.isFinite(msg.lastMs) && msg.lastMs > 0) {
          const rtt = Date.now() - msg.lastMs;
          if (rtt >= 0 && rtt < 2000) player.latency = Math.min(0.4, rtt / 2000);
        }
        break;
      }

      case 'buy': {
        const result = world.buy(player, String(msg.item || ''));
        socket.send(JSON.stringify({ t: 'buyResult', ...result }));
        break;
      }

      case 'chat': {
        const text = String(msg.text || '').slice(0, 120);
        if (text) world.pushEvent({ type: 'chat', name: player.name, team: player.team, text });
        break;
      }
    }
  });

  socket.on('close', () => {
    if (!player) return;
    world.announce(`${player.name} quitte la partie`);
    clients.delete(player.id);
    world.removePlayer(player.id);
    ensureBots();
  });

  socket.on('error', () => {
    /* le close suivra */
  });
});

const clampAxis = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

// -----------------------------------------------------------------------------
//  Boucles
// -----------------------------------------------------------------------------

// Boucle de simulation : on compense la dérive de setInterval en rattrapant les
// ticks en retard, sinon le jeu ralentirait sous charge au lieu de sauter.
let nextTickTime = Date.now();
setInterval(() => {
  const now = Date.now();
  let guard = 0;
  while (now >= nextTickTime && guard < 8) {
    world.tick();
    collectSnapshotEvents();
    nextTickTime += TICK_DT * 1000;
    guard++;
  }
  if (guard >= 8) nextTickTime = now; // trop de retard : on abandonne le rattrapage
}, 1000 / TICK_RATE);

// Les événements naissent au tick, mais sont envoyés au rythme des instantanés :
// on les accumule pour ne rien perdre entre deux envois.
let pendingEvents = [];
function collectSnapshotEvents() {
  if (world.events.length > 0) pendingEvents.push(...world.events);
}

setInterval(() => {
  if (clients.size === 0) {
    pendingEvents.length = 0;
    return;
  }
  for (const [id, socket] of clients) {
    const player = world.byId.get(id);
    if (!player || socket.readyState !== 1) continue;
    const snap = world.snapshot(player);
    snap.ev = pendingEvents;
    socket.send(JSON.stringify(snap));
  }
  pendingEvents = [];
}, 1000 / SNAPSHOT_RATE);

ensureBots();

httpServer.listen(PORT, () => {
  console.log(`[Point de Rupture] serveur prêt sur le port ${PORT}`);
  console.log(`[Point de Rupture] carte « ${MAP.name} », ${TICK_RATE} Hz, instantanés à ${SNAPSHOT_RATE} Hz`);
});
