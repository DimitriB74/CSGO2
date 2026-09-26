// =============================================================================
//  Déroulement du match : rounds, économie, bombe.
//
//  Tout est décidé ici, côté serveur. Un client ne peut ni s'ajouter de l'argent,
//  ni poser la bombe plus vite, ni gagner un round.
// =============================================================================

import { ROUND, ECONOMY, TEAM, TEAM_LABEL, otherTeam } from '../shared/constants.js';
import { MAP, siteAt, siteCenter } from '../shared/map.js';
import { startingPistol } from '../shared/weapons.js';

export class Match {
  constructor(world) {
    this.world = world;

    this.state = 'warmup';
    this.timer = 0;
    this.round = 0;
    this.scores = { [TEAM.CENDRE]: 0, [TEAM.VERROU]: 0 };
    this.lossStreak = { [TEAM.CENDRE]: 0, [TEAM.VERROU]: 0 };
    this.halfSwapped = false;
    this.lastResult = null;

    this.bomb = {
      planted: false,
      carrier: null,
      site: null,
      pos: null,
      timer: 0,
      defuseProgress: 0,
      defuserId: null,
      defused: false,
      exploded: false,
    };
  }

  get buyOpen() {
    if (this.state === 'warmup') return true;
    if (this.state === 'freeze') return true;
    // Le temps d'achat court à partir du début du round et déborde donc sur la
    // phase live, comme dans les FPS de désamorçage.
    if (this.state === 'live') return this.timer > ROUND.roundTime - ROUND.buyTime;
    return false;
  }

  get frozen() {
    return this.state === 'freeze';
  }

  update(dt) {
    this.timer -= dt;

    switch (this.state) {
      case 'warmup':
        // On compte les joueurs CONNECTÉS, pas les vivants : personne n'est
        // vivant avant le premier round, sinon le match ne démarrerait jamais.
        if (this.world.players().length >= ROUND.warmupMinPlayers) this.startRound(true);
        break;

      case 'freeze':
        if (this.timer <= 0) {
          this.state = 'live';
          this.timer = ROUND.roundTime;
          this.world.announce('Le round commence');
        }
        break;

      case 'live':
        this.updateLive(dt);
        break;

      case 'end':
        if (this.timer <= 0) this.afterRound();
        break;

      case 'over':
        break;
    }
  }

  updateLive(dt) {
    if (this.bomb.planted) {
      this.bomb.timer -= dt;
      if (this.bomb.timer <= 0) {
        this.explodeBomb();
        return;
      }
    }

    const cendreAlive = this.world.alivePlayers(TEAM.CENDRE).length;
    const verrouAlive = this.world.alivePlayers(TEAM.VERROU).length;

    // Les Cendre éliminés perdent le round SAUF si la bombe est posée : le
    // compte à rebours continue tout seul.
    if (cendreAlive === 0 && !this.bomb.planted) {
      this.endRound(TEAM.VERROU, 'Cendre éliminés');
      return;
    }
    if (verrouAlive === 0) {
      this.endRound(TEAM.CENDRE, 'Verrou éliminés');
      return;
    }

    if (this.timer <= 0 && !this.bomb.planted) {
      this.endRound(TEAM.VERROU, 'Temps écoulé');
    }
  }

  // ---------------------------------------------------------------------------
  //  Bombe
  // ---------------------------------------------------------------------------

  /** Progression de la pose, appelée chaque tick tant que le joueur maintient Use. */
  tickPlant(player, dt) {
    if (this.bomb.planted || this.state !== 'live') return false;
    if (player.team !== TEAM.CENDRE || !player.hasBomb || !player.alive) return false;
    if (!player.grounded) return false;

    const site = siteAt(player.pos);
    if (!site) return false;

    player.actionProgress += dt / ROUND.plantTime;
    player.actionLabel = 'Pose de la charge';

    if (player.actionProgress < 1) return true;

    this.bomb.planted = true;
    this.bomb.site = site;
    this.bomb.pos = { x: player.pos.x, y: player.pos.y + 0.15, z: player.pos.z };
    this.bomb.timer = ROUND.bombTime;
    this.bomb.carrier = null;
    player.hasBomb = false;
    player.actionProgress = 0;
    player.actionLabel = '';

    // La prime de pose est acquise même si le round est perdu ensuite.
    player.money = Math.min(ECONOMY.max, player.money + ECONOMY.plantBonus);
    this.world.announce(`Charge posée sur le site ${site}`);
    this.world.pushEvent({ type: 'plant', site, pos: this.bomb.pos });
    return true;
  }

  /** Progression du désamorçage. */
  tickDefuse(player, dt) {
    if (!this.bomb.planted || this.state !== 'live') return false;
    if (player.team !== TEAM.VERROU || !player.alive) return false;

    const dx = player.pos.x - this.bomb.pos.x;
    const dz = player.pos.z - this.bomb.pos.z;
    if (dx * dx + dz * dz > 2.25) return false; // rayon de 1,5 m

    const duration = player.hasKit ? ROUND.defuseKitTime : ROUND.defuseTime;
    this.bomb.defuserId = player.id;
    this.bomb.defuseProgress += dt / duration;
    player.actionProgress = this.bomb.defuseProgress;
    player.actionLabel = player.hasKit ? 'Désamorçage (kit)' : 'Désamorçage';

    if (this.bomb.defuseProgress < 1) return true;

    this.bomb.defused = true;
    player.money = Math.min(ECONOMY.max, player.money + ECONOMY.defuseBonus);
    player.actionProgress = 0;
    player.actionLabel = '';
    this.world.pushEvent({ type: 'defused' });
    this.endRound(TEAM.VERROU, 'Charge désamorcée');
    return true;
  }

