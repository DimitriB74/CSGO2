using UnityEngine;

namespace PointDeRupture.Player
{
    /// <summary>
    /// Réglages de physique de déplacement, recopiés depuis le
    /// <see cref="PointDeRupture.Data.MovementProfile"/> au moment du Spawn.
    ///
    /// C'est une struct sans référence à un asset : le solveur reste ainsi
    /// testable en dehors d'Unity et déterministe sous le rollback de Fusion.
    /// </summary>
    public struct MovementTuning
    {
        /// <summary>Accélération au sol (sans unité, façon Quake/Source).</summary>
        public float Accelerate;

        /// <summary>Accélération en l'air. C'est elle qui autorise l'air-strafe.</summary>
        public float AirAccelerate;

        /// <summary>Friction au sol. Plus haut = arrêt plus sec.</summary>
        public float Friction;

        /// <summary>Vitesse plancher utilisée par la friction, évite de glisser à l'infini.</summary>
        public float StopSpeed;

        /// <summary>Plafond de vitesse souhaitée pris en compte en l'air (m/s).</summary>
        public float AirSpeedCap;

        /// <summary>Gravité, en m/s².</summary>
        public float Gravity;

        /// <summary>Vitesse verticale donnée par un saut, en m/s.</summary>
        public float JumpImpulse;

        /// <summary>Petite vitesse descendante appliquée au sol pour rester collé.</summary>
        public float GroundStickSpeed;
    }

    /// <summary>
    /// Physique de déplacement façon Quake/Source : friction au sol,
    /// accélération plafonnée, et accélération en l'air volontairement faible
    /// mais non nulle.
    ///
    /// Deux propriétés découlent de ce modèle, et ce sont exactement celles que
    /// l'on veut pour un FPS tactique :
    ///
    /// - le **counter-strafe** : appuyer sur la direction opposée annule la
    ///   vitesse en ~0,15 s, bien plus vite que la friction seule ;
    /// - l'**air-strafe** : en l'air, orienter la vue pendant qu'on pousse sur
    ///   le côté ajoute de la vitesse, parce que le plafond ne s'applique qu'à
    ///   la projection de la vitesse sur la direction souhaitée.
    ///
    /// Classe volontairement statique et sans état : elle prend une vitesse,
    /// rend une vitesse. Aucun accès à Time, à un composant ou à une scène, donc
    /// rejouable à l'identique quand Fusion resimule un tick.
    /// </summary>
    public static class MoveSolver
    {
        /// <summary>
        /// Calcule la nouvelle vitesse pour un pas de simulation.
        /// </summary>
        /// <param name="velocity">Vitesse actuelle, en m/s (monde).</param>
        /// <param name="wishDirection">
        /// Direction souhaitée, horizontale et normalisée (ou nulle si le joueur
        /// ne pousse sur rien).
        /// </param>
        /// <param name="wishSpeed">Vitesse visée, en m/s (dépend de l'arme et de la posture).</param>
        /// <param name="isGrounded">Le personnage touche-t-il le sol au début du pas ?</param>
        /// <param name="jumpRequested">Le joueur demande-t-il un saut à ce tick ?</param>
        /// <param name="tuning">Réglages de physique.</param>
        /// <param name="deltaTime">Durée du pas de simulation (1/64 s en jeu).</param>
        /// <param name="jumped">Vrai si un saut a effectivement été déclenché.</param>
        public static Vector3 Step(Vector3 velocity, Vector3 wishDirection, float wishSpeed,
            bool isGrounded, bool jumpRequested, MovementTuning tuning, float deltaTime,
            out bool jumped)
        {
            jumped = false;
            if (deltaTime <= 0f) return velocity;

            if (isGrounded)
            {
                // La friction s'applique AVANT l'accélération : c'est cet ordre
                // qui donne le freinage net du counter-strafe.
                velocity = ApplyFriction(velocity, tuning, deltaTime);

                if (jumpRequested)
                {
                    velocity.y = tuning.JumpImpulse;
                    jumped = true;
                    isGrounded = false;
                }
                else
                {
                    velocity = Accelerate(velocity, wishDirection, wishSpeed,
                        tuning.Accelerate * wishSpeed, deltaTime);

                    // On reste collé au sol : sans ça, le personnage décolle sur
                    // la moindre bosse et perd son état "au sol".
                    velocity.y = -tuning.GroundStickSpeed;
                }
            }

            if (!isGrounded)
            {
                velocity = AirAccelerate(velocity, wishDirection, wishSpeed, tuning, deltaTime);
                velocity.y -= tuning.Gravity * deltaTime;
            }

            return velocity;
        }

