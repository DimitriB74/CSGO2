// =============================================================================
//  La simulation. Elle tourne à 64 Hz sur le serveur, qui est **la seule
//  autorité** : les clients envoient des intentions, jamais des résultats.
//
//  Trois mécanismes rendent le jeu agréable malgré la latence :
//
//  1. le client prédit son propre déplacement avec le même code
//     (shared/movement.js) et se corrige quand le serveur le contredit ;
//  2. les autres joueurs sont interpolés entre deux instantanés ;
//  3. les tirs sont résolus avec **compensation de latence** : on rembobine les
//     hitbox à l'instant où le tireur a vu sa cible, donc on touche ce qu'on
//     voyait à l'écran.
// =============================================================================

import {
  BTN, ECONOMY, HEALTH, LAG_COMP_MAX, LAG_COMP_WINDOW, MOVE, ROUND,
  SNAPSHOT_RATE, TEAM, TICK_DT, TICK_RATE, otherTeam,
} from '../shared/constants.js';
import { moveAndCollide, playerHitboxes, pushApart, rayBox, raycastWorld, hasLineOfSight }
  from '../shared/collision.js';
import { resolveDamage } from '../shared/damage.js';
import { MAP, inBuyZone, siteAt } from '../shared/map.js';
import { applySpread, computeSpread, patternKick, recoverPunch } from '../shared/recoil.js';
import { GEAR, WEAPONS, buyList, gearList, startingPistol } from '../shared/weapons.js';
import { bodyHeight, eyeHeight, stepVelocity, wishDirection, wishSpeed } from '../shared/movement.js';
import { dirFromAngles } from '../shared/vec.js';
import { Match } from './match.js';
import { updateBot } from './bot.js';

const HISTORY_SIZE = Math.ceil(LAG_COMP_WINDOW * TICK_RATE);

function weaponState(weapon) {
  return { id: weapon.id, ammo: weapon.magazine, reserve: weapon.reserve };
}

let nextEntityId = 1;

export class World {
  constructor() {
    this.tickCount = 0;
    this.time = 0;
    this.byId = new Map();
    this.events = [];
    this.pickups = [];
    this.match = new Match(this);
    this.friendlyFire = false;
  }

  // ---------------------------------------------------------------------------
  //  Joueurs
  // ---------------------------------------------------------------------------

  players(team = null) {
    const list = [];
    for (const p of this.byId.values()) if (!team || p.team === team) list.push(p);
    return list;
  }

  alivePlayers(team = null) {
    return this.players(team).filter((p) => p.alive);
  }

  /** Équipe la moins peuplée, pour garder les camps équilibrés. */
  pickTeam() {
    const cendre = this.players(TEAM.CENDRE).length;
    const verrou = this.players(TEAM.VERROU).length;
    if (cendre === verrou) return Math.random() < 0.5 ? TEAM.CENDRE : TEAM.VERROU;
    return cendre < verrou ? TEAM.CENDRE : TEAM.VERROU;
  }

  addPlayer({ name, isBot = false, team = null }) {
    const id = nextEntityId++;
    const chosen = team || this.pickTeam();

    const player = {
      id,
      name: name || `Joueur ${id}`,
      team: chosen,
      isBot,

      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      crouchBlend: 0,
      grounded: true,

      health: HEALTH.max,
      armor: 0,
      helmet: false,
      hasKit: false,
      alive: false,

      money: ECONOMY.start,
      kills: 0,
      deaths: 0,
      score: 0,
      roundDamage: 0,

      inv: { primary: null, secondary: weaponState(startingPistol(chosen)), melee: weaponState(WEAPONS.crochet) },
      slot: 'secondary',
      punch: { pitch: 0, yaw: 0 },
      sprayIndex: 0,
      shotCount: 0,
      lastShotTick: -999,
      nextFireTick: 0,
      reloadEndTick: 0,
      burstLeft: 0,
      scoped: false,

      hasBomb: false,
      actionProgress: 0,
      actionLabel: '',

      /** Incrémenté à chaque apparition : le client s'en sert pour adopter
       *  l'orientation de départ décidée par le serveur. */
      respawnSeq: 0,

      input: { rs: 0, mx: 0, mz: 0, yaw: 0, pitch: 0, btn: 0, slot: 0, seq: 0 },
      /** File des entrées reçues, consommées une par tick. Voir setInput. */
      inputQueue: [],
      lastSeq: 0,
      prevBtn: 0,
      latency: 0,
      history: [],

      bot: isBot ? { path: [], node: 0, target: null, reactAt: 0, aimError: { yaw: 0, pitch: 0 }, nextThink: 0, goal: null, strafe: 1 } : null,
    };

    this.byId.set(id, player);
    return player;
  }

