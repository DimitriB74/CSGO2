// =============================================================================
//  Tests sans navigateur : équilibrage, déterminisme, carte, et une partie
//  complète simulée. Se lance avec `npm test`.
//
//  Ces vérifications tournent en quelques secondes et attrapent les régressions
//  d'équilibrage avant qu'on ne les découvre en jouant.
// =============================================================================

import { World } from '../server/world.js';
import { resolveDamage, shotsToKill } from '../shared/damage.js';
import { applySpread, computeSpread, hashSeed, patternKick } from '../shared/recoil.js';
import { stepVelocity, wishDirection } from '../shared/movement.js';
import { MAP, findPath, nearestNode, siteCenter } from '../shared/map.js';
import { WEAPONS } from '../shared/weapons.js';
import { MOVE, TICK_DT } from '../shared/constants.js';

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'OK   ' : 'ÉCHEC'} ${label}${detail ? '  — ' + detail : ''}`);
};

const query = (gun, zone, distance, armored) => ({
  baseDamage: gun.baseDamage,
  headMultiplier: gun.headMultiplier,
  armorPenetration: gun.armorPenetration,
  rangeFalloff: gun.rangeFalloff,
  distance,
  zone,
  armor: armored ? 100 : 0,
  helmet: armored,
});

console.log('\n=== Équilibrage des armes ===');
const W = WEAPONS;
check('Faucheur : une balle à la tête avec casque à 30 m',
  shotsToKill(query(W.faucheur, 'head', 30, true)) === 1,
  `${resolveDamage(query(W.faucheur, 'head', 30, true)).health} dégâts`);
check('Arbitre : PAS une balle à la tête avec casque',
  shotsToKill(query(W.arbitre, 'head', 0, true)) > 1,
  `${resolveDamage(query(W.arbitre, 'head', 0, true)).health} dégâts`);
check('Monolithe : une balle au torse avec gilet à 50 m',
  shotsToKill(query(W.monolithe, 'chest', 50, true)) === 1);
check('Monolithe : PAS une balle dans la jambe',
  resolveDamage(query(W.monolithe, 'legs', 0, true)).health < 100,
  `${resolveDamage(query(W.monolithe, 'legs', 0, true)).health} dégâts`);
check('Écharde : PAS une balle au torse avec gilet',
  shotsToKill(query(W.echarde, 'chest', 0, true)) > 1);
check('Masse .50 : une balle à la tête avec casque à 20 m',
  shotsToKill(query(W.masse50, 'head', 20, true)) === 1);
check('VK-9 : PAS une balle à la tête avec casque',
  shotsToKill(query(W.vk9, 'head', 0, true)) > 1);
check('le gilet réduit toujours les dégâts au torse',
  resolveDamage(query(W.faucheur, 'chest', 0, true)).health <
  resolveDamage(query(W.faucheur, 'chest', 0, false)).health);
check('aucun impact ne fait zéro dégât, même une jambe à 200 m',
  resolveDamage(query(W.bourrasque, 'legs', 200, true)).health >= 1);
check('les 20 armes ont un prix et des dégâts cohérents',
  Object.values(W).every((w) => w.baseDamage > 0 && w.rpm > 0 && w.price >= 0),
  `${Object.keys(W).length} armes`);

console.log('\n=== Dispersion déterministe ===');
check('même (tick, joueur, balle) → même graine',
  hashSeed(1234, 3, 7) === hashSeed(1234, 3, 7));
check('tick différent → graine différente',
  hashSeed(1234, 3, 7) !== hashSeed(1235, 3, 7));

const forward = { x: 0, y: 0, z: 1 };
const a = applySpread(forward, 2, 900, 4, 11);
const b = applySpread(forward, 2, 900, 4, 11);
check('serveur et client calculent la même balle', a.x === b.x && a.y === b.y && a.z === b.z);

let maxDeviation = 0;
let sumDeviation = 0;
const samples = 60000;
for (let i = 0; i < samples; i++) {
  const shot = applySpread(forward, 2, i, 1, i % 30);
  const deviation = (Math.acos(Math.min(1, shot.z)) * 180) / Math.PI;
  maxDeviation = Math.max(maxDeviation, deviation);
  sumDeviation += deviation;
}
check('aucune balle hors du cône', maxDeviation <= 2.001, `max ${maxDeviation.toFixed(3)}°`);
check('répartition uniforme dans le disque',
  Math.abs(sumDeviation / samples - (2 * 2) / 3) < 0.06,
  `moyenne ${(sumDeviation / samples).toFixed(3)}° (attendu 1,333)`);

check('la précision se dégrade en mouvement',
  computeSpread(W.faucheur, { speedRatio: 1, airborne: false, crouching: false, sprayIndex: 0, scoped: false }) >
  computeSpread(W.faucheur, { speedRatio: 0, airborne: false, crouching: false, sprayIndex: 0, scoped: false }));
check('le motif de recul est reproductible',
  patternKick(W.faucheur, 5).pitch === patternKick(W.faucheur, 5).pitch);

console.log('\n=== Déplacement ===');
const vel = { x: 0, y: 0, z: 0 };
const dir = wishDirection(0, 1, 0);
let ticks = 0;
while (Math.hypot(vel.x, vel.z) < MOVE.runSpeed * 0.99 && ticks < 640) {
  stepVelocity(vel, dir, MOVE.runSpeed, true, false, TICK_DT);
  ticks++;
}
check('montée à 99 % de la vitesse max', ticks > 20 && ticks < 50,
  `${(ticks * TICK_DT * 1000).toFixed(0)} ms`);

const back = wishDirection(0, -1, 0);
let counterTicks = 0;
while (Math.hypot(vel.x, vel.z) > 0.5 && counterTicks < 640) {
  stepVelocity(vel, back, MOVE.runSpeed, true, false, TICK_DT);
  counterTicks++;
}
const counterMs = counterTicks * TICK_DT * 1000;
check('counter-strafe sous 0,5 m/s en moins de 130 ms', counterMs < 130, `${counterMs.toFixed(0)} ms`);

const glide = { x: 0, y: 0, z: MOVE.runSpeed };
let glideTicks = 0;
while (Math.hypot(glide.x, glide.z) > 0.5 && glideTicks < 640) {
  stepVelocity(glide, { x: 0, y: 0, z: 0 }, 0, true, false, TICK_DT);
  glideTicks++;
}
const glideMs = glideTicks * TICK_DT * 1000;
check('le counter-strafe est au moins deux fois plus rapide que la friction',
  glideMs > counterMs * 2, `friction ${glideMs.toFixed(0)} ms contre ${counterMs.toFixed(0)} ms`);

console.log('\n=== Carte ===');
check('aucun nœud de navigation isolé',
  MAP.nav.edges.every((e) => e.length > 0), `${MAP.nav.nodes.length} nœuds`);

const routes = {};
for (const [label, from, to] of [
  ['cendreA', { x: 0, z: -27 }, siteCenter('A')],
  ['cendreB', { x: 0, z: -27 }, siteCenter('B')],
  ['verrouA', { x: 0, z: 27 }, siteCenter('A')],
  ['verrouB', { x: 0, z: 27 }, siteCenter('B')],
]) {
  const path = findPath(nearestNode(from), nearestNode(to));
  let length = 0;
  for (let i = 1; i < path.length; i++) {
    const p = MAP.nav.nodes[path[i - 1]];
    const q = MAP.nav.nodes[path[i]];
    length += Math.hypot(p.x - q.x, p.z - q.z);
  }
  routes[label] = length / MOVE.runSpeed;
  check(`chemin ${label} praticable`, path.length > 0, `${length.toFixed(1)} m`);
}
check('les défenseurs arrivent avant les attaquants',
  routes.verrouA < routes.cendreA - 3 && routes.verrouB < routes.cendreB - 3,
  `A : ${routes.verrouA.toFixed(1)} s contre ${routes.cendreA.toFixed(1)} s`);
check('les deux sites sont équilibrés pour les attaquants',
  Math.abs(routes.cendreA - routes.cendreB) < 2.5,
  `${routes.cendreA.toFixed(1)} s contre ${routes.cendreB.toFixed(1)} s`);

console.log('\n=== Partie complète simulée ===');
const world = new World();
for (let i = 0; i < 10; i++) world.addPlayer({ name: `Bot ${i + 1}`, isBot: true });

const counts = {};
const started = Date.now();
const totalTicks = 64 * 300; // cinq minutes de jeu
for (let i = 0; i < totalTicks; i++) {
  world.tick();
  for (const event of world.events) counts[event.type] = (counts[event.type] ?? 0) + 1;
}
const elapsed = Date.now() - started;

check('dix joueurs répartis en deux camps',
  world.players('cendre').length === 5 && world.players('verrou').length === 5);
check('le match progresse', world.match.round >= 3, `round ${world.match.round}`);
check('les bots se tuent', (counts.kill ?? 0) > 10, `${counts.kill ?? 0} éliminations`);
check('les bots posent la charge', (counts.plant ?? 0) >= 1, `${counts.plant ?? 0} poses`);
check('les scores avancent',
  world.match.scores.cendre + world.match.scores.verrou >= 3,
  `${world.match.scores.cendre} - ${world.match.scores.verrou}`);
check('personne ne dépasse le plafond d\'argent',
  world.players().every((p) => p.money <= 16000 && p.money >= 0));
check('aucun joueur hors de la carte',
  world.players().every((p) =>
    p.pos.x > MAP.bounds.x1 - 2 && p.pos.x < MAP.bounds.x2 + 2 &&
    p.pos.z > MAP.bounds.z1 - 2 && p.pos.z < MAP.bounds.z2 + 2 &&
    p.pos.y > -2 && p.pos.y < 20));
check('le serveur tient largement le temps réel',
  elapsed < totalTicks * TICK_DT * 1000 * 0.1,
  `${(elapsed / totalTicks).toFixed(3)} ms par tick, soit ${((elapsed / (totalTicks * TICK_DT * 1000)) * 100).toFixed(1)} % du budget`);

const snapshot = JSON.stringify(world.snapshot(world.players()[0]));
check('instantané de taille raisonnable', snapshot.length < 8000, `${snapshot.length} octets`);

console.log(`\n${passed}/${passed + failed} vérifications passées`);
if (failed > 0) process.exit(1);
