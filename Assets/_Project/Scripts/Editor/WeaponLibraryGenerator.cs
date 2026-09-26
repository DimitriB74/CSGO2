#if UNITY_EDITOR
using System.Collections.Generic;
using PointDeRupture.Data;
using UnityEditor;
using UnityEngine;

namespace PointDeRupture.EditorTools
{
    /// <summary>
    /// Génère les assets de toutes les armes et de tous les motifs de recul
    /// depuis le tableau d'équilibrage de docs/01-univers-et-armes.md.
    ///
    /// Pourquoi un générateur plutôt qu'une saisie à la main : 28 assets à 30
    /// champs chacun, c'est 800 valeurs. Une seule faute de frappe déséquilibre
    /// le jeu sans qu'on s'en aperçoive, et personne ne revérifie. Ici le tableau
    /// est dans le code, relisible d'un coup d'œil, et régénérable.
    ///
    /// Le générateur est **idempotent** : relancé, il met à jour les assets
    /// existants au lieu d'en créer des doublons. Les références posées dans les
    /// prefabs et les scènes survivent donc à une régénération.
    ///
    /// Menu : Point de Rupture → Générer la bibliothèque d'armes
    /// </summary>
    public static class WeaponLibraryGenerator
    {
        private const string DataRoot = "Assets/_Project/Data";
        private const string WeaponFolder = DataRoot + "/Weapons";
        private const string RecoilFolder = DataRoot + "/Recoil";

        /// <summary>Une ligne du tableau d'équilibrage.</summary>
        private struct Row
        {
            public string Id, Name, RecoilId;
            public WeaponCategory Category;
            public WeaponTeam Team;
            public int Price, KillReward, Magazine, Reserve, Pellets, BurstCount;
            public float Damage, Head, Pen, Falloff, Range, Rpm, Reload;
            public float BaseSpread, MoveSpread, JumpSpread, SpreadPerShot;
            public float RecoilV, RecoilH, Recovery, Speed;
            public FireMode Mode;
            public bool Scope;
            public float ScopeSpread, ScopeSpeed, ScopeFov;
        }

        private static Row Gun(string id, string name, WeaponCategory cat, WeaponTeam team,
            int price, int kill, float dmg, float head, float pen, float falloff, float range,
            int pellets, FireMode mode, float rpm, int mag, int reserve, float reload,
            float baseSpread, float moveSpread, float jumpSpread, float perShot,
            float recoilV, float recoilH, float recovery, float speed, string recoilId)
        {
            Row r = new Row();
            r.Id = id; r.Name = name; r.Category = cat; r.Team = team;
            r.Price = price; r.KillReward = kill;
            r.Damage = dmg; r.Head = head; r.Pen = pen; r.Falloff = falloff; r.Range = range;
            r.Pellets = pellets; r.Mode = mode; r.Rpm = rpm;
            r.Magazine = mag; r.Reserve = reserve; r.Reload = reload;
            r.BaseSpread = baseSpread; r.MoveSpread = moveSpread;
            r.JumpSpread = jumpSpread; r.SpreadPerShot = perShot;
            r.RecoilV = recoilV; r.RecoilH = recoilH; r.Recovery = recovery;
            r.Speed = speed; r.RecoilId = recoilId;
            r.BurstCount = 1;
            r.ScopeSpread = 1f; r.ScopeSpeed = 0.45f; r.ScopeFov = 40f;
            return r;
        }

        private static Row Scoped(Row r, float spreadFactor, float speedFactor, float fov)
        {
            r.Scope = true;
            r.ScopeSpread = spreadFactor;
            r.ScopeSpeed = speedFactor;
            r.ScopeFov = fov;
            return r;
        }

        private static Row Item(string id, string name, WeaponCategory cat, WeaponTeam team, int price)
        {
            Row r = new Row();
            r.Id = id; r.Name = name; r.Category = cat; r.Team = team; r.Price = price;
            r.KillReward = 300; r.Head = 1f; r.Pen = 0.5f; r.Falloff = 1f; r.Pellets = 1;
            r.Mode = FireMode.Single; r.Rpm = 60f; r.Speed = 1f; r.BurstCount = 1;
            r.ScopeSpread = 1f; r.ScopeSpeed = 1f; r.ScopeFov = 40f;
            return r;
        }

