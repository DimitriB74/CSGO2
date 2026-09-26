using Fusion;
using PointDeRupture.Core;
using PointDeRupture.Data;
using PointDeRupture.Networking;
using PointDeRupture.Player;
using UnityEngine;

namespace PointDeRupture.Combat
{
    /// <summary>
    /// Le tir : cadence, chargeur, rechargement, dispersion, recul, et résolution
    /// des impacts avec compensation de latence.
    ///
    /// **Partage host / client** — c'est le cœur de la phase :
    ///
    /// - le **client** prédit tout ce qui est immédiat : décompte des munitions,
    ///   temps de recharge, recul de la vue, effets. Le tir répond donc sans
    ///   aucune latence perçue ;
    /// - le **host** seul résout les impacts et applique les dégâts. Un client
    ///   modifié ne peut pas s'attribuer de touche.
    ///
    /// Les deux calculent pourtant **la même balle**, parce que la dispersion est
    /// tirée d'un générateur déterministe alimenté par (tick, joueur, numéro de
    /// balle) : voir <see cref="RecoilSolver"/>. Sans cela, le client verrait ses
    /// impacts ailleurs que le host.
    ///
    /// La simulation est pilotée par <see cref="PlayerAgent"/> et non par un
    /// <c>FixedUpdateNetwork</c> propre : cela garantit que la visée est appliquée
    /// avant le tir, dans un ordre qui ne dépend pas de l'ordre des composants.
    /// </summary>
    public class WeaponRuntime : NetworkBehaviour
    {
        [Header("Arme")]
        [Tooltip("Arme équipée. En Phase 3, elle viendra de l'inventaire.")]
        [SerializeField] private WeaponDefinition _weapon;

        [Header("Références du prefab")]
        [SerializeField] private PlayerAgent _agent;
        [SerializeField] private PlayerHealth _health;

        [Networked] public int Ammo { get; set; }
        [Networked] public int Reserve { get; set; }

        /// <summary>Balles tirées depuis l'apparition. Sert de graine et d'événement visuel.</summary>
        [Networked] public int ShotCount { get; set; }

        /// <summary>Position dans le motif de recul. Remise à zéro après une pause.</summary>
        [Networked] public int SprayIndex { get; set; }

        [Networked] public NetworkBool IsScoped { get; set; }

        [Networked] private int LastShotTick { get; set; }
        [Networked] private TickTimer FireCooldown { get; set; }
        [Networked] private TickTimer ReloadTimer { get; set; }
        [Networked] private int BurstRemaining { get; set; }

        public WeaponDefinition Weapon
        {
            get { return _weapon; }
        }

        public bool IsReloading
        {
            get { return ReloadTimer.IsRunning; }
        }

        /// <summary>Facteur de vitesse à appliquer au déplacement.</summary>
        public float MoveSpeedFactor
        {
            get
            {
                if (_weapon == null) return 1f;
                return IsScoped ? _weapon.MoveSpeedFactor * _weapon.ScopedSpeedFactor
                                : _weapon.MoveSpeedFactor;
            }
        }

        /// <summary>Champ de vision à utiliser : réduit en lunette.</summary>
        public float FieldOfViewOverride
        {
            get
            {
                if (_weapon == null || !IsScoped) return 0f;
                return _weapon.ScopedFieldOfView;
            }
        }

        /// <summary>Cône de dispersion actuel, en degrés. Le viseur s'ouvre avec lui.</summary>
        public float CurrentSpread
        {
            get
            {
                if (_weapon == null || _agent == null) return 0f;

                float speedRatio = _agent.HorizontalSpeed / Mathf.Max(0.01f, _agent.RunSpeed);
                return RecoilSolver.Spread(_weapon.BaseSpread, _weapon.MoveSpread,
                    _weapon.JumpSpread, _weapon.SpreadPerShot, speedRatio,
                    !_agent.IsGrounded, _agent.CrouchBlend > 0.5f, SprayIndex,
                    IsScoped ? _weapon.ScopedSpreadFactor : 1f);
            }
        }

