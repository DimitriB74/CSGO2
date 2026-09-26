using UnityEngine;

namespace PointDeRupture.Core
{
    /// <summary>
    /// Accès aux points d'apparition de la scène courante.
    ///
    /// Les points sont trouvés une fois puis mis en cache, et **triés par nom** :
    /// l'ordre de <c>FindObjectsByType</c> n'est pas garanti, et on veut que
    /// l'attribution soit la même à chaque lancement et sur chaque machine.
    ///
    /// À partir de la Phase 5, les points porteront un camp et ce service
    /// filtrera par équipe.
    /// </summary>
    public static class SpawnService
    {
        private static PlayerSpawnPoint[] _points;

        public static int Count
        {
            get
            {
                EnsureCache();
                return _points.Length;
            }
        }

        /// <summary>À appeler après un changement de scène.</summary>
        public static void Invalidate()
        {
            _points = null;
        }

        private static void EnsureCache()
        {
            if (_points != null) return;

            _points = Object.FindObjectsByType<PlayerSpawnPoint>(FindObjectsSortMode.None);
            System.Array.Sort(_points, (a, b) => string.CompareOrdinal(a.name, b.name));
        }

        /// <summary>
        /// Point numéro <paramref name="index"/>, en boucle. Rend false s'il n'y
        /// a aucun point dans la scène.
        /// </summary>
        public static bool TryGet(int index, out Vector3 position, out float yaw)
        {
            EnsureCache();

            if (_points.Length == 0)
            {
                position = Vector3.zero;
                yaw = 0f;
                return false;
            }

            // Le modulo d'un index négatif est négatif en C# : on le redresse.
            int safe = index % _points.Length;
            if (safe < 0) safe += _points.Length;

            PlayerSpawnPoint point = _points[safe];
            position = point.Position;
            yaw = point.Yaw;
            return true;
        }
    }
}
