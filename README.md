# Point de Rupture

FPS tactique multijoueur 5v5 en rounds — Attaquants (**Cendre**) contre
Défenseurs (**Verrou**) : économie, achat d'armes, pose et désamorçage d'une
charge, une seule vie par round.

Création 100 % originale : aucun nom, logo, map, modèle ni son issu d'un jeu
existant.

## Stack

| | |
|---|---|
| Moteur | Unity 6 LTS |
| Rendu | URP |
| Réseau | Photon Fusion 2, mode **Host** (client-host), tick 64 Hz |
| Déplacement | Simple KCC (addon Fusion) + solveur d'accélération maison |
| Tirs | hitscan lag-compensé (`Runner.LagCompensation`) |
| Équilibrage | ScriptableObjects (`Assets/_Project/Data/`) |
| Maps | greybox ProBuilder |
| Tests | Multiplayer Play Mode (Unity 6) |

## Documentation

| Fichier | Contenu |
|---|---|
| [`docs/05-comment-tester.md`](docs/05-comment-tester.md) | **commence ici** : les 3 niveaux de test, du plus simple au plus complet |
| [`docs/00-architecture.md`](docs/00-architecture.md) | architecture globale, flux d'un tir, d'un achat, d'un round, règles réseau |
| [`docs/01-univers-et-armes.md`](docs/01-univers-et-armes.md) | camps, maps, 20 armes avec tableau d'équilibrage, économie, durées |
| [`docs/02-phase-0.md`](docs/02-phase-0.md) | installation pas à pas et test à 2 joueurs |
| [`docs/03-phase-1.md`](docs/03-phase-1.md) | réseau, déplacement, caméra : scripts, réglages éditeur, test à 2 joueurs |
| [`docs/04-phase-2.md`](docs/04-phase-2.md) | tir lag-compensé, dégâts par zone, hitbox, tableaux de dégâts vérifiés |

## Feuille de route

| Phase | Contenu | État |
|---|---|---|
| 0 | Installation (Unity 6, URP, Fusion 2, App ID, Simple KCC, structure) | livrée |
| 1 | Connexion, apparition de 2 joueurs, déplacement FPS et caméra | **livrée, à tester** |
| 2 | Première arme, tir hitscan lag-compensé, vie, mort, réapparition | **livrée, à tester** |
| 3 | Système d'armes complet en ScriptableObjects | à faire |
| 4 | Mode Deathmatch jouable | à faire |
| 5 | Équipes, rounds, économie, menu d'achat | à faire |
| 6 | Charge explosive → mode Compétitif | à faire |
| 7 | Grenades | à faire |
| 8 | HUD, tableau des scores, killfeed, radar, sons | à faire |
| 9 | Maps en greybox | à faire |
| 10 | Autres modes de jeu | à faire |
| 11 | Personnages, animations, menus, paramètres | à faire |
| 12 | Optimisation, finitions, build | à faire |

## Structure

Tout notre contenu vit sous `Assets/_Project/` pour rester séparé des SDK.
Voir la section 8 de [`docs/00-architecture.md`](docs/00-architecture.md).
