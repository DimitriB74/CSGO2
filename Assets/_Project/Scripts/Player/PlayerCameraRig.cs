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
        /// <param name="eyeHeight">Hauteur des yeux, qui suit l'accroupissement.</param>
        /// <param name="pitch">Angle vertical du regard, en degrés.</param>
        /// <param name="viewPunch">
        /// Décalage de recul, en degrés : x = tangage, y = lacet. Il est appliqué
        /// à la caméra, donc **le viseur suit les balles** : compenser le recul en
        /// tirant la souris vers le bas fonctionne exactement comme attendu.
        /// </param>
        /// <param name="fieldOfViewOverride">
        /// Champ de vision imposé par une lunette, ou 0 pour garder le FOV normal.
        /// </param>
        public void UpdateView(float eyeHeight, float pitch, Vector2 viewPunch,
            float fieldOfViewOverride)
        {
            if (_headAnchor == null) return;

            Vector3 local = _headAnchor.localPosition;
            local.y = eyeHeight;
            _headAnchor.localPosition = local;

            if (_camera == null) return;

            // Le lacet du regard est déjà porté par la rotation du personnage :
            // la caméra n'ajoute que le tangage, plus le recul sur les deux axes.
            _camera.transform.localRotation =
                Quaternion.Euler(pitch + viewPunch.x, viewPunch.y, 0f);

            // Le zoom de lunette est instantané côté FOV ; l'interpolation
            // viendra avec les visuels en Phase 11.
            float target = fieldOfViewOverride > 0f ? fieldOfViewOverride : FieldOfView;
            if (!Mathf.Approximately(_camera.fieldOfView, target)) _camera.fieldOfView = target;
        }

        private void OnDisable()
        {
            Detach();
        }
    }
}
