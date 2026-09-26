using UnityEngine;

namespace PointDeRupture.Combat
{
    /// <summary>
    /// Déclare la zone de dégâts d'une hitbox.
    ///
    /// À poser sur chaque GameObject qui porte un composant <c>Hitbox</c> de
    /// Fusion. Le tir lit ce composant pour savoir quel multiplicateur appliquer.
    ///
    /// Pourquoi un composant séparé plutôt qu'un champ dans la Hitbox de Fusion :
    /// la Hitbox appartient au SDK, on ne la modifie pas. Et cela garde notre code
    /// indépendant de sa structure interne.
    /// </summary>
    public class DamageZoneTag : MonoBehaviour
    {
        public DamageZone Zone = DamageZone.Chest;

        private void OnDrawGizmosSelected()
        {
            // Code couleur : rouge = tête, orange = ventre, bleu = jambes.
            switch (Zone)
            {
                case DamageZone.Head: Gizmos.color = new Color(1f, 0.25f, 0.25f, 0.6f); break;
                case DamageZone.Stomach: Gizmos.color = new Color(1f, 0.65f, 0.2f, 0.6f); break;
                case DamageZone.Legs: Gizmos.color = new Color(0.4f, 0.6f, 1f, 0.6f); break;
                default: Gizmos.color = new Color(0.8f, 0.8f, 0.8f, 0.6f); break;
            }
            Gizmos.DrawSphere(transform.position, 0.06f);
        }
    }
}