        public override void Spawned()
        {
            if (HasStateAuthority && _weapon != null) RefillAmmo();
        }

        /// <summary>Recharge complète : début de round, ou changement d'arme.</summary>
        public void RefillAmmo()
        {
            if (_weapon == null) return;
            Ammo = _weapon.MagazineSize;
            Reserve = _weapon.ReserveAmmo;
            SprayIndex = 0;
            IsScoped = false;
            ReloadTimer = TickTimer.None;
            FireCooldown = TickTimer.None;
            BurstRemaining = 0;
        }

        /// <summary>
        /// Un pas de simulation. Appelé par <see cref="PlayerAgent"/>, après que
        /// la visée du tick a été appliquée.
        /// </summary>
        public void Simulate(NetInput input, NetworkButtons pressed, float deltaTime)
        {
            if (_weapon == null || _agent == null) return;

            // Retour de la vue au repos : même sur le client, pour que la
            // compensation du recul soit immédiate à la souris.
            _agent.RecoverViewPunch(_weapon.RecoilRecovery, deltaTime);

            if (_health != null && !_health.IsAlive)
            {
                IsScoped = false;
                return;
            }

            ResetSprayAfterPause();

            // --- lunette -------------------------------------------------------
            if (_weapon.HasScope && pressed.IsSet((int)PlayerButton.AltFire) && !IsReloading)
                IsScoped = !IsScoped;

            // --- rechargement --------------------------------------------------
            if (ReloadTimer.Expired(Runner))
            {
                ReloadTimer = TickTimer.None;
                CompleteReload();
            }

            if (pressed.IsSet((int)PlayerButton.Reload)) TryStartReload();
            if (IsReloading) return;

            // --- tir -----------------------------------------------------------
            bool holding = input.Buttons.IsSet((int)PlayerButton.Fire);
            bool clicked = pressed.IsSet((int)PlayerButton.Fire);

            bool wantsToFire;
            switch (_weapon.FireMode)
            {
                case FireMode.Automatic:
                    wantsToFire = holding;
                    break;
                case FireMode.Burst:
                    // Un clic arme la rafale, elle se vide ensuite toute seule.
                    if (clicked && BurstRemaining <= 0) BurstRemaining = _weapon.BurstCount;
                    wantsToFire = BurstRemaining > 0;
                    break;
                default:
                    wantsToFire = clicked;
                    break;
            }

            if (!wantsToFire) return;
            if (!FireCooldown.ExpiredOrNotRunning(Runner)) return;

            if (Ammo <= 0)
            {
                // Chargeur vide : petit délai pour ne pas spammer, et recharge
                // automatique si on a des munitions, comme dans tous les FPS.
                FireCooldown = TickTimer.CreateFromSeconds(Runner, 0.25f);
                BurstRemaining = 0;
                TryStartReload();
                return;
            }

            Fire();
        }

        private void Fire()
        {
            Ammo--;
            ShotCount++;
            LastShotTick = Runner.Tick;
            FireCooldown = TickTimer.CreateFromSeconds(Runner, _weapon.CycleTime);
            if (BurstRemaining > 0) BurstRemaining--;

            Vector3 origin = _agent.EyePosition;
            Vector3 aim = _agent.FireDirection;
            float spread = CurrentSpread;

            // API Fusion : identifiant du joueur, utilisé comme graine.
            int playerId = Object.InputAuthority.PlayerId;

            int pellets = Mathf.Max(1, _weapon.Pellets);
            for (int pellet = 0; pellet < pellets; pellet++)
            {
                // La graine mélange le tick, le joueur et un index unique par
                // balle : deux plombs d'une même cartouche partent donc dans des
                // directions différentes, mais identiques sur host et client.
                Vector3 direction = RecoilSolver.ApplySpread(aim, spread,
                    Runner.Tick, playerId, ShotCount * 16 + pellet);

                ResolveShot(origin, direction);
            }

            // Recul : le motif est fixe, donc apprenable.
            Vector2 kick = RecoilSolver.PatternKick(
                _weapon.Recoil != null ? _weapon.Recoil.Points : null,
                SprayIndex, _weapon.RecoilVertical, _weapon.RecoilHorizontal);
            _agent.AddViewPunch(kick);
            SprayIndex++;

            // Une lunette de sniper se referme au tir.
            if (IsScoped && _weapon.Category == WeaponCategory.Sniper) IsScoped = false;
        }

