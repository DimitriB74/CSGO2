> Ce document reste **la référence d'équilibrage du jeu**. Les valeurs vivent
> dans `shared/weapons.js` et sont vérifiées par `npm test`.

# Univers, nommage et équilibrage — *Point de Rupture*

Rien de ce document ne reprend un nom, un logo, une map ou un son de
Counter-Strike. Les valeurs numériques sont des points de départ d'équilibrage,
pas des copies : elles vivront dans des ScriptableObjects et bougeront après les
premiers tests.

> **À vérifier avant toute diffusion publique** : une recherche de marque
> (INPI / EUIPO) sur le titre retenu et sur les noms d'armes. Un nom original
> n'est pas forcément un nom libre.

---

## 1. Titre du jeu

| Proposition | Ton |
|---|---|
| **Point de Rupture** *(retenu par défaut, code projet `PDR`)* | sobre, tactique, francophone, décrit le moment où une défense cède |
| **Brèche** | court, agressif, marche aussi en anglais (*Breach*) |
| **Dernier Verrou** | plus narratif, met en avant le camp défenseur |

Le titre n'apparaît qu'à un seul endroit du code (`AppConfig.GameName`) : il est
changeable en dix secondes.

---

## 2. Les deux camps

| | Attaquants | Défenseurs |
|---|---|---|
| **Nom** | **CENDRE** | **VERROU** |
| Nom long | Collectif Cendre | Groupe d'intervention Verrou |
| Rôle | poser la charge | empêcher la pose, désamorcer |
| Identité visuelle | tons terre brûlée, ocre, noir mat ; équipement dépareillé, tissu, sangles | tons ardoise et bleu acier ; plaques rigides, casques intégraux, marquages réglementaires |
| Couleur d'interface | `#E3B44C` (ambre) | `#6BA8ED` (bleu acier) |
| Voix / annonces | radio saturée, familière | protocole, indicatifs courts |

Le contraste ambre / bleu acier reste lisible pour les daltonismes courants
(deutéranopie, protanopie) : on différencie aussi par la **silhouette**
(souple contre blindée), jamais par la couleur seule.

---

## 3. Les maps

| Fichier de scène | Nom | Ambiance | Sites | Usage |
|---|---|---|---|---|
| `10_Sablier` | **Sablier** | village désertique, ruelles ocre, citernes | A / B | map de référence, 5v5 |
| `11_CaleSeche` | **Cale Sèche** | docks, cale de radoub vidée, conteneurs | A / B | 5v5 |
| `12_Terminus` | **Terminus** | station de métro à l'abandon, quais, tunnels | A / B | 5v5 |
| `13_Neve` | **Névé** | base de montagne enneigée, hangars, téléphérique | A / B | 5v5 |
| `20_Citerne` | **Citerne** | château d'eau et cour bétonnée | site unique | Wingman 2v2 |
| `90_Stand` | **Stand** | stand de tir couvert | — | entraînement solo |

Chaque map respectera la règle de rotation : **les Défenseurs arrivent sur un
site ~5 s avant les Attaquants**. Les plans vus du dessus arriveront en Phase 9,
un par un, avant toute construction ProBuilder.

### Callouts de *Sablier* (provisoires)

`Spawn Cendre` · `Le Four` · `Ruelle Basse` · `Le Puits` (milieu) ·
`Les Arches` · `Terrasse A` · `Site A` · `Citerne B` · `Souk` ·
`Passe B` · `Cour Verrou` · `Spawn Verrou`

---

## 4. Les armes

Fabricants fictifs, pour donner une cohérence aux noms :
**Voskov** (marché gris, côté Cendre) · **Kestrel Defence** (institutionnel,
côté Verrou) · **Meridian** (civil / commun aux deux camps).

### Lecture du tableau

- **Dégâts** : torse, à bout portant, sans armure.
- **Tête** : multiplicateur appliqué avant l'armure.
- **Pén.** : part des dégâts qui traverse le gilet (plus haut = meilleur contre
  une cible armurée).
- **Cadence** : coups par minute.
- **Préc.** : diamètre du cône debout immobile, en degrés (plus petit = mieux).
- **Recul** : indice de difficulté de contrôle, de 1 à 10.
- **Vitesse** : vitesse de déplacement arme en main, en m/s (référence couteau
  6,35 m/s).
- **Kill** : argent gagné par élimination.

### Corps à corps

| Arme | Prix | Dégâts | Tête | Pén. | Cadence | Mag/Rés | Rech. | Préc. | Recul | Vitesse | Kill | Camp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Crochet** (couteau) | 0 | 45 léger / 95 lourd / **200 dans le dos** | ×1.0 | 85 % | 150 / 55 | — | — | — | — | 6.35 | 1500 | Tous |

### Pistolets

