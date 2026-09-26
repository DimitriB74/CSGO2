using Fusion;
using PointDeRupture.Core;
using PointDeRupture.Player;
using UnityEngine;

namespace PointDeRupture.Combat
{
    /// <summary>
    /// Vie, armure, mort et réapparition.
    ///
    /// **Autorité** : seul le host écrit ces valeurs. Un client ne peut pas
    /// s'infliger ni se retirer des dégâts — il ne fait que lire. C'est la
    /// garantie anti-triche la plus importante du jeu.
    ///
    /// La réapparition automatique de cette phase est provisoire : à partir de la
    /// Phase 5, on n'a qu'une vie par round et c'est le MatchDirector qui décide
    /// des réapparitions.
    /// </summary>
    public class PlayerHealth : NetworkBehaviour
    {
        [Header("Réglages")]
        [Tooltip("Délai avant réapparition, en secondes (provisoire, Phase 2).")]
        [SerializeField] private float _respawnDelay = 3f;

        [Header("Références du prefab")]
        [SerializeField] private PlayerAgent _agent;

        [Tooltip("Modèle à masquer à la mort.")]
        [SerializeField] private GameObject _visualRoot;

        [Networked] public int Health { get; set; }
        [Networked] public int Armor { get; set; }
        [Networked] public NetworkBool Helmet { get; set; }
        [Networked] public NetworkBool IsAlive { get; set; }

        [Networked] public int Kills { get; set; }
        [Networked] public int Deaths { get; set; }

        /// <summary>Compteur incrémenté à chaque blessure : sert aux effets visuels.</summary>
        [Networked] public int HitCount { get; set; }

        /// <summary>Direction d'où venait le dernier tir reçu, pour l'indicateur de dégâts.</summary>
        [Networked] public Vector3 LastHitDirection { get; set; }

        [Networked] private TickTimer RespawnTimer { get; set; }

        /// <summary>Index de réapparition, pour ne pas toujours revenir au même endroit.</summary>
        [Networked] private int SpawnIndex { get; set; }

        // API Fusion : le détecteur de changements remplace l'attribut
        // [Networked(OnChanged=…)] de Fusion 1. Si ta version du SDK diffère,
        // c'est la seule ligne à adapter.
        private ChangeDetector _changes;

        public override void Spawned()
        {
            if (HasStateAuthority) ResetToFull();
            _changes = GetChangeDetector(ChangeDetector.Source.SimulationState);
        }

        /// <summary>Remet la vie au maximum et retire l'armure. Host uniquement.</summary>
        public void ResetToFull()
        {
            Health = DamageModel.MaxHealth;
            Armor = 0;
            Helmet = false;
            IsAlive = true;
        }

        /// <summary>Donne un gilet, avec ou sans casque. Host uniquement (achat validé).</summary>
        public void GiveArmor(bool withHelmet)
        {
            Armor = DamageModel.MaxArmor;
            if (withHelmet) Helmet = true;
        }

        /// <summary>
        /// Applique un impact. **À n'appeler que sur le host.**
        /// </summary>
        /// <param name="query">
        /// Requête déjà remplie par le tireur, sauf l'armure : on écrase
        /// volontairement les champs d'armure avec l'état réel de la victime, car
        /// c'est nous qui en sommes la source de vérité.
        /// </param>
        /// <param name="attacker">Tireur, pour créditer l'élimination.</param>
        /// <param name="direction">Direction de la balle, pour l'indicateur de dégâts.</param>
        public void ApplyDamage(DamageQuery query, PlayerHealth attacker, Vector3 direction)
        {
            if (!HasStateAuthority) return;
            if (!IsAlive) return;

            query.Armor = Armor;
            query.Helmet = Helmet;

            DamageResult result = DamageModel.Resolve(query);

            Armor = Mathf.Max(0, Armor - result.ArmorLoss);
            Health -= result.HealthLoss;
            HitCount++;
            LastHitDirection = direction;

            if (Health > 0) return;

            Health = 0;
            IsAlive = false;
            Deaths++;
            RespawnTimer = TickTimer.CreateFromSeconds(Runner, _respawnDelay);

            // On ne crédite pas un suicide.
            if (attacker != null && attacker != this) attacker.Kills++;
        }

        public override void FixedUpdateNetwork()
        {
            if (!HasStateAuthority) return;
            if (IsAlive) return;
            if (!RespawnTimer.Expired(Runner)) return;

            RespawnTimer = TickTimer.None;
            Respawn();
        }

        private void Respawn()
        {
            SpawnIndex++;

            Vector3 position;
            float yaw;
            if (SpawnService.TryGet(SpawnIndex, out position, out yaw) && _agent != null)
                _agent.TeleportTo(position, yaw);

            ResetToFull();
        }

        public override void Render()
        {
            if (_changes == null) return;

            // On réagit aux changements d'état plutôt que d'envoyer un RPC par
            // balle : c'est beaucoup moins de trafic, et ça marche aussi pour un
            // joueur qui vient de rejoindre.
            foreach (string changed in _changes.DetectChanges(this))
            {
                if (changed == nameof(IsAlive))
                {
                    if (_visualRoot != null && !_agent.HasInputAuthority)
                        _visualRoot.SetActive(IsAlive);
                }
                else if (changed == nameof(HitCount))
                {
                    // Phase 8 : flash d'écran et indicateur de direction.
                    // Les effets d'impact se brancheront ici.
                }
            }
        }
    }
}
