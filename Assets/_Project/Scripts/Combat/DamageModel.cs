using UnityEngine;

namespace PointDeRupture.Combat
{
    /// <summary>Tout ce qu'il faut pour chiffrer un impact.</summary>
    public struct DamageQuery
    {
        /// <summary>Dégâts torse à bout portant, sans armure.</summary>
        public float BaseDamage;

        /// <summary>Multiplicateur de tête propre à l'arme (2,5 à 4).</summary>
        public float HeadMultiplier;

        /// <summary>Part des dégâts qui traverse le gilet, dans [0, 1].</summary>
        public float ArmorPenetration;

        /// <summary>Facteur de perte appliqué tous les <see cref="DamageModel.FalloffStep"/> mètres.</summary>
        public float RangeFalloff;

        /// <summary>Distance parcourue par la balle, en mètres.</summary>
        public float Distance;

        public DamageZone Zone;

        /// <summary>Armure restante de la victime, 0 à 100.</summary>
        public int Armor;

        public bool Helmet;
    }

    /// <summary>Ce que l'impact retire effectivement.</summary>
    public struct DamageResult
    {
        public int HealthLoss;
        public int ArmorLoss;
    }

    /// <summary>
    /// Calcul des dégâts : zone, perte à la distance, puis absorption par le
    /// gilet. C'est du C# pur, sans dépendance à Unity ni au réseau.
    ///
    /// Deux raisons à ce choix :
    /// - le host et le client doivent obtenir **exactement** le même chiffre ;
    /// - on peut vérifier l'équilibrage sans lancer le jeu (tableau de
    ///   « balles pour tuer » dans docs/04-phase-2.md).
    ///
    /// L'ordre des opérations compte et ne doit pas être réarrangé : zone,
    /// puis distance, puis armure. Inverser distance et armure changerait le
    /// nombre de balles nécessaires à longue portée.
    /// </summary>
    public static class DamageModel
    {
        /// <summary>Pas de la perte à la distance, en mètres.</summary>
        public const float FalloffStep = 12.7f;

        /// <summary>Part des dégâts bloqués que le gilet encaisse lui-même.</summary>
        private const float ArmorAbsorption = 0.5f;

        public const int MaxHealth = 100;
        public const int MaxArmor = 100;

        /// <summary>Multiplicateur de la zone touchée.</summary>
        public static float ZoneMultiplier(DamageZone zone, float headMultiplier)
        {
            switch (zone)
            {
                case DamageZone.Head: return headMultiplier;
                case DamageZone.Stomach: return 1.25f;
                case DamageZone.Legs: return 0.75f;
                default: return 1f; // torse et bras
            }
        }

        /// <summary>
        /// Le casque ne protège que la tête ; le gilet protège tout le reste.
        /// Une tête sans casque ignore complètement l'armure.
        /// </summary>
        public static bool ArmorCovers(DamageZone zone, int armor, bool helmet)
        {
            if (armor <= 0) return false;
            return zone != DamageZone.Head || helmet;
        }

        public static DamageResult Resolve(DamageQuery query)
        {
            DamageResult result = new DamageResult();

            // 1. Zone.
            float damage = query.BaseDamage * ZoneMultiplier(query.Zone, query.HeadMultiplier);

            // 2. Perte à la distance : facteur^(distance / pas).
            if (query.RangeFalloff > 0f && query.RangeFalloff < 1f && query.Distance > 0f)
                damage *= Mathf.Pow(query.RangeFalloff, query.Distance / FalloffStep);

            // 3. Armure.
            if (ArmorCovers(query.Zone, query.Armor, query.Helmet) && query.ArmorPenetration < 1f)
            {
                float through = damage * query.ArmorPenetration;
                float absorbed = (damage - through) * ArmorAbsorption;

                if (absorbed > query.Armor)
                {
                    // Le gilet cède : il ne bloque que ce qu'il pouvait encore
                    // encaisser, le reste passe.
                    absorbed = query.Armor;
                    through = damage - absorbed / ArmorAbsorption;
                }

                result.ArmorLoss = Mathf.Min(query.Armor, Mathf.CeilToInt(absorbed));
                damage = through;
            }

            // Un impact enlève toujours au moins 1 point : sinon une balle
            // touchée dans la jambe à 200 m ne ferait littéralement rien, ce qui
            // se lit comme un bug côté joueur.
            result.HealthLoss = Mathf.Max(1, Mathf.RoundToInt(damage));
            return result;
        }

        /// <summary>
        /// Nombre de balles nécessaires pour tuer. Sert au tableau
        /// d'équilibrage et aux tests, pas au jeu.
        /// </summary>
        public static int ShotsToKill(DamageQuery query, int health = MaxHealth)
        {
            int remainingHealth = health;
            int remainingArmor = query.Armor;
            int shots = 0;

            while (remainingHealth > 0 && shots < 100)
            {
                DamageQuery shot = query;
                shot.Armor = remainingArmor;
                DamageResult result = Resolve(shot);

                remainingHealth -= result.HealthLoss;
                remainingArmor -= result.ArmorLoss;
                if (remainingArmor < 0) remainingArmor = 0;
                shots++;
            }

            return shots;
        }
    }
}