| Arme | Prix | Dégâts | Tête | Pén. | Cadence | Mag/Rés | Rech. | Préc. | Recul | Vitesse | Kill | Camp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Voskov VK-9** | 0 | 29 | ×4.0 | 47 % | 400 | 20 / 120 | 2.2 s | 0.45° | 3 | 6.30 | 300 | Cendre |
| **Kestrel K-7** | 0 | 34 | ×4.0 | 50 % | 353 | 12 / 24 | 2.2 s | 0.38° | 3 | 6.30 | 300 | Verrou |
| **Meridian Masse .50** | 700 | 62 | ×4.0 | 93 % | 267 | 7 / 35 | 2.2 s | 0.50° | 7 | 6.20 | 300 | Tous |
| **Voskov Salve-3** (rafale ×3) | 350 | 26 /balle | ×4.0 | 65 % | 3 coups, 0.35 s entre rafales | 18 / 90 | 2.0 s | 0.55° | 4 | 6.30 | 300 | Tous |
| **Meridian Gémeaux** (doubles) | 500 | 27 | ×4.0 | 52 % | 500 | 30 / 120 | 3.4 s | 0.90° | 5 | 6.25 | 300 | Tous |

*Masse .50* tue en un coup à la tête même avec casque. C'est l'arme d'éco
signature : cher, 7 balles, gros recul.

### Fusils à pompe

| Arme | Prix | Dégâts | Tête | Pén. | Cadence | Mag/Rés | Rech. | Préc. | Recul | Vitesse | Kill | Camp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Meridian Bourrasque** | 1000 | 9 × 26 | ×4.0 | 50 % | 68 | 8 / 32 | 3.2 s | gerbe 3.2° | 8 | 6.10 | 900 | Tous |
| **Kestrel Grêle SA** | 2000 | 8 × 20 | ×4.0 | 50 % | 171 | 7 / 32 | 3.4 s | gerbe 3.6° | 7 | 6.00 | 900 | Tous |

### Pistolets-mitrailleurs

| Arme | Prix | Dégâts | Tête | Pén. | Cadence | Mag/Rés | Rech. | Préc. | Recul | Vitesse | Kill | Camp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Voskov Guêpe** | 1050 | 28 | ×4.0 | 58 % | 857 | 30 / 100 | 2.3 s | 0.90° | 5 | 6.25 | 600 | Cendre |
| **Kestrel Onde-9** | 1250 | 26 | ×4.0 | 60 % | 900 | 30 / 120 | 2.1 s | 0.80° | 4 | 6.28 | 600 | Verrou |
| **Meridian Ruche** | 1200 | 24 | ×4.0 | 62 % | 857 | 50 / 100 | 3.3 s | 0.75° | 4 | 6.15 | 600 | Tous |

### Fusils d'assaut

| Arme | Prix | Dégâts | Tête | Pén. | Cadence | Mag/Rés | Rech. | Préc. | Recul | Vitesse | Kill | Camp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Voskov Brûlot** (éco) | 1800 | 30 | ×4.0 | 78 % | 667 | 35 / 90 | 3.0 s | 0.42° | 6 | 5.95 | 300 | Cendre |
| **Kestrel Clairon** (éco) | 2050 | 30 | ×4.0 | 70 % | 667 | 25 / 90 | 3.3 s | 0.40° | 6 | 5.95 | 300 | Verrou |
| **Voskov Faucheur** | 2700 | 36 | ×4.0 | 78 % | 600 | 30 / 90 | 2.4 s | 0.28° | 8 | 5.90 | 300 | Cendre |
| **Kestrel Arbitre** | 3100 | 33 | ×4.0 | 70 % | 667 | 30 / 90 | 3.1 s | 0.26° | 6 | 5.90 | 300 | Verrou |
| **Meridian Scrutateur 2×** | 2750 | 38 | ×4.0 | 80 % | 500 | 20 / 60 | 3.0 s | 0.22° (0.06° zoomé) | 7 | 5.85 | 300 | Tous |

*Faucheur* : tue en un coup à la tête à toute distance, mais motif de recul
sévère. *Arbitre* : ne tue pas à la tête avec casque au-delà de 30 m, mais se
contrôle beaucoup plus facilement. C'est l'opposition centrale du jeu.

### Fusils de précision

| Arme | Prix | Dégâts | Tête | Pén. | Cadence | Mag/Rés | Rech. | Préc. | Recul | Vitesse | Kill | Camp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Kestrel Écharde** (léger) | 1700 | 88 | ×3.0 | 85 % | 48 | 10 / 90 | 3.6 s | 0.14° | 6 | 5.85 | 300 | Tous |
| **Voskov Monolithe** (lourd) | 4750 | 115 | ×2.5 | 97 % | 41 | 10 / 30 | 3.7 s | 0.10° | 9 | 5.35 | **100** | Tous |
| **Meridian Verdict** (semi-auto) | 5000 | 80 | ×3.0 | 82 % | 150 | 20 / 90 | 3.9 s | 0.16° | 6 | 5.60 | 300 | Tous |

