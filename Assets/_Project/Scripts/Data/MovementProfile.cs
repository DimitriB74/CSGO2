using PointDeRupture.Player;
using UnityEngine;

namespace PointDeRupture.Data
{
    /// <summary>
    /// Tous les réglages de déplacement d'un personnage, dans un asset.
    ///
    /// Aucune de ces valeurs n'est écrite en dur dans le code : on équilibre en
    /// modifiant l'asset, sans recompiler. Les valeurs par défaut sont celles
    /// mesurées dans docs/03-phase-1.md (counter-strafe ≈ 0,11 s).
    ///
    /// Création : clic droit dans Assets/_Project/Data/ →
    /// Create → Point de Rupture → Movement Profile
    /// </summary>
    [CreateAssetMenu(
        menuName = "Point de Rupture/Movement Profile",
        fileName = "MovementProfile_Default")]
    public class MovementProfile : ScriptableObject
    {
        [Header("Vitesses")]
        [Tooltip("Vitesse de course de référence, en m/s (arme la plus légère).")]
        public float RunSpeed = 6.35f;

        [Tooltip("Facteur appliqué en marche silencieuse (Shift).")]
        [Range(0.2f, 1f)] public float WalkFactor = 0.52f;

        [Tooltip("Facteur appliqué accroupi.")]
        [Range(0.2f, 1f)] public float CrouchFactor = 0.34f;

        [Header("Physique (façon Quake/Source)")]
        [Tooltip("Accélération au sol. Plus haut = démarrage plus vif.")]
        public float Accelerate = 5.5f;

        [Tooltip("Accélération en l'air. C'est elle qui autorise l'air-strafe.")]
        public float AirAccelerate = 12f;

        [Tooltip("Friction au sol. Plus haut = arrêt plus sec.")]
        public float Friction = 5.2f;

        [Tooltip("Vitesse plancher de la friction, en m/s.")]
        public float StopSpeed = 1.9f;

        [Tooltip("Plafond de vitesse souhaitée pris en compte en l'air, en m/s.")]
        public float AirSpeedCap = 0.762f;

        [Tooltip("Gravité, en m/s².")]
        public float Gravity = 20.32f;

        [Tooltip("Impulsion verticale d'un saut, en m/s (≈1,38 m d'apogée).")]
        public float JumpImpulse = 7.64f;

        [Tooltip("Vitesse descendante appliquée au sol pour y rester collé.")]
        public float GroundStickSpeed = 2f;

        [Header("Gabarit de la capsule")]
        public float StandHeight = 1.85f;
        public float CrouchHeight = 1.35f;
        public float Radius = 0.4f;

        [Tooltip("Hauteur des yeux debout, en m.")]
        public float EyeHeightStand = 1.62f;

        [Tooltip("Hauteur des yeux accroupi, en m.")]
        public float EyeHeightCrouch = 1.15f;

        [Tooltip("Hauteur de marche franchissable sans sauter, en m.")]
        public float StepOffset = 0.46f;

        [Tooltip("Pente maximale gravissable, en degrés.")]
        public float SlopeLimit = 45f;

        [Tooltip("Vitesse de transition debout ↔ accroupi (1 / secondes).")]
        public float CrouchSpeed = 8f;

        [Header("Vue")]
        [Tooltip("Angle vertical minimum (regarder en haut), en degrés.")]
        public float MinPitch = -89f;

        [Tooltip("Angle vertical maximum (regarder en bas), en degrés.")]
        public float MaxPitch = 89f;

        /// <summary>Recopie les réglages de physique dans la struct du solveur.</summary>
        public MovementTuning ToTuning()
        {
            MovementTuning tuning = new MovementTuning();
            tuning.Accelerate = Accelerate;
            tuning.AirAccelerate = AirAccelerate;
            tuning.Friction = Friction;
            tuning.StopSpeed = StopSpeed;
            tuning.AirSpeedCap = AirSpeedCap;
            tuning.Gravity = Gravity;
            tuning.JumpImpulse = JumpImpulse;
            tuning.GroundStickSpeed = GroundStickSpeed;
            return tuning;
        }

        /// <summary>Hauteur de la capsule pour un mélange debout/accroupi donné.</summary>
        public float HeightFor(float crouchBlend)
        {
            return Mathf.Lerp(StandHeight, CrouchHeight, crouchBlend);
        }

        /// <summary>Hauteur des yeux pour un mélange debout/accroupi donné.</summary>
        public float EyeHeightFor(float crouchBlend)
        {
            return Mathf.Lerp(EyeHeightStand, EyeHeightCrouch, crouchBlend);
        }

        /// <summary>
        /// Vitesse visée selon la posture et l'arme tenue.
        /// </summary>
        /// <param name="crouchBlend">0 debout, 1 accroupi.</param>
        /// <param name="isWalking">Marche silencieuse demandée.</param>
        /// <param name="weaponFactor">Facteur de l'arme tenue (1 = la plus légère).</param>
        public float WishSpeed(float crouchBlend, bool isWalking, float weaponFactor)
        {
            float factor = weaponFactor;

            // Accroupi et marche silencieuse ne se cumulent pas : on garde le
            // plus contraignant des deux, comme dans les FPS tactiques.
            if (crouchBlend > 0.5f) factor *= CrouchFactor;
            else if (isWalking) factor *= WalkFactor;

            return RunSpeed * factor;
        }
    }
}
