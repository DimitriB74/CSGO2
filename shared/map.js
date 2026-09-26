// =============================================================================
//  « Sablier » — village désertique, deux sites de bombe.
//
//  La géométrie est décrite ici et envoyée telle quelle au client, qui en
//  construit le rendu 3D. Une seule source de vérité : impossible que la
//  collision du serveur et le décor affiché divergent.
//
//  Plan vu du dessus (+Z vers le haut = côté Verrou) :
//
//        ┌──────────────────────────────────────────────────┐
//   z=30 │            S P A W N   V E R R O U               │
//        │──────────┐                        ┌──────────────│  z=24
//        │  SITE B  │                        │   SITE A     │
//        │  ██  ██  │        LE PUITS        │   ██  ██     │
//        │      ██  │        (milieu)        │   ██         │
//   z=9  │──────┐   │            ██          │   ┌──────────│
//        │      │   │                        │   │          │  z=5
//        │ PASSE B  │  ██                ██  │  RUELLE A    │
//        │      │   │                        │   │          │
//        │      │   │  ██                    │   │          │
//   z=-24│──────┘   └────────┐      ┌────────┘   └──────────│
//        │            S P A W N   C E N D R E               │
//  z=-30 └──────────────────────────────────────────────────┘
//        x=-34                  x=0                     x=34
//
//  Rotations : les Verrou (défenseurs) atteignent un site en ~4 s, les Cendre
//  (attaquants) en ~9 s par le couloir extérieur. C'est l'écart qui donne aux
//  défenseurs le temps de se placer, comme dans tout FPS de désamorçage.
// =============================================================================

import { hasLineOfSight } from './collision.js';
import { TEAM } from './constants.js';

/** Boîte décrite par son emprise au sol et sa hauteur. */
function box(x1, z1, x2, z2, y1, y2, kind) {
  return {
    min: { x: Math.min(x1, x2), y: y1, z: Math.min(z1, z2) },
    max: { x: Math.max(x1, x2), y: y2, z: Math.max(z1, z2) },
    kind,
  };
}

const WALL_H = 6;

function buildGeometry() {
  const g = [];

  // --- sol et enceinte ------------------------------------------------------
  g.push(box(-35, -31, 35, 31, -1, 0, 'floor'));
  g.push(box(-35, -31, 35, -30, 0, WALL_H, 'wall'));
  g.push(box(-35, 30, 35, 31, 0, WALL_H, 'wall'));
  g.push(box(-35, -31, -34, 31, 0, WALL_H, 'wall'));
  g.push(box(34, -31, 35, 31, 0, WALL_H, 'wall'));

  // --- murs séparant le milieu des couloirs extérieurs ----------------------
  // Portes laissées à z ∈ [-2, 2] (milieu → couloir) et z ∈ [16, 20] (milieu → site).
  for (const side of [1, -1]) {
    const x = 11 * side;
    g.push(box(x - 0.5, -24, x + 0.5, -2, 0, WALL_H, 'wall'));
    g.push(box(x - 0.5, 2, x + 0.5, 16, 0, WALL_H, 'wall'));
    g.push(box(x - 0.5, 20, x + 0.5, 24, 0, WALL_H, 'wall'));
  }

  // --- murs fermant les sites, avec l'entrée extérieure ---------------------
  // Porte à x ∈ [26, 31] côté A, symétrique côté B : c'est le long angle.
  g.push(box(11.5, 4.5, 26, 5.5, 0, WALL_H, 'wall'));
  g.push(box(31, 4.5, 34, 5.5, 0, WALL_H, 'wall'));
  g.push(box(-26, 4.5, -11.5, 5.5, 0, WALL_H, 'wall'));
  g.push(box(-34, 4.5, -31, 5.5, 0, WALL_H, 'wall'));

  // --- le milieu, en chicane ------------------------------------------------
  // Deux murs aux portes décalées. Sans eux, il existe une ligne de vue droite
  // de 54 m d'un spawn à l'autre : les joueurs se tireraient dessus dès
  // l'apparition et le milieu n'aurait aucun intérêt tactique.
  // Porte ouest au sud, porte est au nord : impossible de traverser en ligne.
  g.push(box(-7, -0.5, 10.5, 0.5, 0, WALL_H, 'wall'));
  g.push(box(-10.5, 9.5, 7, 10.5, 0, WALL_H, 'wall'));

  // --- couverts -------------------------------------------------------------
  const crate = (cx, cz, size, height) =>
    g.push(box(cx - size / 2, cz - size / 2, cx + size / 2, cz + size / 2, 0, height, 'crate'));

  // milieu — « Le Puits »
  crate(-9, 5, 2, 2);
  crate(-4, -8, 2, 2);
  crate(4, -1, 2, 1.4);
  crate(9, 14, 1.6, 1);

  // sites et couloirs, en miroir
  for (const side of [1, -1]) {
    crate(18 * side, 10, 2.4, 2.4);
    crate(26 * side, 16, 2, 2);
    crate(21.5 * side, 21.5, 1.5, 1.5);
    crate(26 * side, -10, 2, 2);
    crate(16 * side, -20, 2, 2);
    // Marche basse : se monte sans sauter, pour tester la hauteur de pas.
    g.push(box(20 * side - 2, 13, 20 * side + 2, 15, 0, 0.4, 'crate'));
  }

  // spawns
  crate(0, -27, 2, 1);
  crate(0, 27, 2, 1);

  return g;
}

const GEOMETRY = buildGeometry();

