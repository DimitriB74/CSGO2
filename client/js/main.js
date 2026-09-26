// =============================================================================
//  Orchestration du client.
//
//  Deux boucles distinctes, et c'est volontaire :
//
//  - une boucle à pas fixe (64 Hz) qui construit l'entrée, la prédit localement
//    et l'envoie. Même cadence que le serveur, donc la prédiction est exacte ;
//  - le rendu, à la fréquence de l'écran, qui interpole les autres joueurs dans
//    un léger passé pour qu'ils bougent de façon fluide malgré 22 instantanés
//    par seconde.
// =============================================================================

import { SNAPSHOT_RATE, TICK_DT } from '/shared/constants.js';
import { eyeHeight } from '/shared/movement.js';
import { Audio } from '/js/audio.js';
import { Hud } from '/js/hud.js';
import { Input } from '/js/input.js';
import { Net } from '/js/net.js';
import { Predictor } from '/js/predict.js';
import { Scene3D } from '/js/scene.js';

const canvas = document.getElementById('view');
const net = new Net();
const input = new Input(canvas);
const audio = new Audio();

let scene = null;
let hud = null;
let predictor = null;
let latestSnapshot = null;
let sequence = 0;
let previousButtons = 0;
let started = false;

/** Historique par joueur distant, pour l'interpolation. */
const remoteHistory = new Map();
const INTERP_DELAY = 1800 / SNAPSHOT_RATE; // ms : un peu moins de deux instantanés

// -----------------------------------------------------------------------------
//  Connexion
// -----------------------------------------------------------------------------

net.onStatus = (text) => { document.getElementById('status').textContent = text; };

net.onInit = (init) => {
  scene = new Scene3D(canvas, init.map);
  hud = new Hud(init, (item) => {
    net.send({ t: 'buy', item });
    audio.buy();
  });
  predictor = new Predictor(init.map.geometry);

  // Orientation de départ, connue dès l'init : la première image regarde déjà
  // dans la bonne direction.
  input.yaw = init.spawnYaw ?? 0;
  input.respawnSeq = init.respawnSeq ?? 0;

  input.onToggleBuy = () => {
    const open = hud.toggleBuy();
    if (open) input.unlock();
    else input.lock();
  };
  input.onToggleScoreboard = (show) => hud.toggleScoreboard(show);
  input.enabled = true;

  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  input.lock();
  canvas.addEventListener('click', () => { if (!hud.buyOpen) input.lock(); });

  // Chiffres : achat rapide quand le menu est ouvert, changement d'arme sinon.
  addEventListener('keydown', (event) => {
    if (!hud.buyOpen) return;
    if (/^Digit[1-9]$/.test(event.code)) hud.quickBuy(Number(event.code.slice(5)) - 1);
    if (event.code === 'Escape') { hud.toggleBuy(false); input.lock(); }
  });

  net.onBuyResult = (result) => hud.buyResult(result);

  // Poignée de diagnostic. Le serveur étant seul décideur, l'exposer ne crée
  // aucune faille qu'un navigateur n'offrirait pas déjà : elle sert à inspecter
  // l'état du client et à tester automatiquement le jeu.
  window.__pdr = { net, input, predictor, scene, hud, audio };

  started = true;
  requestAnimationFrame(frame);
  setInterval(fixedStep, TICK_DT * 1000);
};

net.onSnapshot = (snap) => {
  latestSnapshot = snap;
  const now = performance.now();

  // À chaque apparition, on adopte l'orientation décidée par le serveur.
  // Sans ça, le client imposerait son lacet de départ (0°) et les joueurs
  // apparaîtraient tous face au nord — dos à la carte pour un des deux camps.
  if (snap.me.rs !== input.respawnSeq) {
    input.respawnSeq = snap.me.rs;
    input.yaw = snap.me.y;
    input.pitch = snap.me.pi;
  }

  predictor.frozen = snap.m.state === 'freeze' || snap.m.state === 'warmup';
  predictor.alive = !!snap.me.al;

  const weapon = snap.me.w ? net.init.weapons[snap.me.w] : null;
  predictor.speedFactor = weapon
    ? weapon.speedFactor * (snap.me.sc ? 0.45 : 1)
    : 1;

  predictor.reconcile(snap.me, snap.ack);
  hud.setTeam(snap.sb.find((row) => row.i === net.init.id)?.t ?? net.init.team);

  for (const other of snap.ps) {
    if (!remoteHistory.has(other.i)) remoteHistory.set(other.i, []);
    const history = remoteHistory.get(other.i);
    history.push({
      at: now,
      pos: { x: other.p[0], y: other.p[1], z: other.p[2] },
      yaw: other.y,
      crouch: other.c,
      alive: !!other.a,
      team: other.t,
      name: other.n,
      hp: other.hp,
      bomb: !!other.b,
    });
    while (history.length > 20) history.shift();
  }
  for (const id of remoteHistory.keys()) {
    if (!snap.ps.some((p) => p.i === id)) remoteHistory.delete(id);
  }

  handleEvents(snap.ev, snap);
  hud.handleEvents(snap.ev, net.init.id);
};

// -----------------------------------------------------------------------------
//  Effets déclenchés par les événements du serveur
// -----------------------------------------------------------------------------

