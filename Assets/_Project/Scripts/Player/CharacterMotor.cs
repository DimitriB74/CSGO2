using PointDeRupture.Core;
using PointDeRupture.Data;
using UnityEngine;

namespace PointDeRupture.Player
{
    /// <summary>
    /// Implémentation du moteur au-dessus du <see cref="CharacterController"/>
    /// d'Unity.
    ///
    /// Choix assumé pour la Phase 1 : c'est un composant standard, sans
    /// dépendance à un addon, donc on est certain que la phase compile et tourne.
    /// Son défaut est qu'il n'est pas parfaitement déterministe sous rollback —
    /// en pratique on observe au pire de micro-corrections sur les pentes. On
    /// passera au Simple KCC quand on voudra gommer ça (voir KccMotor.cs).
    ///
    /// Toute la sensation de déplacement vient de <see cref="MoveSolver"/> :
    /// ce composant ne fait que *déplacer la capsule et glisser* le long des murs.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public class CharacterMotor : MonoBehaviour, ICharacterMotor
    {
        private CharacterController _controller;
        private MovementProfile _profile;
        private MovementTuning _tuning;

        // Normales des murs touchés pendant le dernier Move(), collectées par le
        // message OnControllerColliderHit qu'Unity envoie *pendant* l'appel.
        private Vector3 _lastWallNormal;
        private bool _hitWall;

        public void Initialise(MovementProfile profile)
        {
            _profile = profile;
            _tuning = profile.ToTuning();

            _controller = GetComponent<CharacterController>();
            _controller.radius = profile.Radius;
            _controller.slopeLimit = profile.SlopeLimit;
            _controller.stepOffset = profile.StepOffset;
            _controller.skinWidth = 0.02f;
            _controller.minMoveDistance = 0f;
            ApplyHeight(0f);
        }

        public MotorState Step(MotorState state, MotorInput input, float deltaTime)
        {
            if (_profile == null || deltaTime <= 0f) return state;

            // 1. Posture. On ne se relève pas s'il y a un plafond au-dessus.
            bool wantsCrouch = input.Crouch || !HasHeadroom(state.CrouchBlend);
            state.CrouchBlend = Mathf.MoveTowards(state.CrouchBlend, wantsCrouch ? 1f : 0f,
                _profile.CrouchSpeed * deltaTime);
            ApplyHeight(state.CrouchBlend);

            // 2. Direction et vitesse souhaitées, dans le repère du regard.
            Vector3 wishDirection = WishDirection(input);
            float wishSpeed = _profile.WishSpeed(state.CrouchBlend, input.Walk,
                                  input.WeaponSpeedFactor <= 0f ? 1f : input.WeaponSpeedFactor)
                              * Mathf.Clamp01(input.Move.magnitude);

            // 3. Physique. Le saut accroupi est autorisé (on n'exige pas d'être
            //    debout), conformément au cahier des charges.
            bool jumped;
            state.Velocity = MoveSolver.Step(state.Velocity, wishDirection, wishSpeed,
                state.IsGrounded, input.Jump, _tuning, deltaTime, out jumped);
            if (jumped) state.IsGrounded = false;

            // 4. Déplacement réel. OnControllerColliderHit peut se déclencher ici.
            _hitWall = false;
            bool wasGrounded = state.IsGrounded;
            _controller.Move(state.Velocity * deltaTime);

            // 5. On retire la composante de vitesse qui rentrait dans le mur,
            //    sinon on continue d'accumuler de la vitesse contre un obstacle
            //    et on décolle dès qu'on s'en écarte.
            if (_hitWall)
            {
                float into = Vector3.Dot(state.Velocity, _lastWallNormal);
                if (into < 0f) state.Velocity -= _lastWallNormal * into;
            }

            // 6. Contact sol. isGrounded seul est capricieux en descente : on
            //    complète par une sonde sphérique.
            state.IsGrounded = !jumped && (_controller.isGrounded || GroundProbe(state.Velocity));
            if (state.IsGrounded && !wasGrounded && state.Velocity.y < 0f)
            {
                // Atterrissage. La vitesse verticale sera réinitialisée au pas
                // suivant par GroundStickSpeed ; on la garde ici pour que les
                // dégâts de chute (Phase 2) puissent la lire.
                state.Velocity.y = Mathf.Max(state.Velocity.y, -_tuning.GroundStickSpeed);
            }

            return state;
        }

        public void Teleport(Vector3 position)
        {
            // On désactive le contrôleur le temps du déplacement, sinon il résout
            // une collision depuis l'ancienne position et « glisse » à l'arrivée.
            bool wasEnabled = _controller.enabled;
            _controller.enabled = false;
            transform.position = position;
            _controller.enabled = wasEnabled;
        }

        /// <summary>Direction horizontale souhaitée, tournée selon le regard.</summary>
        private static Vector3 WishDirection(MotorInput input)
        {
            Vector3 local = new Vector3(input.Move.x, 0f, input.Move.y);
            if (local.sqrMagnitude < 0.0001f) return Vector3.zero;

            Vector3 world = Quaternion.Euler(0f, input.YawDegrees, 0f) * local;
            return world.normalized;
        }

        private void ApplyHeight(float crouchBlend)
        {
            float height = _profile.HeightFor(crouchBlend);
            _controller.height = height;
            _controller.center = new Vector3(0f, height * 0.5f, 0f);
        }

        /// <summary>Y a-t-il la place de se relever ?</summary>
        private bool HasHeadroom(float crouchBlend)
        {
            if (crouchBlend <= 0.001f) return true;

            Vector3 origin = transform.position + Vector3.up * (_profile.CrouchHeight - _profile.Radius);
            float distance = _profile.StandHeight - _profile.CrouchHeight + 0.02f;

            RaycastHit hit;
            return !Physics.SphereCast(origin, _profile.Radius * 0.95f, Vector3.up, out hit, distance,
                Layers.GroundMask, QueryTriggerInteraction.Ignore);
        }

        private bool GroundProbe(Vector3 velocity)
        {
            if (velocity.y > 0.1f) return false;

            Vector3 origin = transform.position + Vector3.up * (_profile.Radius + 0.05f);
            RaycastHit hit;
            return Physics.SphereCast(origin, _profile.Radius * 0.9f, Vector3.down, out hit, 0.14f,
                Layers.GroundMask, QueryTriggerInteraction.Ignore);
        }

        private void OnControllerColliderHit(ControllerColliderHit hit)
        {
            // On ignore les surfaces praticables : seuls les murs et les pentes
            // trop raides doivent rogner la vitesse.
            if (hit.normal.y > 0.7f) return;
            _lastWallNormal = hit.normal;
            _hitWall = true;
        }
    }
}
