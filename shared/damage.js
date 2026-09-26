// =============================================================================
//  Calcul des dégâts : zone touchée, perte à la distance, absorption du gilet.
//
//  L'ordre des trois opérations compte et ne doit pas être réarrangé. Inverser
//  distance et armure changerait le nombre de balles nécessaires à longue
//  portée.
//
//  Ce modèle a été vérifié numériquement : voir test/sim.test.js, qui rejoue
//  dix contrôles de conception (« le Faucheur tue d'une balle à la tête avec
//  casque à 30 m », « le Monolithe ne tue pas d'une balle dans la jambe », …).
// =============================================================================

import { HEALTH, ZONE_MULTIPLIER } from './constants.js';

/** Multiplicateur de la zone touchée. La tête est propre à chaque arme. */
export function zoneMultiplier(zone, headMultiplier) {
  if (zone === 'head') return headMultiplier;
  const m = ZONE_MULTIPLIER[zone];
  return m === undefined || m === null ? 1 : m;
}

/**
 * Le casque ne protège que la tête, le gilet protège tout le reste.
 * Une tête sans casque ignore complètement l'armure.
 */
export function armorCovers(zone, armor, helmet) {
  if (armor <= 0) return false;
  return zone !== 'head' || helmet;
}

/**
 * Chiffre un impact.
 *
 * @returns {{health: number, armor: number}} points de vie et d'armure retirés
 */
export function resolveDamage({ baseDamage, headMultiplier, armorPenetration, rangeFalloff, distance, zone, armor, helmet }) {
  // 1. Zone.
  let damage = baseDamage * zoneMultiplier(zone, headMultiplier);

  // 2. Perte à la distance : facteur élevé à (distance / pas).
  if (rangeFalloff > 0 && rangeFalloff < 1 && distance > 0) {
    damage *= Math.pow(rangeFalloff, distance / HEALTH.falloffStep);
  }

  // 3. Armure.
  let armorLoss = 0;
  if (armorCovers(zone, armor, helmet) && armorPenetration < 1) {
    let through = damage * armorPenetration;
    let absorbed = (damage - through) * HEALTH.armorAbsorption;

    if (absorbed > armor) {
      // Le gilet cède : il ne bloque que ce qu'il pouvait encore encaisser.
      absorbed = armor;
      through = damage - absorbed / HEALTH.armorAbsorption;
    }

    armorLoss = Math.min(armor, Math.ceil(absorbed));
    damage = through;
  }

  // Un impact enlève toujours au moins 1 point : une balle dans la jambe à
  // 200 m qui ne ferait littéralement rien se lit comme un bug côté joueur.
  return { health: Math.max(1, Math.round(damage)), armor: armorLoss };
}

/** Nombre de balles pour tuer. Sert à l'équilibrage et aux tests. */
export function shotsToKill(query, health = HEALTH.max) {
  let hp = health;
  let armor = query.armor;
  let shots = 0;
  while (hp > 0 && shots < 200) {
    const result = resolveDamage({ ...query, armor });
    hp -= result.health;
    armor = Math.max(0, armor - result.armor);
    shots++;
  }
  return shots;
}
