// =============================================================================
//  Collisions. Toute la géométrie du niveau est faite de boîtes alignées sur les
//  axes (AABB), et le joueur est lui aussi une AABB.
//
//  Ce n'est pas un raccourci : Quake utilisait exactement ça. Les AABB donnent
//  des collisions parfaitement stables et prévisibles, ce qui est indispensable
//  quand le client doit prédire son déplacement et retomber sur le même résultat
//  que le serveur.
// =============================================================================

import { MOVE } from './constants.js';

export function playerBox(pos, height, radius = MOVE.radius) {
  return {
    min: { x: pos.x - radius, y: pos.y, z: pos.z - radius },
    max: { x: pos.x + radius, y: pos.y + height, z: pos.z + radius },
  };
}

export function overlap(a, b) {
  return (
    a.min.x < b.max.x && a.max.x > b.min.x &&
    a.min.y < b.max.y && a.max.y > b.min.y &&
    a.min.z < b.max.z && a.max.z > b.min.z
  );
}

function freeAt(x, y, z, height, radius, boxes) {
  const test = playerBox({ x, y, z }, height, radius);
  for (const box of boxes) if (overlap(test, box)) return false;
  return true;
}

/**
 * Déplace une AABB de joueur et résout les collisions, axe par axe.
 *
 * L'ordre Y → X → Z est volontaire : on règle d'abord le sol, puis on glisse le
 * long des murs. Reculer sur un seul axe en gardant l'autre, c'est exactement ce
 * qui produit le glissement le long d'un mur.
 *
 * Modifie `pos` et `vel` sur place.
 * @returns {{grounded: boolean, hitWall: boolean, landed: number}}
 *          landed = vitesse verticale au moment de l'atterrissage, 0 sinon
 */
export function moveAndCollide(pos, vel, height, dt, boxes) {
  const r = MOVE.radius;
  let grounded = false;
  let hitWall = false;
  let landed = 0;

  // --- vertical -------------------------------------------------------------
  pos.y += vel.y * dt;
  let body = playerBox(pos, height, r);
  for (const box of boxes) {
    if (!overlap(body, box)) continue;
    if (vel.y <= 0) {
      pos.y = box.max.y;
      grounded = true;
      landed = vel.y;
    } else {
      pos.y = box.min.y - height;
    }
    vel.y = 0;
    body = playerBox(pos, height, r);
  }

  // --- horizontal, un axe à la fois ----------------------------------------
  for (const axis of ['x', 'z']) {
    const previous = pos[axis];
    pos[axis] += vel[axis] * dt;
    body = playerBox(pos, height, r);

    for (const box of boxes) {
      if (!overlap(body, box)) continue;

      // On tente de monter la marche avant de considérer ça comme un mur : c'est
      // ce qui permet de franchir un trottoir ou une caisse basse sans sauter.
      const rise = box.max.y - pos.y;
      if (rise > 0.001 && rise <= MOVE.stepHeight &&
          freeAt(pos.x, box.max.y, pos.z, height, r, boxes)) {
        pos.y = box.max.y;
        grounded = true;
        if (vel.y < 0) vel.y = 0;
      } else {
        pos[axis] = previous;
        vel[axis] = 0;
        hitWall = true;
      }
      body = playerBox(pos, height, r);
    }
  }

  // --- contact sol ----------------------------------------------------------
  // isGrounded seul est capricieux en descente : on complète par une sonde juste
  // sous les pieds, sinon on « décolle » à chaque petite pente.
  if (!grounded && vel.y <= 0.1) {
    const probe = playerBox({ x: pos.x, y: pos.y - 0.08, z: pos.z }, height, r * 0.95);
    for (const box of boxes) {
      if (overlap(probe, box)) {
        grounded = true;
        break;
      }
    }
  }

  return { grounded, hitWall, landed };
}

/** Sépare deux joueurs qui se chevauchent, horizontalement et à parts égales. */
export function pushApart(a, b, radius = MOVE.radius) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const distSq = dx * dx + dz * dz;
  const minDist = radius * 2;
  if (distSq >= minDist * minDist || distSq < 1e-8) return;

  const dist = Math.sqrt(distSq);
  const push = (minDist - dist) * 0.5;
  const nx = dx / dist;
  const nz = dz / dist;
  a.x -= nx * push;
  a.z -= nz * push;
  b.x += nx * push;
  b.z += nz * push;
}