  /** Le désamorçage repart de zéro si on lâche la touche : pas de pause. */
  cancelDefuse(playerId) {
    if (this.bomb.defuserId === playerId) {
      this.bomb.defuserId = null;
      this.bomb.defuseProgress = 0;
    }
  }

  explodeBomb() {
    this.bomb.exploded = true;
    this.world.explode(this.bomb.pos, 500, 12);
    this.world.pushEvent({ type: 'explosion', pos: this.bomb.pos });
    this.endRound(TEAM.CENDRE, 'Charge explosée');
  }

  // ---------------------------------------------------------------------------
  //  Rounds
  // ---------------------------------------------------------------------------

  startRound(first = false) {
    this.round++;
    this.state = 'freeze';
    this.timer = ROUND.freezeTime;

    this.bomb = {
      planted: false, carrier: null, site: null, pos: null, timer: 0,
      defuseProgress: 0, defuserId: null, defused: false, exploded: false,
    };

    const players = this.world.players();
    const spawnIndex = { [TEAM.CENDRE]: 0, [TEAM.VERROU]: 0 };

    for (const player of players) {
      if (!player.team) continue;

      const spawns = MAP.spawns[player.team];
      const spawn = spawns[spawnIndex[player.team]++ % spawns.length];
      this.world.respawn(player, spawn);

      if (first) {
        player.money = ECONOMY.start;
        player.kills = 0;
        player.deaths = 0;
        player.score = 0;
      }
    }

    // Un porteur de charge au hasard chez les Cendre.
    const attackers = this.world.players(TEAM.CENDRE).filter((p) => p.alive);
    if (attackers.length > 0) {
      const carrier = attackers[Math.floor(Math.random() * attackers.length)];
      carrier.hasBomb = true;
      this.bomb.carrier = carrier.id;
    }

    this.world.announce(`Round ${this.round} — ${this.scores[TEAM.CENDRE]} / ${this.scores[TEAM.VERROU]}`);
  }

  endRound(winner, reason) {
    if (this.state === 'end' || this.state === 'over') return;

    this.state = 'end';
    this.timer = ROUND.endDelay;
    this.scores[winner]++;
    this.lastResult = { winner, reason };

    const loser = otherTeam(winner);
    this.lossStreak[loser] = Math.min(this.lossStreak[loser] + 1, ECONOMY.lossLadder.length);
    this.lossStreak[winner] = 0;

    // Récompenses
    let winReward = ECONOMY.win;
    if (this.bomb.exploded && winner === TEAM.CENDRE) winReward = ECONOMY.bombExploded;
    if (this.bomb.defused && winner === TEAM.VERROU) winReward = ECONOMY.defused;

    const lossReward = ECONOMY.lossLadder[this.lossStreak[loser] - 1] ?? ECONOMY.lossLadder[0];

    for (const player of this.world.players()) {
      if (!player.team) continue;
      const reward = player.team === winner ? winReward : lossReward;
      player.money = Math.min(ECONOMY.max, player.money + reward);
    }

    this.world.announce(`${TEAM_LABEL[winner]} remporte le round — ${reason}`);
    this.world.pushEvent({ type: 'roundEnd', winner, reason });
  }

  afterRound() {
    const cendre = this.scores[TEAM.CENDRE];
    const verrou = this.scores[TEAM.VERROU];

    if (cendre >= ROUND.roundsToWin || verrou >= ROUND.roundsToWin) {
      this.state = 'over';
      this.timer = 0;
      const winner = cendre > verrou ? TEAM.CENDRE : TEAM.VERROU;
      this.world.announce(`${TEAM_LABEL[winner]} remporte le match ${Math.max(cendre, verrou)} - ${Math.min(cendre, verrou)}`);
      this.world.pushEvent({ type: 'matchEnd', winner });
      // Nouveau match après dix secondes, pour que la partie continue.
      setTimeout(() => this.resetMatch(), 10000);
      return;
    }

    if (!this.halfSwapped && this.round >= ROUND.halfTimeAfter) {
      this.halfSwapped = true;
      this.world.swapTeams();
      const swapped = { [TEAM.CENDRE]: this.scores[TEAM.VERROU], [TEAM.VERROU]: this.scores[TEAM.CENDRE] };
      this.scores = swapped;
      this.lossStreak = { [TEAM.CENDRE]: 0, [TEAM.VERROU]: 0 };
      for (const player of this.world.players()) player.money = ECONOMY.start;
      this.world.announce('Mi-temps — changement de camp');
    }

    this.startRound(false);
  }

  resetMatch() {
    this.scores = { [TEAM.CENDRE]: 0, [TEAM.VERROU]: 0 };
    this.lossStreak = { [TEAM.CENDRE]: 0, [TEAM.VERROU]: 0 };
    this.round = 0;
    this.halfSwapped = false;
    this.startRound(true);
  }

  /** Vue envoyée au client. */
  serialize() {
    return {
      state: this.state,
      timer: Math.max(0, this.timer),
      round: this.round,
      scores: this.scores,
      buyOpen: this.buyOpen,
      result: this.lastResult,
      bomb: this.bomb.planted
        ? {
            planted: true,
            site: this.bomb.site,
            pos: this.bomb.pos,
            timer: Math.max(0, this.bomb.timer),
            defuse: this.bomb.defuseProgress,
          }
        : { planted: false, carrier: this.bomb.carrier },
    };
  }
}
