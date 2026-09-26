# Comment tester — commence ici

Rien n'est testable tant que le projet Unity n'existe pas sur ta machine : ce
dépôt ne contient que les scripts et la documentation. `ProjectSettings/` et
`Packages/` seront créés par Unity.

Compte **2 h en tout**, dont une bonne heure de téléchargement pendant laquelle
tu peux faire autre chose.

Ne saute pas les niveaux. Chacun isole une source de panne différente : si tu
montes tout d'un coup et que ça ne marche pas, tu ne sauras pas si c'est le
réseau, le prefab ou les hitbox.

---

## Niveau 0 — la connexion seule · ~45 min

**Ce qu'on valide** : Unity, URP, Fusion, ton App ID Photon, et que ton pare-feu
laisse sortir l'UDP. Rien d'autre. Si ce niveau échoue, aucun des suivants ne
peut marcher.

Suis [`docs/02-phase-0.md`](02-phase-0.md), étapes 1 à 10.

**Réussi quand** les deux consoles affichent :

```
[SmokeTest] Connecté. Rôle : HOST — mon PlayerRef : 0
[SmokeTest] Joueurs dans la session : 2
```

Il n'y a **rien à voir à l'écran** : c'est normal, il n'y a pas encore de
personnage. Ne cherche pas plus loin.

---

## Niveau 1 — deux joueurs qui bougent · ~40 min

**Ce qu'on valide** : le prefab, la caméra, et surtout la sensation de
déplacement.

Suis [`docs/03-phase-1.md`](03-phase-1.md), sections 2 à 7.

**Le test qui compte** : appuie `F3` pour afficher la vitesse, cours tout droit
jusqu'à 6,35 m/s, puis **lâche `W` et appuie `S`**. La vitesse doit tomber sous
0,5 m/s en **environ un dixième de seconde**. Compare avec un simple relâchement
de touche : c'est plus de trois fois plus lent. Ce rapport est toute la
différence entre un FPS tactique et un FPS générique.

Les 8 autres vérifications sont dans la section 7 du doc.

---

## Niveau 2 — se tirer dessus · ~40 min

**Ce qu'on valide** : les hitbox, les dégâts par zone, et la compensation de
latence.

Suis [`docs/04-phase-2.md`](04-phase-2.md), sections 3 à 7.

C'est le niveau le plus minutieux : 7 hitbox à positionner au centimètre. Prends
ton temps sur le tableau de la section 4, c'est lui qui définit le ressenti du
tir.

**Réussi quand** : 3 balles de Faucheur au torse tuent, 1 seule à la tête, et le
tué réapparaît 3 s plus tard.

---

## Tester seul la compensation de latence

Le vrai test demande une cible qui **se déplace latéralement** pendant que tu lui
tires dessus. Impossible en contrôlant deux joueurs à la fois — d'où la cible
d'entraînement.

### Construire la cible · ~10 min

Elle réutilise exactement le même chemin de dégâts qu'un joueur : un test qui
passe ici vaut pour un vrai duel.

1. `GameObject → Create Empty`, nomme-le `Cible`, position `(0, 0, 8)`.
2. Ajoute-lui : **NetworkObject**, **NetworkTransform**, **HitboxRoot**,
   **Player Health**, **Training Target**.