  removePlayer(id) {
    this.byId.delete(id);
  }

  swapTeams() {
    for (const player of this.byId.values()) {
      player.team = otherTeam(player.team);
      // Le pistolet de départ change de camp avec le joueur.
      player.inv.secondary = weaponState(startingPistol(player.team));
      player.inv.primary = null;
      player.armor = 0;
      player.helmet = false;
      player.hasKit = false;
    }
  }

  /**
   * Apparition d'un joueur qui rejoint en pleine action.
   *
   * Le principe « une seule vie par round » voudrait qu'il attende le round
   * suivant. Mais un round dure presque deux minutes : quelqu'un qui ouvre le
   * lien resterait devant un écran vide, et abandonnerait. On le fait donc
   * apparaître tout de suite, sur le point le plus éloigné des adversaires
   * vivants pour ne pas le jeter dans une fusillade.
   */
  spawnLate(player) {
    const spawns = MAP.spawns[player.team];
    const enemies = this.alivePlayers(otherTeam(player.team));

    let best = spawns[0];
    let bestDistance = -1;
    for (const spawn of spawns) {
      let nearest = Infinity;
      for (const enemy of enemies) {
        const d = Math.hypot(spawn.pos.x - enemy.pos.x, spawn.pos.z - enemy.pos.z);
        if (d < nearest) nearest = d;
      }
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = spawn;
      }
    }

