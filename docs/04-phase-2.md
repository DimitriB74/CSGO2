# Phase 2 — Première arme, tir lag-compensé, vie, mort, réapparition

Objectif : deux joueurs se tirent dessus et se touchent **là où ils se voient**,
même avec 100 ms de latence. Vie, armure par zone, mort, réapparition.

Prérequis : Phase 1 validée (deux joueurs se déplacent et se voient).

---

## 1. Les scripts livrés

| Fichier | Rôle |
|---|---|
| `Combat/DamageZone.cs` | les 5 zones de dégâts |
| `Combat/DamageModel.cs` | **C# pur** : zone, distance, absorption du gilet |
| `Combat/RecoilSolver.cs` | **C# pur** : cône, motif de recul, aléatoire déterministe |
| `Combat/DamageZoneTag.cs` | déclare la zone d'une hitbox |
| `Combat/PlayerHealth.cs` | vie, armure, mort, réapparition. Host autoritaire |
| `Combat/WeaponRuntime.cs` | cadence, chargeur, recharge, tir lag-compensé |
| `Data/WeaponDefinition.cs` | **ScriptableObject** : toutes les stats d'une arme |
| `Data/RecoilPattern.cs` | **ScriptableObject** : motif de recul réutilisable |
| `Editor/WeaponLibraryGenerator.cs` | génère les 28 assets depuis le tableau d'équilibrage |
| `Core/SpawnService.cs` | accès trié et mis en cache aux points d'apparition |

### Le partage host / client, en une phrase chacun

- **Le client prédit** ce qui doit répondre instantanément : munitions, temps de
  recharge, recul de la vue. Le tir ne « colle » jamais, même à 100 ms.
- **Le host seul résout les impacts** et applique les dégâts. Un client modifié
  ne peut pas s'attribuer une touche : il n'écrit rien.

Et pourtant les deux calculent **la même balle**, parce que la dispersion vient
d'un générateur déterministe alimenté par `(tick, joueur, numéro de balle)`.
C'est le point qu'il ne faut jamais casser : si tu utilises un jour
`UnityEngine.Random` dans le chemin du tir, le client verra ses impacts ailleurs
que le host.

### Ce que fait la compensation de latence

```
t = 0 ms     le client voit l'ennemi à la position P, tire dessus
t = 0 ms     le client prédit : munition en moins, recul, effet de tir
t = 45 ms    le tir arrive chez le host. L'ennemi est maintenant en P'
             ↓
             Runner.LagCompensation.Raycast rembobine les hitbox
             de 45 ms → l'ennemi est réévalué en P → la balle touche
```

Sans ça, il faudrait viser devant un ennemi qui se déplace, proportionnellement à
son ping. C'est ce qui sépare un FPS jouable d'un FPS frustrant.

---

## 2. Les modèles sont vérifiés numériquement

Les deux modèles purs (`DamageModel`, `RecoilSolver`) ont été exécutés hors
d'Unity. Voici les chiffres à retrouver en jeu.

### Dégâts par balle, contre une cible **avec gilet + casque**

| Arme | tête 0 m | tête 30 m | torse 0 m | torse 30 m | ventre | jambe |
|---|---|---|---|---|---|---|
| VK-9 | 55 | 53 | 14 | 13 | 17 | 10 |
| K-7 | 68 | 54 | 17 | 14 | 21 | 13 |
| Masse .50 | 231 | 140 | 58 | 35 | 72 | 43 |
| Salve-3 | 68 | 58 | 17 | 15 | 21 | 13 |
| Gémeaux | 56 | 49 | 14 | 12 | 18 | 11 |
| Bourrasque *(par plomb, ×9)* | 52 | 22 | 13 | 6 | 16 | 10 |
| Grêle SA *(par plomb, ×8)* | 40 | 17 | 10 | 4 | 13 | 8 |
| Guêpe | 65 | 41 | 16 | 10 | 20 | 12 |
| Onde-9 | 62 | 41 | 16 | 10 | 20 | 12 |
| Ruche | 60 | 36 | 15 | 9 | 19 | 11 |
| Brûlot | 94 | 89 | 23 | 22 | 29 | 18 |
| Clairon | 84 | 78 | 21 | 20 | 26 | 16 |
| **Faucheur** | **112** | **107** | 28 | 27 | 35 | 21 |
| **Arbitre** | 92 | 86 | 23 | 21 | 29 | 17 |
| Scrutateur 2× | 122 | 119 | 30 | 30 | 38 | 23 |
| Écharde | 224 | 214 | 75 | 71 | 94 | 56 |
| **Monolithe** | 279 | 272 | **112** | **109** | 139 | 84 |
| Verdict | 197 | 188 | 66 | 63 | 82 | 49 |
| Broyeur | 81 | 77 | 20 | 19 | 25 | 15 |

