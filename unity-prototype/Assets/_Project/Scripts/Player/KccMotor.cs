// =============================================================================
//  Moteur basé sur l'addon Simple KCC de Fusion.
//
//  DÉSACTIVÉ PAR DÉFAUT : ce fichier n'est compilé que si le symbole
//  PDR_SIMPLE_KCC est défini dans
//      Project Settings → Player → Other Settings → Scripting Define Symbols
//
//  Pourquoi cette précaution : l'API exacte de SimpleKCC (nom des méthodes,
//  signature de Move) varie selon la version de l'addon. Sans le garde, une
//  différence de signature empêcherait TOUT le projet de compiler et bloquerait
//  la Phase 1. Avec le garde, la Phase 1 tourne sur CharacterMotor et on bascule
//  ici quand on veut, en corrigeant au besoin les 4 appels marqués « API KCC ».
//
//  Quand l'activer : dès qu'on veut un rollback parfaitement propre, typiquement
//  quand on commencera à voir des micro-corrections de position sur les pentes.
//
//  Marche à suivre :
//   1. Importer l'addon (docs/02-phase-0.md, étape 8).
//   2. Ajouter PDR_SIMPLE_KCC aux Scripting Define Symbols.
//   3. Sur le prefab Player : retirer CharacterController + CharacterMotor +
//      NetworkTransform, ajouter SimpleKCC + KccMotor.
//      (SimpleKCC synchronise déjà la position : garder NetworkTransform en plus
//       ferait se battre les deux composants.)
//   4. Compiler. Si une signature diffère, les 4 appels à corriger sont
//      annotés « API KCC » ci-dessous.
// =============================================================================

#if PDR_SIMPLE_KCC

using Fusion.Addons.SimpleKCC;
using PointDeRupture.Data;
using UnityEngine;

namespace PointDeRupture.Player
{
    /// <summary>
    /// Même physique que <see cref="CharacterMotor"/> — le solveur est partagé —
    /// mais la capsule est déplacée par le Simple KCC de Fusion, conçu pour être
    /// déterministe sous resimulation.
    /// </summary>
    [RequireComponent(typeof(SimpleKCC))]
    public class KccMotor : MonoBehaviour, ICharacterMotor
    {
        private SimpleKCC _kcc;
        private MovementProfile _profile;
        private MovementTuning _tuning;

        public void Initialise(MovementProfile profile)
        {
            _profile = profile;
            _tuning = profile.ToTuning();

            _kcc = GetComponent<SimpleKCC>();

            // API KCC (1/4) : gabarit de la capsule.
            _kcc.SetHeight(profile.StandHeight);
            _kcc.SetRadius(profile.Radius);
        }

        public MotorState Step(MotorState state, MotorInput input, float deltaTime)
        {
            if (_profile == null || deltaTime <= 0f) return state;

            // 1. Posture.
            bool wantsCrouch = input.Crouch;
            state.CrouchBlend = Mathf.MoveTowards(state.CrouchBlend, wantsCrouch ? 1f : 0f,
                _profile.CrouchSpeed * deltaTime);

            // API KCC (2/4) : hauteur courante de la capsule.
            _kcc.SetHeight(_profile.HeightFor(state.CrouchBlend));

            // 2. Direction et vitesse souhaitées.
            Vector3 wishDirection = WishDirection(input);
            float wishSpeed = _profile.WishSpeed(state.CrouchBlend, input.Walk,
                                  input.WeaponSpeedFactor <= 0f ? 1f : input.WeaponSpeedFactor)
                              * Mathf.Clamp01(input.Move.magnitude);

            // 3. Physique : exactement le même solveur que l'autre moteur.
            bool jumped;
            state.Velocity = MoveSolver.Step(state.Velocity, wishDirection, wishSpeed,
                state.IsGrounded, input.Jump, _tuning, deltaTime, out jumped);

            // 4. Déplacement. Le KCC applique sa propre gravité si on la lui
            //    laisse : on la neutralise pour garder la nôtre, qui est celle
            //    que le solveur a déjà intégrée.
            // API KCC (3/4) : déplacement par vitesse cinématique.
            _kcc.Move(state.Velocity);

            // 5. Retour du KCC : il a résolu les collisions, donc sa vitesse
            //    réelle peut différer de celle demandée (mur, pente). On la
            //    reprend, sinon on accumulerait de la vitesse contre un mur.
            // API KCC (4/4) : état après résolution.
            state.Velocity = _kcc.RealVelocity;
            state.IsGrounded = !jumped && _kcc.IsGrounded;

            return state;
        }

        public void Teleport(Vector3 position)
        {
            _kcc.SetPosition(position);
        }

        private static Vector3 WishDirection(MotorInput input)
        {
            Vector3 local = new Vector3(input.Move.x, 0f, input.Move.y);
            if (local.sqrMagnitude < 0.0001f) return Vector3.zero;
            return (Quaternion.Euler(0f, input.YawDegrees, 0f) * local).normalized;
        }
    }
}

#endif