    this.respawn(player, best);
  }

  respawn(player, spawn) {
    player.respawnSeq++;
    player.pos = { x: spawn.pos.x, y: spawn.pos.y, z: spawn.pos.z };
    player.vel = { x: 0, y: 0, z: 0 };
    player.yaw = spawn.yaw;
    player.pitch = 0;
    player.crouchBlend = 0;
    player.grounded = true;
    player.health = HEALTH.max;
    player.alive = true;
    player.roundDamage = 0;
    player.punch = { pitch: 0, yaw: 0 };
    player.sprayIndex = 0;
    player.nextFireTick = 0;
    player.reloadEndTick = 0;
    player.burstLeft = 0;
    player.scoped = false;
    player.hasBomb = false;
    player.actionProgress = 0;
    player.actionLabel = '';
    player.history.length = 0;

    // Les chargeurs sont rendus pleins à chaque round.
    for (const key of ['primary', 'secondary', 'melee']) {
      const state = player.inv[key];
      if (!state) continue;
      const weapon = WEAPONS[state.id];
      state.ammo = weapon.magazine;
      state.reserve = weapon.reserve;
    }
    player.slot = player.inv.primary ? 'primary' : 'secondary';
  }

  // ---------------------------------------------------------------------------
  //  Entrées
  // ---------------------------------------------------------------------------

  /**
   * Met une entrée en file. **Une seule est consommée par tick.**
   *
   * Pourquoi une file et non « garder la dernière » : le client et le serveur
   * tournent tous deux à 64 Hz, mais la gigue du réseau fait arriver parfois deux
   * entrées entre deux ticks. En n'en gardant qu'une, le serveur en perdrait une
   * tout en l'acquittant : le client la retirerait de ses entrées en attente et
   * rejouerait une séquence différente de celle réellement simulée. Résultat, une
   * oscillation de la position à chaque manœuvre rapide.
   *
   * La file est bornée : un client qui envoie trop vite ne gagne pas de vitesse,
   * ses entrées les plus anciennes sont simplement jetées.
   */
  setInput(player, input) {
    player.inputQueue.push(input);
    const MAX_QUEUE = 6;
    while (player.inputQueue.length > MAX_QUEUE) player.inputQueue.shift();
  }

  /** Retire une entrée de la file et l'acquitte. */
  takeInput(player) {
    player.input = player.inputQueue.shift();
    // On n'acquitte que ce qui a vraiment été simulé : c'est ce numéro que le
    // client utilise pour savoir quelles entrées rejouer.
    if (player.input.seq > player.lastSeq) player.lastSeq = player.input.seq;
    return player.input;
  }

  // ---------------------------------------------------------------------------
  //  Boucle de simulation
  // ---------------------------------------------------------------------------

  tick() {
    this.tickCount++;
    this.time += TICK_DT;
    this.events.length = 0;

    for (const player of this.byId.values()) {
      if (player.isBot) updateBot(this, player, TICK_DT);
      this.simulatePlayer(player, TICK_DT);
    }

    this.separatePlayers();
    this.recordHistory();
    this.match.update(TICK_DT);
  }

  /**
   * Un joueur humain n'est simulé que **pour les entrées qu'il a réellement
   * envoyées**, jamais un tick de plus.
   *
   * C'est la clé d'une prédiction exacte. Le navigateur d'un client ne tient pas
   * exactement 64 Hz : s'il envoie 60 entrées par seconde et que le serveur en
   * simulait 64 en répétant la dernière, il simulerait quatre pas par seconde que
   * le client ne rejoue pas. La position dériverait en permanence, et chaque
   * correction ferait osciller le personnage.
   *
   * Quand la file est vide, on ne fait rien : le joueur marque une pause d'un
   * tick, ce qui est invisible, plutôt que de désynchroniser.
   */
  simulatePlayer(player, dt) {
    if (player.isBot) {
      this.simulateOne(player, player.input, dt);
      return;
    }

    if (player.inputQueue.length === 0) return;

    // Rattrapage borné : si la gigue a fait s'accumuler des entrées, on en traite
    // deux d'un coup. Borné, sinon un client pourrait accélérer en spammant.
    let budget = player.inputQueue.length > 3 ? 2 : 1;
    while (budget-- > 0 && player.inputQueue.length > 0) {
      this.simulateOne(player, this.takeInput(player), dt);
    }
  }

  simulateOne(player, input, dt) {
    const pressed = input.btn & ~player.prevBtn;

    // L'orientation du client n'est prise en compte que s'il a vu la dernière
    // apparition. Sinon le premier input (lacet 0 par défaut) arriverait avant
    // le premier instantané et écraserait l'orientation de départ : un camp
    // apparaîtrait dos à la carte.
    const viewAcknowledged = input.rs === player.respawnSeq;

    if (!player.alive) {
      // Un mort garde la maîtrise de sa vue pour regarder ses coéquipiers.
      if (viewAcknowledged) {
        player.yaw = input.yaw;
        player.pitch = Math.max(-89, Math.min(89, input.pitch));
      }
      player.prevBtn = input.btn;
      return;
    }

    if (viewAcknowledged) {
      player.yaw = input.yaw;
      player.pitch = Math.max(-89, Math.min(89, input.pitch));
    }

    this.simulateStance(player, input, dt);
    this.simulateMovement(player, input, dt);
    this.simulateWeapon(player, input, pressed, dt);
    this.simulateUse(player, input, dt);

    player.prevBtn = input.btn;
  }

  simulateStance(player, input, dt) {
    const wantCrouch = (input.btn & BTN.CROUCH) !== 0;
    const target = wantCrouch ? 1 : 0;

    // On ne se relève pas s'il y a un plafond : on teste avant de changer.
    if (target < player.crouchBlend) {
      const tall = bodyHeight(0);
      const probe = {
        min: { x: player.pos.x - MOVE.radius, y: player.pos.y, z: player.pos.z - MOVE.radius },
        max: { x: player.pos.x + MOVE.radius, y: player.pos.y + tall, z: player.pos.z + MOVE.radius },
      };
      for (const box of MAP.geometry) {
        if (box.kind === 'floor') continue;
        if (
          probe.min.x < box.max.x && probe.max.x > box.min.x &&
          probe.min.y < box.max.y && probe.max.y > box.min.y &&
          probe.min.z < box.max.z && probe.max.z > box.min.z
        ) return; // pas la place, on reste accroupi
      }
    }

    const step = MOVE.crouchSpeed * dt;
    if (player.crouchBlend < target) player.crouchBlend = Math.min(target, player.crouchBlend + step);
    else if (player.crouchBlend > target) player.crouchBlend = Math.max(target, player.crouchBlend - step);
  }

  simulateMovement(player, input, dt) {
    // Pendant le freeze time, personne ne bouge : on peut seulement viser et acheter.
    if (this.match.frozen) {
      player.vel.x = 0;
      player.vel.z = 0;
      player.vel.y = -MOVE.groundStick;
      return;
    }

    const weapon = this.currentWeapon(player);
    let speedFactor = weapon ? weapon.speedFactor : 1;
    if (player.scoped && weapon) speedFactor *= weapon.scopedSpeedFactor;

    const wishDir = wishDirection(input.mx, input.mz, player.yaw);
    const magnitude = Math.min(1, Math.hypot(input.mx, input.mz));
    const speed = wishSpeed(player.crouchBlend, (input.btn & BTN.WALK) !== 0, speedFactor) * magnitude;
    const jump = (input.btn & BTN.JUMP) !== 0 && (player.prevBtn & BTN.JUMP) === 0;

    stepVelocity(player.vel, wishDir, speed, player.grounded, jump, dt);

    const height = bodyHeight(player.crouchBlend);
    const result = moveAndCollide(player.pos, player.vel, height, dt, MAP.geometry);
    player.grounded = result.grounded;

    // Dégâts de chute.
    if (result.landed < -MOVE.fallDamageSpeed) {
      const excess = -result.landed - MOVE.fallDamageSpeed;
      this.damagePlayer(player, null, Math.round(excess * 7), 'legs', { x: 0, y: -1, z: 0 }, 'chute');
    }
  }

  separatePlayers() {
    const alive = this.alivePlayers();
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        pushApart(alive[i].pos, alive[j].pos);
      }
    }
  }

  // ---------------------------------------------------------------------------
  //  Armes
  // ---------------------------------------------------------------------------

  currentState(player) {
    return player.inv[player.slot];
  }

  currentWeapon(player) {
    const state = this.currentState(player);
    return state ? WEAPONS[state.id] : null;
  }

  simulateWeapon(player, input, pressed, dt) {
    const weapon = this.currentWeapon(player);
    player.punch = recoverPunch(player.punch, weapon ? weapon.recoilRecovery : 10, dt);

    if (!weapon) return;

    // Changement d'arme
    if (input.slot) {
      const target = input.slot === 1 ? 'primary' : input.slot === 2 ? 'secondary' : 'melee';
      if (target !== player.slot && player.inv[target]) {
        player.slot = target;
        player.scoped = false;
        player.sprayIndex = 0;
        player.reloadEndTick = 0;
        player.nextFireTick = this.tickCount + Math.ceil(0.3 * TICK_RATE);
        return;
      }
    }

    // Le motif de recul repart du début après une pause : sinon deux rafales
    // enchaînées seraient incontrôlables.
    const idleTicks = Math.ceil((weapon.cycleTime * 1.7 + 0.06) / TICK_DT);
    if (player.sprayIndex > 0 && this.tickCount - player.lastShotTick > idleTicks) player.sprayIndex = 0;

    // Lunette
    if (weapon.scoped && (pressed & BTN.ALT)) player.scoped = !player.scoped;

    // Rechargement
    const state = this.currentState(player);
    if (player.reloadEndTick > 0) {
      if (this.tickCount >= player.reloadEndTick) {
        player.reloadEndTick = 0;
        const want = weapon.magazine - state.ammo;
        const taken = Math.min(want, state.reserve);
        state.ammo += taken;
        state.reserve -= taken;
      }
      return;
    }
    if ((pressed & BTN.RELOAD) && state.ammo < weapon.magazine && state.reserve > 0) {
      player.reloadEndTick = this.tickCount + Math.ceil(weapon.reloadTime / TICK_DT);
      player.scoped = false;
      player.sprayIndex = 0;
      player.burstLeft = 0;
      return;
    }

    if (this.match.frozen) return;

    // Intention de tir selon le mode
    let wantsFire = false;
    if (weapon.fireMode === 'auto') {
      wantsFire = (input.btn & BTN.FIRE) !== 0;
    } else if (weapon.fireMode === 'burst') {
      if ((pressed & BTN.FIRE) && player.burstLeft <= 0) player.burstLeft = weapon.burstCount;
      wantsFire = player.burstLeft > 0;
    } else {
      wantsFire = (pressed & BTN.FIRE) !== 0;
    }

    if (!wantsFire || this.tickCount < player.nextFireTick) return;

    if (weapon.category === 'melee') {
      player.nextFireTick = this.tickCount + Math.ceil(weapon.cycleTime / TICK_DT);
      this.meleeAttack(player, weapon);
      return;
    }

    if (state.ammo <= 0) {
      player.nextFireTick = this.tickCount + Math.ceil(0.25 / TICK_DT);
      player.burstLeft = 0;
      if (state.reserve > 0) player.reloadEndTick = this.tickCount + Math.ceil(weapon.reloadTime / TICK_DT);
      return;
    }

    this.fire(player, weapon, state);
  }

  fire(player, weapon, state) {
    state.ammo--;
    player.shotCount++;
    player.lastShotTick = this.tickCount;
    player.nextFireTick = this.tickCount + Math.max(1, Math.round(weapon.cycleTime / TICK_DT));
    if (player.burstLeft > 0) player.burstLeft--;

    const origin = this.eyePosition(player);
    const aim = dirFromAngles(player.yaw + player.punch.yaw, player.pitch + player.punch.pitch);

    const spread = computeSpread(weapon, {
      speedRatio: Math.hypot(player.vel.x, player.vel.z) / MOVE.runSpeed,
      airborne: !player.grounded,
      crouching: player.crouchBlend > 0.5,
      sprayIndex: player.sprayIndex,
      scoped: player.scoped,
    });

    const pellets = Math.max(1, weapon.pellets);
    for (let pellet = 0; pellet < pellets; pellet++) {
      const dir = applySpread(aim, spread, this.tickCount, player.id, player.shotCount * 16 + pellet);
      this.resolveShot(player, weapon, origin, dir);
    }

    // Recul : motif fixe, donc apprenable.
    const kick = patternKick(weapon, player.sprayIndex);
    player.punch = {
      pitch: Math.max(-12, Math.min(3, player.punch.pitch + kick.pitch)),
      yaw: Math.max(-7, Math.min(7, player.punch.yaw + kick.yaw)),
    };
    player.sprayIndex++;

    if (player.scoped && weapon.category === 'sniper') player.scoped = false;
  }

  /**
   * Un tir, avec compensation de latence.
   *
   * On rembobine les autres joueurs à l'instant où le tireur les a vus : c'est ce
   * qui fait qu'on touche ce qu'on a à l'écran, sans avoir à viser devant une
   * cible en mouvement.
   */
  resolveShot(shooter, weapon, origin, dir) {
    const wallHit = raycastWorld(origin, dir, weapon.maxRange, MAP.geometry);
    let closest = wallHit ? wallHit.distance : weapon.maxRange;
    let victim = null;
    let zone = 'chest';

    const rewindTicks = Math.round(Math.min(Math.max(shooter.latency, 0), LAG_COMP_MAX) / TICK_DT);

    for (const other of this.byId.values()) {
      if (other === shooter || !other.alive) continue;
      if (other.team === shooter.team && !this.friendlyFire) continue;

      const past = this.rewind(other, rewindTicks);
      for (const hitbox of playerHitboxes(past.pos, past.crouchBlend)) {
        const distance = rayBox(origin, dir, hitbox);
        if (distance < 0 || distance >= closest) continue;
        closest = distance;
        victim = other;
        zone = hitbox.zone;
      }
    }

    const endPoint = {
      x: origin.x + dir.x * closest,
      y: origin.y + dir.y * closest,
      z: origin.z + dir.z * closest,
    };

    this.pushEvent({
      type: 'shot',
      shooter: shooter.id,
      weapon: weapon.id,
      from: origin,
      to: endPoint,
      hitPlayer: victim ? victim.id : 0,
    });

    if (!victim) {
      if (wallHit && closest === wallHit.distance) {
        this.pushEvent({ type: 'impact', pos: endPoint, normal: wallHit.normal });
      }
      return;
    }

    const result = resolveDamage({
      baseDamage: weapon.baseDamage,
      headMultiplier: weapon.headMultiplier,
      armorPenetration: weapon.armorPenetration,
      rangeFalloff: weapon.rangeFalloff,
      distance: closest,
      zone,
      armor: victim.armor,
      helmet: victim.helmet,
    });

    victim.armor = Math.max(0, victim.armor - result.armor);
    this.applyDamage(victim, shooter, result.health, zone, dir, weapon);
  }

  meleeAttack(player, weapon) {
    const origin = this.eyePosition(player);
    const dir = dirFromAngles(player.yaw, player.pitch);
    this.pushEvent({ type: 'melee', shooter: player.id });

    let victim = null;
    let closest = weapon.maxRange;
    for (const other of this.byId.values()) {
      if (other === player || !other.alive) continue;
      if (other.team === player.team && !this.friendlyFire) continue;
      for (const hitbox of playerHitboxes(other.pos, other.crouchBlend)) {
        const distance = rayBox(origin, dir, hitbox);
        if (distance < 0 || distance >= closest) continue;
        closest = distance;
        victim = other;
      }
    }
    if (!victim) return;

    // Frappe dans le dos : on compare la direction du coup et le regard de la cible.
    const facing = dirFromAngles(victim.yaw, 0);
    const fromBehind = facing.x * dir.x + facing.z * dir.z > 0.55;
    const damage = fromBehind ? 200 : weapon.baseDamage;

    const result = resolveDamage({
      baseDamage: damage, headMultiplier: 1, armorPenetration: weapon.armorPenetration,
      rangeFalloff: 1, distance: 0, zone: 'chest', armor: victim.armor, helmet: victim.helmet,
    });
    victim.armor = Math.max(0, victim.armor - result.armor);
    this.applyDamage(victim, player, result.health, 'chest', dir, weapon);
  }

  damagePlayer(victim, attacker, amount, zone, dir, cause) {
    this.applyDamage(victim, attacker, amount, zone, dir, { id: cause, name: cause, killReward: 0 });
  }

  applyDamage(victim, attacker, amount, zone, dir, weapon) {
    if (!victim.alive) return;

    victim.health -= amount;
    if (attacker && attacker !== victim) attacker.roundDamage += amount;

    this.pushEvent({
      type: 'hit',
      victim: victim.id,
      attacker: attacker ? attacker.id : 0,
      amount,
      zone,
      dir,
      lethal: victim.health <= 0,
    });

    if (victim.health > 0) return;

    victim.health = 0;
    victim.alive = false;
    victim.deaths++;
    victim.actionProgress = 0;
    victim.actionLabel = '';
    this.match.cancelDefuse(victim.id);

    if (attacker && attacker !== victim) {
      attacker.kills++;
      attacker.score += 2;
      attacker.money = Math.min(ECONOMY.max, attacker.money + (weapon.killReward || 0));
    }

    // Les armes tombent au sol et peuvent être ramassées.
    if (victim.inv.primary) {
      this.pickups.push({
        id: nextEntityId++,
        weaponId: victim.inv.primary.id,
        ammo: victim.inv.primary.ammo,
        reserve: victim.inv.primary.reserve,
        pos: { x: victim.pos.x, y: victim.pos.y + 0.2, z: victim.pos.z },
      });
      victim.inv.primary = null;
      // Sans ça, l'emplacement resterait vide et l'arme courante serait nulle.
      if (victim.slot === 'primary') victim.slot = 'secondary';
    }

    // La charge tombe aussi : un autre Cendre peut la reprendre.
    if (victim.hasBomb) {
      victim.hasBomb = false;
      this.pickups.push({
        id: nextEntityId++,
        bomb: true,
        pos: { x: victim.pos.x, y: victim.pos.y + 0.2, z: victim.pos.z },
      });
      this.match.bomb.carrier = null;
    }

    this.pushEvent({
      type: 'kill',
      killer: attacker ? attacker.name : 'le décor',
      killerTeam: attacker ? attacker.team : null,
      victim: victim.name,
      victimTeam: victim.team,
      weapon: weapon.name || weapon.id,
      headshot: zone === 'head',
    });
  }

  explode(pos, maxDamage, radius) {
    for (const player of this.byId.values()) {
      if (!player.alive) continue;
      const chest = { x: player.pos.x, y: player.pos.y + 1.2, z: player.pos.z };
      const dx = chest.x - pos.x;
      const dy = chest.y - pos.y;
      const dz = chest.z - pos.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance > radius) continue;

      // Un mur encaisse une partie du souffle.
      const shielded = hasLineOfSight(pos, chest, MAP.geometry) ? 1 : 0.35;
      let falloff = 1 - distance / radius;
      falloff *= falloff;

      const amount = Math.round(maxDamage * falloff * shielded);
      if (amount >= 1) {
        this.damagePlayer(player, null, amount, 'chest', { x: dx, y: dy, z: dz }, 'explosion');
      }
    }
  }

  // ---------------------------------------------------------------------------
  //  Touche Utiliser : pose, désamorçage, ramassage
  // ---------------------------------------------------------------------------

  simulateUse(player, input, dt) {
    const holding = (input.btn & BTN.USE) !== 0;

    if (!holding) {
      if (player.actionProgress > 0 && player.actionLabel.startsWith('Pose')) player.actionProgress = 0;
      this.match.cancelDefuse(player.id);
      if (!player.actionLabel.startsWith('Pose')) player.actionProgress = 0;
      player.actionLabel = '';
      return;
    }

    if (this.match.tickPlant(player, dt)) return;
    if (this.match.tickDefuse(player, dt)) return;

    // Ramassage : la plus proche à moins de 1,6 m.
    for (let i = 0; i < this.pickups.length; i++) {
      const pickup = this.pickups[i];
      const dx = pickup.pos.x - player.pos.x;
      const dz = pickup.pos.z - player.pos.z;
      if (dx * dx + dz * dz > 2.56) continue;

      if (pickup.bomb) {
        if (player.team !== TEAM.CENDRE) continue;
        player.hasBomb = true;
        this.match.bomb.carrier = player.id;
      } else {
        player.inv.primary = { id: pickup.weaponId, ammo: pickup.ammo, reserve: pickup.reserve };
        player.slot = 'primary';
      }
      this.pickups.splice(i, 1);
      this.pushEvent({ type: 'pickup', player: player.id });
      return;
    }
  }

  // ---------------------------------------------------------------------------
  //  Achats — validés par le serveur, toujours
  // ---------------------------------------------------------------------------

  buy(player, itemId) {
    if (!player.alive) return { ok: false, reason: 'Mort' };
    if (!this.match.buyOpen) return { ok: false, reason: "Temps d'achat écoulé" };
    if (!inBuyZone(player.team, player.pos)) return { ok: false, reason: "Hors de la zone d'achat" };

    const gear = Object.values(GEAR).find((g) => g.id === itemId);
    if (gear) {
      if (gear.team && gear.team !== player.team) return { ok: false, reason: 'Indisponible pour ton camp' };
      if (player.money < gear.price) return { ok: false, reason: 'Fonds insuffisants' };
      if (gear.kit) {
        if (player.hasKit) return { ok: false, reason: 'Déjà équipé' };
        player.hasKit = true;
      } else {
        if (player.armor >= HEALTH.maxArmor && player.helmet >= !!gear.helmet) {
          return { ok: false, reason: 'Déjà équipé' };
        }
        player.armor = gear.armor;
        if (gear.helmet) player.helmet = true;
      }
      player.money -= gear.price;
      return { ok: true, item: gear.name };
    }

    const weapon = WEAPONS[itemId];
    if (!weapon || weapon.price <= 0) return { ok: false, reason: 'Article inconnu' };
    if (weapon.team && weapon.team !== player.team) return { ok: false, reason: 'Indisponible pour ton camp' };
    if (player.money < weapon.price) return { ok: false, reason: 'Fonds insuffisants' };

    const slot = weapon.category === 'pistol' ? 'secondary' : 'primary';

    // On lâche l'ancienne arme principale au sol plutôt que de la faire disparaître.
    if (slot === 'primary' && player.inv.primary) {
      this.pickups.push({
        id: nextEntityId++,
        weaponId: player.inv.primary.id,
        ammo: player.inv.primary.ammo,
        reserve: player.inv.primary.reserve,
        pos: { x: player.pos.x + 0.5, y: player.pos.y + 0.2, z: player.pos.z },
      });
    }

    player.inv[slot] = weaponState(weapon);
    player.slot = slot;
    player.money -= weapon.price;
    player.scoped = false;
    return { ok: true, item: weapon.name };
  }

  // ---------------------------------------------------------------------------
  //  Historique pour la compensation de latence
  // ---------------------------------------------------------------------------

  recordHistory() {
    for (const player of this.byId.values()) {
      player.history.push({
        tick: this.tickCount,
        pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
        crouchBlend: player.crouchBlend,
      });
      if (player.history.length > HISTORY_SIZE) player.history.shift();
    }
  }

  rewind(player, ticksBack) {
    if (ticksBack <= 0 || player.history.length === 0) {
      return { pos: player.pos, crouchBlend: player.crouchBlend };
    }
    const index = player.history.length - 1 - ticksBack;
    if (index < 0) return player.history[0];
    return player.history[index];
  }

  eyePosition(player) {
    return {
      x: player.pos.x,
      y: player.pos.y + eyeHeight(player.crouchBlend),
      z: player.pos.z,
    };
  }

  // ---------------------------------------------------------------------------
  //  Événements et instantanés
  // ---------------------------------------------------------------------------

  pushEvent(event) {
    this.events.push(event);
  }

  announce(text) {
    this.pushEvent({ type: 'announce', text });
  }

  /** Instantané destiné à un joueur donné. */
  snapshot(viewer) {
    const state = this.currentState(viewer);
    const weapon = this.currentWeapon(viewer);

    const others = [];
    for (const player of this.byId.values()) {
      if (player === viewer) continue;
      others.push({
        i: player.id,
        n: player.name,
        t: player.team,
        p: [round2(player.pos.x), round2(player.pos.y), round2(player.pos.z)],
        y: Math.round(player.yaw),
        pi: Math.round(player.pitch),
        c: round2(player.crouchBlend),
        a: player.alive ? 1 : 0,
        hp: player.health,
        b: player.hasBomb ? 1 : 0,
        w: this.currentState(player)?.id ?? null,
      });
    }

    return {
      t: 's',
      k: this.tickCount,
      ms: Date.now(),
      ack: viewer.lastSeq,
      me: {
        rs: viewer.respawnSeq,
        y: viewer.yaw,
        pi: viewer.pitch,
        p: [viewer.pos.x, viewer.pos.y, viewer.pos.z],
        v: [viewer.vel.x, viewer.vel.y, viewer.vel.z],
        c: viewer.crouchBlend,
        g: viewer.grounded ? 1 : 0,
        hp: viewer.health,
        ar: viewer.armor,
        hel: viewer.helmet ? 1 : 0,
        kit: viewer.hasKit ? 1 : 0,
        al: viewer.alive ? 1 : 0,
        mo: viewer.money,
        sl: viewer.slot,
        w: state ? state.id : null,
        am: state ? state.ammo : 0,
        res: state ? state.reserve : 0,
        rl: viewer.reloadEndTick > 0 ? 1 : 0,
        sc: viewer.scoped ? 1 : 0,
        pu: [round2(viewer.punch.pitch), round2(viewer.punch.yaw)],
        sp: round2(weapon ? computeSpread(weapon, {
          speedRatio: Math.hypot(viewer.vel.x, viewer.vel.z) / MOVE.runSpeed,
          airborne: !viewer.grounded,
          crouching: viewer.crouchBlend > 0.5,
          sprayIndex: viewer.sprayIndex,
          scoped: viewer.scoped,
        }) : 0),
        bomb: viewer.hasBomb ? 1 : 0,
        act: round2(viewer.actionProgress),
        lbl: viewer.actionLabel,
        k: viewer.kills,
        d: viewer.deaths,
        dmg: viewer.roundDamage,
      },
      ps: others,
      pk: this.pickups.map((p) => ({ i: p.id, w: p.weaponId ?? null, b: p.bomb ? 1 : 0, p: [round2(p.pos.x), round2(p.pos.y), round2(p.pos.z)] })),
      m: this.match.serialize(),
      ev: this.events,
      sb: this.scoreboard(),
    };
  }

  scoreboard() {
    return this.players()
      .map((p) => ({ i: p.id, n: p.name, t: p.team, k: p.kills, d: p.deaths, mo: p.money, bot: p.isBot ? 1 : 0, ping: Math.round(p.latency * 1000) }))
      .sort((a, b) => b.k - a.k);
  }
}

const round2 = (v) => Math.round(v * 100) / 100;
