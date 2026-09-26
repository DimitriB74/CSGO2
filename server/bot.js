// =============================================================================
//  Bots.
//
//  Ils n'ont aucun privilège : un bot remplit la **même structure d'entrées**
//  qu'un joueur humain (axes, angles de vue, boutons), et la simulation la traite
//  exactement de la même façon. Un bot est donc soumis au recul, à la dispersion,
//  au temps de rechargement et à l'économie, sans exception.
//
//  C'est aussi ce qui rend le jeu testable seul : la partie tourne à dix même
//  sans amis connectés.
// =============================================================================

import { BTN, ROUND, TEAM } from '../shared/constants.js';
import { hasLineOfSight } from '../shared/collision.js';
import { MAP, findPath, nearestNode, siteAt, siteCenter, inBuyZone } from '../shared/map.js';
import { WEAPONS } from '../shared/weapons.js';

/** Trois niveaux, réglés par l'erreur de visée et le temps de réaction. */
const SKILL = {
  /** Écart de visée en degrés, à 20 m. */
  aimError: 2.6,
  /** Vitesse de rotation de la vue, en degrés par seconde. */
  turnSpeed: 320,
  /** Délai avant de réagir à une cible qui apparaît, en secondes. */
  reaction: 0.22,
  /** Portée maximale à laquelle un bot ouvre le feu. */
  engageRange: 60,
  /** Demi-angle du champ de vision, en degrés. */
  fov: 75,
};

function angleTo(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dy = to.y - from.y;
  const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
  const horizontal = Math.hypot(dx, dz);
  const pitch = (-Math.atan2(dy, horizontal) * 180) / Math.PI;
  return { yaw, pitch };
}

