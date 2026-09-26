using UnityEngine;

namespace PointDeRupture.Data
{
    public enum WeaponCategory
    {
        Melee,
        Pistol,
        Shotgun,
        Smg,
        Rifle,
        Sniper,
        MachineGun,
        Grenade,
        Equipment
    }

    public enum FireMode
    {
        /// <summary>Un coup par clic.</summary>
        Single,

        /// <summary>Tir continu tant que le bouton est maintenu.</summary>
        Automatic,

        /// <summary>Rafale de N coups par clic.</summary>
        Burst
    }

    public enum WeaponTeam
    {
        Both,
        Attackers,
        Defenders
    }

    /// <summary>
    /// Toutes les statistiques d'une arme, dans un asset.
    ///
    /// Aucune valeur d'équilibrage ne doit se retrouver en dur dans le code :
    /// on règle le jeu en modifiant ces assets, sans recompiler et sans
    /// redéployer aux joueurs. Le tableau de référence est dans
    /// docs/01-univers-et-armes.md, et les assets sont générés automatiquement
    /// depuis ce tableau (menu « Point de Rupture → Générer la bibliothèque
    /// d'armes »).
    /// </summary>
    [CreateAssetMenu(
        menuName = "Point de Rupture/Weapon Definition",
        fileName = "Weapon_New")]
    public class WeaponDefinition : ScriptableObject
    {
        [Header("Identité")]
        [Tooltip("Identifiant stable, utilisé par le réseau et les sauvegardes. " +
                 "Ne jamais le changer après la première partie publique.")]
        public string Id = "arme";

        public string DisplayName = "Arme";
        public WeaponCategory Category = WeaponCategory.Rifle;
        public WeaponTeam AllowedTeam = WeaponTeam.Both;

        [Header("Économie")]
        public int Price;

        [Tooltip("Argent gagné par élimination.")]
        public int KillReward = 300;

        [Header("Dégâts")]
        [Tooltip("Dégâts au torse, à bout portant, sans armure.")]
        public float BaseDamage = 30f;

        [Tooltip("Multiplicateur de la tête (2,5 à 4).")]
        public float HeadMultiplier = 4f;

        [Tooltip("Part des dégâts qui traverse le gilet. 1 = ignore l'armure.")]
        [Range(0f, 1f)] public float ArmorPenetration = 0.7f;

        [Tooltip("Facteur de perte de dégâts tous les 12,7 m. 1 = aucune perte.")]
        [Range(0.5f, 1f)] public float RangeFalloff = 0.98f;

        [Tooltip("Portée maximale de la balle, en mètres.")]
        public float MaxRange = 100f;

        [Tooltip("Nombre de projectiles par tir (pompes).")]
        public int Pellets = 1;

        [Header("Tir")]
        public FireMode FireMode = FireMode.Automatic;

        [Tooltip("Cadence en coups par minute.")]
        public float RoundsPerMinute = 600f;

        [Tooltip("Coups par rafale, pour FireMode.Burst.")]
        public int BurstCount = 3;

        [Tooltip("Délai entre deux rafales, en secondes.")]
        public float BurstInterval = 0.35f;

        [Header("Munitions")]
        public int MagazineSize = 30;
        public int ReserveAmmo = 90;
        public float ReloadTime = 2.5f;

        [Header("Précision (degrés)")]
        [Tooltip("Cône debout immobile.")]
        public float BaseSpread = 0.3f;

        [Tooltip("Pénalité à pleine course.")]
        public float MoveSpread = 12f;

        [Tooltip("Pénalité en l'air.")]
        public float JumpSpread = 17f;

        [Tooltip("Ouverture ajoutée par balle déjà tirée.")]
        public float SpreadPerShot = 0.55f;

        [Header("Recul")]
        public RecoilPattern Recoil;

        [Tooltip("Amplitude verticale du recul, en degrés par balle.")]
        public float RecoilVertical = 2f;

        [Tooltip("Amplitude horizontale du recul, en degrés par balle.")]
        public float RecoilHorizontal = 1f;

        [Tooltip("Vitesse de retour de la vue au repos.")]
        public float RecoilRecovery = 6f;

        [Header("Mobilité")]
        [Tooltip("Facteur de vitesse arme en main. 1 = arme la plus légère.")]
        [Range(0.5f, 1f)] public float MoveSpeedFactor = 0.94f;

        [Header("Lunette")]
        public bool HasScope;

        [Tooltip("Facteur appliqué au cône quand on est en lunette.")]
        [Range(0.01f, 1f)] public float ScopedSpreadFactor = 1f;

        [Tooltip("Facteur de vitesse en lunette.")]
        [Range(0.1f, 1f)] public float ScopedSpeedFactor = 0.45f;

        [Tooltip("Champ de vision en lunette, en degrés.")]
        public float ScopedFieldOfView = 40f;

        [Header("Présentation (Phase 11)")]
        public GameObject ViewModelPrefab;
        public GameObject WorldModelPrefab;

        /// <summary>Délai entre deux coups, en secondes.</summary>
        public float CycleTime
        {
            get { return RoundsPerMinute <= 0f ? 0.5f : 60f / RoundsPerMinute; }
        }

        /// <summary>Une arme qui tire des balles (ni couteau, ni grenade, ni équipement).</summary>
        public bool IsFirearm
        {
            get
            {
                return Category != WeaponCategory.Melee
                       && Category != WeaponCategory.Grenade
                       && Category != WeaponCategory.Equipment;
            }
        }

        public bool IsAvailableTo(WeaponTeam team)
        {
            return AllowedTeam == WeaponTeam.Both || AllowedTeam == team;
        }
    }
}
