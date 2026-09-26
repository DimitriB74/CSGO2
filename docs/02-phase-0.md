# Phase 0 — Installation et mise en place

Objectif : à la fin de cette phase, deux instances du jeu se connectent à la
même session Photon et l'affichent dans la console. Aucun gameplay, mais une
base saine. Compte environ 1 h 30, dont beaucoup de téléchargement.

**Ne saute aucune étape, et surtout pas l'étape 9 (vérification).**

---

## Étape 1 — Installer Unity 6 LTS

1. Installe **Unity Hub** depuis `unity.com/download`.
2. Dans le Hub : onglet **Installs** → **Install Editor**.
3. Choisis la version **Unity 6 LTS** (la ligne marquée `LTS`, numéro
   `6000.x.y`). Pas une version `beta` ni `alpha`.
4. Coche les modules :
   - **Windows Build Support (IL2CPP)** — ou **Mac Build Support (IL2CPP)** si
     tu es sur Mac ;
   - **Documentation** (optionnel, mais pratique hors ligne).
5. Lance l'installation et va faire autre chose : c'est long.

> Pourquoi IL2CPP : c'est le backend qu'on utilisera pour le build final envoyé
> à tes amis. Autant l'avoir dès maintenant.

---

## Étape 2 — Créer le projet

1. Hub → **Projects** → **New project**.
2. Template : **Universal 3D** (c'est URP). *Pas* « 3D (Built-in) », *pas* HDRP.
3. Nom du projet : `PointDeRupture`.
4. Emplacement : un dossier **vide**, par exemple `D:\Dev\PointDeRupture`.
   Évite OneDrive, Google Drive et Dropbox : la synchronisation corrompt le
   dossier `Library` d'Unity.
5. **Create project**. Unity va générer le projet et importer URP.

Quand l'éditeur s'ouvre, tu dois voir une scène `SampleScene` avec un plan et
un cube. C'est normal.

---

## Étape 3 — Brancher le dépôt Git

Le dépôt contient déjà la structure de dossiers, le `.gitignore` et la
documentation. On les fait descendre dans le projet Unity fraîchement créé.

Ouvre un terminal **dans le dossier du projet** (`D:\Dev\PointDeRupture`) :

```bash
git init
git remote add origin https://github.com/DimitriB74/CSGO2.git
git fetch origin claude/busy-goldberg-5v8m1h
git checkout -b claude/busy-goldberg-5v8m1h origin/claude/busy-goldberg-5v8m1h
```

Tu récupères `.gitignore`, `README.md`, `docs/` et l'arborescence
`Assets/_Project/`. Les fichiers générés par Unity (`ProjectSettings/`,
`Packages/`, `Assets/Settings/`) ne sont pas dans la branche : ils sont à toi,
tu les commiteras à la fin de cette phase.

```bash
git add .
git commit -m "Phase 0 : projet Unity 6 URP initial"
```

> **Le nom du dépôt** est encore `CSGO2`. Comme le jeu doit être entièrement
> original, renomme-le sur GitHub (`Settings` → `Repository name`) en
> `point-de-rupture` quand tu veux. Git suit automatiquement, il n'y a que
> l'URL du remote à mettre à jour.

Vérifie enfin que `Library/` n'est **pas** suivi :

```bash
git status --short | grep Library
```

Cette commande ne doit rien afficher.

---

## Étape 4 — Réglages du projet

`Edit → Project Settings`.

### Player
| Champ | Valeur |
|---|---|
| Company Name | ton pseudo ou studio |
| Product Name | `Point de Rupture` |
| **Active Input Handling** | **Input System Package (New)** |
| Color Space *(Other Settings)* | **Linear** |
| Api Compatibility Level | **.NET Standard 2.1** |

Unity demandera de redémarrer après le changement d'Input Handling : accepte.

### Tags and Layers
Crée ces **User Layers** (laisse les 0 à 7 tranquilles) :

| N° | Nom | Rôle |
|---|---|---|
| 8 | `Player` | capsule de collision des personnages |
| 9 | `Hitbox` | volumes de dégâts lag-compensés (Fusion) |
| 10 | `Pickup` | armes au sol, bombe |
| 11 | `ViewModel` | arme en vue première personne |
| 12 | `Penetrable` | cloisons fines traversables par les balles (Phase 7+) |

### Physics
`Layer Collision Matrix` — décoche toutes les cases de la ligne `Hitbox` sauf
la colonne `Hitbox` elle aussi décochée. Autrement dit : **`Hitbox` ne collide
avec rien**. Ces volumes ne servent qu'aux raycasts, ils ne doivent jamais
pousser un personnage.

Même chose pour `ViewModel` : aucune collision.

### Time
Ne touche à rien. Fusion gère son propre pas de simulation ; le
`Fixed Timestep` d'Unity ne pilote pas le gameplay réseau.

---

## Étape 5 — Paquets Unity

`Window → Package Manager` → source **Unity Registry**.

| Paquet | Pourquoi |
|---|---|
| **ProBuilder** | construction des maps en greybox (Phase 9) |
| **Input System** | déjà là si l'étape 4 est faite ; vérifie la présence |
| **TextMeshPro** | tout le texte d'interface (fourni avec UGUI dans Unity 6) |

Puis le paquet de test multijoueur, à ajouter par son nom :
**Package Manager → `+` → Add package by name…** →

```
com.unity.multiplayer.playmode
```

Il ajoute le menu `Window → Multiplayer → Multiplayer Play Mode`, qui permet de
lancer jusqu'à 4 joueurs virtuels depuis un seul éditeur. C'est notre outil de
test principal.

---

## Étape 6 — Photon : compte et App ID

1. Va sur `dashboard.photonengine.com`, crée un compte gratuit.
2. **Create a new app** :
   - Photon SDK : **Fusion**
   - Fusion SDK version : **Fusion 2**
   - Name : `Point de Rupture`
   - Description : libre
3. **Create**. L'application apparaît dans le tableau de bord avec un
   **App ID** (une longue chaîne du type `a1b2c3d4-…`).
4. Clique dessus pour le copier. Garde l'onglet ouvert.

> Le plan gratuit autorise **20 joueurs simultanés**. Pour jouer à 10 entre
> amis, c'est largement suffisant et il n'y a rien à payer.

---

## Étape 7 — Importer Fusion 2

1. Va sur `doc.photonengine.com/fusion/current/getting-started/sdk-download`
   (connecté avec ton compte Photon).
2. Télécharge la dernière **Fusion SDK 2.x** — un fichier `.unitypackage`.
3. Dans Unity : `Assets → Import Package → Custom Package…`, sélectionne le
   fichier, **Import** (tout cocher).
4. À la fin de l'import, la fenêtre **Fusion Hub** s'ouvre. Si elle ne s'ouvre
   pas : `Tools → Fusion → Fusion Hub`.
5. Dans le Fusion Hub, onglet **Photon App ID** (ou le champ en haut de la page
   d'accueil) : colle l'App ID de l'étape 6, puis valide.
   → Cela écrit `Assets/Photon/Fusion/Resources/PhotonAppSettings.asset`.
6. Vérifie que **toutes les pastilles du Fusion Hub sont vertes**.

> Ce fichier `PhotonAppSettings.asset` est **exclu du Git** par notre
> `.gitignore` : l'App ID est lié à ton compte. Chaque personne qui clone le
> projet renseignera le sien (ou tu lui donneras le tien en privé).

### Régler le tick rate et la lag compensation

`Tools → Fusion → Network Project Config` (ou l'asset
`Assets/Photon/Fusion/Resources/NetworkProjectConfig.asset`) :

| Section | Champ | Valeur |
|---|---|---|
| Simulation | **Tick Rate** | `64` |
| Simulation | Input Transfer Mode | laisser par défaut |
| Lag Compensation | activée, `Hitbox Count` ≥ `256` | |
| Network Conditions | tout à 0 pour l'instant | |

> **Note honnête sur le 64 Hz** : Fusion tourne par défaut à 60 Hz. 64 est un
> chiffre venu de CS, pas une contrainte de Fusion. On le met à 64 comme tu le
> souhaites ; si tu constates de la gigue ou une charge CPU trop élevée chez le
> host, redescendre à 60 est le réglage le plus sûr et ne changera rien au
> ressenti.

---

## Étape 8 — Importer Simple KCC

1. `doc.photonengine.com/fusion/current/addons/simple-kcc` → télécharge le
   `.unitypackage`.
2. `Assets → Import Package → Custom Package…` → **Import**.
3. Il s'installe dans `Assets/Photon/FusionAddons/SimpleKCC`.

> **Pourquoi Simple KCC** : c'est un contrôleur de personnage cinématique
> conçu pour Fusion, donc compatible prédiction et rollback, avec un
> *collide-and-slide* correct sur les pentes et les marches. Le
> `CharacterController` d'Unity n'est pas déterministe sous rollback : il
> provoquerait des micro-corrections visibles.
>
> **Attention** : Simple KCC seul ne donne pas le counter-strafe instantané ni
> l'air-strafe de CS. En Phase 1, je mettrai la physique de déplacement
> (accélération, friction, plafond d'accélération en l'air) dans une petite
> classe C# testable séparément, et Simple KCC ne servira qu'à *déplacer et
> faire glisser* la capsule. C'est cette séparation qui nous donnera un
> counter-strafe net tout en restant réseau-compatible.

---

## Étape 9 — Scènes et vérification

### Créer les scènes

Dans `Assets/_Project/Scenes/`, crée (clic droit → `Create → Scene`) :

| Scène | Rôle |
|---|---|
| `00_Bootstrap` | scène de démarrage, ne contient que des systèmes |
| `01_MainMenu` | menu principal (Phase 11) |
| `10_Sablier` | première map (Phase 9) |
| `90_Stand` | map d'entraînement |

Puis `File → Build Profiles` (ou `Build Settings`) → ajoute les scènes
**dans cet ordre exact** : `00_Bootstrap`, `01_MainMenu`, `10_Sablier`,
`90_Stand`. L'ordre compte : l'index 0 est la scène chargée au lancement.

Tu peux supprimer `Assets/Scenes/SampleScene.unity` du template.

### Poser le test de fumée

1. Ouvre `00_Bootstrap`.
2. Supprime tout sauf la `Main Camera` (garde-la, sinon Unity se plaint).
3. `GameObject → Create Empty`, renomme-le `__SmokeTest`.
4. Ajoute le composant **NetworkSmokeTest**
   (`Assets/_Project/Scripts/Networking/NetworkSmokeTest.cs`).
5. Laisse `Session Name` sur `PDR-TEST`.
6. Sauvegarde la scène (`Ctrl+S`).

---

## Étape 10 — Procédure de test à 2 joueurs

1. `Window → Multiplayer → Multiplayer Play Mode`.
2. Dans la fenêtre, active **Player 2** (coche la case). Laisse Player 3 et 4
   désactivés.
3. Assure-toi que la scène ouverte est `00_Bootstrap`.
4. Appuie sur **Play**.

### Résultat attendu

Deux fenêtres apparaissent (l'éditeur = Player 1, une fenêtre = Player 2). Dans
la console de chacune :

```
[SmokeTest] Connexion à la session « PDR-TEST »…
[SmokeTest] Connecté. Rôle : HOST — mon PlayerRef : 0     ← Player 1
[SmokeTest] Joueurs dans la session : 1
[SmokeTest] Joueurs dans la session : 2                   ← quand Player 2 arrive
```

et côté Player 2 :

```
[SmokeTest] Connecté. Rôle : CLIENT — mon PlayerRef : 1
[SmokeTest] Joueurs dans la session : 2
```

**Si tu vois « Joueurs dans la session : 2 » des deux côtés, la Phase 0 est
validée.** Il n'y a rien à voir à l'écran : c'est normal, il n'y a pas encore de
joueur à faire apparaître.

### Si ça ne marche pas

| Symptôme | Cause probable | Correctif |
|---|---|---|
| `ShutdownReason: InvalidAppSettings` ou `InvalidAuthentication` | App ID absent ou mal collé | Fusion Hub → recoller l'App ID |
| `ShutdownReason: ConnectionTimeout` | pare-feu / antivirus bloque l'UDP sortant | autoriser Unity dans le pare-feu Windows |
| Les deux instances sont **HOST** | elles n'utilisent pas le même `Session Name`, ou MPPM n'est pas vraiment actif | vérifier la coche Player 2 |
| `NetworkSceneManagerDefault` introuvable à la compilation | nom de classe différent dans ta version du SDK | supprimer les deux lignes du `sceneManager` dans le script, `SceneManager` est optionnel ici |
| Erreurs de compilation Input System | redémarrage d'Unity non effectué après l'étape 4 | relancer Unity |

### Commit de fin de phase

```bash
git add .
git commit -m "Phase 0 : Fusion 2 + Simple KCC installes, test de fumee OK"
git push -u origin claude/busy-goldberg-5v8m1h
```

---

## Ce que la Phase 1 fera

Remplacer `NetworkSmokeTest` par de vrais systèmes :

- `NetInput` : la struct `INetworkInput` (direction, delta souris, boutons) ;
- `NetworkLauncher` + `RunnerCallbacks` : connexion propre et `OnInput` ;
- `PlayerSpawner` : un `PlayerAgent` par joueur qui rejoint ;
- `PlayerMotor` : déplacement Simple KCC + solveur d'accélération façon CS
  (marche, course, marche silencieuse, accroupi, saut, counter-strafe) ;
- `PlayerLook` + `PlayerCameraRig` : vue première personne, angles réseau,
  caméra locale interpolée dans `Render()`.

Test de fin de Phase 1 : deux joueurs se voient bouger, chacun avec sa souris,
sans saccade et sans téléportation.
