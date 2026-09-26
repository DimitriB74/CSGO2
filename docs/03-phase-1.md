# Phase 1 — Connexion, apparition, déplacement FPS et caméra

Objectif : deux joueurs apparaissent dans une scène, chacun contrôle son
personnage à la souris et au clavier, et voit l'autre bouger sans saccade.

Prérequis : Phase 0 validée (Fusion Hub vert, test de fumée à 2 joueurs OK).

---

## 1. Les scripts livrés

Tout est déjà dans le dépôt, commenté en français.

| Fichier | Rôle |
|---|---|
| `Core/Layers.cs` | index et masques des couches physiques |
| `Core/PlayerSpawnPoint.cs` | marqueur d'apparition, avec gizmo dans l'éditeur |
| `Data/MovementProfile.cs` | **ScriptableObject** : toutes les valeurs de déplacement |
| `Player/MoveSolver.cs` | physique façon Quake/Source. Pur C#, déterministe |
| `Player/ICharacterMotor.cs` | contrat du moteur + structs `MotorInput` / `MotorState` |
| `Player/CharacterMotor.cs` | implémentation sur `CharacterController` (celle qu'on utilise) |
| `Player/KccMotor.cs` | implémentation Simple KCC, **désactivée** par défaut |
| `Player/PlayerAgent.cs` | le personnage réseau : état `[Networked]`, `FixedUpdateNetwork`, `Render` |
| `Player/PlayerCameraRig.cs` | caméra accrochée à la tête du joueur local |
| `Networking/NetInput.cs` | la struct `INetworkInput` envoyée chaque tick |
| `Networking/InputCollector.cs` | lecture clavier/souris locale et accumulation |
| `Networking/NetworkLauncher.cs` | démarrage du runner, `OnInput`, apparition des joueurs |
| `UI/DebugOverlay.cs` | affichage F3 : vitesse, au sol, accroupi, angles |

### Le point important : où vit l'état

`PlayerAgent` garde la vitesse, l'accroupissement et le contact sol dans des
propriétés `[Networked]`, et le moteur est une fonction
`(état, intention) → état`.

Ce n'est pas un détail de style. Quand le host corrige un client, Fusion
**restaure l'état réseau puis rejoue les ticks**. Si la vitesse vivait dans un
champ privé du moteur, elle ne serait pas restaurée : le personnage
désynchroniserait et tremblerait. C'est l'erreur la plus courante en Fusion, et
la raison de cette architecture un peu inhabituelle.

### Mesures de référence du solveur

Ces valeurs ont été mesurées en exécutant `MoveSolver` hors d'Unity, à 64 Hz,
avec le profil par défaut. Tu dois retrouver les mêmes en jeu :

| Mesure | Valeur |
|---|---|
| Arrêt → 99 % de la vitesse max | 0,52 s |
| **Counter-strafe** (pleine vitesse → < 0,5 m/s) | **0,109 s** |
| Relâchement seul (friction) → < 0,5 m/s | 0,375 s |
| Vitesse après 3 ticks de counter-strafe | 3,37 m/s |
| Apogée d'un saut | 1,38 m |
| Gain d'air-strafe sur 1 s (vue tournée à 80 °/s) | +15,5 % |
| Déterminisme (même séquence rejouée) | identique bit à bit |

Le rapport 0,109 s contre 0,375 s est exactement ce qui fait qu'un joueur
entraîné peut s'arrêter net pour tirer.

---

## 2. Créer l'asset de déplacement

1. Dans `Assets/_Project/Data/`, clic droit →
   **Create → Point de Rupture → Movement Profile**.
2. Nomme-le `MovementProfile_Default`.
3. Ne change rien : les valeurs par défaut sont celles mesurées ci-dessus.

C'est ici que tu régleras la sensation de déplacement plus tard, sans toucher au
code.

---

## 3. Créer la scène de test

On ne construit pas encore *Sablier* (c'est la Phase 9). Il nous faut juste une
boîte avec du sol, des murs et une caisse.

1. `Assets/_Project/Scenes/` → clic droit → **Create → Scene** → `99_BacASable`.
2. Ouvre-la. Elle contient une `Main Camera` et une `Directional Light` :
   **garde les deux**. La caméra doit rester marquée `MainCamera` (c'est le cas
   par défaut) : `PlayerCameraRig` la retrouve par ce tag.
3. Le sol : `GameObject → 3D Object → Plane`.
   - Position `(0, 0, 0)`, Scale `(6, 1, 6)` → un carré de 60 m.
   - Nomme-le `Sol`, Layer = **Default**.
4. Quatre murs : `GameObject → 3D Object → Cube`, un par côté.
   - Scale `(60, 4, 1)`, positions `(0, 2, 30)` et `(0, 2, -30)`.
   - Scale `(1, 4, 60)`, positions `(30, 2, 0)` et `(-30, 2, 0)`.
   - Layer = **Default**.
5. Deux caisses, pour tester les sauts et les collisions :
   `Cube`, Scale `(2, 2, 2)`, positions `(4, 1, 6)` et `(6, 1, 8)`.
6. Une rampe, pour tester les pentes :
   `Cube`, Scale `(4, 0.3, 8)`, position `(-6, 1, 4)`, Rotation `(-20, 0, 0)`.
7. Une marche de 40 cm, pour vérifier le `StepOffset` :
   `Cube`, Scale `(4, 0.4, 2)`, position `(-6, 0.2, -6)`.

### Les points d'apparition

1. `GameObject → Create Empty`, nomme-le **`SpawnPoint_01`**.
2. Position `(-3, 0, -10)`, Rotation `(0, 0, 0)` (regard vers +Z).
3. Ajoute le composant **PlayerSpawnPoint**. Une capsule verte et une flèche
   apparaissent dans la vue : la flèche montre la direction du regard.
4. Duplique-le 3 fois : `SpawnPoint_02` `(-1, 0, -10)`, `SpawnPoint_03`
   `(1, 0, -10)`, `SpawnPoint_04` `(3, 0, -10)`.

> Le nommage `_01`, `_02`… n'est pas décoratif : `NetworkLauncher` trie les
> points par nom pour que l'attribution soit la même à chaque lancement.

8. Sauvegarde, puis ajoute `99_BacASable` aux scènes du build
   (`File → Build Profiles`) et **ouvre-la** : c'est elle qu'on va lancer.

---

## 4. Créer le prefab du personnage

### Hiérarchie exacte

```
Player                      ← Layer : Player (8)
├── Head                    ← GameObject vide, Position (0, 1.62, 0)
└── Visual                  ← GameObject vide, Position (0, 0, 0)
    └── Body                ← Capsule, Position (0, 0.925, 0), Scale (0.8, 0.925, 0.8)
```

### Étapes

1. `GameObject → Create Empty`, nomme-le `Player`. Position `(0, 0, 0)`.
2. En haut à droite de l'Inspector, mets **Layer = Player**. Unity demande si
   tu veux l'appliquer aux enfants : réponds **No, this object only** (les
   enfants suivront, on les réglera si besoin).
3. Enfant `Head` : `Create Empty` dans `Player`, Position `(0, 1.62, 0)`.
4. Enfant `Visual` : `Create Empty` dans `Player`, Position `(0, 0, 0)`.
5. Dans `Visual`, ajoute une **Capsule** (`3D Object → Capsule`), nomme-la `Body` :
   - Position `(0, 0.925, 0)`, Scale `(0.8, 0.925, 0.8)`
     → la capsule fait exactement 1,85 m de haut, du sol au sommet.
   - **Supprime son `Capsule Collider`** (clic droit sur le composant →
     Remove Component). Sinon il se bat avec le `CharacterController`.
6. Pour distinguer les deux joueurs à l'écran, crée un matériau quelconque et
   assigne-le à `Body` (facultatif mais pratique).

### Composants sur la racine `Player`

Ajoute-les dans cet ordre, et règle-les exactement comme indiqué.

| Composant | Réglages |
|---|---|
| **NetworkObject** | laisser par défaut |
| **NetworkTransform** | laisser par défaut |
| **Character Controller** | Slope Limit `45`, Step Offset `0.46`, Skin Width `0.02`, Min Move Distance `0`, Center `(0, 0.925, 0)`, Radius `0.4`, Height `1.85` |
| **Character Motor** | rien à régler (lit le profil) |
| **Player Camera Rig** | `Head Anchor` → glisser l'enfant **Head** · Field Of View `90` · Near Clip `0.02` |
| **Player Agent** | voir ci-dessous |

> `CharacterMotor` réécrit de toute façon la taille et le rayon au démarrage
> depuis le `MovementProfile`. Les valeurs saisies à la main servent surtout à
> voir la bonne capsule dans l'éditeur.

**Player Agent**, les quatre références à glisser :

| Champ | À glisser |
|---|---|
| `Movement Profile` | l'asset `MovementProfile_Default` |
| `Motor Component` | le composant **Character Motor** (depuis la racine `Player`) |
| `Camera Rig` | le composant **Player Camera Rig** |
| `Third Person Visual` | le GameObject enfant **Visual** |

7. Glisse le GameObject `Player` dans `Assets/_Project/Prefabs/Player/` pour en
   faire un prefab, puis **supprime-le de la scène** : c'est le host qui le fera
   apparaître.

> Fusion enregistre automatiquement les prefabs porteurs d'un `NetworkObject`.
> Si le champ de prefab du launcher refuse ton prefab, fais
> `Tools → Fusion → Rebuild Prefab Table` et réessaie.

---

## 5. Les systèmes dans la scène

1. `GameObject → Create Empty`, nomme-le `__Systems`, Position `(0, 0, 0)`.
2. Ajoute-lui trois composants :
   - **Input Collector** — `Sensitivity` `2`, `Degrees Per Count` `0.022`,
     `Invert Y` décoché ;
   - **Network Launcher** — `Session Name` `PDR-TEST`, `Max Players` `10`,
     `Player Prefab` → glisser le prefab **Player**, `Input Collector` → laisser
     vide (il se trouve tout seul) ;
   - **Debug Overlay** — `Visible` coché.
3. **Supprime le GameObject `__SmokeTest`** s'il est encore là : deux
   `NetworkRunner` dans la même scène se battraient pour la session.
   Tu peux aussi supprimer le fichier
   `Assets/_Project/Scripts/Networking/NetworkSmokeTest.cs`, il ne sert plus.
4. Sauvegarde la scène.

---

## 6. Les contrôles

| Touche | Action |
|---|---|
| `Z`/`W` `Q`/`A` `S` `D` | déplacement (touches QWERTY : W A S D) |
| Souris | visée |
| `Espace` | saut (une pression = un saut, maintenir n'enchaîne pas) |
| `Ctrl gauche` | accroupi (le saut accroupi fonctionne) |
| `Maj gauche` | marche silencieuse |
| `Échap` | libérer / reprendre la souris |
| `F3` | afficher/masquer l'overlay de debug |
| `F4` | remettre à zéro le pic de vitesse |

Les autres touches (`R`, `E`, `B`, `Tab`, clics, `1`–`5`) sont déjà transmises
au réseau mais n'ont pas encore d'effet : elles serviront dès la Phase 2.

---

## 7. Procédure de test à 2 joueurs

1. `Window → Multiplayer → Multiplayer Play Mode`, active **Player 2**.
2. Ouvre `99_BacASable`.
3. **Play**.

### Critères de réussite — les 9 à vérifier

| # | Vérification | Attendu |
|---|---|---|
| 1 | Apparition | deux capsules, sur deux points différents, alignées sur `z = -10` |
| 2 | Vue | chaque fenêtre est en vue première personne, on ne voit pas sa propre capsule |
| 3 | Souris | la visée suit la souris dans les deux fenêtres, indépendamment |
| 4 | Vitesse (F3) | ~**6,35 m/s** en course, ~3,30 en marche silencieuse, ~2,16 accroupi |
| 5 | **Counter-strafe** | à pleine vitesse, lâcher `W` et appuyer `S` : la vitesse tombe sous 0,5 en ~0,1 s (nettement plus vif qu'un simple relâchement) |
| 6 | Saut | franchit la caisse de 2 m ? non. La marche de 40 cm se monte **sans sauter** |
| 7 | Fluidité | le mouvement de l'autre joueur est continu, sans téléportation ni tremblement |
| 8 | Accroupi | quand l'autre s'accroupit, sa capsule s'écrase ; sous un plafond bas il ne se relève pas |
| 9 | Collision | impossible de traverser l'autre joueur |

### Vérifier la prédiction (facultatif mais instructif)

`Tools → Fusion → Network Project Config` → section **Network Conditions** :
mets 100 ms de latence et 5 % de perte, puis relance.

Ton propre personnage doit rester **parfaitement réactif** (c'est la prédiction
côté client), tandis que l'autre joueur devient un peu plus « mou ». Si ton
propre personnage devient élastique ou saccadé, c'est le signe d'un état non
`[Networked]` quelque part : dis-le moi, c'est un vrai bug.

N'oublie pas de remettre ces valeurs à 0 après le test.

---

## 8. Dépannage

| Symptôme | Cause | Correctif |
|---|---|---|
| `InvalidOperationException: You are trying to read Input using the UnityEngine.Input class` | un script utilise l'ancienne API | tous les nôtres utilisent le nouvel Input System ; vérifie tes propres ajouts |
| Aucun personnage n'apparaît | `Player Prefab` non assigné, ou prefab sans `NetworkObject` | réassigner, puis `Tools → Fusion → Rebuild Prefab Table` |
| **Deux** personnages par joueur | un `INetworkRunnerCallbacks` enregistré deux fois | le launcher met déjà le runner sur un GameObject séparé pour l'éviter ; vérifie qu'il n'y a pas un second script de callbacks |
| La caméra reste immobile au centre de la scène | pas de caméra marquée `MainCamera`, ou `Head Anchor` non assigné | corriger dans le prefab |
| Le personnage tombe à travers le sol | le sol n'est pas sur la couche `Default` | `GroundMask` ne regarde que `Default` et `Penetrable` |
| Le personnage glisse sans fin | `Friction` à 0 dans le `MovementProfile` | remettre `5.2` |
| Tremblement en montant la rampe | limite du `CharacterController` sous rollback | passer au Simple KCC (voir en-tête de `KccMotor.cs`) |
| Un membre de `INetworkRunnerCallbacks` manque à la compilation | signature différente dans ta version du SDK | `Ctrl+.` → *Implement interface*, un corps vide suffit |

---

## 9. Pourquoi CharacterController et pas Simple KCC tout de suite

`CharacterMotor` (CharacterController d'Unity) est livré actif parce qu'il ne
dépend d'aucun addon : la Phase 1 compile et tourne à coup sûr.

`KccMotor` est livré complet mais encadré par `#if PDR_SIMPLE_KCC`, donc non
compilé. Raison honnête : l'API exacte de `SimpleKCC` varie selon la version de
l'addon, et si une signature diffère, **tout le projet cesserait de compiler** et
la Phase 1 serait bloquée. Avec le garde, la phase fonctionne, et on bascule
quand on veut.

Pour basculer :
1. ajouter `PDR_SIMPLE_KCC` dans
   *Project Settings → Player → Scripting Define Symbols* ;
2. sur le prefab : retirer `CharacterController`, `CharacterMotor` **et
   `NetworkTransform`** (SimpleKCC synchronise déjà la position, les deux se
   battraient), ajouter `SimpleKCC` et `KccMotor` ;
3. réassigner `Motor Component` sur `PlayerAgent` ;
4. si ça ne compile pas, les 4 appels à corriger sont annotés « API KCC » dans le
   fichier — envoie-moi l'erreur, je corrige.

La sensation de jeu ne changera pas : les deux moteurs partagent le même
`MoveSolver`.

---

## 10. Ce que fera la Phase 2

- une première arme et un tir **hitscan lag-compensé**
  (`Runner.LagCompensation.Raycast`) ;
- `HitboxRoot` + `Hitbox` sur le personnage, avec les zones tête / torse /
  ventre / jambes ;
- vie, armure, mort, et réapparition ;
- le recul de vue, branché sur `PlayerCameraRig`.

Test de fin de Phase 2 : à 100 ms de latence simulée, tirer sur un joueur en
mouvement et le toucher là où on le voyait.