/**
 * Intersection rayon / AABB par la méthode des tranches.
 * @returns distance le long du rayon, ou -1
 */
export function rayBox(origin, dir, box) {
  let tmin = 0;
  let tmax = Infinity;
  let hitAxis = 'x';
  let hitSign = 1;

  for (const axis of ['x', 'y', 'z']) {
    const d = dir[axis];
    const o = origin[axis];
    if (Math.abs(d) < 1e-9) {
      // Rayon parallèle à cette paire de plans : il doit déjà être entre les deux.
      if (o < box.min[axis] || o > box.max[axis]) return -1;
      continue;
    }
    const inv = 1 / d;
    let t1 = (box.min[axis] - o) * inv;
    let t2 = (box.max[axis] - o) * inv;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      hitAxis = axis;
      hitSign = sign;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }

  return tmin >= 0 ? tmin : -1;
}

/** Comme rayBox, mais renvoie aussi la normale de la face touchée. */
export function rayBoxDetailed(origin, dir, box) {
  let tmin = 0;
  let tmax = Infinity;
  let axis = 'x';
  let sign = 1;

  for (const a of ['x', 'y', 'z']) {
    const d = dir[a];
    const o = origin[a];
    if (Math.abs(d) < 1e-9) {
      if (o < box.min[a] || o > box.max[a]) return null;
      continue;
    }
    const inv = 1 / d;
    let t1 = (box.min[a] - o) * inv;
    let t2 = (box.max[a] - o) * inv;
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = a;
      sign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin < 0) return null;

  const normal = { x: 0, y: 0, z: 0 };
  normal[axis] = sign;
  return { distance: tmin, normal };
}

/** Premier obstacle du niveau touché par un rayon. */
export function raycastWorld(origin, dir, maxDistance, boxes) {
  let best = null;
  for (const box of boxes) {
    const hit = rayBoxDetailed(origin, dir, box);
    if (!hit || hit.distance > maxDistance) continue;
    if (!best || hit.distance < best.distance) best = { ...hit, box };
  }
  if (!best) return null;
  return {
    distance: best.distance,
    normal: best.normal,
    point: {
      x: origin.x + dir.x * best.distance,
      y: origin.y + dir.y * best.distance,
      z: origin.z + dir.z * best.distance,
    },
  };
}

/** Y a-t-il une ligne de vue dégagée entre deux points ? */
export function hasLineOfSight(from, to, boxes) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 1e-6) return true;
  const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
  const hit = raycastWorld(from, dir, dist - 0.01, boxes);
  return hit === null;
}

/**
 * Les cinq zones de dégâts d'un joueur, en coordonnées monde.
 *
 * Elles s'écrasent avec l'accroupissement : s'accroupir réduit réellement la
 * surface exposée, ce n'est pas qu'un effet visuel.
 */
export function playerHitboxes(pos, crouchBlend) {
  const s = (MOVE.standHeight + (MOVE.crouchHeight - MOVE.standHeight) * crouchBlend) / MOVE.standHeight;
  const box = (zone, y1, y2, hx, hz, offsetX = 0) => ({
    zone,
    min: { x: pos.x + offsetX - hx, y: pos.y + y1 * s, z: pos.z - hz },
    max: { x: pos.x + offsetX + hx, y: pos.y + y2 * s, z: pos.z + hz },
  });

  return [
    box('head', 1.54, 1.80, 0.12, 0.12),
    box('chest', 0.98, 1.54, 0.22, 0.13),
    box('stomach', 0.79, 0.98, 0.20, 0.12),
    box('arms', 0.98, 1.50, 0.08, 0.08, -0.30),
    box('arms', 0.98, 1.50, 0.08, 0.08, 0.30),
    box('legs', 0.00, 0.80, 0.09, 0.09, -0.13),
    box('legs', 0.00, 0.80, 0.09, 0.09, 0.13),
  ];
}
