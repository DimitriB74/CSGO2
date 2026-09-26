using PointDeRupture.Data;
using UnityEngine;

namespace PointDeRupture.Player
{
    /// <summary>
    /// Intention de déplacement pour un pas de simulation. Reconstruite chaque
    /// tick depuis <see cref="PointDeRupture.Networking.NetInput"/>.
    /// </summary>
    public struct MotorInput
    {
        /// <summary>Axes de déplacement : x = droite, y = avant. Dans [-1, 1].</summary>
        public Vector2 Move;

        /// <summary>Orientation horizontale du regard, en degrés.</summary>
        public float YawDegrees;

        public bool Jump;
        public bool Crouch;

        /// <summary>Marche silencieuse (Shift).</summary>
        public bool Walk;

        /// <summary>Facteur de vitesse de l'arme tenue. 1 = arme la plus légère.</summary>
        public float WeaponSpeedFactor;
    }

    /// <summary>
    /// État physique complet du personnage.
    ///
    /// **Point réseau important** : cet état est stocké en <c>[Networked]</c> sur
    /// le <see cref="PlayerAgent"/>, pas dans un champ privé du moteur. Quand
    /// Fusion resimule des ticks (rollback après correction du host), il restaure
    /// l'état réseau puis rejoue les pas : si la vitesse vivait dans un champ
    /// ordinaire, elle ne serait pas restaurée et le personnage désynchroniserait.
    ///
    /// C'est pour cette raison que le moteur est une fonction
    /// <c>(état, intention) → état</c> et non un objet qui garde sa vitesse.
    /// </summary>
    public struct MotorState
    {
        /// <summary>Vitesse en m/s, repère monde.</summary>
        public Vector3 Velocity;

        /// <summary>Transition debout ↔ accroupi. 0 = debout, 1 = accroupi.</summary>
        public float CrouchBlend;

        /// <summary>Le personnage touchait-il le sol à la fin du pas ?</summary>
        public bool IsGrounded;
    }

    /// <summary>
    /// Abstraction du contrôleur de personnage.
    ///
    /// Deux implémentations :
    /// - <see cref="CharacterMotor"/> : CharacterController d'Unity. Utilisé en
    ///   Phase 1 parce qu'il fonctionne à coup sûr, sans dépendance externe.
    /// - <c>KccMotor</c> : addon Simple KCC de Fusion, à activer quand on veut le
    ///   rollback parfaitement propre (voir KccMotor.cs).
    ///
    /// Les deux partagent le même <see cref="MoveSolver"/> : la sensation de jeu
    /// est identique, seule la résolution des collisions change.
    /// </summary>
    public interface ICharacterMotor
    {
        /// <summary>Appelé une fois au Spawn, avant tout appel à <see cref="Step"/>.</summary>
        void Initialise(MovementProfile profile);

        /// <summary>
        /// Avance la simulation d'un pas : calcule la nouvelle vitesse puis
        /// déplace réellement la capsule en résolvant les collisions.
        /// </summary>
        MotorState Step(MotorState state, MotorInput input, float deltaTime);

        /// <summary>Repositionne sans interpolation (apparition, début de round).</summary>
        void Teleport(Vector3 position);
    }
}
