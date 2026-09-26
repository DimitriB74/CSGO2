using UnityEngine;

namespace PointDeRupture.Data
{
    /// <summary>
    /// Motif de recul d'une arme : la trajectoire que suit le viseur quand on
    /// maintient le tir.
    ///
    /// Le motif est **fixe**, donc apprenable : c'est ce qui récompense
    /// l'entraînement. Seule une petite dispersion aléatoire s'y ajoute.
    ///
    /// Asset séparé de l'arme pour pouvoir partager un même motif entre deux
    /// armes et l'ajuster sans toucher au reste des statistiques.
    /// </summary>
    [CreateAssetMenu(
        menuName = "Point de Rupture/Recoil Pattern",
        fileName = "RecoilPattern_New")]
    public class RecoilPattern : ScriptableObject
    {
        [Tooltip("Une entrée par balle. x = décalage horizontal dans [-1, 1] " +
                 "(négatif = gauche), y = montée dans [0, 1].")]
        public Vector2[] Points = new Vector2[0];

        /// <summary>
        /// Point du motif pour la Nième balle. Au-delà du tableau, on répète la
        /// dernière valeur : un chargeur plus long que le motif ne provoque donc
        /// jamais d'erreur, le recul se stabilise simplement.
        /// </summary>
        public Vector2 At(int shotIndex)
        {
            if (Points == null || Points.Length == 0) return new Vector2(0f, 1f);
            int index = Mathf.Clamp(shotIndex, 0, Points.Length - 1);
            return Points[index];
        }

        public int Length
        {
            get { return Points == null ? 0 : Points.Length; }
        }
    }
}