*Monolithe* tue en un tir au torse et au ventre, à toute distance, même contre un
gilet. **Pas** dans les jambes en revanche : 84 dégâts, vérifié dans le tableau
de `docs/04-phase-2.md`. Récompense volontairement basse (100 $) pour ne pas
récompenser le camping.

### Mitrailleuse

| Arme | Prix | Dégâts | Tête | Pén. | Cadence | Mag/Rés | Rech. | Préc. | Recul | Vitesse | Kill | Camp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Voskov Broyeur** | 5700 | 35 | ×4.0 | 58 % | 800 | 150 / 0 | 5.7 s | 0.55° (0.12° après 1 s de tir) | 7 | 5.35 | 300 | Tous |

### Grenades — 4 au maximum par joueur

| Grenade | Prix | Effet | Camp |
|---|---|---|---|
| **Fragment** | 300 | jusqu'à 98 dégâts, rayon 7.5 m, atténuée par les murs | Tous |
| **Éclair** | 200 | aveuglement de 0.5 s à 3.2 s selon l'angle de vue et la distance | Tous |
| **Voile** (fumigène) | 300 | 18 s d'occlusion, éteint les zones en feu | Tous |
| **Braise** (incendiaire) | 400 Cendre / 600 Verrou | 7 s de zone en feu, 11 dégâts/s | Tous |
| **Leurre** | 50 | reproduit des bruits de tir pendant 15 s puis explose faiblement | Tous |

### Équipement

| Objet | Prix | Effet | Camp |
|---|---|---|---|
| **Gilet** | 650 | 100 d'armure, absorbe selon la pénétration de l'arme | Tous |
| **Gilet + Casque** | 1000 | idem + protection des dégâts à la tête | Tous |
| **Kit de désamorçage** | 400 | désamorçage 10 s → 5 s | Verrou |

---

### Perte de dégâts à la distance

Chaque arme a un facteur appliqué tous les 12,7 m parcourus par la balle. Les
valeurs exactes sont dans les assets générés ; par famille :

| Famille | Facteur / 12,7 m | Effet à 30 m |
|---|---|---|
| Fusils d'assaut, snipers, mitrailleuse | 0,97 à 0,99 | −2 à −7 % |
| Pistolets | 0,81 à 0,99 | −5 à −38 % |
| Pistolets-mitrailleurs | 0,81 à 0,84 | −32 à −38 % |
| Fusils à pompe | 0,70 | −57 % |

C'est ce qui donne à chaque famille sa portée utile : une SMG reste redoutable
en intérieur et devient inoffensive sur un long angle.

Le tableau complet des dégâts par balle et du nombre de balles pour tuer, calculé
depuis ces valeurs, est dans [`docs/04-phase-2.md`](04-phase-2.md).

## 5. Multiplicateurs de zone

| Zone | Multiplicateur |
|---|---|
| Tête | valeur propre à l'arme (×2.5 à ×4.0) |
| Torse / bras | ×1.00 |
| Ventre | ×1.25 |
| Jambes | ×0.75 |

Les hitbox sont **identiques pour les 8 modèles de personnage**. Les modèles
sont purement cosmétiques : c'est une règle non négociable pour l'équilibre.

---

## 6. Économie

| Événement | Montant |
|---|---|
| Argent de départ (et après la mi-temps) | 800 $ |
| Plafond | 16 000 $ |
| Victoire de round | 3 250 $ |
| Défaite, 1ʳᵉ consécutive | 1 400 $ |
| +500 $ par défaite consécutive supplémentaire | 1 900 / 2 400 / 2 900 / 3 400 $ |
| Pose de la bombe (équipe Cendre, même en cas de défaite) | +800 $ |
| Désamorçage (équipe Verrou) | +3 500 $ au lieu de 3 250 $ |
| Bonus individuel de pose / de désamorçage | +300 $ |
| Élimination | selon l'arme (voir tableaux) |

## 7. Durées

| Paramètre | Valeur |
|---|---|
| Freeze time | 15 s |
| Temps d'achat (à partir du début du round) | 20 s |
| Durée du round | 1 min 55 |
| Timer de la bombe | 40 s |
| Pose | 3.2 s |
| Désamorçage | 10 s, ou 5 s avec le kit |
| Fin de round (avant le suivant) | 5 s |
| Rounds pour gagner / mi-temps | 13 / après 12 rounds |

Toutes ces valeurs vivent dans `GameModeDefinition`, jamais en dur.
