// =============================================================================
//  Catalogue des armes.
//
//  Toutes les valeurs d'équilibrage sont ici, et nulle part ailleurs. Le tableau
//  de référence, avec les dégâts par balle et le nombre de balles pour tuer, est
//  dans docs/01-univers-et-armes.md et docs/04-phase-2.md.
//
//  Noms 100 % originaux, avec trois fabricants fictifs :
//    Voskov (marché gris, côté Cendre) · Kestrel (institutionnel, côté Verrou)
//    Meridian (civil, commun aux deux camps)
// =============================================================================

import { TEAM } from './constants.js';

/**
 * Motif des fusils d'assaut : montée franche sur 6 balles, puis un balayage
 * droite → gauche → droite. C'est LE motif à apprendre.
 * Format : [décalage horizontal −1..1, montée 0..1]
 */
const RIFLE_PATTERN = [
  [0.00, 0.35], [0.05, 0.62], [-0.04, 0.80], [0.10, 0.90], [0.22, 0.96],
  [0.38, 1.00], [0.52, 1.00], [0.62, 0.98], [0.55, 0.95], [0.30, 0.92],
  [-0.05, 0.90], [-0.38, 0.88], [-0.62, 0.86], [-0.72, 0.85], [-0.60, 0.84],
  [-0.34, 0.83], [-0.02, 0.82], [0.28, 0.82], [0.52, 0.81], [0.68, 0.81],
  [0.60, 0.80], [0.34, 0.80], [0.04, 0.80], [-0.26, 0.79], [-0.50, 0.79],
  [-0.66, 0.78], [-0.54, 0.78], [-0.26, 0.78], [0.06, 0.77], [0.34, 0.77],
];

/** Motif généré : montée douce et oscillation régulière. */
function oscillating(count, climbShots, amplitude, period) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push([
      Math.sin((i / period) * Math.PI * 2) * amplitude,
      Math.min(1, (i + 1) / climbShots),
    ]);
  }
  return points;
}

/** Montée quasi verticale avec une légère alternance gauche/droite. */
function mostlyVertical(count, climbShots, jitter) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const climb = Math.min(1, (i + 1) / climbShots);
    points.push([(i % 2 === 0 ? 1 : -1) * jitter * climb, climb]);
  }
  return points;
}

const PATTERNS = {
  rifle: RIFLE_PATTERN,
  smg: oscillating(40, 8, 0.55, 9),
  pistol: mostlyVertical(20, 5, 0.22),
  shotgun: mostlyVertical(8, 3, 0.18),
  sniper: mostlyVertical(10, 2, 0.1),
  mg: oscillating(60, 12, 0.7, 14),
};

/**
 * Une arme.
 * @param p paramètres, voir les valeurs par défaut pour la liste complète
 */
function weapon(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,            // melee | pistol | shotgun | smg | rifle | sniper | mg
    team: p.team ?? null,            // null = les deux camps
    price: p.price ?? 0,
    killReward: p.killReward ?? 300,

    baseDamage: p.baseDamage ?? 30,
    headMultiplier: p.headMultiplier ?? 4,
    armorPenetration: p.armorPenetration ?? 0.7,
    rangeFalloff: p.rangeFalloff ?? 0.98,
    maxRange: p.maxRange ?? 100,
    pellets: p.pellets ?? 1,

    fireMode: p.fireMode ?? 'auto',  // auto | single | burst
    rpm: p.rpm ?? 600,
    burstCount: p.burstCount ?? 1,
    magazine: p.magazine ?? 30,
    reserve: p.reserve ?? 90,
    reloadTime: p.reloadTime ?? 2.5,

    baseSpread: p.baseSpread ?? 0.3,
    moveSpread: p.moveSpread ?? 12,
    jumpSpread: p.jumpSpread ?? 17,
    spreadPerShot: p.spreadPerShot ?? 0.55,

    recoilPattern: p.pattern ? PATTERNS[p.pattern] : null,
    recoilVertical: p.recoilVertical ?? 2,
    recoilHorizontal: p.recoilHorizontal ?? 1,
    recoilRecovery: p.recoilRecovery ?? 10,

    speedFactor: p.speedFactor ?? 0.94,
    scoped: p.scoped ?? false,
    scopedSpreadFactor: p.scopedSpreadFactor ?? 1,
    scopedSpeedFactor: p.scopedSpeedFactor ?? 0.45,
    scopedFov: p.scopedFov ?? 40,

    /** Délai entre deux coups, en secondes. */
    get cycleTime() {
      return this.rpm <= 0 ? 0.5 : 60 / this.rpm;
    },
  };
}