        /// <summary>
        /// Friction au sol. En dessous de <see cref="MovementTuning.StopSpeed"/>,
        /// on freine comme si on était à StopSpeed, ce qui garantit un arrêt
        /// franc au lieu d'une décroissance exponentielle interminable.
        /// </summary>
        private static Vector3 ApplyFriction(Vector3 velocity, MovementTuning tuning, float deltaTime)
        {
            Vector3 horizontal = new Vector3(velocity.x, 0f, velocity.z);
            float speed = horizontal.magnitude;

            if (speed < 0.01f)
            {
                velocity.x = 0f;
                velocity.z = 0f;
                return velocity;
            }

            float control = speed < tuning.StopSpeed ? tuning.StopSpeed : speed;
            float drop = control * tuning.Friction * deltaTime;
            float scale = Mathf.Max(0f, speed - drop) / speed;

            velocity.x *= scale;
            velocity.z *= scale;
            return velocity;
        }

        /// <summary>
        /// Accélération plafonnée : on n'ajoute de la vitesse que jusqu'à ce que
        /// la projection de la vitesse sur la direction souhaitée atteigne
        /// <paramref name="wishSpeed"/>.
        ///
        /// Conséquence : courir tout droit plafonne à wishSpeed, mais si la
        /// vitesse actuelle pointe ailleurs, la projection est faible (voire
        /// négative) et l'accélération repart à plein. C'est toute la mécanique
        /// du counter-strafe et du strafe-jump.
        /// </summary>
        private static Vector3 Accelerate(Vector3 velocity, Vector3 wishDirection, float wishSpeed,
            float accelerationPerSecond, float deltaTime)
        {
            if (wishSpeed <= 0f) return velocity;

            float projected = Vector3.Dot(velocity, wishDirection);
            float missing = wishSpeed - projected;
            if (missing <= 0f) return velocity;

            float step = Mathf.Min(accelerationPerSecond * deltaTime, missing);
            return velocity + wishDirection * step;
        }

        /// <summary>
        /// Accélération en l'air. La subtilité — et c'est elle qui rend
        /// l'air-strafe possible — est que le plafond
        /// (<see cref="MovementTuning.AirSpeedCap"/>) ne limite que la *cible*,
        /// pas la force de l'accélération, qui reste proportionnelle à la
        /// vitesse souhaitée complète.
        /// </summary>
        private static Vector3 AirAccelerate(Vector3 velocity, Vector3 wishDirection, float wishSpeed,
            MovementTuning tuning, float deltaTime)
        {
            if (wishSpeed <= 0f) return velocity;

            float cappedTarget = Mathf.Min(wishSpeed, tuning.AirSpeedCap);
            float projected = Vector3.Dot(velocity, wishDirection);
            float missing = cappedTarget - projected;
            if (missing <= 0f) return velocity;

            float step = Mathf.Min(tuning.AirAccelerate * wishSpeed * deltaTime, missing);
            return velocity + wishDirection * step;
        }

        /// <summary>Vitesse horizontale, en m/s. Pratique pour le HUD et la précision.</summary>
        public static float HorizontalSpeed(Vector3 velocity)
        {
            return new Vector3(velocity.x, 0f, velocity.z).magnitude;
        }
    }
}