        /// <summary>
        /// Résolution d'un impact, **host uniquement**, avec compensation de
        /// latence : Fusion rembobine les hitbox à l'instant où le client a tiré,
        /// donc le joueur touche ce qu'il voyait sur son écran.
        /// </summary>
        private void ResolveShot(Vector3 origin, Vector3 direction)
        {
            if (!HasStateAuthority) return;

            LagCompensatedHit hit;

            // API Fusion : Raycast lag-compensé. HitOptions.IncludePhysX permet de
            // toucher aussi la géométrie ordinaire (murs), pas seulement les
            // hitbox réseau.
            //
            // Le masque vient de Layers.BulletMask — Default + Hitbox +
            // Penetrable — et **exclut volontairement la couche Player** : la
            // capsule de collision d'un joueur ne doit pas arrêter une balle,
            // sinon les tirs s'arrêteraient devant la vraie hitbox et les coups à
            // la tête deviendraient impossibles.
            bool didHit = Runner.LagCompensation.Raycast(
                origin, direction, _weapon.MaxRange,
                Object.InputAuthority, out hit,
                Layers.BulletMask, HitOptions.IncludePhysX);

            if (!didHit) return;

            GameObject target = null;
            if (hit.Hitbox != null) target = hit.Hitbox.gameObject;
            else if (hit.Collider != null) target = hit.Collider.gameObject;
            if (target == null) return;

            PlayerHealth victim = target.GetComponentInParent<PlayerHealth>();
            if (victim == null || victim == _health) return;

            // Phase 5 : c'est ici que le tir allié sera filtré selon le mode de
            // jeu. En Phase 2, tout le monde peut toucher tout le monde.

            DamageZoneTag zoneTag = target.GetComponent<DamageZoneTag>();

            DamageQuery query = new DamageQuery();
            query.BaseDamage = _weapon.BaseDamage;
            query.HeadMultiplier = _weapon.HeadMultiplier;
            query.ArmorPenetration = _weapon.ArmorPenetration;
            query.RangeFalloff = _weapon.RangeFalloff;
            query.Distance = hit.Distance;
            query.Zone = zoneTag != null ? zoneTag.Zone : DamageZone.Chest;

            victim.ApplyDamage(query, _health, direction);
        }

        private void TryStartReload()
        {
            if (IsReloading) return;
            if (_weapon.MagazineSize <= 0) return;
            if (Ammo >= _weapon.MagazineSize) return;
            if (Reserve <= 0) return;

            ReloadTimer = TickTimer.CreateFromSeconds(Runner, _weapon.ReloadTime);
            IsScoped = false;
            SprayIndex = 0;
            BurstRemaining = 0;
        }

        private void CompleteReload()
        {
            int wanted = _weapon.MagazineSize - Ammo;
            int taken = Mathf.Min(wanted, Reserve);
            Ammo += taken;
            Reserve -= taken;
        }

        /// <summary>
        /// Après une courte pause, le recul repart du début du motif. Sans cela,
        /// tirer deux rafales d'affilée serait incontrôlable.
        /// </summary>
        private void ResetSprayAfterPause()
        {
            if (SprayIndex <= 0) return;

            float idleSeconds = _weapon.CycleTime * 1.7f + 0.06f;
            int idleTicks = Mathf.CeilToInt(idleSeconds / Mathf.Max(0.0001f, Runner.DeltaTime));
            if (Runner.Tick - LastShotTick > idleTicks) SprayIndex = 0;
        }
    }
}
