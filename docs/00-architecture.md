# Architecture globale — *Point de Rupture*

Unity 6 LTS · URP · C# · Photon Fusion 2 (mode **Host**) · tick 64 Hz

---

## 1. Principe directeur : une seule source de vérité

En mode Host, un joueur héberge la partie. Sa machine fait tourner **la
simulation de référence**. Les autres clients envoient uniquement leurs
*intentions* (les inputs) et reçoivent l'état du monde.

Trois règles qui ne bougeront plus de tout le projet :

| Règle | Conséquence concrète |
|---|---|
| **Le client demande, le host décide.** | Un client ne se soigne pas, ne s'achète pas une arme, ne s'inflige pas de dégâts. Il envoie « je veux acheter le Faucheur » et le host valide (argent, zone d'achat, freeze time). |
| **Tout ce qui est gameplay est dans `FixedUpdateNetwork()`.** | Déterminisme + prédiction. Rien de gameplay dans `Update()`. |
| **Tout ce qui est visuel est dans `Render()`.** | Caméra, view model, animations, HUD : jamais dans la simulation. |

Le client **prédit** localement son propre personnage (Fusion le fait
nativement pour les objets dont il a l'*Input Authority*), donc les
déplacements sont sans latence perçue. Si le host corrige, Fusion rejoue les
ticks : c'est transparent tant que le code de mouvement est déterministe.

---

## 2. Les couches

```
┌──────────────────────────────────────────────────────────────────────┐
│  PRESENTATION  (local, Render(), jamais d'autorité)                  │
│  PlayerCameraRig · ViewModelRig · HudPresenter · BuyMenuPresenter    │
│  ScoreboardPresenter · KillfeedPresenter · ChatPresenter             │
└───────────────▲──────────────────────────────────────┬───────────────┘
                │ lit l'état [Networked]               │ envoie des RPC
                │                                      ▼   (rares)
┌───────────────┴──────────────────────────────────────────────────────┐
│  SIMULATION  (FixedUpdateNetwork, autorité = Host)                   │
│                                                                      │
│  MatchDirector ──► EconomyService ──► TeamRoster                     │
│      │  (machine à états du round)                                   │
│      ├──► BombObjective (pose / désamorçage / timer)                 │
│      └──► SpawnService (réapparition début de round)                 │
│                                                                      │
│  PlayerAgent (1 par joueur, NetworkObject)                           │
│      ├── PlayerMotor      (Simple KCC + MoveSolver)                  │
│      ├── PlayerLook       (pitch/yaw réseau)                         │
│      ├── PlayerHealth     (vie, armure, casque)                      │
│      ├── PlayerInventory  (3 slots + grenades + kit)                 │
│      ├── WeaponRuntime    (cadence, chargeur, recul, dispersion)     │
│      └── HitboxRoot + Hitbox[]   (cibles lag-compensées)             │
│                                                                      │
│  Services sans état visuel : Ballistics · DamageResolver             │
└───────────────▲──────────────────────────────────────────────────────┘
                │ lit (lecture seule, jamais modifié à l'exécution)
┌───────────────┴──────────────────────────────────────────────────────┐
│  DONNEES  (ScriptableObjects, identiques sur tous les postes)        │
│  WeaponDefinition · CharacterDefinition · MapDefinition              │
│  GameModeDefinition · EconomyDefinition · RecoilPattern              │
└──────────────────────────────────────────────────────────────────────┘
                ▲
┌───────────────┴──────────────────────────────────────────────────────┐
│  TRANSPORT  (Fusion)                                                 │
│  NetworkLauncher · RunnerCallbacks · NetInput (INetworkInput)         │
│  NetworkSceneManagerDefault · LagCompensation                        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Le flux le plus important : un tir

C'est ici que se joue la sensation du jeu. À lire deux fois.

```
1. CLIENT  — InputCollector (Update)
             lit souris/clavier, accumule le delta souris
             ↓
2. CLIENT  — RunnerCallbacks.OnInput(runner, input)
             remplit la struct NetInput { MoveDir, LookDelta, Buttons, WeaponSlot }
             input.Set(netInput)            ← 1 struct par tick, ~20 octets
             ↓
3. LES DEUX — PlayerAgent.FixedUpdateNetwork()
             GetInput(out NetInput data)
             PlayerLook.Apply(data.LookDelta)           → angles [Networked]
             PlayerMotor.Move(data.MoveDir, data.Buttons)
             WeaponRuntime.TryFire(data.Buttons)
             ↓
4. LES DEUX — WeaponRuntime.Fire()   (le client PRÉDIT, le host TRANCHE)
             a. vérifie cadence (Runner.Tick vs NextFireTick)  → [Networked]
             b. décrémente le chargeur                          → [Networked]
             c. calcule la direction :
                  aim = angles de vue
                + motif de recul fixe [index de tir]   ← apprenable
                + dispersion aléatoire (seed = Runner.Tick + PlayerRef)
                  ⇒ MÊME résultat côté client et côté host
             ↓
5. HOST SEUL — Ballistics.Resolve()
             Runner.LagCompensation.Raycast(
                 origin, dir, range, player,
                 out LagCompensatedHit hit,
                 layerMask, HitOptions.IncludePhysX)
             ⇒ Fusion rembobine les Hitbox à l'instant où le client a tiré.
               Le joueur touche ce qu'il voyait sur son écran.
             ↓
6. HOST SEUL — DamageResolver.Apply(hit, weapon, shooter)
             dégâts = base
                    × multiplicateur de zone (tête/torse/ventre/jambes)
                    × perte de distance (courbe de l'arme)
             puis absorption gilet/casque selon la pénétration de l'arme
             PlayerHealth.Health -= dégâts        → [Networked]
             ↓
7. TOUS     — Render() + ChangeDetector
             baisse de vie détectée → indicateur de direction, flash écran
             compteur de tirs changé → flash de bouche, douille, son 3D
             mort détectée           → ragdoll, lâcher d'arme, killfeed (RPC)
```

**Pourquoi ça marche même à 80 ms de ping** : le client prédit son tir
immédiatement (retour visuel instantané), et le host valide en rembobinant les
hitbox. Les deux calculent la même direction de balle parce que le recul et la
dispersion sont *déterministes* (seed dérivée du tick).

---

## 4. Le flux d'un achat (exemple de RPC justifié)

Un achat est **rare, ponctuel et doit être fiable** : c'est le cas d'usage d'un
RPC, pas d'un état synchronisé.

```
CLIENT  BuyMenuPresenter : clic sur « Faucheur »
        → PlayerInventory.RpcRequestBuy(weaponId)
          [Rpc(RpcSources.InputAuthority, RpcTargets.StateAuthority)]

HOST    RpcRequestBuy s'exécute ici et VALIDE :
        · phase == FreezeTime ou temps d'achat non écoulé ?
        · joueur dans sa zone d'achat ?
        · joueur vivant ?
        · argent suffisant ?
        · arme autorisée pour son camp et pour le mode ?
        si tout est bon : Money -= prix ; équipe l'arme   → [Networked]
        sinon : RpcBuyRefused(raison) vers l'émetteur uniquement
```

Un client modifié ne peut rien voler : il ne fait que *demander*.

---

## 5. Le flux d'un round

`MatchDirector` est une machine à états, seule sur le host, avec l'état courant
en `[Networked]` pour que tout le monde affiche le même compte à rebours.

```
        ┌──────────┐
        │ Warmup   │  attend le nombre de joueurs minimum
        └────┬─────┘
             ▼
        ┌──────────┐   15 s — armes rendues, joueurs figés,
        │ Freeze   │        zone d'achat active (20 s au total)
        └────┬─────┘
             ▼
        ┌──────────┐   1 min 55 — une seule vie
        │  Live    │◄──────────────┐
        └────┬─────┘               │ bombe posée :
             │                     │ le timer de round est remplacé
             │                     │ par le timer de bombe (40 s)
             ▼                     │
        ┌──────────┐───────────────┘
        │ RoundEnd │  5 s — économie distribuée, MVP calculé
        └────┬─────┘
             ▼
      12 rounds joués ? ──oui──► ┌──────────┐ ──► Freeze (camps inversés,
             │                    │ Halftime │      argent remis à 800 $)
             non                  └──────────┘
             ▼
      13 rounds gagnés ? ──oui──► ┌──────────┐
             │                     │ MatchEnd │  écran de statistiques
             non                   └──────────┘
             └──► Freeze (round suivant)
```

Conditions de victoire d'un round, évaluées dans cet ordre :
1. bombe explosée → Attaquants
2. bombe désamorcée → Défenseurs
3. une équipe entière éliminée → l'autre (mais si la bombe est posée, les
   Attaquants peuvent gagner même tous morts : le timer continue)
4. temps écoulé sans pose → Défenseurs

---

## 6. Qui parle à qui : le tableau de référence

| Besoin | Mécanisme | Pourquoi |
|---|---|---|
| Position, angles, vie, argent, munitions, état du round | `[Networked]` | État continu, doit être interpolé et prédit |
| Input du joueur | struct `INetworkInput` | 1 échantillon par tick, compressé par Fusion |
| Achat, demande de pose, changement d'équipe, chat | `[Rpc]` | Événement rare, ponctuel, à valider |
| Killfeed, annonces de round | `[Rpc(RpcTargets.All)]` | Événement à afficher une fois, pas un état |
| Flash de bouche, impact, son | `ChangeDetector` dans `Render()` | Réaction visuelle à un compteur `[Networked]` |
| Stats d'arme, prix, courbes | `ScriptableObject` | Identique partout, jamais transmis sur le réseau |

**Anti-pattern à éviter** : un RPC par tir. On synchronise un compteur
`ShotCount` et chaque client déclenche son effet quand le compteur change.

---

## 7. Architecture data-driven

Aucune valeur d'équilibrage dans le code. Une arme = un asset.

```
WeaponDefinition (ScriptableObject)
├── Identité      : Id (string stable), NomAffiché, Catégorie, CampAutorisé
├── Économie      : Prix, RécompenseParKill
├── Dégâts        : DégâtsBase, MultiplicateursZone[4], PénétrationArmure,
│                   CourbePerteDistance (AnimationCurve), PortéeMax
├── Tir           : Cadence, Auto/SemiAuto/Rafale, Projectiles, Pénétration murs
├── Munitions     : Chargeur, Réserve, TempsRechargement
├── Précision     : ConeDebout, PénalitéCourse, PénalitéSaut, PénalitéAccroupi
├── Recul         : RecoilPattern (asset séparé, réutilisable), Récupération
├── Mobilité      : VitesseTenue, VitesseZoom
└── Présentation  : PrefabViewModel, PrefabMonde, ClipTir, ClipRecharge
```

`RecoilPattern` est un asset à part contenant `Vector2[]` : le motif est
**fixe et apprenable**, la seule part aléatoire est une petite dispersion.
On peut ainsi donner le même motif à deux armes, ou l'éditer sans toucher au
reste.

Même principe pour `GameModeDefinition` (durée des rounds, tir allié,
rounds pour gagner, armure offerte…) : les 7 modes de la feuille de route sont
7 assets, pas 7 branches de code.

---

## 8. Structure de dossiers

`Assets/_Project/` isole tout notre contenu des SDK. Les mises à jour de Fusion
ou d'un asset du Store ne toucheront jamais à notre code.

```
Assets/
├── _Project/
│   ├── Art/          Materials · Models · Textures · VFX
│   ├── Audio/        SFX · Music · Mixers
│   ├── Data/         Weapons · Characters · Maps · Modes · Economy   (les SO)
│   ├── Prefabs/      Player · Weapons · Networking · Gameplay · UI
│   ├── Scenes/       00_Bootstrap · 01_MainMenu · 10_Sablier · 90_Stand
│   ├── Scripts/
│   │   ├── Core/         Bootstrap, constantes, couches physiques
│   │   ├── Networking/   Launcher, callbacks, NetInput, spawner
│   │   ├── Player/       Motor, Look, Camera, ViewModel
│   │   ├── Combat/       WeaponRuntime, Ballistics, DamageResolver, Health
│   │   ├── Data/         définitions ScriptableObject
│   │   ├── Rules/        MatchDirector, Economy, TeamRoster
│   │   ├── Objectives/   BombObjective, BombSite, Defuse
│   │   ├── UI/           HUD, menus, scoreboard, killfeed, chat
│   │   └── Utility/      extensions, maths, debug
│   ├── Settings/     assets URP, Input Actions
│   └── UI/           Fonts · Sprites
├── Photon/           SDK Fusion 2      ← ne jamais modifier
├── Plugins/          addons (Simple KCC)
└── Samples/          échantillons Fusion, à supprimer avant le build final
```

---

## 9. Limites assumées, à trancher plus tard

| Sujet | Situation |
|---|---|
| **Tick 64 Hz** | Fusion tourne par défaut à 60 Hz. 64 est un chiffre de CS, pas une contrainte technique de Fusion. On le règle à 64 dans le Network Project Config ; si on observe de la gigue, 60 Hz est le choix le plus sûr. |
| **Host migration** | Fusion 2 la gère, mais il faut sérialiser l'état du match pour le transférer. Prévu Phase 12, pas avant. |
| **Pénétration des murs** | Nécessite une couche `Penetrable` et une passe de raycast supplémentaire. Phase 7+. |
| **Plan gratuit Photon** | 20 CCU simultanés : largement suffisant pour jouer entre amis. Pas de serveur dédié, donc le host a un avantage de 0 ms : normal en client-host. |
| **Portée du projet** | 4 maps + 8 personnages + 7 modes + 20 armes, c'est plusieurs mois. La feuille de route est bonne, mais je recommande de viser un **MVP jouable à la Phase 6** : 1 map (Sablier), mode Compétitif, 8 armes. Le reste devient du contenu qu'on ajoute sans retoucher l'architecture. |