function handleEvents(events, snap) {
  if (!events || !scene) return;
  const me = { x: snap.me.p[0], y: snap.me.p[1], z: snap.me.p[2] };
  const distanceTo = (p) => Math.hypot(p.x - me.x, p.y - me.y, p.z - me.z);

  for (const event of events) {
    switch (event.type) {
      case 'shot': {
        scene.tracer(event.from, event.to);
        scene.muzzle(event.from);
        const weapon = net.init.weapons[event.weapon];
        audio.shot(weapon ? weapon.category : 'rifle', distanceTo(event.from));
        break;
      }
      case 'impact':
        scene.spark(event.pos);
        audio.impact(distanceTo(event.pos));
        break;
      case 'hit':
        if (event.attacker === net.init.id) {
          if (event.zone === 'head') audio.headshot();
          else audio.hit();
        }
        if (event.victim === net.init.id) audio.hurt();
        break;
      case 'explosion':
        scene.explosion(event.pos);
        audio.explosion(distanceTo(event.pos));
        break;
      case 'plant':
        audio.plant();
        break;
      case 'defused':
        audio.defuse();
        break;
      case 'announce':
        if (event.text.startsWith('Round')) audio.roundStart();
        break;
    }
  }

  // Bip de la charge armée, de plus en plus pressant.
  const bomb = snap.m.bomb;
  if (bomb && bomb.planted) {
    const urgency = 1 - Math.min(1, bomb.timer / 40);
    const interval = 1000 - urgency * 830;
    if (!handleEvents.nextBeep || performance.now() > handleEvents.nextBeep) {
      audio.beep();
      handleEvents.nextBeep = performance.now() + interval;
    }
  } else {
    handleEvents.nextBeep = 0;
  }
}

// -----------------------------------------------------------------------------
//  Boucle à pas fixe : entrée, prédiction, envoi
// -----------------------------------------------------------------------------

function fixedStep() {
  if (!started || !net.ready) return;

  sequence++;
  const message = input.build(sequence);
  predictor.push(message, previousButtons);
  previousButtons = message.btn;
  net.sendInput(message);
}

// -----------------------------------------------------------------------------
//  Rendu
// -----------------------------------------------------------------------------

let lastFrame = performance.now();

function frame() {
  requestAnimationFrame(frame);
  if (!scene || !latestSnapshot) return;

  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  const snap = latestSnapshot;
  const me = snap.me;

  // --- caméra ---------------------------------------------------------------
  // On part de la position prédite localement : c'est ce qui rend le déplacement
  // instantané. Le recul vient du serveur et décale la vue, donc le viseur suit
  // les balles : compenser en tirant la souris vers le bas fonctionne.
  const state = predictor.state;
  const eye = {
    x: state.pos.x,
    y: state.pos.y + eyeHeight(state.crouchBlend),
    z: state.pos.z,
  };

  const weapon = me.w ? net.init.weapons[me.w] : null;
  const fov = me.sc && weapon && weapon.scopedFov ? weapon.scopedFov : 90;
  const viewYaw = input.yaw + me.pu[1];
  const viewPitch = input.pitch + me.pu[0];
  scene.setCamera(eye, viewYaw, viewPitch, fov);
  hud.viewYaw = input.yaw;

  // --- joueurs distants, interpolés dans un léger passé ---------------------
  const renderTime = now - INTERP_DELAY;
  const remotePlayers = [];
  for (const [id, history] of remoteHistory) {
    const sample = sampleHistory(history, renderTime);
    if (sample) remotePlayers.push({ id, ...sample });
  }
  scene.updatePlayers(remotePlayers);
  scene.updatePickups(snap.pk ?? []);
  scene.setBomb(snap.m.bomb);

  // --- interface -------------------------------------------------------------
  // Écart du viseur = projection exacte du cône sur l'écran.
  const halfFov = (fov / 2) * Math.PI / 180;
  const spreadPixels = Math.tan((me.sp * Math.PI) / 180) / Math.tan(halfFov) * (innerHeight / 2);
  hud.update(snap, spreadPixels, dt);
  hud.drawNametags(remotePlayers, (p) => scene.project(p));

  scene.render(dt);
}

/** Interpolation linéaire entre les deux échantillons qui encadrent l'instant voulu. */
function sampleHistory(history, time) {
  if (history.length === 0) return null;
  if (history.length === 1 || time >= history[history.length - 1].at) {
    return history[history.length - 1];
  }

  for (let i = history.length - 1; i > 0; i--) {
    const after = history[i];
    const before = history[i - 1];
    if (before.at <= time && time <= after.at) {
      const span = after.at - before.at;
      const t = span > 0 ? (time - before.at) / span : 0;
      return {
        pos: {
          x: before.pos.x + (after.pos.x - before.pos.x) * t,
          y: before.pos.y + (after.pos.y - before.pos.y) * t,
          z: before.pos.z + (after.pos.z - before.pos.z) * t,
        },
        // Par le plus court chemin, sinon la silhouette pivote à l'envers en
        // passant de 359° à 1°.
        yaw: before.yaw + (((after.yaw - before.yaw + 540) % 360) - 180) * t,
        crouch: before.crouch + (after.crouch - before.crouch) * t,
        alive: after.alive,
        team: after.team,
        name: after.name,
        hp: after.hp,
        bomb: after.bomb,
      };
    }
  }
  return history[0];
}

// -----------------------------------------------------------------------------
//  Écran d'accueil
// -----------------------------------------------------------------------------

document.getElementById('play').addEventListener('click', () => {
  const name = document.getElementById('nick').value.trim() || 'Joueur';
  audio.start();
  net.connect(name);
});

document.getElementById('nick').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') document.getElementById('play').click();
});