        // =====================================================================
        //  Le tableau d'équilibrage. Toute modification passe par ici.
        // =====================================================================
        private static Row[] BuildTable()
        {
            List<Row> t = new List<Row>();

            // --- corps à corps ------------------------------------------------
            t.Add(Gun("crochet", "Crochet", WeaponCategory.Melee, WeaponTeam.Both,
                0, 1500, 45f, 1.0f, 0.85f, 1f, 1.4f, 1, FireMode.Single, 150f, 0, 0, 0f,
                0f, 0f, 0f, 0f, 0f, 0f, 10f, 1.00f, null));

            // --- pistolets ----------------------------------------------------
            t.Add(Gun("vk9", "Voskov VK-9", WeaponCategory.Pistol, WeaponTeam.Attackers,
                0, 300, 29f, 4f, 0.47f, 0.99f, 60f, 1, FireMode.Single, 400f, 20, 120, 2.2f,
                0.45f, 5f, 12f, 0.50f, 1.3f, 0.7f, 14f, 1.00f, "pistolet"));
            t.Add(Gun("k7", "Kestrel K-7", WeaponCategory.Pistol, WeaponTeam.Defenders,
                0, 300, 34f, 4f, 0.50f, 0.91f, 60f, 1, FireMode.Single, 353f, 12, 24, 2.2f,
                0.38f, 5f, 12f, 0.50f, 1.4f, 0.6f, 14f, 1.00f, "pistolet"));
            t.Add(Gun("masse50", "Meridian Masse .50", WeaponCategory.Pistol, WeaponTeam.Both,
                700, 300, 62f, 4f, 0.93f, 0.81f, 70f, 1, FireMode.Single, 267f, 7, 35, 2.2f,
                0.50f, 9f, 14f, 1.40f, 4.2f, 1.6f, 9f, 0.98f, "pistolet"));
            Row salve = Gun("salve3", "Voskov Salve-3", WeaponCategory.Pistol, WeaponTeam.Both,
                350, 300, 26f, 4f, 0.65f, 0.94f, 60f, 1, FireMode.Burst, 600f, 18, 90, 2.0f,
                0.55f, 6f, 13f, 0.45f, 1.6f, 0.8f, 13f, 1.00f, "pistolet");
            salve.BurstCount = 3;
            t.Add(salve);
            t.Add(Gun("gemeaux", "Meridian Gémeaux", WeaponCategory.Pistol, WeaponTeam.Both,
                500, 300, 27f, 4f, 0.52f, 0.94f, 55f, 1, FireMode.Automatic, 500f, 30, 120, 3.4f,
                0.90f, 7f, 14f, 0.55f, 1.5f, 1.2f, 13f, 0.99f, "pistolet"));

            // --- fusils à pompe -----------------------------------------------
            t.Add(Gun("bourrasque", "Meridian Bourrasque", WeaponCategory.Shotgun, WeaponTeam.Both,
                1000, 900, 26f, 4f, 0.50f, 0.70f, 25f, 9, FireMode.Single, 68f, 8, 32, 3.2f,
                3.2f, 5f, 10f, 0.20f, 5.5f, 1.4f, 9f, 0.96f, "pompe"));
            t.Add(Gun("grele", "Kestrel Grêle SA", WeaponCategory.Shotgun, WeaponTeam.Both,
                2000, 900, 20f, 4f, 0.50f, 0.70f, 25f, 8, FireMode.Single, 171f, 7, 32, 3.4f,
                3.6f, 5f, 10f, 0.20f, 4.5f, 1.2f, 9f, 0.94f, "pompe"));

            // --- pistolets-mitrailleurs ---------------------------------------
            t.Add(Gun("guepe", "Voskov Guêpe", WeaponCategory.Smg, WeaponTeam.Attackers,
                1050, 600, 28f, 4f, 0.58f, 0.82f, 45f, 1, FireMode.Automatic, 857f, 30, 100, 2.3f,
                0.90f, 8f, 14f, 0.50f, 1.6f, 1.1f, 13f, 0.98f, "smg"));
            t.Add(Gun("onde9", "Kestrel Onde-9", WeaponCategory.Smg, WeaponTeam.Defenders,
                1250, 600, 26f, 4f, 0.60f, 0.84f, 45f, 1, FireMode.Automatic, 900f, 30, 120, 2.1f,
                0.80f, 7f, 13f, 0.45f, 1.4f, 1.0f, 14f, 0.99f, "smg"));
            t.Add(Gun("ruche", "Meridian Ruche", WeaponCategory.Smg, WeaponTeam.Both,
                1200, 600, 24f, 4f, 0.62f, 0.81f, 45f, 1, FireMode.Automatic, 857f, 50, 100, 3.3f,
                0.75f, 7f, 13f, 0.42f, 1.3f, 0.9f, 14f, 0.97f, "smg"));

            // --- fusils d'assaut ----------------------------------------------
            t.Add(Gun("brulot", "Voskov Brûlot", WeaponCategory.Rifle, WeaponTeam.Attackers,
                1800, 300, 30f, 4f, 0.78f, 0.98f, 90f, 1, FireMode.Automatic, 667f, 35, 90, 3.0f,
                0.42f, 12f, 17f, 0.60f, 2.0f, 1.1f, 11f, 0.94f, "fusil"));
            t.Add(Gun("clairon", "Kestrel Clairon", WeaponCategory.Rifle, WeaponTeam.Defenders,
                2050, 300, 30f, 4f, 0.70f, 0.97f, 90f, 1, FireMode.Automatic, 667f, 25, 90, 3.3f,
                0.40f, 12f, 17f, 0.58f, 2.0f, 1.0f, 11f, 0.94f, "fusil"));
            t.Add(Gun("faucheur", "Voskov Faucheur", WeaponCategory.Rifle, WeaponTeam.Attackers,
                2700, 300, 36f, 4f, 0.78f, 0.98f, 100f, 1, FireMode.Automatic, 600f, 30, 90, 2.4f,
                0.28f, 13f, 18f, 0.62f, 2.35f, 1.35f, 10f, 0.93f, "fusil"));
            t.Add(Gun("arbitre", "Kestrel Arbitre", WeaponCategory.Rifle, WeaponTeam.Defenders,
                3100, 300, 33f, 4f, 0.70f, 0.97f, 100f, 1, FireMode.Automatic, 667f, 30, 90, 3.1f,
                0.26f, 12f, 17f, 0.55f, 1.95f, 1.05f, 11f, 0.93f, "fusil"));
            t.Add(Scoped(Gun("scrutateur", "Meridian Scrutateur 2×", WeaponCategory.Rifle,
                WeaponTeam.Both, 2750, 300, 38f, 4f, 0.80f, 0.99f, 120f, 1, FireMode.Automatic,
                500f, 20, 60, 3.0f, 0.22f, 14f, 19f, 0.70f, 2.4f, 0.9f, 10f, 0.92f, "fusil"),
                0.28f, 0.60f, 55f));

            // --- fusils de précision ------------------------------------------
            t.Add(Scoped(Gun("echarde", "Kestrel Écharde", WeaponCategory.Sniper, WeaponTeam.Both,
                1700, 300, 88f, 3f, 0.85f, 0.98f, 200f, 1, FireMode.Single, 48f, 10, 90, 3.6f,
                0.14f, 22f, 30f, 2.0f, 4.0f, 0.5f, 8f, 0.92f, "sniper"),
                0.10f, 0.60f, 30f));
            t.Add(Scoped(Gun("monolithe", "Voskov Monolithe", WeaponCategory.Sniper, WeaponTeam.Both,
                4750, 100, 115f, 2.5f, 0.97f, 0.99f, 250f, 1, FireMode.Single, 41f, 10, 30, 3.7f,
                0.10f, 26f, 34f, 2.5f, 5.5f, 0.4f, 7f, 0.84f, "sniper"),
                0.06f, 0.40f, 20f));
            t.Add(Scoped(Gun("verdict", "Meridian Verdict", WeaponCategory.Sniper, WeaponTeam.Both,
                5000, 300, 80f, 3f, 0.82f, 0.98f, 220f, 1, FireMode.Single, 150f, 20, 90, 3.9f,
                0.16f, 24f, 32f, 1.60f, 3.6f, 0.6f, 8f, 0.88f, "sniper"),
                0.09f, 0.50f, 30f));

            // --- mitrailleuse -------------------------------------------------
            t.Add(Gun("broyeur", "Voskov Broyeur", WeaponCategory.MachineGun, WeaponTeam.Both,
                5700, 300, 35f, 4f, 0.58f, 0.98f, 100f, 1, FireMode.Automatic, 800f, 150, 0, 5.7f,
                0.55f, 16f, 22f, 0.30f, 2.2f, 1.3f, 10f, 0.84f, "mitrailleuse"));

            // --- grenades (comportement en Phase 7, prix dès la Phase 5) ------
            t.Add(Item("fragment", "Fragment", WeaponCategory.Grenade, WeaponTeam.Both, 300));
            t.Add(Item("eclair", "Éclair", WeaponCategory.Grenade, WeaponTeam.Both, 200));
            t.Add(Item("voile", "Voile", WeaponCategory.Grenade, WeaponTeam.Both, 300));
            t.Add(Item("braise", "Braise", WeaponCategory.Grenade, WeaponTeam.Both, 400));
            t.Add(Item("leurre", "Leurre", WeaponCategory.Grenade, WeaponTeam.Both, 50));

            // --- équipement ---------------------------------------------------
            t.Add(Item("gilet", "Gilet", WeaponCategory.Equipment, WeaponTeam.Both, 650));
            t.Add(Item("gilet_casque", "Gilet + Casque", WeaponCategory.Equipment, WeaponTeam.Both, 1000));
            t.Add(Item("kit", "Kit de désamorçage", WeaponCategory.Equipment, WeaponTeam.Defenders, 400));

            return t.ToArray();
        }