function shortestAngle(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function eye(player) {
  return { x: player.pos.x, y: player.pos.y + 1.55, z: player.pos.z };
}

/** Cible la plus proche, visible et dans le champ de vision. */
function findTarget(world, bot) {
  const origin = eye(bot);
  const weapon = world.currentWeapon(bot);
  const reach = weapon ? Math.min(SKILL.engageRange, weapon.maxRange * 0.7) : 10;
  let best = null;
  let bestDist = SKILL.engageRange;

  for (const other of world.byId.values()) {
    if (other === bot || !other.alive || other.team === bot.team) continue;

    const target = { x: other.pos.x, y: other.pos.y + 1.2, z: other.pos.z };
    const dx = target.x - origin.x;
    const dz = target.z - origin.z;
    const distance = Math.hypot(dx, dz);
    if (distance > bestDist) continue;
    // Portée utile de l'arme tenue : un pistolet n'engage pas à 50 m.
    if (distance > reach) continue;

    // Champ de vision : un bot ne voit pas dans son dos.
    const desired = angleTo(origin, target);
    if (Math.abs(shortestAngle(bot.yaw, desired.yaw)) > SKILL.fov) continue;
    if (!hasLineOfSight(origin, target, MAP.geometry)) continue;

    bestDist = distance;
    best = { player: other, distance, aim: desired };
  }
  return best;
}

/** Achats : fusil si possible, sinon SMG, sinon pistolet lourd. Gilet en priorité. */
function buyPhase(world, bot) {
  const state = bot.bot;
  if (state.boughtRound === world.match.round) return;
  if (!inBuyZone(bot.team, bot.pos)) return;

  state.boughtRound = world.match.round;

  const rifle = bot.team === TEAM.CENDRE ? WEAPONS.faucheur : WEAPONS.arbitre;
  const smg = bot.team === TEAM.CENDRE ? WEAPONS.guepe : WEAPONS.onde9;

  // Le gilet d'abord : sans armure, une balle de fusil au torse fait 36 dégâts
  // au lieu de 28, ce qui change le nombre de balles pour tuer.
  if (bot.money >= rifle.price + 1000) {
    world.buy(bot, 'casque');
    world.buy(bot, rifle.id);
  } else if (bot.money >= smg.price + 650) {
    world.buy(bot, 'gilet');
    world.buy(bot, smg.id);
  } else if (bot.money >= 1000) {
    world.buy(bot, 'casque');
  } else if (bot.money >= GEAR_PISTOL_PRICE) {
    world.buy(bot, 'masse50');
  }

  if (bot.team === TEAM.VERROU && bot.money >= 400) world.buy(bot, 'kit');
}

const GEAR_PISTOL_PRICE = 700;

/** Objectif courant, selon le camp et l'état de la bombe. */
function chooseGoal(world, bot) {
  const match = world.match;

  if (match.bomb.planted) {
    // Les deux camps convergent sur la charge.
    return match.bomb.pos;
  }

  if (bot.team === TEAM.CENDRE) {
    // Tout le monde va sur le même site que le porteur : jouer groupé.
    if (!bot.bot.site) bot.bot.site = world.match.round % 2 === 0 ? 'A' : 'B';
    return siteCenter(bot.bot.site);
  }

  // Les Verrou se répartissent entre les deux sites.
  if (!bot.bot.site) bot.bot.site = bot.id % 2 === 0 ? 'A' : 'B';
  return siteCenter(bot.bot.site);
}

export function updateBot(world, bot, dt) {
  const state = bot.bot;
  // `rs` doit suivre le compteur d'apparition : le serveur ignore l'orientation
  // d'une entrée qui n'a pas vu la dernière apparition, et un bot resterait
  // alors figé face à son point de départ, incapable de viser.
  const input = { rs: bot.respawnSeq, mx: 0, mz: 0, yaw: bot.yaw, pitch: bot.pitch, btn: 0, slot: 0, seq: 0 };

  if (!bot.alive) {
    state.site = null;
    bot.input = input;
    return;
  }

  if (world.match.buyOpen) buyPhase(world, bot);

  // Reprendre l'arme la plus efficace disponible.
  if (bot.inv.primary && bot.slot !== 'primary') input.slot = 1;

  const target = findTarget(world, bot);
  const now = world.time;

  if (target) {
    // Temps de réaction : un bot ne tire pas à l'instant où la cible apparaît.
    if (state.target !== target.player.id) {
      state.target = target.player.id;
      state.reactAt = now + SKILL.reaction;
      // Erreur de visée tirée une fois par cible, pas à chaque tick : sinon le
      // viseur tremblerait de façon caricaturale.
      const spread = SKILL.aimError * (0.5 + target.distance / 40);
      state.aimError = {
        yaw: (Math.random() * 2 - 1) * spread,
        pitch: (Math.random() * 2 - 1) * spread * 0.5,
      };
    }

    const wantYaw = target.aim.yaw + state.aimError.yaw;
    const wantPitch = target.aim.pitch + state.aimError.pitch;
    const maxTurn = SKILL.turnSpeed * dt;

    input.yaw = bot.yaw + Math.max(-maxTurn, Math.min(maxTurn, shortestAngle(bot.yaw, wantYaw)));
    input.pitch = bot.pitch + Math.max(-maxTurn, Math.min(maxTurn, wantPitch - bot.pitch));

    const aligned = Math.abs(shortestAngle(input.yaw, wantYaw)) < 3;
    const weapon = world.currentWeapon(bot);
    const stateAmmo = world.currentState(bot);

    if (stateAmmo && stateAmmo.ammo <= 0) {
      input.btn |= BTN.RELOAD;
    } else if (aligned && now >= state.reactAt) {
      // Une arme semi-automatique exige de RELÂCHER la gâchette entre deux
      // coups : si le bot la maintient, il ne tire qu'une seule fois. On pulse
      // donc un tick sur deux, décalé par l'identifiant pour que les bots ne
      // tirent pas tous en cadence.
      const holdTrigger = weapon && weapon.fireMode === 'auto';
      if (holdTrigger || (world.tickCount + bot.id) % 2 === 0) input.btn |= BTN.FIRE;
    }

    // À longue portée, on continue d'avancer vers l'objectif tout en tirant :
    // rester planté à 40 m avec un pistolet ne mène à rien.
    const tooFarToTrade = target.distance > 25;
    if (tooFarToTrade) {
      input.mz = 0.7;
    } else if (now < state.reactAt) {
      // Pas latéral avant d'ouvrir le feu, pour ne pas être une cible fixe.
      if (now > state.nextThink) {
        state.strafe = Math.random() < 0.5 ? -1 : 1;
        state.nextThink = now + 0.6;
      }
      input.mx = state.strafe * 0.8;
    }

    bot.input = input;
    return;
  }

  state.target = null;

  // --- déplacement vers l'objectif -----------------------------------------
  const goal = chooseGoal(world, bot);
  const goalNode = nearestNode(goal);

  if (now > state.nextThink || state.path.length === 0) {
    state.nextThink = now + 0.8;
    state.path = findPath(nearestNode(bot.pos), goalNode);
    state.node = 0;
  }

  // Objectif atteint : poser ou désamorcer.
  const dxGoal = goal.x - bot.pos.x;
  const dzGoal = goal.z - bot.pos.z;
  const distanceToGoal = Math.hypot(dxGoal, dzGoal);

  if (bot.team === TEAM.CENDRE && bot.hasBomb && siteAt(bot.pos)) {
    input.btn |= BTN.USE;
    bot.input = input;
    return;
  }
  if (bot.team === TEAM.VERROU && world.match.bomb.planted && distanceToGoal < 1.4) {
    input.btn |= BTN.USE;
    bot.input = input;
    return;
  }

  // Suivre le chemin.
  let waypoint = null;
  while (state.node < state.path.length) {
    const node = MAP.nav.nodes[state.path[state.node]];
    const dx = node.x - bot.pos.x;
    const dz = node.z - bot.pos.z;
    if (dx * dx + dz * dz < 2.25) {
      state.node++;
      continue;
    }
    waypoint = node;
    break;
  }
  if (!waypoint && distanceToGoal > 2) waypoint = goal;

  if (waypoint) {
    const desired = angleTo({ x: bot.pos.x, y: 0, z: bot.pos.z }, { x: waypoint.x, y: 0, z: waypoint.z });
    const maxTurn = SKILL.turnSpeed * dt;
    input.yaw = bot.yaw + Math.max(-maxTurn, Math.min(maxTurn, shortestAngle(bot.yaw, desired.yaw)));
    input.pitch = bot.pitch * 0.9;
    input.mz = 1;

    // Anti-blocage : si on n'avance plus, on repart sur un autre chemin.
    const moved = Math.hypot(bot.pos.x - (state.lastX ?? 0), bot.pos.z - (state.lastZ ?? 0));
    if (moved < 0.05) {
      state.stuck = (state.stuck || 0) + dt;
      if (state.stuck > 0.7) {
        state.stuck = 0;
        state.path = [];
        input.mx = Math.random() < 0.5 ? -1 : 1;
        input.btn |= BTN.JUMP;
      }
    } else {
      state.stuck = 0;
    }
    state.lastX = bot.pos.x;
    state.lastZ = bot.pos.z;
  }

  bot.input = input;
}
