// Petits vecteurs sous forme d'objets {x, y, z}. Pas de classe : les objets
// simples se sérialisent directement en JSON pour le réseau.

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const clone = (a) => ({ x: a.x, y: a.y, z: a.z });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const length = (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const lengthSq = (a) => a.x * a.x + a.y * a.y + a.z * a.z;

export const horizontalLength = (a) => Math.sqrt(a.x * a.x + a.z * a.z);

export function normalize(a) {
  const l = length(a);
  return l < 1e-6 ? v3() : { x: a.x / l, y: a.y / l, z: a.z / l };
}

export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export const distance = (a, b) => length(sub(a, b));

export function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);

/** Interpolation d'angle en degrés, par le plus court chemin. */
export function lerpAngle(a, b, t) {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

/** Direction de regard depuis des angles en degrés. */
export function dirFromAngles(yawDeg, pitchDeg) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cp = Math.cos(pitch);
  // Convention : yaw 0 regarde vers +Z, pitch positif regarde vers le bas.
  return { x: Math.sin(yaw) * cp, y: -Math.sin(pitch), z: Math.cos(yaw) * cp };
}