        // =====================================================================
        //  Motifs de recul
        // =====================================================================

        /// <summary>
        /// Motif des fusils d'assaut : montée franche sur 6 balles, puis un
        /// balayage droite → gauche → droite. C'est le motif « à apprendre ».
        /// x dans [-1, 1], y dans [0, 1].
        /// </summary>
        private static readonly Vector2[] RiflePoints =
        {
            new Vector2(0.00f, 0.35f), new Vector2(0.05f, 0.62f), new Vector2(-0.04f, 0.80f),
            new Vector2(0.10f, 0.90f), new Vector2(0.22f, 0.96f), new Vector2(0.38f, 1.00f),
            new Vector2(0.52f, 1.00f), new Vector2(0.62f, 0.98f), new Vector2(0.55f, 0.95f),
            new Vector2(0.30f, 0.92f), new Vector2(-0.05f, 0.90f), new Vector2(-0.38f, 0.88f),
            new Vector2(-0.62f, 0.86f), new Vector2(-0.72f, 0.85f), new Vector2(-0.60f, 0.84f),
            new Vector2(-0.34f, 0.83f), new Vector2(-0.02f, 0.82f), new Vector2(0.28f, 0.82f),
            new Vector2(0.52f, 0.81f), new Vector2(0.68f, 0.81f), new Vector2(0.60f, 0.80f),
            new Vector2(0.34f, 0.80f), new Vector2(0.04f, 0.80f), new Vector2(-0.26f, 0.79f),
            new Vector2(-0.50f, 0.79f), new Vector2(-0.66f, 0.78f), new Vector2(-0.54f, 0.78f),
            new Vector2(-0.26f, 0.78f), new Vector2(0.06f, 0.77f), new Vector2(0.34f, 0.77f)
        };