export const WEAPONS = {
  // --- corps à corps --------------------------------------------------------
  crochet: weapon({
    id: 'crochet', name: 'Crochet', category: 'melee', price: 0, killReward: 1500,
    baseDamage: 45, headMultiplier: 1, armorPenetration: 0.85, rangeFalloff: 1,
    maxRange: 1.6, fireMode: 'single', rpm: 150, magazine: 0, reserve: 0,
    baseSpread: 0, moveSpread: 0, jumpSpread: 0, spreadPerShot: 0,
    recoilVertical: 0, recoilHorizontal: 0, speedFactor: 1,
  }),

  // --- pistolets ------------------------------------------------------------
  vk9: weapon({
    id: 'vk9', name: 'Voskov VK-9', category: 'pistol', team: TEAM.CENDRE, price: 0,
    baseDamage: 29, armorPenetration: 0.47, rangeFalloff: 0.99, maxRange: 60,
    fireMode: 'single', rpm: 400, magazine: 20, reserve: 120, reloadTime: 2.2,
    baseSpread: 0.45, moveSpread: 5, jumpSpread: 12, spreadPerShot: 0.5,
    recoilVertical: 1.3, recoilHorizontal: 0.7, recoilRecovery: 14,
    speedFactor: 1, pattern: 'pistol',
  }),
  k7: weapon({
    id: 'k7', name: 'Kestrel K-7', category: 'pistol', team: TEAM.VERROU, price: 0,
    baseDamage: 34, armorPenetration: 0.5, rangeFalloff: 0.91, maxRange: 60,
    fireMode: 'single', rpm: 353, magazine: 12, reserve: 24, reloadTime: 2.2,
    baseSpread: 0.38, moveSpread: 5, jumpSpread: 12, spreadPerShot: 0.5,
    recoilVertical: 1.4, recoilHorizontal: 0.6, recoilRecovery: 14,
    speedFactor: 1, pattern: 'pistol',
  }),
  masse50: weapon({
    id: 'masse50', name: 'Meridian Masse .50', category: 'pistol', price: 700,
    baseDamage: 62, armorPenetration: 0.93, rangeFalloff: 0.81, maxRange: 70,
    fireMode: 'single', rpm: 267, magazine: 7, reserve: 35, reloadTime: 2.2,
    baseSpread: 0.5, moveSpread: 9, jumpSpread: 14, spreadPerShot: 1.4,
    recoilVertical: 4.2, recoilHorizontal: 1.6, recoilRecovery: 9,
    speedFactor: 0.98, pattern: 'pistol',
  }),
  salve3: weapon({
    id: 'salve3', name: 'Voskov Salve-3', category: 'pistol', price: 350,
    baseDamage: 26, armorPenetration: 0.65, rangeFalloff: 0.94, maxRange: 60,
    fireMode: 'burst', burstCount: 3, rpm: 600, magazine: 18, reserve: 90, reloadTime: 2,
    baseSpread: 0.55, moveSpread: 6, jumpSpread: 13, spreadPerShot: 0.45,
    recoilVertical: 1.6, recoilHorizontal: 0.8, recoilRecovery: 13,
    speedFactor: 1, pattern: 'pistol',
  }),
  gemeaux: weapon({
    id: 'gemeaux', name: 'Meridian Gémeaux', category: 'pistol', price: 500,
    baseDamage: 27, armorPenetration: 0.52, rangeFalloff: 0.94, maxRange: 55,
    fireMode: 'auto', rpm: 500, magazine: 30, reserve: 120, reloadTime: 3.4,
    baseSpread: 0.9, moveSpread: 7, jumpSpread: 14, spreadPerShot: 0.55,
    recoilVertical: 1.5, recoilHorizontal: 1.2, recoilRecovery: 13,
    speedFactor: 0.99, pattern: 'pistol',
  }),

  // --- fusils à pompe -------------------------------------------------------
  bourrasque: weapon({
    id: 'bourrasque', name: 'Meridian Bourrasque', category: 'shotgun', price: 1000,
    killReward: 900, baseDamage: 26, armorPenetration: 0.5, rangeFalloff: 0.7,
    maxRange: 25, pellets: 9, fireMode: 'single', rpm: 68, magazine: 8, reserve: 32,
    reloadTime: 3.2, baseSpread: 3.2, moveSpread: 5, jumpSpread: 10, spreadPerShot: 0.2,
    recoilVertical: 5.5, recoilHorizontal: 1.4, recoilRecovery: 9,
    speedFactor: 0.96, pattern: 'shotgun',
  }),
  grele: weapon({
    id: 'grele', name: 'Kestrel Grêle SA', category: 'shotgun', price: 2000,
    killReward: 900, baseDamage: 20, armorPenetration: 0.5, rangeFalloff: 0.7,
    maxRange: 25, pellets: 8, fireMode: 'single', rpm: 171, magazine: 7, reserve: 32,
    reloadTime: 3.4, baseSpread: 3.6, moveSpread: 5, jumpSpread: 10, spreadPerShot: 0.2,
    recoilVertical: 4.5, recoilHorizontal: 1.2, recoilRecovery: 9,
    speedFactor: 0.94, pattern: 'shotgun',
  }),

  // --- pistolets-mitrailleurs -----------------------------------------------
  guepe: weapon({
    id: 'guepe', name: 'Voskov Guêpe', category: 'smg', team: TEAM.CENDRE, price: 1050,
    killReward: 600, baseDamage: 28, armorPenetration: 0.58, rangeFalloff: 0.82,
    maxRange: 45, rpm: 857, magazine: 30, reserve: 100, reloadTime: 2.3,
    baseSpread: 0.9, moveSpread: 8, jumpSpread: 14, spreadPerShot: 0.5,
    recoilVertical: 1.6, recoilHorizontal: 1.1, recoilRecovery: 13,
    speedFactor: 0.98, pattern: 'smg',
  }),
  onde9: weapon({
    id: 'onde9', name: 'Kestrel Onde-9', category: 'smg', team: TEAM.VERROU, price: 1250,
    killReward: 600, baseDamage: 26, armorPenetration: 0.6, rangeFalloff: 0.84,
    maxRange: 45, rpm: 900, magazine: 30, reserve: 120, reloadTime: 2.1,
    baseSpread: 0.8, moveSpread: 7, jumpSpread: 13, spreadPerShot: 0.45,
    recoilVertical: 1.4, recoilHorizontal: 1, recoilRecovery: 14,
    speedFactor: 0.99, pattern: 'smg',
  }),
  ruche: weapon({
    id: 'ruche', name: 'Meridian Ruche', category: 'smg', price: 1200,
    killReward: 600, baseDamage: 24, armorPenetration: 0.62, rangeFalloff: 0.81,
    maxRange: 45, rpm: 857, magazine: 50, reserve: 100, reloadTime: 3.3,
    baseSpread: 0.75, moveSpread: 7, jumpSpread: 13, spreadPerShot: 0.42,
    recoilVertical: 1.3, recoilHorizontal: 0.9, recoilRecovery: 14,
    speedFactor: 0.97, pattern: 'smg',
  }),

  // --- fusils d'assaut ------------------------------------------------------
  brulot: weapon({
    id: 'brulot', name: 'Voskov Brûlot', category: 'rifle', team: TEAM.CENDRE, price: 1800,
    baseDamage: 30, armorPenetration: 0.78, rangeFalloff: 0.98, maxRange: 90,
    rpm: 667, magazine: 35, reserve: 90, reloadTime: 3,
    baseSpread: 0.42, moveSpread: 12, jumpSpread: 17, spreadPerShot: 0.6,
    recoilVertical: 2, recoilHorizontal: 1.1, recoilRecovery: 11,
    speedFactor: 0.94, pattern: 'rifle',
  }),
  clairon: weapon({
    id: 'clairon', name: 'Kestrel Clairon', category: 'rifle', team: TEAM.VERROU, price: 2050,
    baseDamage: 30, armorPenetration: 0.7, rangeFalloff: 0.97, maxRange: 90,
    rpm: 667, magazine: 25, reserve: 90, reloadTime: 3.3,
    baseSpread: 0.4, moveSpread: 12, jumpSpread: 17, spreadPerShot: 0.58,
    recoilVertical: 2, recoilHorizontal: 1, recoilRecovery: 11,
    speedFactor: 0.94, pattern: 'rifle',
  }),
  faucheur: weapon({
    id: 'faucheur', name: 'Voskov Faucheur', category: 'rifle', team: TEAM.CENDRE, price: 2700,
    baseDamage: 36, armorPenetration: 0.78, rangeFalloff: 0.98, maxRange: 100,
    rpm: 600, magazine: 30, reserve: 90, reloadTime: 2.4,
    baseSpread: 0.28, moveSpread: 13, jumpSpread: 18, spreadPerShot: 0.62,
    recoilVertical: 2.35, recoilHorizontal: 1.35, recoilRecovery: 10,
    speedFactor: 0.93, pattern: 'rifle',
  }),
  arbitre: weapon({
    id: 'arbitre', name: 'Kestrel Arbitre', category: 'rifle', team: TEAM.VERROU, price: 3100,
    baseDamage: 33, armorPenetration: 0.7, rangeFalloff: 0.97, maxRange: 100,
    rpm: 667, magazine: 30, reserve: 90, reloadTime: 3.1,
    baseSpread: 0.26, moveSpread: 12, jumpSpread: 17, spreadPerShot: 0.55,
    recoilVertical: 1.95, recoilHorizontal: 1.05, recoilRecovery: 11,
    speedFactor: 0.93, pattern: 'rifle',
  }),
  scrutateur: weapon({
    id: 'scrutateur', name: 'Meridian Scrutateur 2×', category: 'rifle', price: 2750,
    baseDamage: 38, armorPenetration: 0.8, rangeFalloff: 0.99, maxRange: 120,
    rpm: 500, magazine: 20, reserve: 60, reloadTime: 3,
    baseSpread: 0.22, moveSpread: 14, jumpSpread: 19, spreadPerShot: 0.7,
    recoilVertical: 2.4, recoilHorizontal: 0.9, recoilRecovery: 10,
    speedFactor: 0.92, pattern: 'rifle',
    scoped: true, scopedSpreadFactor: 0.28, scopedSpeedFactor: 0.6, scopedFov: 55,
  }),

  // --- fusils de précision --------------------------------------------------
  echarde: weapon({
    id: 'echarde', name: 'Kestrel Écharde', category: 'sniper', price: 1700,
    baseDamage: 88, headMultiplier: 3, armorPenetration: 0.85, rangeFalloff: 0.98,
    maxRange: 200, fireMode: 'single', rpm: 48, magazine: 10, reserve: 90, reloadTime: 3.6,
    baseSpread: 0.14, moveSpread: 22, jumpSpread: 30, spreadPerShot: 2,
    recoilVertical: 4, recoilHorizontal: 0.5, recoilRecovery: 8,
    speedFactor: 0.92, pattern: 'sniper',
    scoped: true, scopedSpreadFactor: 0.1, scopedSpeedFactor: 0.6, scopedFov: 30,
  }),
  monolithe: weapon({
    id: 'monolithe', name: 'Voskov Monolithe', category: 'sniper', price: 4750,
    killReward: 100, baseDamage: 115, headMultiplier: 2.5, armorPenetration: 0.97,
    rangeFalloff: 0.99, maxRange: 250, fireMode: 'single', rpm: 41, magazine: 10,
    reserve: 30, reloadTime: 3.7,
    baseSpread: 0.1, moveSpread: 26, jumpSpread: 34, spreadPerShot: 2.5,
    recoilVertical: 5.5, recoilHorizontal: 0.4, recoilRecovery: 7,
    speedFactor: 0.84, pattern: 'sniper',
    scoped: true, scopedSpreadFactor: 0.06, scopedSpeedFactor: 0.4, scopedFov: 20,
  }),
  verdict: weapon({
    id: 'verdict', name: 'Meridian Verdict', category: 'sniper', price: 5000,
    baseDamage: 80, headMultiplier: 3, armorPenetration: 0.82, rangeFalloff: 0.98,
    maxRange: 220, fireMode: 'single', rpm: 150, magazine: 20, reserve: 90, reloadTime: 3.9,
    baseSpread: 0.16, moveSpread: 24, jumpSpread: 32, spreadPerShot: 1.6,
    recoilVertical: 3.6, recoilHorizontal: 0.6, recoilRecovery: 8,
    speedFactor: 0.88, pattern: 'sniper',
    scoped: true, scopedSpreadFactor: 0.09, scopedSpeedFactor: 0.5, scopedFov: 30,
  }),

  // --- mitrailleuse ---------------------------------------------------------
  broyeur: weapon({
    id: 'broyeur', name: 'Voskov Broyeur', category: 'mg', price: 5700,
    baseDamage: 35, armorPenetration: 0.58, rangeFalloff: 0.98, maxRange: 100,
    rpm: 800, magazine: 150, reserve: 0, reloadTime: 5.7,
    baseSpread: 0.55, moveSpread: 16, jumpSpread: 22, spreadPerShot: 0.3,
    recoilVertical: 2.2, recoilHorizontal: 1.3, recoilRecovery: 10,
    speedFactor: 0.84, pattern: 'mg',
  }),
};

/** Équipement : pas d'arme, mais ça s'achète. */
export const GEAR = {
  gilet: { id: 'gilet', name: 'Gilet', price: 650, armor: 100, helmet: false },
  casque: { id: 'casque', name: 'Gilet + Casque', price: 1000, armor: 100, helmet: true },
  kit: { id: 'kit', name: 'Kit de désamorçage', price: 400, team: TEAM.VERROU, kit: true },
};

export const startingPistol = (team) => (team === TEAM.CENDRE ? WEAPONS.vk9 : WEAPONS.k7);

/** Tout ce qu'un camp peut acheter, dans l'ordre du menu. */
export function buyList(team) {
  const list = [];
  for (const w of Object.values(WEAPONS)) {
    if (w.price <= 0) continue;
    if (w.team && w.team !== team) continue;
    list.push(w);
  }
  return list;
}

export function gearList(team) {
  return Object.values(GEAR).filter((g) => !g.team || g.team === team);
}
