using Fusion;
using PointDeRupture.Data;
using PointDeRupture.Networking;
using UnityEngine;

namespace PointDeRupture.Player
{
    /// <summary>
    /// Le personnage réseau. Un par joueur connecté.
    ///
    /// Répartition du travail, à garder en tête pour toutes les phases suivantes :
    ///
    /// - <see cref="FixedUpdateNetwork"/> : simulation. Tourne à 64 Hz, sur le
    ///   host **et** sur le client qui possède l'input (prédiction). Peut être
    ///   rejoué plusieurs fois pour le même tick quand le host corrige le client
    ///   (rollback) : tout ce qui influe sur le résultat doit donc vivre dans une
    ///   propriété <c>[Networked]</c>, jamais dans un champ ordinaire.
    ///
    /// - <see cref="Render"/> : affichage. Tourne à la fréquence de l'écran, sur
    ///   tous les postes. Aucune décision de jeu ici, uniquement du visuel.
    ///
    /// Les joueurs distants (« proxies ») n'exécutent pas la simulation : leur
    /// position arrive interpolée par le NetworkTransform.
    /// </summary>
    [RequireComponent(typeof(NetworkObject))]
    public class PlayerAgent : NetworkBehaviour
    {
        [Header("Données")]
        [Tooltip("Profil de déplacement. Asset créé en Phase 1.")]
        [SerializeField] private MovementProfile _movementProfile;

        [Header("Références du prefab")]
        [Tooltip("Composant qui déplace la capsule (CharacterMotor ou KccMotor).")]
        [SerializeField] private MonoBehaviour _motorComponent;

        [SerializeField] private PlayerCameraRig _cameraRig;

        [Tooltip("Modèle visible par les autres joueurs. Masqué pour soi-même.")]
        [SerializeField] private GameObject _thirdPersonVisual;

        // ---- état réseau ----------------------------------------------------
        // Tout ce qui est ci-dessous est restauré par Fusion avant une
        // resimulation. C'est ce qui rend la prédiction correcte.

        /// <summary>Orientation horizontale du regard, en degrés.</summary>
        [Networked] public float Yaw { get; set; }

        /// <summary>Orientation verticale du regard, en degrés. Négatif = vers le haut.</summary>
        [Networked] public float Pitch { get; set; }

        /// <summary>Vitesse courante, en m/s.</summary>
        [Networked] public Vector3 Velocity { get; set; }

        /// <summary>Transition debout ↔ accroupi. 0 = debout, 1 = accroupi.</summary>
        [Networked] public float CrouchBlend { get; set; }

        /// <summary>Contact au sol à la fin du dernier tick.</summary>
        [Networked] public NetworkBool IsGrounded { get; set; }

        /// <summary>
        /// Boutons du tick précédent. En réseau aussi : c'est indispensable pour
        /// détecter une pression (et non un maintien) de façon fiable après un
        /// rollback. Sans ça, un saut pourrait être déclenché deux fois.
        /// </summary>
        [Networked] public NetworkButtons PreviousButtons { get; set; }

        private ICharacterMotor _motor;

        /// <summary>
        /// Le personnage du joueur local, ou null avant son apparition.
        /// Le HUD et l'overlay de debug s'en servent pour éviter de parcourir la
        /// scène à chaque image.
        /// </summary>
        public static PlayerAgent Local { get; private set; }

        /// <summary>Vitesse horizontale, en m/s. Lue par le HUD et la précision du tir.</summary>
        public float HorizontalSpeed
        {
            get { return MoveSolver.HorizontalSpeed(Velocity); }
        }

        /// <summary>Position des yeux : origine des tirs et de la caméra.</summary>
        public Vector3 EyePosition
        {
            get { return transform.position + Vector3.up * _movementProfile.EyeHeightFor(CrouchBlend); }
        }

        /// <summary>Direction du regard.</summary>
        public Vector3 AimDirection
        {
            get { return Quaternion.Euler(Pitch, Yaw, 0f) * Vector3.forward; }
        }

