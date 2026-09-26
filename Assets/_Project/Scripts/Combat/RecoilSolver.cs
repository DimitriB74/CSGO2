using UnityEngine;

namespace PointDeRupture.Combat
{
    /// <summary>
    /// Direction d'une balle : cône de dispersion et motif de recul.
    ///
    /// Contrainte centrale : le host et le client doivent calculer **la même
    /// balle**, sinon le client voit un impact là où le host n'en voit pas. Toute
    /// la part aléatoire passe donc par un générateur déterministe alimenté par
    /// (tick, joueur, numéro de balle) : mêmes entrées, même résultat, sur
    /// n'importe quelle machine et même après une resimulation.
    ///
    /// Ne jamais utiliser <c>UnityEngine.Random</c> ici : il a un état global,
    /// donc il diverge entre les postes et casse la prédiction.
    /// </summary>
    public static class RecoilSolver
    {
        /// <summary>
        /// Demi-angle du cône de dispersion, en degrés.
        /// </summary>
        /// <param name="baseSpread">Cône debout immobile.</param>
        /// <param name="moveSpread">Pénalité à pleine course.</param>
        /// <param name="jumpSpread">Pénalité en l'air.</param>
        /// <param name="spreadPerShot">Ouverture par balle déjà tirée.</param>
        /// <param name="speedRatio">Vitesse actuelle / vitesse de course, dans [0, 1].</param>
        /// <param name="isAirborne">Le tireur est en l'air.</param>
        /// <param name="isCrouching">Le tireur est accroupi.</param>
        /// <param name="shotIndex">Balles déjà tirées dans la rafale en cours.</param>
        /// <param name="scopedFactor">Facteur de lunette (1 = pas de lunette).</param>
        public static float Spread(float baseSpread, float moveSpread, float jumpSpread,
            float spreadPerShot, float speedRatio, bool isAirborne, bool isCrouching,
            int shotIndex, float scopedFactor)
        {
            float spread = baseSpread;

            // La pénalité de mouvement est quadratique : marcher doucement gêne
            // peu, sprinter gêne énormément. C'est ce qui rend le counter-strafe
            // payant plutôt que cosmétique.
            float ratio = Mathf.Clamp01(speedRatio);
            spread += moveSpread * ratio * ratio;

            if (isAirborne) spread += jumpSpread;
            else if (isCrouching) spread *= 0.76f;

            spread += spreadPerShot * Mathf.Max(0, shotIndex);

            return spread * (scopedFactor <= 0f ? 1f : scopedFactor);
        }

        /// <summary>
        /// Décale une direction dans un cône, de façon déterministe.
        /// </summary>
        public static Vector3 ApplySpread(Vector3 direction, float spreadDegrees,
            int tick, int playerId, int shotIndex)
        {
            if (spreadDegrees <= 0.0001f) return direction;

            // Deux tirages indépendants : un angle et un rayon. La racine carrée
            // sur le rayon donne une répartition uniforme dans le disque — sans
            // elle, les balles s'agglutineraient au centre.
            uint seed = Hash(tick, playerId, shotIndex);
            float angle = NextFloat(ref seed) * 2f * Mathf.PI;
            float radius = Mathf.Sqrt(NextFloat(ref seed)) * Mathf.Tan(spreadDegrees * Mathf.Deg2Rad);

            Vector3 right = Vector3.Cross(Vector3.up, direction);
            if (right.sqrMagnitude < 0.0001f) right = Vector3.right;
            right.Normalize();
            Vector3 up = Vector3.Cross(direction, right).normalized;

            Vector3 offset = right * (Mathf.Cos(angle) * radius) + up * (Mathf.Sin(angle) * radius);
            return (direction + offset).normalized;
        }

        /// <summary>
        /// Recul de vue de la Nième balle, en degrés : x = tangage (négatif =
        /// vers le haut), y = lacet.
        ///
        /// Le motif est **fixe**, donc apprenable : c'est le cœur de la maîtrise
        /// d'une arme. Seule la dispersion ci-dessus est aléatoire.
        /// </summary>
        public static Vector2 PatternKick(Vector2[] pattern, int shotIndex, float verticalScale,
            float horizontalScale)
        {
            if (pattern == null || pattern.Length == 0)
                return new Vector2(-verticalScale, 0f);

            int index = Mathf.Clamp(shotIndex, 0, pattern.Length - 1);
            Vector2 point = pattern[index];

            // Convention du motif : x = décalage horizontal dans [-1, 1],
            // y = montée dans [0, 1].
            return new Vector2(-point.y * verticalScale, point.x * horizontalScale);
        }

        /// <summary>
        /// Retour progressif de la vue au repos. Décroissance exponentielle :
        /// rapide au début, douce à la fin, comme le ressenti d'une arme réelle.
        /// </summary>
        public static Vector2 Recover(Vector2 punch, float recoverRate, float deltaTime)
        {
            float factor = Mathf.Exp(-Mathf.Max(0f, recoverRate) * deltaTime);
            Vector2 result = punch * factor;
            if (result.sqrMagnitude < 0.0004f) return Vector2.zero;
            return result;
        }

        // ---- générateur déterministe ----------------------------------------

        /// <summary>
        /// Mélange trois entiers en une graine. Variante de l'avalanche de
        /// Murmur3 : de petites variations d'entrée donnent des graines très
        /// différentes, ce qui évite les motifs visibles entre balles voisines.
        /// </summary>
        public static uint Hash(int tick, int playerId, int shotIndex)
        {
            uint h = 2166136261u;
            h = Mix(h, (uint)tick);
            h = Mix(h, (uint)playerId * 2654435761u);
            h = Mix(h, (uint)shotIndex * 40503u + 1u);
            return h == 0u ? 1u : h;
        }

        private static uint Mix(uint h, uint value)
        {
            h ^= value;
            h *= 16777619u;
            h ^= h >> 13;
            h *= 2246822519u;
            h ^= h >> 16;
            return h;
        }

        /// <summary>Xorshift32 : rapide, sans état global, suffisant pour une dispersion.</summary>
        private static float NextFloat(ref uint state)
        {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            return (state >> 8) * (1f / 16777216f); // 24 bits → [0, 1[
        }
    }
}