### Balles pour tuer

| Arme | tête (armuré) | torse (armuré) | torse 30 m (armuré) | tête (nu) | torse (nu) |
|---|---|---|---|---|---|
| VK-9 | 2 | 8 | 8 | 1 | 4 |
| K-7 | 2 | 6 | 8 | 1 | 3 |
| Masse .50 | **1** | 2 | 3 | 1 | 2 |
| Salve-3 | 2 | 6 | 7 | 1 | 4 |
| Gémeaux | 2 | 8 | 9 | 1 | 4 |
| Bourrasque *(plombs)* | 2 | 8 | 17 | 1 | 4 |
| Grêle SA *(plombs)* | 3 | 10 | 25 | 2 | 5 |
| Guêpe | 2 | 7 | 10 | 1 | 4 |
| Onde-9 | 2 | 7 | 10 | 1 | 4 |
| Ruche | 2 | 7 | 12 | 2 | 5 |
| Brûlot | 2 | 5 | 5 | 1 | 4 |
| Clairon | 2 | 5 | 5 | 1 | 4 |
| **Faucheur** | **1** | 4 | 4 | 1 | 3 |
| **Arbitre** | 2 | 5 | 5 | 1 | 4 |
| Scrutateur 2× | **1** | 4 | 4 | 1 | 3 |
| Écharde | **1** | 2 | 2 | 1 | 2 |
| **Monolithe** | **1** | **1** | **1** | 1 | 1 |
| Verdict | **1** | 2 | 2 | 1 | 2 |
| Broyeur | 2 | 5 | 6 | 1 | 3 |

### L'opposition centrale du jeu, vérifiée

| Contrôle | Résultat |
|---|---|
| Faucheur : 1 balle à la tête avec casque, à 30 m | oui (107 dégâts) |
| Arbitre : 1 balle à la tête avec casque | **non** (86 à 30 m, 92 à bout portant) |
| Masse .50 : 1 balle à la tête avec casque à 20 m | oui |
| Monolithe : 1 balle au torse avec gilet à 50 m | oui (109) |
| Monolithe : 1 balle dans la jambe | **non** (84) |
| Écharde : 1 balle au torse avec gilet | **non** (75) |
| Le gilet réduit toujours les dégâts au torse | oui |
| Une tête sans casque ignore le gilet | oui |
| Aucun impact ne fait 0 dégât, même une jambe à 200 m | oui (minimum 1) |

C'est exactement l'équilibre voulu : le fusil des Attaquants récompense la visée
haute, celui des Défenseurs récompense le contrôle du recul.

### Dispersion et recul

| Mesure | Résultat |
|---|---|
| Même `(tick, joueur, balle)` → même direction | identique |
| Tick différent → direction différente | oui |
| Cône demandé 2,00° → déviation maximale | 2,000° (aucune balle hors du cône) |
| Déviation moyenne | 1,334° = 2/3 du cône, signature d'un disque uniforme |
| Faucheur après 10 balles | −15,3° de tangage |
| Retour complet de la vue au repos | 0,84 s |

La moyenne à exactement 2/3 du cône confirme que la répartition est uniforme sur
le disque : sans la racine carrée sur le rayon, les balles s'agglutineraient au
centre et le cône ne voudrait plus rien dire.

---

## 3. Générer la bibliothèque d'armes

Menu **Point de Rupture → Générer la bibliothèque d'armes**.

Cela crée en un clic :
- `Assets/_Project/Data/Weapons/` — 28 assets (20 armes, 5 grenades, 3 équipements) ;
- `Assets/_Project/Data/Recoil/` — 6 motifs de recul (fusil, smg, pistolet,
  pompe, sniper, mitrailleuse).

Le générateur est **idempotent** : relancé, il met à jour les assets existants
sans créer de doublons, donc les références posées dans tes prefabs survivent.

> Pour équilibrer, tu as deux options : modifier un asset directement dans
> l'Inspector (rapide, pour tester), ou modifier le tableau dans
> `WeaponLibraryGenerator.cs` puis régénérer (durable, c'est la source de
> vérité). **Attention** : régénérer écrase les modifications faites à la main.

---

## 4. Ajouter les hitbox au prefab Player

C'est l'étape la plus minutieuse de la phase. Les hitbox sont ce que la
compensation de latence rembobine : leur position et leur taille définissent le
ressenti du tir.

