using Fusion;
using PointDeRupture.Combat;
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

        [Tooltip("Vie et armure. Laisser vide si le prefab n'en a pas encore.")]
        [SerializeField] private PlayerHealth _health;

        [Tooltip("Arme équipée. Laisser vide en Phase 1.")]
        [SerializeField] private WeaponRuntime _weapon;

        [Tooltip("Modèle visible par les autres joueurs. Masqué pour soi-même.")]
        [SerializeField] private GameObject _thirdPersonVisual;

        [Tooltip("Parent des hitbox. Écrasé quand le joueur s'accroupit.")]
        [SerializeField] private Transform _hitboxRoot;

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

        /// <summary>
        /// Recul poussé sur la vue, en degrés : x = tangage (négatif = vers le
        /// haut), y = lacet.
        ///
        /// Il est réseau parce qu'il influe sur la direction des balles : après
        /// une resimulation, le client doit retrouver exactement le même recul,
        /// sinon ses balles ne partent plus là où le host les envoie.
        /// </summary>
        [Networked] public Vector2 ViewPunch { get; set; }

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

        /// <summary>Direction du regard, recul non compris.</summary>
        public Vector3 AimDirection
        {
            get { return Quaternion.Euler(Pitch, Yaw, 0f) * Vector3.forward; }
        }

        /// <summary>
        /// Direction réelle d'une balle : le regard plus le recul.
        ///
        /// C'est aussi là que pointe le viseur, puisque la caméra reçoit le même
        /// décalage. Le joueur voit donc toujours où partent ses balles.
        /// </summary>
        public Vector3 FireDirection
        {
            get
            {
                Vector2 punch = ViewPunch;
                return Quaternion.Euler(Pitch + punch.x, Yaw + punch.y, 0f) * Vector3.forward;
            }
        }

        /// <summary>Vitesse de course de référence, lue par le calcul de précision.</summary>
        public float RunSpeed
        {
            get { return _movementProfile != null ? _movementProfile.RunSpeed : 6.35f; }
        }

        /// <summary>Le personnage est-il vivant ? Vrai s'il n'a pas de composant de vie.</summary>
        public bool IsAliveOrNoHealth
        {
            get { return _health == null || _health.IsAlive; }
        }

        /// <summary>Ajoute un coup de recul. Appelé par l'arme au moment du tir.</summary>
        public void AddViewPunch(Vector2 kick)
        {
            Vector2 punch = ViewPunch + kick;

            // On borne : sans cela, une longue rafale finirait par viser le ciel
            // et le joueur perdrait tout repère.
            punch.x = Mathf.Clamp(punch.x, -12f, 3f);
            punch.y = Mathf.Clamp(punch.y, -7f, 7f);
            ViewPunch = punch;
        }

        /// <summary>Retour progressif de la vue au repos.</summary>
        public void RecoverViewPunch(float recoverRate, float deltaTime)
        {
            ViewPunch = RecoilSolver.Recover(ViewPunch, recoverRate, deltaTime);
        }

        /// <summary>Repositionne le personnage. Host uniquement (apparition, round).</summary>
        public void TeleportTo(Vector3 position, float yaw)
        {
            Yaw = yaw;
            Pitch = 0f;
            Velocity = Vector3.zero;
            CrouchBlend = 0f;
            IsGrounded = true;
            ViewPunch = Vector2.zero;
            transform.rotation = Quaternion.Euler(0f, yaw, 0f);
            if (_motor != null) _motor.Teleport(position);
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

            // Un mort ne bouge plus et ne tire plus, mais on continue de lire les
            // inputs pour que la visée reste libre en attendant la réapparition.
            if (!IsAliveOrNoHealth)
            {
                Velocity = Vector3.zero;
                ViewPunch = Vector2.zero;
                return;
            }

            // ---- déplacement --------------------------------------------------
            MotorInput motorInput = new MotorInput();
            motorInput.Move = input.Move;
            motorInput.YawDegrees = Yaw;
            motorInput.Jump = pressed.IsSet((int)PlayerButton.Jump);
            motorInput.Crouch = input.Buttons.IsSet((int)PlayerButton.Crouch);
            motorInput.Walk = input.Buttons.IsSet((int)PlayerButton.Walk);

            // L'arme tenue ralentit le déplacement : un sniper court moins vite
            // qu'un couteau, et la lunette ralentit encore.
            motorInput.WeaponSpeedFactor = _weapon != null ? _weapon.MoveSpeedFactor : 1f;

            MotorState state = new MotorState();
            state.Velocity = Velocity;
            state.CrouchBlend = CrouchBlend;
            state.IsGrounded = IsGrounded;

            state = _motor.Step(state, motorInput, Runner.DeltaTime);

            Velocity = state.Velocity;
            CrouchBlend = state.CrouchBlend;
            IsGrounded = state.IsGrounded;

            // Les hitbox suivent la posture DANS la simulation, et non dans
            // Render : la compensation de latence rembobine des positions
            // simulées, donc une hitbox qui ne bougerait qu'à l'affichage serait
            // rembobinée au mauvais endroit et s'accroupir ne protégerait pas.
            ApplyCrouchToHitboxes();

            // Le tir vient APRÈS le déplacement et la visée, et c'est nous qui
            // l'appelons : l'ordre est ainsi garanti, indépendamment de l'ordre
            // des composants sur le prefab.
            if (_weapon != null) _weapon.Simulate(input, pressed, Runner.DeltaTime);
        }

        private void ApplyCrouchToHitboxes()
        {
            if (_hitboxRoot == null) return;

            float scale = _movementProfile.HeightFor(CrouchBlend) / _movementProfile.StandHeight;
            _hitboxRoot.localScale = new Vector3(1f, scale, 1f);
        }

        public override void Render()
        {
            // Hauteur des yeux et tangage : purement visuel, donc ici.
            if (_cameraRig != null && HasInputAuthority)
                _cameraRig.UpdateView(_movementProfile.EyeHeightFor(CrouchBlend), Pitch,
                    ViewPunch, _weapon != null ? _weapon.FieldOfViewOverride : 0f);

            // Le modèle des autres joueurs s'écrase quand ils s'accroupissent.
            if (_thirdPersonVisual != null && _thirdPersonVisual.activeSelf)
            {
                float scale = _movementProfile.HeightFor(CrouchBlend) / _movementProfile.StandHeight;
                _thirdPersonVisual.transform.localScale = new Vector3(1f, scale, 1f);
            }
        }
    }
}
