// =============================================================================
//  Toutes les valeurs réglables du jeu. Rien de tout cela ne doit être écrit
//  en dur ailleurs dans le code.
//
//  Unités : mètres, secondes, m/s. Les valeurs de déplacement sont converties
//  depuis les unités source (1 u = 2,54 cm) pour garder une sensation de FPS
//  tactique reconnaissable.
// =============================================================================

/** Fréquence de la simulation serveur. 64 Hz, comme les FPS compétitifs. */
export const TICK_RATE = 64;
export const TICK_DT = 1 / TICK_RATE;

/** Fréquence d'envoi de l'état aux clients. Plus basse que la simulation :
 *  les clients interpolent entre deux instantanés, ce qui suffit largement et
 *  divise la bande passante par trois. */
export const SNAPSHOT_RATE = 22;

/** Historique conservé pour la compensation de latence, en secondes. */
export const LAG_COMP_WINDOW = 1.0;

/** Latence maximale qu'on accepte de rembobiner. Au-delà, on plafonne :
 *  sinon un joueur avec 800 ms de ping tirerait sur un passé trop lointain. */
export const LAG_COMP_MAX = 0.25;

export const MOVE = {
  /** 800 u/s² */
  gravity: 20.32,
  /** 301 u/s → apogée ≈ 1,38 m */
  jumpImpulse: 7.64,
  /** 250 u/s */
  runSpeed: 6.35,
  accelerate: 5.5,
  airAccelerate: 12,
  friction: 5.2,
  /** 75 u/s */
  stopSpeed: 1.9,
  /** 30 u/s : le plafond qui rend l'air-strafe possible */
  airSpeedCap: 0.762,
  walkFactor: 0.52,
  crouchFactor: 0.34,
  standHeight: 1.85,
  crouchHeight: 1.35,
  radius: 0.4,
  eyeStand: 1.62,
  eyeCrouch: 1.15,
  /** 18 u : hauteur de marche franchissable sans sauter */
  stepHeight: 0.46,
  crouchSpeed: 8,
  groundStick: 2,
  /** Vitesse de chute au-delà de laquelle on prend des dégâts */
  fallDamageSpeed: 14,
};

export const ROUND = {
  freezeTime: 5,
  buyTime: 20,
  roundTime: 115,
  bombTime: 40,
  plantTime: 3.2,
  defuseTime: 10,
  defuseKitTime: 5,
  endDelay: 5,
  roundsToWin: 13,
  halfTimeAfter: 12,
  teamSize: 5,
  warmupMinPlayers: 1,
};

export const ECONOMY = {
  start: 800,
  max: 16000,
  win: 3250,
  bombExploded: 3500,
  defused: 3500,
  plantBonus: 300,
  defuseBonus: 300,
  /** 1400 $ puis +500 par défaite consécutive */
  lossLadder: [1400, 1900, 2400, 2900, 3400],
};

export const HEALTH = {
  max: 100,
  maxArmor: 100,
  /** Le gilet encaisse la moitié des dégâts qu'il bloque */
  armorAbsorption: 0.5,
  /** Pas de la perte de dégâts à la distance : 500 u */
  falloffStep: 12.7,
};

/** Multiplicateurs de zone. La tête est propre à chaque arme. */
export const ZONE_MULTIPLIER = {
  head: null, // remplacé par headMultiplier de l'arme
  chest: 1.0,
  stomach: 1.25,
  arms: 1.0,
  legs: 0.75,
};

export const TEAM = { CENDRE: 'cendre', VERROU: 'verrou' };

export const TEAM_LABEL = {
  [TEAM.CENDRE]: 'CENDRE',
  [TEAM.VERROU]: 'VERROU',
};

export const TEAM_COLOR = {
  [TEAM.CENDRE]: '#e3b44c',
  [TEAM.VERROU]: '#6ba8ed',
};

export function otherTeam(team) {
  return team === TEAM.CENDRE ? TEAM.VERROU : TEAM.CENDRE;
}

/** Bits d'entrée. L'ordre fait partie du protocole : on ajoute à la fin. */
export const BTN = {
  FIRE: 1 << 0,
  ALT: 1 << 1,
  RELOAD: 1 << 2,
  JUMP: 1 << 3,
  CROUCH: 1 << 4,
  WALK: 1 << 5,
  USE: 1 << 6,
};