### Hiérarchie à obtenir

```
Player                       ← HitboxRoot ici, sur la racine
├── Head
├── Visual
│   └── Body
└── Hitboxes                 ← GameObject vide, Position (0, 0, 0)
    ├── HB_Tete              ← Hitbox + DamageZoneTag (Head)
    ├── HB_Torse             ← Hitbox + DamageZoneTag (Chest)
    ├── HB_Ventre            ← Hitbox + DamageZoneTag (Stomach)
    ├── HB_BrasG             ← Hitbox + DamageZoneTag (Arms)
    ├── HB_BrasD             ← Hitbox + DamageZoneTag (Arms)
    ├── HB_JambeG            ← Hitbox + DamageZoneTag (Legs)
    └── HB_JambeD            ← Hitbox + DamageZoneTag (Legs)
```

### Étapes

1. Sur la racine `Player`, ajoute le composant **HitboxRoot** de Fusion.
2. Crée un enfant vide `Hitboxes` à la position `(0, 0, 0)`.
3. Dans `Hitboxes`, crée 7 GameObjects vides et donne à chacun un composant
   **Hitbox** (Fusion) + **Damage Zone Tag**, avec ces positions et dimensions :

| Nom | Position | Dimensions (boîte) | Zone |
|---|---|---|---|
| `HB_Tete` | `(0, 1.66, 0)` | `0.24 × 0.26 × 0.24` | Head |
| `HB_Torse` | `(0, 1.26, 0)` | `0.44 × 0.56 × 0.26` | Chest |
| `HB_Ventre` | `(0, 0.94, 0)` | `0.40 × 0.30 × 0.24` | Stomach |
| `HB_BrasG` | `(-0.32, 1.24, 0)` | `0.16 × 0.52 × 0.16` | Arms |
| `HB_BrasD` | `(0.32, 1.24, 0)` | `0.16 × 0.52 × 0.16` | Arms |
| `HB_JambeG` | `(-0.13, 0.40, 0)` | `0.18 × 0.80 × 0.18` | Legs |
| `HB_JambeD` | `(0.13, 0.40, 0)` | `0.18 × 0.80 × 0.18` | Legs |

Le composant `Hitbox` de Fusion propose une forme (boîte, sphère, capsule) et ses
dimensions. Choisis **boîte** et saisis les dimensions ci-dessus. Selon la version
du SDK, le champ s'appelle *Box Extents* et attend parfois la **demi-dimension** :
si les hitbox apparaissent deux fois trop grandes dans la vue, divise par deux.

4. Mets les 7 GameObjects sur la couche **Hitbox (9)**.
5. Sur `PlayerAgent`, assigne le champ **Hitbox Root** → le GameObject
   `Hitboxes`.

> Pourquoi ce champ : s'accroupir doit réellement réduire la surface exposée.
> `PlayerAgent` écrase le conteneur `Hitboxes` **dans la simulation** et non dans
> `Render()`. Une hitbox qui ne bougerait qu'à l'affichage serait rembobinée au
> mauvais endroit par la compensation de latence, et s'accroupir ne protégerait
> de rien.

### Vérification visuelle

Sélectionne le prefab : les hitbox de Fusion se dessinent dans la vue. La
silhouette doit épouser la capsule de 1,85 m, sans trou entre le ventre et les
jambes, et sans dépasser au-dessus de la tête.

---

## 5. Ajouter la vie et l'arme au prefab

Sur la racine `Player`, ajoute :

### Player Health

| Champ | Valeur |
|---|---|
| `Respawn Delay` | `3` |
| `Agent` | le composant **Player Agent** |
| `Visual Root` | le GameObject enfant **Visual** |

### Weapon Runtime

| Champ | Valeur |
|---|---|
| `Weapon` | `Weapon_faucheur` (ou `Weapon_arbitre`, au choix) |
| `Agent` | le composant **Player Agent** |
| `Health` | le composant **Player Health** |

### Player Agent — deux références à compléter

| Champ | Valeur |
|---|---|
| `Health` | le composant **Player Health** |
| `Weapon` | le composant **Weapon Runtime** |
| `Hitbox Root` | le GameObject **Hitboxes** |

Sauvegarde le prefab.

> Il n'y a **pas** de masque de couche à régler : le tir utilise
> `Layers.BulletMask`, défini une seule fois dans `Core/Layers.cs`. Il exclut
> volontairement la couche `Player` — la capsule de collision ne doit pas arrêter
> une balle, sinon les tirs s'arrêteraient devant la vraie hitbox et les coups à
> la tête seraient impossibles.