        /// <summary>Motif généré : montée douce et oscillation régulière.</summary>
        private static Vector2[] Oscillating(int count, float climbShots, float amplitude, float period)
        {
            Vector2[] points = new Vector2[count];
            for (int i = 0; i < count; i++)
            {
                float climb = Mathf.Min(1f, (i + 1) / climbShots);
                float side = Mathf.Sin(i / period * Mathf.PI * 2f) * amplitude;
                points[i] = new Vector2(side, climb);
            }
            return points;
        }

        private static Vector2[] MostlyVertical(int count, float climbShots, float jitter)
        {
            Vector2[] points = new Vector2[count];
            for (int i = 0; i < count; i++)
            {
                float climb = Mathf.Min(1f, (i + 1) / climbShots);
                // Alternance gauche/droite légère : lisible, pas aléatoire.
                float side = (i % 2 == 0 ? 1f : -1f) * jitter * climb;
                points[i] = new Vector2(side, climb);
            }
            return points;
        }

        // =====================================================================
        //  Génération
        // =====================================================================

        [MenuItem("Point de Rupture/Générer la bibliothèque d'armes")]
        public static void Generate()
        {
            EnsureFolder(DataRoot);
            EnsureFolder(WeaponFolder);
            EnsureFolder(RecoilFolder);

            Dictionary<string, RecoilPattern> patterns = new Dictionary<string, RecoilPattern>();
            patterns["fusil"] = WritePattern("fusil", RiflePoints);
            patterns["smg"] = WritePattern("smg", Oscillating(40, 8f, 0.55f, 9f));
            patterns["pistolet"] = WritePattern("pistolet", MostlyVertical(20, 5f, 0.22f));
            patterns["pompe"] = WritePattern("pompe", MostlyVertical(8, 3f, 0.18f));
            patterns["sniper"] = WritePattern("sniper", MostlyVertical(10, 2f, 0.10f));
            patterns["mitrailleuse"] = WritePattern("mitrailleuse", Oscillating(60, 12f, 0.70f, 14f));

            Row[] table = BuildTable();
            int created = 0;
            int updated = 0;

            for (int i = 0; i < table.Length; i++)
            {
                Row row = table[i];
                string path = $"{WeaponFolder}/Weapon_{row.Id}.asset";

                WeaponDefinition weapon = AssetDatabase.LoadAssetAtPath<WeaponDefinition>(path);
                bool isNew = weapon == null;
                if (isNew)
                {
                    weapon = ScriptableObject.CreateInstance<WeaponDefinition>();
                    AssetDatabase.CreateAsset(weapon, path);
                    created++;
                }
                else
                {
                    updated++;
                }

                Apply(weapon, row, patterns);
                EditorUtility.SetDirty(weapon);
            }

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            Debug.Log($"[Armes] Bibliothèque générée : {created} créée(s), {updated} mise(s) à jour, " +
                      $"{patterns.Count} motifs de recul. Dossier : {WeaponFolder}");
        }