        /// <summary>
        /// Appelé par le NetworkLauncher dans onBeforeSpawned, donc avant que les
        /// clients ne reçoivent l'objet : l'orientation de départ est correcte dès
        /// la première image, sans « saut » visuel.
        /// </summary>
        public void InitialiseSpawn(float yaw)
        {
            Yaw = yaw;
            Pitch = 0f;
            Velocity = Vector3.zero;
            CrouchBlend = 0f;
            IsGrounded = true;
        }

        public override void Spawned()
        {
            if (_movementProfile == null)
            {
                Debug.LogError("[PlayerAgent] MovementProfile non assigné sur le prefab.");
                return;
            }

            _motor = _motorComponent as ICharacterMotor;
            if (_motor == null)
            {
                Debug.LogError("[PlayerAgent] Le composant moteur n'implémente pas ICharacterMotor.");
                return;
            }
            _motor.Initialise(_movementProfile);

            if (HasInputAuthority)
            {
                Local = this;

                // C'est mon personnage : je prends la caméra et je masque mon
                // propre modèle, sinon je verrais l'intérieur de ma tête.
                if (_cameraRig != null) _cameraRig.Attach();
                if (_thirdPersonVisual != null) _thirdPersonVisual.SetActive(false);
            }
        }

        public override void Despawned(NetworkRunner runner, bool hasState)
        {
            if (!HasInputAuthority) return;
            if (_cameraRig != null) _cameraRig.Detach();
            if (Local == this) Local = null;
        }

        public override void FixedUpdateNetwork()
        {
            // GetInput ne rend true que sur le host et sur le client qui possède
            // l'input : les joueurs distants ne simulent rien, leur position
            // arrive par le NetworkTransform.
            NetInput input;
            if (!GetInput(out input)) return;
            if (_motor == null) return;

            // ---- visée -------------------------------------------------------
            // On applique le delta accumulé côté client depuis le tick précédent.
            Yaw = Mathf.Repeat(Yaw + input.LookDelta.x, 360f);
            Pitch = Mathf.Clamp(Pitch + input.LookDelta.y,
                _movementProfile.MinPitch, _movementProfile.MaxPitch);

            // Le corps suit le lacet. La rotation part dans le NetworkTransform,
            // donc les autres joueurs voient où l'on regarde.
            transform.rotation = Quaternion.Euler(0f, Yaw, 0f);

            // ---- boutons -----------------------------------------------------
            // Un saut est une pression, pas un maintien : maintenir Espace ne doit
            // pas enchaîner les sauts automatiquement.
            NetworkButtons pressed = input.Buttons.GetPressed(PreviousButtons);
            PreviousButtons = input.Buttons;

            // ---- déplacement --------------------------------------------------
            MotorInput motorInput = new MotorInput();
            motorInput.Move = input.Move;
            motorInput.YawDegrees = Yaw;
            motorInput.Jump = pressed.IsSet((int)PlayerButton.Jump);
            motorInput.Crouch = input.Buttons.IsSet((int)PlayerButton.Crouch);
            motorInput.Walk = input.Buttons.IsSet((int)PlayerButton.Walk);

            // Phase 3 : ce facteur viendra de l'arme tenue. Pour l'instant, 1.
            motorInput.WeaponSpeedFactor = 1f;

            MotorState state = new MotorState();
            state.Velocity = Velocity;
            state.CrouchBlend = CrouchBlend;
            state.IsGrounded = IsGrounded;

            state = _motor.Step(state, motorInput, Runner.DeltaTime);

            Velocity = state.Velocity;
            CrouchBlend = state.CrouchBlend;
            IsGrounded = state.IsGrounded;
        }

        public override void Render()
        {
            // Hauteur des yeux et tangage : purement visuel, donc ici.
            if (_cameraRig != null && HasInputAuthority)
                _cameraRig.UpdateView(_movementProfile.EyeHeightFor(CrouchBlend), Pitch);

            // Le modèle des autres joueurs s'écrase quand ils s'accroupissent.
            if (_thirdPersonVisual != null && _thirdPersonVisual.activeSelf)
            {
                float scale = _movementProfile.HeightFor(CrouchBlend) / _movementProfile.StandHeight;
                _thirdPersonVisual.transform.localScale = new Vector3(1f, scale, 1f);
            }
        }
    }
}
