# Point de Rupture

FPS tactique multijoueur en rounds, **jouable dans le navigateur**.
Attaquants (**Cendre**) contre défenseurs (**Verrou**) : économie, achat
d'armes, pose et désamorçage d'une charge, une seule vie par round.

Tu déploies, tu envoies le lien, vous jouez. Rien à installer pour tes amis.

Création originale : aucun nom, logo, carte, modèle ni son issu d'un jeu
existant.

---

## Mettre en ligne

### Render (le plus simple)

1. Pousse ce dépôt sur GitHub.
2. Sur [render.com](https://render.com) : **New → Blueprint**, choisis le dépôt.
3. Render lit `render.yaml` et déploie tout seul.

Un seul service web : le même processus sert la page **et** la partie en
WebSocket. Pas de serveur de jeu séparé, aucun port à ouvrir.

> **Plan gratuit** : le service s'endort après 15 minutes sans visite, et le
> premier chargement suivant prend ~30 secondes. Pour une session prévue avec
> des amis, ouvre le lien une minute avant. Le plan payant le plus bas supprime
> la mise en veille.

Ça marche aussi tel quel sur Railway, Fly.io, Koyeb ou n'importe quel hébergeur
Node : `npm install` puis `npm start`, en écoutant sur `PORT`.

### En local

```bash
npm install
npm start
# puis http://localhost:3000
```

Pour jouer à plusieurs sur le même réseau, tes amis ouvrent
`http://TON-IP-LOCALE:3000`.

---

## Commandes

| Touche | Action |
|---|---|
| `Z` `Q` `S` `D` ou `W` `A` `S` `D` | se déplacer |
| Souris | viser · `Clic` tirer · `Clic droit` lunette |
| `Espace` | sauter |
| `Ctrl` | s'accroupir (réduit vraiment ta hitbox) |
| `Maj` | marcher lentement |
| `R` | recharger |
| `1` `2` `3` | arme principale / secondaire / couteau |
| `E` | poser la charge · désamorcer · ramasser une arme |
| `B` | menu d'achat (puis `1`…`9` pour acheter vite) |
| `Tab` | tableau des scores |
| `Échap` | libérer la souris |

**Le geste à connaître** : lâche la touche d'avance et appuie sur celle
d'arrière juste avant de tirer. Ce *counter-strafe* t'arrête en 0,1 s au lieu de
0,37 s, et rend ton tir précis. C'est toute la différence entre arroser et
toucher.

---

## Ce qui est en place

- **Déplacement façon Quake/Source** : accélération plafonnée, friction,
  counter-strafe, air-strafe, saut accroupi, franchissement de marches.
- **20 armes** : couteau, 5 pistolets, 2 pompes, 3 PM, 5 fusils d'assaut,
  3 fusils de précision, 1 mitrailleuse. Chacune avec ses dégâts, sa cadence,
  son motif de recul, sa pénétration d'armure et sa perte de dégâts à distance.
- **Tir hitscan** avec zones (tête, torse, ventre, bras, jambes), gilet, casque,
  et **compensation de latence** : tu touches ce que tu vois.
- **Motifs de recul fixes**, donc apprenables, avec une petite dispersion.
- **Rounds complets** : freeze time, temps d'achat, économie (prime de défaite
  progressive, récompense par arme), mi-temps avec changement de camp, premier
  à 13.
- **Charge explosive** : pose 3,2 s, désamorçage 10 s ou 5 s avec le kit,
  minuteur de 40 s, la charge tombe au sol si le porteur meurt.
- **Armes au sol** ramassables après une mort.
- **Bots** pour remplir les deux camps : la partie tourne à dix même si tu es
  seul. Ils achètent, tiennent les sites, posent et désamorcent.
- **ATH complet** : vie, armure, munitions, argent, chronomètre, score,
  killfeed, radar tournant, viseur dynamique, indicateur de charge, tableau
  des scores.
- **Sons synthétisés** à la volée : aucun fichier audio dans le dépôt.

## Ce qui n'y est pas encore

Grenades, personnages et animations, autres cartes, autres modes de jeu, chat
textuel, menu de création de partie. Le socle est prévu pour les recevoir.