        private static void Apply(WeaponDefinition weapon, Row row,
            Dictionary<string, RecoilPattern> patterns)
        {
            weapon.Id = row.Id;
            weapon.DisplayName = row.Name;
            weapon.Category = row.Category;
            weapon.AllowedTeam = row.Team;

            weapon.Price = row.Price;
            weapon.KillReward = row.KillReward;

            weapon.BaseDamage = row.Damage;
            weapon.HeadMultiplier = row.Head;
            weapon.ArmorPenetration = row.Pen;
            weapon.RangeFalloff = row.Falloff;
            weapon.MaxRange = row.Range;
            weapon.Pellets = row.Pellets;

            weapon.FireMode = row.Mode;
            weapon.RoundsPerMinute = row.Rpm;
            weapon.BurstCount = row.BurstCount;
            weapon.BurstInterval = 0.35f;

            weapon.MagazineSize = row.Magazine;
            weapon.ReserveAmmo = row.Reserve;
            weapon.ReloadTime = row.Reload;

            weapon.BaseSpread = row.BaseSpread;
            weapon.MoveSpread = row.MoveSpread;
            weapon.JumpSpread = row.JumpSpread;
            weapon.SpreadPerShot = row.SpreadPerShot;

            weapon.RecoilVertical = row.RecoilV;
            weapon.RecoilHorizontal = row.RecoilH;
            weapon.RecoilRecovery = row.Recovery;
            weapon.MoveSpeedFactor = row.Speed;

            weapon.HasScope = row.Scope;
            weapon.ScopedSpreadFactor = row.ScopeSpread;
            weapon.ScopedSpeedFactor = row.ScopeSpeed;
            weapon.ScopedFieldOfView = row.ScopeFov;

            RecoilPattern pattern;
            weapon.Recoil = row.RecoilId != null && patterns.TryGetValue(row.RecoilId, out pattern)
                ? pattern
                : null;
        }

        private static RecoilPattern WritePattern(string id, Vector2[] points)
        {
            string path = $"{RecoilFolder}/RecoilPattern_{id}.asset";

            RecoilPattern pattern = AssetDatabase.LoadAssetAtPath<RecoilPattern>(path);
            if (pattern == null)
            {
                pattern = ScriptableObject.CreateInstance<RecoilPattern>();
                AssetDatabase.CreateAsset(pattern, path);
            }

            pattern.Points = points;
            EditorUtility.SetDirty(pattern);
            return pattern;
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;

            int slash = path.LastIndexOf('/');
            string parent = path.Substring(0, slash);
            string leaf = path.Substring(slash + 1);
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, leaf);
        }
    }
}
#endif