3. `Player Health` : laisse `Agent` **vide** (c'est prévu), `Respawn Delay` `2`,
   `Visual Root` → l'enfant `Visual` créé à l'étape 5.
4. `Training Target` : `Travel` `8`, `Speed` `6.35`, `Axis` `(1, 0, 0)`,
   `Health` → le composant **Player Health**.
5. Enfant `Visual` → dedans une **Capsule** en `(0, 0.925, 0)`, scale
   `(0.8, 0.925, 0.8)`, **collider supprimé**.
6. Enfant `Hitboxes` avec les 7 hitbox : reprends **exactement** le tableau de
   [`docs/04-phase-2.md`](04-phase-2.md) section 4, positions identiques.
7. Fais-en un prefab dans `Assets/_Project/Prefabs/Gameplay/`.

Le trajet de la cible se dessine en orange dans la vue : tu peux la placer à
l'œil sans lancer la partie.

### Qui la fait apparaître

La cible est un objet réseau : seul le host peut la créer. Le plus simple pour
l'instant est de **laisser l'instance dans la scène** — Fusion l'adopte au
démarrage si elle porte un `NetworkObject`. Si elle ne bouge pas côté client,
c'est qu'elle n'a pas été adoptée : dis-le moi, je te fais un spawner en trois
lignes.

### Le test

1. `Tools → Fusion → Network Project Config` → **Network Conditions** :
   latence **100 ms**, perte **0 %**.
2. Lance en solo (pas besoin de MPPM ici, tu es host).
3. La cible fait des allers-retours à la vitesse d'un joueur qui court.
4. Vise **exactement sur elle**, sur ce que tu vois à l'écran, et tire.

| Résultat | Conclusion |
|---|---|
| Tu la touches en visant dessus | **la compensation de latence fonctionne** |
| Tu dois viser devant elle | elle n'est pas active : vérifie `HitboxRoot` sur la racine et la lag compensation dans le Network Project Config |

5. Monte à 200 ms pour voir la différence de façon spectaculaire, puis **remets
   tout à 0**.

C'est aussi le banc d'essai idéal pour apprendre un motif de recul : tire 30
balles sur un mur et observe la trace.

---

## Comment fonctionne le test à 2 joueurs

`Window → Multiplayer → Multiplayer Play Mode`, coche **Player 2**, puis `Play`.

Tu obtiens deux fenêtres : l'éditeur est le joueur 1, une fenêtre séparée est le
joueur 2. Les deux passent par le cloud Photon, donc ça consomme 2 des 20
connexions simultanées de ton plan gratuit — largement suffisant.

Trois choses à savoir :

- **la première activation est lente** (Unity duplique le projet) : laisse-la
  faire, c'est une fois pour toutes ;
- **le clavier et la souris ne vont qu'à la fenêtre active** : pour tester le
  tir, clique sur la fenêtre 1 et tire sur le joueur 2 qui reste immobile ;
- **`Échap` libère la souris** : indispensable pour passer d'une fenêtre à
  l'autre.

### Si MPPM pose problème

Solution de repli, toujours fiable : `File → Build And Run` pour produire un
exécutable, puis lance-le **à côté** de l'éditeur en Play. Deux processus
indépendants, aucune magie. C'est plus lent à itérer mais ça ne trahit jamais.

---

## Tester avec un ami, pour de vrai

C'est le point où Photon fait gagner le plus de temps : **rien à configurer**.

1. Tu fais un build (`File → Build And Run`) et tu lui envoies le dossier.
2. Vous devez avoir **le même `Session Name`** (`PDR-TEST` par défaut) et **le
   même App ID**.
3. Le premier qui lance devient host, le second se connecte.

Ni ouverture de ports, ni adresse IP à échanger, ni serveur à louer : le cloud
Photon fait le relais. C'est tout l'intérêt du plan gratuit.

> L'App ID est exclu du Git (c'est une donnée de ton compte). Si ton ami
> recompile le projet lui-même, transmets-le lui en privé — sinon son build ne se
> connectera à rien.

Un vrai duel entre deux réseaux différents est le seul test qui reproduit les
conditions réelles : c'est là que tu verras si 64 Hz tient chez ton host ou s'il
faut redescendre à 60.

---

## Par quoi commencer, concrètement

Aujourd'hui, fais **le Niveau 0 et rien d'autre**. Installe, colle l'App ID,
vérifie les deux lignes dans la console.

C'est là que se trouvent 90 % des pannes possibles — App ID mal collé, pare-feu,
Input System non redémarré — et une fois ce niveau franchi, les suivants
s'enchaînent sans surprise.

Et colle-moi la première erreur de compilation que tu vois : je n'ai pas pu
compiler contre le vrai SDK Fusion, donc il y a peut-être une signature d'API à
corriger. C'est l'affaire de deux minutes, mais il faut que tu me montres le
message.