---

## 6. Les contrôles ajoutés

| Touche | Action |
|---|---|
| Clic gauche | tirer (automatique ou coup par coup selon l'arme) |
| Clic droit | lunette, pour les armes qui en ont une |
| `R` | recharger |

---

## 7. Procédure de test à 2 joueurs

### A. Le tir fonctionne

1. MPPM, Player 2 activé, scène `99_BacASable`, **Play**.
2. Player 1 tire sur Player 2.
3. Attendu — en Phase 2 personne n'a d'armure (l'achat arrive en Phase 5), donc
   ce sont les colonnes « nu » du tableau qui s'appliquent :
   - avec le Faucheur : **3 balles au torse** (36 dégâts chacune) ;
   - **1 balle à la tête** (144 dégâts) ;
   - le tué disparaît, puis réapparaît 3 s plus tard sur un autre point ;
   - `Kills` et `Deaths` s'incrémentent (visibles dans l'Inspector du
     `PlayerHealth`, en cochant *Debug* sur le composant).

### B. Le recul est un motif, pas du hasard

1. Visse une paroi à 10 m et maintiens le tir, 30 balles.
2. Attendu : la trajectoire des impacts est **la même à chaque rafale** —
   montée, puis droite, puis un long retour à gauche. Si le motif change d'une
   rafale à l'autre, le déterminisme est cassé : dis-le moi.
3. Arrête de tirer une seconde : la rafale suivante repart du **bas** du motif.

### C. La précision dépend du mouvement

1. Tire une balle immobile, à 20 m : elle part au centre du viseur.
2. Tire en courant : les impacts s'éparpillent largement.
3. Fais un **counter-strafe** puis tire immédiatement : la balle repart au
   centre. C'est le geste que la Phase 1 a rendu possible et que la Phase 2
   récompense.
4. Tire en sautant : c'est inutilisable, comme prévu.

### D. Le test qui compte : la compensation de latence

1. `Tools → Fusion → Network Project Config` → **Network Conditions** :
   latence **100 ms**, perte **0 %**.
2. Relance. Demande à Player 2 de **courir latéralement** devant toi, sans
   s'arrêter.
3. Vise **exactement sur lui**, sur ce que tu vois à l'écran, et tire.
4. Attendu : **tu le touches**. Pas besoin de viser devant lui.
5. Remets la latence à 0 après le test.

Si tu dois viser devant la cible, la compensation de latence n'est pas active :
vérifie que `HitboxRoot` est bien sur la racine du prefab et que la lag
compensation est activée dans le Network Project Config.

---

## 8. Dépannage

| Symptôme | Cause probable | Correctif |
|---|---|---|
| Les tirs ne touchent jamais | pas de `HitboxRoot` sur la racine, ou hitbox pas sur la couche `Hitbox` | corriger le prefab |
| Les tirs touchent mais ne font rien | `DamageZoneTag` absent, ou la hitbox n'est pas un enfant du `PlayerHealth` | la hiérarchie doit rester sous la racine `Player` |
| Toujours 1 seule balle pour tuer, partout | le tir touche `HB_Tete` en permanence : hitbox mal positionnée | revoir les positions du tableau |
| Le tir est en retard sur le clic | on attend la réponse du host au lieu de prédire | le client doit exécuter `Simulate` : vérifie que `Weapon` est bien assigné sur `PlayerAgent` |
| Les impacts du client sont ailleurs que ceux du host | de l'aléatoire non déterministe dans le chemin du tir | n'utiliser que `RecoilSolver`, jamais `UnityEngine.Random` |
| S'accroupir ne protège pas | `Hitbox Root` non assigné sur `PlayerAgent` | l'assigner au GameObject `Hitboxes` |
| `ChangeDetector` introuvable | signature différente dans ta version du SDK | c'est la seule ligne concernée, dans `PlayerHealth.Spawned` : envoie-moi l'erreur |
| Le recul monte jusqu'au ciel | motif de recul absent sur l'arme | régénérer la bibliothèque |

---

## 9. Ce que fera la Phase 3

- inventaire à trois emplacements (principale, secondaire, couteau) et
  changement d'arme ;
- toutes les armes achetables et utilisables, depuis les assets déjà générés ;
- ramassage des armes au sol ;
- mode rafale et doubles pistolets ;
- view model et effets de tir.

À ce stade, la Phase 4 (Deathmatch) est à portée : il ne manquera qu'un compteur
de score et un chronomètre pour faire une première partie avec tes amis.
