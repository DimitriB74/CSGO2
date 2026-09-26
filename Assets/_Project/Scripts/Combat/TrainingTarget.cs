using Fusion;
using UnityEngine;

namespace PointDeRupture.Combat
{
    /// <summary>
    /// Cible d'entraînement : une silhouette qui fait des allers-retours et qui
    /// se remet debout après avoir été tuée.
    ///
    /// Elle existe pour une raison précise : **pouvoir tester la compensation de
    /// latence tout seul.** Le vrai test demande une cible qui se déplace
    /// latéralement pendant qu'on lui tire dessus, ce qu'on ne peut pas faire en
    /// contrôlant deux joueurs à la fois. Cette cible remplace le deuxième humain.
    ///
    /// Elle réutilise <see cref="PlayerHealth"/> : les dégâts empruntent donc
    /// exactement le même chemin que sur un joueur, zones comprises. Un test qui
    /// passe ici vaut pour un vrai duel.
    ///
    /// Base de la map d'entraînement de la Phase 9.
    /// </summary>
    public class TrainingTarget : NetworkBehaviour
    {
        [Header("Déplacement")]
        [Tooltip("Amplitude de l'aller-retour, en mètres. 0 = cible fixe.")]
        [SerializeField] private float _travel = 8f;

        [Tooltip("Vitesse de déplacement, en m/s. 6,35 = vitesse d'un joueur qui court.")]
        [SerializeField] private float _speed = 6.35f;

        [Tooltip("Axe du déplacement, dans le repère local du point de départ.")]
        [SerializeField] private Vector3 _axis = Vector3.right;

        [Header("Références")]
        [SerializeField] private PlayerHealth _health;

        /// <summary>
        /// Position de départ, figée au Spawn. Réseau, car le host et les clients
        /// doivent partir du même point de référence.
        /// </summary>
        [Networked] private Vector3 Origin { get; set; }

        /// <summary>
        /// Avancement sur le trajet, en mètres parcourus. Réseau pour survivre à
        /// une resimulation, comme tout état qui influe sur une position.
        /// </summary>
        [Networked] private float Travelled { get; set; }

        public override void Spawned()
        {
            if (HasStateAuthority) Origin = transform.position;
        }

        public override void FixedUpdateNetwork()
        {
            // Seul le host déplace la cible ; les clients la reçoivent interpolée
            // par le NetworkTransform, exactement comme un joueur distant.
            if (!HasStateAuthority) return;
            if (_travel <= 0.01f || _speed <= 0.01f) return;

            Travelled += _speed * Runner.DeltaTime;

            // Va-et-vient : on replie la distance parcourue sur un aller-retour,
            // ce qui donne un mouvement continu sans à-coup au changement de sens.
            float cycle = _travel * 2f;
            float position = Travelled % cycle;
            if (position > _travel) position = cycle - position;

            Vector3 direction = _axis.sqrMagnitude < 0.0001f ? Vector3.right : _axis.normalized;
            transform.position = Origin + direction * (position - _travel * 0.5f);
        }

        /// <summary>Vie restante, pour un affichage de debug.</summary>
        public int Health
        {
            get { return _health != null ? _health.Health : 0; }
        }

        private void OnDrawGizmos()
        {
            // Trajet visible dans l'éditeur, pour placer la cible sans lancer.
            Vector3 center = Application.isPlaying ? (Vector3)Origin : transform.position;
            Vector3 direction = _axis.sqrMagnitude < 0.0001f ? Vector3.right : _axis.normalized;

            Gizmos.color = new Color(1f, 0.6f, 0.2f, 0.9f);
            Gizmos.DrawLine(center - direction * (_travel * 0.5f) + Vector3.up * 0.1f,
                center + direction * (_travel * 0.5f) + Vector3.up * 0.1f);
            Gizmos.DrawWireCube(center + Vector3.up * 0.925f, new Vector3(0.8f, 1.85f, 0.8f));
        }
    }
}
