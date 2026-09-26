using UnityEngine;

namespace PointDeRupture.Player
{
    /// <summary>
    /// Gère la caméra du joueur local : elle est attachée à la tête du
    /// personnage, et son orientation est écrite à chaque image d'affichage.
    ///
    /// Seul le personnage dont on a l'autorité d'input active ce composant : les
    /// autres joueurs n'ont pas de caméra. On réutilise la Main Camera de la
    /// scène plutôt que d'en instancier une, ce qui évite d'avoir deux
    /// AudioListener (Unity ne le tolère pas) et garde l'écoute audio à la tête
    /// du joueur, donc un son 3D correct.
    ///
    /// C'est aussi ici qu'atterriront le recul de vue (Phase 2), le zoom des
    /// lunettes (Phase 3) et le réglage de FOV (Phase 11).
    /// </summary>
    public class PlayerCameraRig : MonoBehaviour
    {
        [Tooltip("Enfant du personnage situé à hauteur des yeux.")]
        [SerializeField] private Transform _headAnchor;

        [Tooltip("Champ de vision vertical, en degrés.")]
        [Range(60f, 110f)] public float FieldOfView = 90f;

        [Tooltip("Distance du plan proche. Faible pour que l'arme ne soit pas coupée.")]
        public float NearClip = 0.02f;

        private Camera _camera;
        private Transform _originalParent;

        public Transform HeadAnchor
        {
            get { return _headAnchor; }
        }

        /// <summary>Prend la caméra de la scène et l'accroche à la tête.</summary>
        public void Attach()
        {
            _camera = Camera.main;
            if (_camera == null)
            {
                Debug.LogError("[CameraRig] Aucune caméra marquée MainCamera dans la scène.");
                return;
            }

            _originalParent = _camera.transform.parent;
            _camera.transform.SetParent(_headAnchor, false);
            _camera.transform.localPosition = Vector3.zero;
            _camera.transform.localRotation = Quaternion.identity;
            _camera.fieldOfView = FieldOfView;
            _camera.nearClipPlane = NearClip;
        }

        /// <summary>Rend la caméra à la scène (mort, déconnexion, fin de round).</summary>
        public void Detach()
        {
            if (_camera == null) return;
            _camera.transform.SetParent(_originalParent, true);
            _camera = null;
        }

        /// <summary>
        /// Place la tête et oriente la caméra. Appelé depuis
        /// <see cref="PlayerAgent.Render"/>, donc à la fréquence d'affichage et
        /// jamais dans la simulation.
        /// </summary>
        public void UpdateView(float eyeHeight, float pitch)
        {
            if (_headAnchor == null) return;

            // La hauteur des yeux suit l'accroupissement.
            Vector3 local = _headAnchor.localPosition;
            local.y = eyeHeight;
            _headAnchor.localPosition = local;

            // Le lacet est déjà porté par la rotation du personnage : la caméra
            // n'ajoute que le tangage. Cela évite d'appliquer deux fois le lacet.
            if (_camera != null)
                _camera.transform.localRotation = Quaternion.Euler(pitch, 0f, 0f);
        }

        private void OnDisable()
        {
            Detach();
        }
    }
}
