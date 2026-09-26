using UnityEngine;

namespace PointDeRupture.Core
{
    /// <summary>
    /// Simple marqueur posé dans la scène : le NetworkLauncher fait apparaître
    /// les joueurs sur ces points, à tour de rôle.
    ///
    /// À partir de la Phase 5 il portera aussi le camp (Cendre / Verrou) ;
    /// pour l'instant tous les points servent aux deux.
    /// </summary>
    public class PlayerSpawnPoint : MonoBehaviour
    {
        /// <summary>Position d'apparition, aux pieds du personnage.</summary>
        public Vector3 Position
        {
            get { return transform.position; }
        }

        /// <summary>Orientation initiale du regard, en degrés.</summary>
        public float Yaw
        {
            get { return transform.eulerAngles.y; }
        }

        private void OnDrawGizmos()
        {
            // Une capsule et une flèche, pour placer les points à l'œil dans
            // l'éditeur sans avoir à lancer la partie.
            Gizmos.color = new Color(0.35f, 0.85f, 0.45f, 0.85f);
            Vector3 center = transform.position + Vector3.up * 0.925f;
            Gizmos.DrawWireCube(center, new Vector3(0.8f, 1.85f, 0.8f));
            Gizmos.DrawLine(center, center + transform.forward * 1.2f);
            Gizmos.DrawSphere(center + transform.forward * 1.2f, 0.08f);
        }
    }
}
