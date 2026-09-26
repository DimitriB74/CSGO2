// =============================================================================
//  Prédiction côté client.
//
//  Le client simule son propre déplacement avec **exactement le même code** que
//  le serveur (shared/movement.js et shared/collision.js). Sans cela, chaque
//  correction du serveur provoquerait un tremblement.
//
//  Boucle de réconciliation :
//   1. à chaque tick, on applique l'entrée localement et on la garde en attente ;
//   2. quand le serveur confirme avoir traité l'entrée n° N, on repart de l'état
//      qu'il annonce et on rejoue les entrées postérieures à N ;
//   3. si le résultat colle à ce qu'on avait prédit — le cas normal — rien ne
//      bouge à l'écran.
// =============================================================================

import { BTN, MOVE, TICK_DT } from '/shared/constants.js';
import { moveAndCollide } from '/shared/collision.js';
import { bodyHeight, stepVelocity, wishDirection, wishSpeed } from '/shared/movement.js';

export class Predictor {
  constructor(geometry) {
    this.geometry = geometry;
    this.state = {
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      crouchBlend: 0,
      grounded: true,
    };
    this.pending = [];
    this.frozen = false;
    this.speedFactor = 1;
    this.alive = false;
    /** Écart mesuré à la dernière correction, en mètres. Utile au diagnostic. */
    this.lastError = 0;
  }

  /** Applique une entrée et l'enregistre pour un éventuel rejeu. */
  push(input, prevBtn) {
    this.pending.push({ ...input, prevBtn });
    if (this.pending.length > 128) this.pending.shift();
    if (this.alive) this.apply(this.state, input, prevBtn, TICK_DT);
  }

  /** Correction depuis un instantané serveur. */
  reconcile(me, ack) {
    const server = {
      pos: { x: me.p[0], y: me.p[1], z: me.p[2] },
      vel: { x: me.v[0], y: me.v[1], z: me.v[2] },
      crouchBlend: me.c,
      grounded: !!me.g,
    };

    this.lastError = Math.hypot(
      server.pos.x - this.state.pos.x,
      server.pos.y - this.state.pos.y,
      server.pos.z - this.state.pos.z,
    );

    // On jette les entrées que le serveur a déjà digérées.
    this.pending = this.pending.filter((input) => input.seq > ack);

    // Puis on rejoue les autres par-dessus l'état officiel.
    this.state = server;
    if (this.alive) {
      for (const input of this.pending) this.apply(this.state, input, input.prevBtn, TICK_DT);
    }
  }

  /** Copie fidèle de World.simulateStance + simulateMovement, côté serveur. */
  apply(state, input, prevBtn, dt) {
    // --- posture ------------------------------------------------------------
    const wantCrouch = (input.btn & BTN.CROUCH) !== 0;
    const target = wantCrouch ? 1 : 0;

    let blocked = false;
    if (target < state.crouchBlend) {
      const tall = bodyHeight(0);
      const probe = {
        min: { x: state.pos.x - MOVE.radius, y: state.pos.y, z: state.pos.z - MOVE.radius },
        max: { x: state.pos.x + MOVE.radius, y: state.pos.y + tall, z: state.pos.z + MOVE.radius },
      };
      for (const box of this.geometry) {
        if (box.kind === 'floor') continue;
        if (
          probe.min.x < box.max.x && probe.max.x > box.min.x &&
          probe.min.y < box.max.y && probe.max.y > box.min.y &&
          probe.min.z < box.max.z && probe.max.z > box.min.z
        ) { blocked = true; break; }
      }
    }

    if (!blocked) {
      const step = MOVE.crouchSpeed * dt;
      if (state.crouchBlend < target) state.crouchBlend = Math.min(target, state.crouchBlend + step);
      else if (state.crouchBlend > target) state.crouchBlend = Math.max(target, state.crouchBlend - step);
    }

    // --- déplacement --------------------------------------------------------
    if (this.frozen) {
      state.vel.x = 0;
      state.vel.z = 0;
      state.vel.y = -MOVE.groundStick;
      return;
    }

    const wishDir = wishDirection(input.mx, input.mz, input.yaw);
    const magnitude = Math.min(1, Math.hypot(input.mx, input.mz));
    const speed = wishSpeed(state.crouchBlend, (input.btn & BTN.WALK) !== 0, this.speedFactor) * magnitude;
    const jump = (input.btn & BTN.JUMP) !== 0 && (prevBtn & BTN.JUMP) === 0;

    stepVelocity(state.vel, wishDir, speed, state.grounded, jump, dt);

    const height = bodyHeight(state.crouchBlend);
    const result = moveAndCollide(state.pos, state.vel, height, dt, this.geometry);
    state.grounded = result.grounded;
  }

  get horizontalSpeed() {
    return Math.hypot(this.state.vel.x, this.state.vel.z);
  }
}
