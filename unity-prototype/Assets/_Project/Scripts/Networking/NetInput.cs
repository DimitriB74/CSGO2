using Fusion;
using UnityEngine;

namespace PointDeRupture.Networking
{
    /// <summary>
    /// Les actions du joueur, encodées sur un bit chacune.
    ///
    /// L'ordre compte : il fait partie du protocole réseau. On ajoute toujours
    /// les nouvelles entrées **à la fin**, jamais au milieu, sinon un client et
    /// un host de versions différentes n'interprètent pas les mêmes bits.
    /// </summary>
    public enum PlayerButton
    {
        Fire = 0,
        AltFire = 1,
        Reload = 2,
        Jump = 3,
        Crouch = 4,
        Walk = 5,
        Use = 6,
        Buy = 7,
        Scoreboard = 8
    }

    /// <summary>
    /// Ce que le client envoie au host, une fois par tick de simulation (64 Hz).
    ///
    /// C'est la **seule** chose qu'un client transmet sur son propre compte.
    /// Tout le reste (position, vie, argent) est calculé par le host et
    /// redescendu. Un client modifié ne peut donc mentir que sur son intention,
    /// jamais sur le résultat.
    ///
    /// Fusion sérialise et compresse cette struct automatiquement. On la garde
    /// petite : ~20 octets.
    /// </summary>
    public struct NetInput : INetworkInput
    {
        /// <summary>Axes de déplacement : x = droite, y = avant. Dans [-1, 1].</summary>
        public Vector2 Move;

        /// <summary>
        /// Rotation de la vue **accumulée depuis le tick précédent**, en degrés.
        ///
        /// On envoie un delta et non un angle absolu : ainsi la souris reste
        /// fluide même si le framerate est supérieur au tick rate (les
        /// mouvements de plusieurs images sont additionnés, rien n'est perdu).
        /// </summary>
        public Vector2 LookDelta;

        /// <summary>Boutons pressés, un bit par <see cref="PlayerButton"/>.</summary>
        public NetworkButtons Buttons;

        /// <summary>Slot d'arme demandé (0 = aucun changement). Utilisé à partir de la Phase 3.</summary>
        public byte WeaponSlot;
    }
}
