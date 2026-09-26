// =============================================================================
//  Direction d'une balle : cône de dispersion et motif de recul.
//
//  Contrainte centrale : le serveur et le client doivent calculer **la même
//  balle**, sinon le client voit ses impacts ailleurs que le serveur ne les
//  place. Toute la part aléatoire passe donc par un générateur déterministe
//  alimenté par (tick, joueur, numéro de balle).
//
//  Ne jamais utiliser Math.random() dans le chemin du tir.
// =============================================================================

import { cross, normalize } from './vec.js';

/**
 * Mélange trois entiers en une graine. Avalanche façon Murmur3 : deux balles
 * consécutives donnent des graines très différentes, donc aucun motif visible.
 */
export function hashSeed(tick, playerId, shotIndex) {
  let h = 2166136261 >>> 0;
  const mix = (value) => {
    h = (h ^ value) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 2246822519) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  };
  mix(tick >>> 0);
  mix(Math.imul(playerId, 2654435761) >>> 0);
  mix((Math.imul(shotIndex, 40503) + 1) >>> 0);
  return h === 0 ? 1 : h;
}

/** Xorshift32 : rapide, sans état global, suffisant pour une dispersion. */
function nextFloat(state) {
  let s = state.v;
  s = (s ^ (s << 13)) >>> 0;
  s = (s ^ (s >>> 17)) >>> 0;
  s = (s ^ (s << 5)) >>> 0;
  state.v = s;
  return (s >>> 8) / 16777216; // 24 bits → [0, 1[
}

/**
 * Demi-angle du cône de dispersion, en degrés.
 *
 * La pénalité de mouvement est quadratique : marcher doucement gêne peu,
 * sprinter gêne énormément. C'est ce qui rend le counter-strafe payant plutôt
 * que cosmétique.
 */
export function computeSpread(weapon, { speedRatio, airborne, crouching, sprayIndex, scoped }) {
  let spread = weapon.baseSpread;

  const ratio = Math.max(0, Math.min(1, speedRatio));
  spread += weapon.moveSpread * ratio * ratio;

  if (airborne) spread += weapon.jumpSpread;
  else if (crouching) spread *= 0.76;

  spread += weapon.spreadPerShot * Math.max(0, sprayIndex);

  if (scoped && weapon.scopedSpreadFactor) spread *= weapon.scopedSpreadFactor;
  return spread;
}

/**
 * Décale une direction dans un cône, de façon déterministe.
 *
 * La racine carrée sur le rayon donne une répartition uniforme dans le disque.
 * Sans elle, les balles s'agglutineraient au centre et le cône ne voudrait plus
 * rien dire (déviation moyenne vérifiée : 2/3 du cône).
 */
export function applySpread(direction, spreadDegrees, tick, playerId, shotIndex) {
  if (spreadDegrees <= 1e-4) return direction;

  const state = { v: hashSeed(tick, playerId, shotIndex) };
  const angle = nextFloat(state) * Math.PI * 2;
  const radius = Math.sqrt(nextFloat(state)) * Math.tan((spreadDegrees * Math.PI) / 180);

  let right = cross({ x: 0, y: 1, z: 0 }, direction);
  if (right.x * right.x + right.y * right.y + right.z * right.z < 1e-6) right = { x: 1, y: 0, z: 0 };
  right = normalize(right);
  const up = normalize(cross(direction, right));

  const dx = Math.cos(angle) * radius;
  const dy = Math.sin(angle) * radius;
  return normalize({
    x: direction.x + right.x * dx + up.x * dy,
    y: direction.y + right.y * dx + up.y * dy,
    z: direction.z + right.z * dx + up.z * dy,
  });
}

/**
 * Recul de vue de la Nième balle, en degrés.
 * Renvoie {pitch, yaw} : pitch négatif = la vue monte.
 *
 * Le motif est **fixe**, donc apprenable : c'est le cœur de la maîtrise d'une
 * arme. Seule la dispersion ci-dessus est aléatoire.
 */
export function patternKick(weapon, sprayIndex) {
  const pattern = weapon.recoilPattern;
  if (!pattern || pattern.length === 0) {
    return { pitch: -weapon.recoilVertical, yaw: 0 };
  }
  const index = Math.max(0, Math.min(sprayIndex, pattern.length - 1));
  const point = pattern[index];
  // Convention du motif : [décalage horizontal −1..1, montée 0..1]
  return {
    pitch: -point[1] * weapon.recoilVertical,
    yaw: point[0] * weapon.recoilHorizontal,
  };
}

/** Retour progressif de la vue au repos. Décroissance exponentielle. */
export function recoverPunch(punch, recoverRate, dt) {
  const factor = Math.exp(-Math.max(0, recoverRate) * dt);
  const pitch = punch.pitch * factor;
  const yaw = punch.yaw * factor;
  if (pitch * pitch + yaw * yaw < 4e-4) return { pitch: 0, yaw: 0 };
  return { pitch, yaw };
}