---

## Comment c'est fait

```
shared/     code partagé serveur ET client — la clé de la prédiction
  constants.js  toutes les valeurs réglables
  movement.js   physique de déplacement
  collision.js  AABB, balayage, rayons, hitbox
  damage.js     zones, distance, armure
  recoil.js     dispersion déterministe, motifs de recul
  weapons.js    les 20 armes
  map.js        géométrie, sites, zones d'achat, navigation des bots
server/
  index.js      HTTP + WebSocket, boucle 64 Hz
  world.js      la simulation autoritaire
  match.js      rounds, économie, charge
  bot.js        IA
client/
  js/           rendu three.js, prédiction, ATH, audio
test/
  sim.test.js   tests sans navigateur (npm test)
  e2e.mjs       test dans un vrai Chromium
```

### Le réseau en trois idées

**1. Le serveur décide de tout.** Le client envoie des intentions (axes,
angles, boutons), jamais des résultats. Achats, dégâts, éliminations, pose de la
charge : tout est validé côté serveur. Un client modifié ne peut pas se donner
de l'argent ni s'attribuer une touche.

**2. Le client prédit son propre déplacement** avec exactement le même code que
le serveur (`shared/movement.js`). Il garde ses entrées en attente ; quand le
serveur confirme en avoir traité une, il repart de l'état officiel et rejoue les
suivantes. En pratique la correction est invisible.

Deux détails rendent cette prédiction exacte, et ils ont coûté cher à trouver :

- le serveur **met les entrées en file** et en consomme une par tick. S'il n'en
  gardait que la dernière, il en perdrait une tout en l'acquittant, et le client
  rejouerait une séquence différente ;
- le serveur ne simule un joueur **que pour les entrées reçues**. Un navigateur
  ne tient pas exactement 64 Hz : inventer les ticks manquants ferait dériver la
  position en permanence.

**3. Les tirs sont compensés en latence.** Le serveur garde une seconde
d'historique des positions et rembobine les hitbox à l'instant où le tireur a vu
sa cible. Pas besoin de viser devant un adversaire qui court.

La dispersion n'utilise jamais `Math.random()` : elle vient d'un générateur
déterministe alimenté par `(tick, joueur, numéro de balle)`, donc serveur et
client calculent la même balle.

---

## Vérifications automatiques

```bash
npm test          # 36 vérifications, sans navigateur, en ~2 s
node test/e2e.mjs # 24 vérifications dans un vrai Chromium
```

Valeurs mesurées par ces tests, et pas estimées :

| Mesure | Résultat |
|---|---|
| Montée à 99 % de la vitesse max | 516 ms |
| **Counter-strafe** (6,35 m/s → sous 0,5) | **109 ms** |
| Relâchement seul (friction) | 375 ms — 3,4× plus lent |
| Cône de dispersion demandé 2,00° | max 2,000°, moyenne 1,335° (disque uniforme) |
| Faucheur, tête avec casque à 30 m | 107 dégâts — tue en une balle |
| Arbitre, tête avec casque | 92 dégâts — ne tue pas |
| Monolithe, jambe | 84 dégâts — ne tue pas |
| Rotation vers un site : Verrou / Cendre | 3,8 s contre 10,6 s |
| Charge serveur, partie à 10 | 0,056 ms par tick — 0,4 % du budget |
| Instantané réseau | ~3 Ko à 22 Hz |

---

## Documentation

| Fichier | Contenu |
|---|---|
| [`docs/01-univers-et-armes.md`](docs/01-univers-et-armes.md) | camps, cartes, les 20 armes avec le tableau d'équilibrage, économie, durées |

Les autres fichiers de `docs/` et le dossier `unity-prototype/` appartiennent à
une première tentative en **Unity + Photon Fusion 2**, abandonnée pour une
raison simple : Fusion ne fonctionne pas dans un navigateur et ne peut pas être
hébergé sur Render, et le travail se faisait entièrement dans l'éditeur Unity.
Toute la conception (armes, modèle de dégâts, boucle de rounds, plan de la
carte) a été reprise telle quelle ici. Le code Unity est conservé au cas où.