/** Zone rectangulaire, en plan. Utilisée pour les sites et les zones d'achat. */
function zone(x1, z1, x2, z2) {
  return { x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2) };
}

export function inZone(z, pos) {
  return pos.x >= z.x1 && pos.x <= z.x2 && pos.z >= z.z1 && pos.z <= z.z2;
}

const SITES = {
  A: zone(14, 9, 30, 23),
  B: zone(-30, 9, -14, 23),
};

const BUY_ZONES = {
  [TEAM.CENDRE]: zone(-30, -30, 30, -23),
  [TEAM.VERROU]: zone(-30, 23, 30, 30),
};

const SPAWNS = {
  [TEAM.CENDRE]: [-8, -4, 0, 4, 8].map((x) => ({ pos: { x, y: 0, z: -27 }, yaw: 0 })),
  [TEAM.VERROU]: [-8, -4, 0, 4, 8].map((x) => ({ pos: { x, y: 0, z: 27 }, yaw: 180 })),
};

/**
 * Graphe de navigation pour les bots.
 *
 * Généré automatiquement : on échantillonne une grille, on jette les points dans
 * un obstacle, puis on relie ceux qui se voient. Pas de placement à la main, donc
 * pas de point oublié quand la carte change.
 */
function buildNavGraph() {
  const nodes = [];
  const step = 3.5;
  for (let x = -32; x <= 32; x += step) {
    for (let z = -28; z <= 28; z += step) {
      const probe = { x, y: 0.9, z };
      let blocked = false;
      for (const b of GEOMETRY) {
        if (b.kind === 'floor') continue;
        if (
          probe.x > b.min.x - 0.6 && probe.x < b.max.x + 0.6 &&
          probe.z > b.min.z - 0.6 && probe.z < b.max.z + 0.6 &&
          b.max.y > 0.5
        ) {
          blocked = true;
          break;
        }
      }
      if (!blocked) nodes.push({ x, y: 0, z });
    }
  }

  const edges = nodes.map(() => []);
  const maxLink = step * 1.6;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dz = nodes[i].z - nodes[j].z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > maxLink) continue;

      const a = { x: nodes[i].x, y: 0.9, z: nodes[i].z };
      const b = { x: nodes[j].x, y: 0.9, z: nodes[j].z };
      if (!hasLineOfSight(a, b, GEOMETRY)) continue;

      edges[i].push({ to: j, cost: dist });
      edges[j].push({ to: i, cost: dist });
    }
  }

  return { nodes, edges };
}

const NAV = buildNavGraph();

export const MAP = {
  name: 'Sablier',
  geometry: GEOMETRY,
  sites: SITES,
  buyZones: BUY_ZONES,
  spawns: SPAWNS,
  nav: NAV,
  bounds: { x1: -34, z1: -30, x2: 34, z2: 30 },
  /** Points d'intérêt pour les bots et les annonces. */
  callouts: [
    { name: 'Site A', pos: { x: 22, z: 16 } },
    { name: 'Site B', pos: { x: -22, z: 16 } },
    { name: 'Le Puits', pos: { x: 0, z: 4 } },
    { name: 'Ruelle A', pos: { x: 26, z: -8 } },
    { name: 'Passe B', pos: { x: -26, z: -8 } },
    { name: 'Spawn Cendre', pos: { x: 0, z: -27 } },
    { name: 'Spawn Verrou', pos: { x: 0, z: 27 } },
  ],
};

/** 'A', 'B' ou null. */
export function siteAt(pos) {
  if (inZone(SITES.A, pos)) return 'A';
  if (inZone(SITES.B, pos)) return 'B';
  return null;
}

export function inBuyZone(team, pos) {
  const z = BUY_ZONES[team];
  return z ? inZone(z, pos) : false;
}

export function siteCenter(site) {
  const z = SITES[site];
  return { x: (z.x1 + z.x2) / 2, y: 0, z: (z.z1 + z.z2) / 2 };
}

/** Nœud le plus proche d'une position. */
export function nearestNode(pos) {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < NAV.nodes.length; i++) {
    const dx = NAV.nodes[i].x - pos.x;
    const dz = NAV.nodes[i].z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** A* sur le graphe. Renvoie une liste d'index de nœuds, départ inclus. */
export function findPath(startNode, goalNode) {
  if (startNode < 0 || goalNode < 0) return [];
  if (startNode === goalNode) return [startNode];

  const n = NAV.nodes.length;
  const g = new Float64Array(n).fill(Infinity);
  const f = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = [startNode];

  const heuristic = (a, b) => {
    const dx = NAV.nodes[a].x - NAV.nodes[b].x;
    const dz = NAV.nodes[a].z - NAV.nodes[b].z;
    return Math.sqrt(dx * dx + dz * dz);
  };

  g[startNode] = 0;
  f[startNode] = heuristic(startNode, goalNode);

  while (open.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bestIndex]]) bestIndex = i;
    const current = open[bestIndex];

    if (current === goalNode) {
      const path = [];
      let node = current;
      while (node >= 0) {
        path.push(node);
        node = from[node];
      }
      return path.reverse();
    }

    open.splice(bestIndex, 1);
    closed[current] = 1;

    for (const edge of NAV.edges[current]) {
      if (closed[edge.to]) continue;
      const tentative = g[current] + edge.cost;
      if (tentative >= g[edge.to]) continue;
      from[edge.to] = current;
      g[edge.to] = tentative;
      f[edge.to] = tentative + heuristic(edge.to, goalNode);
      if (!open.includes(edge.to)) open.push(edge.to);
    }
  }

  return [];
}
