namespace PointDeRupture.Core
{
    /// <summary>
    /// Index et masques des couches physiques, déclarés une seule fois.
    ///
    /// Ces valeurs doivent correspondre exactement à
    /// Project Settings → Tags and Layers (voir docs/02-phase-0.md, étape 4).
    /// Si tu changes une couche dans l'éditeur, change-la ici aussi.
    /// </summary>
    public static class Layers
    {
        public const int Default = 0;

        /// <summary>Capsule de collision des personnages.</summary>
        public const int Player = 8;

        /// <summary>Volumes de dégâts lag-compensés. Ne collide avec rien.</summary>
        public const int Hitbox = 9;

        /// <summary>Armes au sol, charge explosive.</summary>
        public const int Pickup = 10;

        /// <summary>Arme en vue première personne.</summary>
        public const int ViewModel = 11;

        /// <summary>Cloisons fines traversables par les balles (Phase 7+).</summary>
        public const int Penetrable = 12;

        /// <summary>Géométrie sur laquelle on marche et qui bloque les balles.</summary>
        public static readonly int WorldMask = (1 << Default) | (1 << Penetrable);

        /// <summary>Ce qu'une balle peut toucher.</summary>
        public static readonly int BulletMask = (1 << Default) | (1 << Hitbox) | (1 << Penetrable);

        /// <summary>Ce qui porte un personnage. Volontairement sans les autres joueurs.</summary>
        public static readonly int GroundMask = (1 << Default) | (1 << Penetrable);
    }
}
