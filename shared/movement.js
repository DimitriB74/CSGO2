// =============================================================================
//  Physique de déplacement façon Quake/Source.
//
//  Ce fichier est utilisé **à l'identique par le serveur et par le client** :
//  le client prédit ses propres déplacements avec exactement le même code, ce
//  qui fait que la correction du serveur est presque toujours invisible.
//
//  Deux propriétés découlent de ce modèle, et ce sont celles qui font un FPS
//  tactique :
//
//  - le counter-strafe : appuyer sur la direction opposée annule la vitesse en
//    ~0,11 s, contre 0,37 s en relâchant simplement. C'est ce qui permet de
//    s'arrêter net pour tirer juste ;
//  - l'air-strafe : en l'air, tourner la vue en poussant sur le côté ajoute de
//    la vitesse, parce que le plafond ne s'applique qu'à la projection de la
//    vitesse sur la direction souhaitée.
//
//  Fonction pure : (vitesse, intention) → vitesse. Aucun état caché, donc le
//  client peut rejouer une séquence d'entrées et retomber sur le même résultat.
// =============================================================================

import { MOVE } from './constants.js';

/**
 * Applique la friction au sol.
 *
 * En dessous de stopSpeed on freine comme si on était à stopSpeed : sans ça, la
 * vitesse décroît exponentiellement et on glisse indéfiniment.
 */
function applyFriction(vel, dt) {
  const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
  if (speed < 0.01) {
    vel.x = 0;
    vel.z = 0;
    return;
  }
  const control = speed < MOVE.stopSpeed ? MOVE.stopSpeed : speed;
  const drop = control * MOVE.friction * dt;
  const scale = Math.max(0, speed - drop) / speed;
  vel.x *= scale;
  vel.z *= scale;
}

/**
 * Accélération plafonnée.
 *
 * On n'ajoute de la vitesse que jusqu'à ce que la **projection** de la vitesse
 * sur la direction souhaitée atteigne wishSpeed. Si la vitesse actuelle pointe
 * ailleurs, cette projection est faible voire négative, et l'accélération repart
 * à pleine puissance : c'est exactement ce qui rend le counter-strafe si vif.
 */
function accelerate(vel, wishDir, wishSpeed, accelPerSecond, dt) {
  if (wishSpeed <= 0) return;
  const projected = vel.x * wishDir.x + vel.y * wishDir.y + vel.z * wishDir.z;
  const missing = wishSpeed - projected;
  if (missing <= 0) return;
  // accelPerSecond contient DÉJÀ le facteur wishSpeed (voir l'appel dans
  // stepVelocity). Le remultiplier rendrait l'accélération 6 fois trop forte :
  // le counter-strafe prendrait 30 ms au lieu de 110, et tout le dosage du
  // déplacement s'effondrerait.
  const step = Math.min(accelPerSecond * dt, missing);
  vel.x += wishDir.x * step;
  vel.y += wishDir.y * step;
  vel.z += wishDir.z * step;
}

/**
 * Accélération en l'air.
 *
 * Subtilité héritée de Quake, et c'est elle qui autorise l'air-strafe : le
 * plafond limite la *cible* (airSpeedCap), mais la force de l'accélération reste
 * proportionnelle à la vitesse souhaitée complète.
 */
function airAccelerate(vel, wishDir, wishSpeed, dt) {
  if (wishSpeed <= 0) return;
  const cappedTarget = Math.min(wishSpeed, MOVE.airSpeedCap);
  const projected = vel.x * wishDir.x + vel.y * wishDir.y + vel.z * wishDir.z;
  const missing = cappedTarget - projected;
  if (missing <= 0) return;
  const step = Math.min(MOVE.airAccelerate * wishSpeed * dt, missing);
  vel.x += wishDir.x * step;
  vel.y += wishDir.y * step;
  vel.z += wishDir.z * step;
}

/**
 * Direction souhaitée dans le repère du monde, depuis les axes de déplacement
 * et l'orientation du regard.
 */
export function wishDirection(moveX, moveZ, yawDeg) {
  if (moveX === 0 && moveZ === 0) return { x: 0, y: 0, z: 0 };
  const yaw = (yawDeg * Math.PI) / 180;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // Avant = +Z tourné par le lacet ; droite = perpendiculaire.
  const x = moveX * cos + moveZ * sin;
  const z = -moveX * sin + moveZ * cos;
  const len = Math.sqrt(x * x + z * z);
  return len < 1e-6 ? { x: 0, y: 0, z: 0 } : { x: x / len, y: 0, z: z / len };
}

/** Vitesse visée selon la posture et l'arme tenue. */
export function wishSpeed(crouchBlend, walking, weaponFactor) {
  let factor = weaponFactor > 0 ? weaponFactor : 1;
  // Accroupi et marche lente ne se cumulent pas : on garde le plus contraignant.
  if (crouchBlend > 0.5) factor *= MOVE.crouchFactor;
  else if (walking) factor *= MOVE.walkFactor;
  return MOVE.runSpeed * factor;
}

/**
 * Un pas de physique. Modifie `vel` sur place et renvoie si un saut a eu lieu.
 *
 * @param {{x,y,z}} vel        vitesse, modifiée sur place
 * @param {{x,y,z}} wishDir    direction souhaitée, horizontale et normalisée
 * @param {number}  speed      vitesse visée en m/s
 * @param {boolean} grounded   au sol au début du pas
 * @param {boolean} jump       saut demandé à ce tick
 * @param {number}  dt         durée du pas
 */
export function stepVelocity(vel, wishDir, speed, grounded, jump, dt) {
  let jumped = false;
  if (dt <= 0) return jumped;

  if (grounded) {
    // La friction s'applique AVANT l'accélération : c'est cet ordre qui donne
    // le freinage sec du counter-strafe.
    applyFriction(vel, dt);

    if (jump) {
      vel.y = MOVE.jumpImpulse;
      jumped = true;
      grounded = false;
    } else {
      accelerate(vel, wishDir, speed, MOVE.accelerate * speed, dt);
      // On reste collé au sol, sinon on décolle sur la moindre bosse.
      vel.y = -MOVE.groundStick;
    }
  }

  if (!grounded) {
    airAccelerate(vel, wishDir, speed, dt);
    vel.y -= MOVE.gravity * dt;
  }

  return jumped;
}

export const eyeHeight = (crouchBlend) =>
  MOVE.eyeStand + (MOVE.eyeCrouch - MOVE.eyeStand) * crouchBlend;

export const bodyHeight = (crouchBlend) =>
  MOVE.standHeight + (MOVE.crouchHeight - MOVE.standHeight) * crouchBlend;
