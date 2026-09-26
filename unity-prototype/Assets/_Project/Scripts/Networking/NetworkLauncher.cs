using System;
using System.Collections.Generic;
using Fusion;
using Fusion.Sockets;
using PointDeRupture.Core;
using PointDeRupture.Player;
using UnityEngine;

namespace PointDeRupture.Networking
{
    /// <summary>
    /// Point d'entrée réseau : démarre le NetworkRunner, transmet les inputs du
    /// joueur local et fait apparaître un personnage par joueur connecté.
    ///
    /// Remplace le NetworkSmokeTest de la Phase 0.
    ///
    /// Note sur l'implémentation de <see cref="INetworkRunnerCallbacks"/> : cette
    /// interface compte une vingtaine de membres et Fusion en ajuste parfois la
    /// signature d'une version à l'autre. Si ton IDE signale un membre manquant
    /// ou une signature différente, fais « Implement interface » (Ctrl+. sous
    /// Rider/Visual Studio) : un corps vide suffit, seuls OnInput,
    /// OnPlayerJoined et OnPlayerLeft font quelque chose ici.
    /// </summary>
    public class NetworkLauncher : MonoBehaviour, INetworkRunnerCallbacks
    {
        [Header("Session")]
        [Tooltip("Les deux instances doivent utiliser le même nom pour se retrouver.")]
        [SerializeField] private string _sessionName = "PDR-TEST";

        [Tooltip("Nombre maximum de joueurs.")]
        [SerializeField] private int _maxPlayers = 10;

        [Header("Références")]
        [Tooltip("Prefab du personnage. Doit porter un NetworkObject et un PlayerAgent.")]
        [SerializeField] private NetworkPrefabRef _playerPrefab;

        [Tooltip("Collecteur d'inputs local. Laisser vide : trouvé automatiquement.")]
        [SerializeField] private InputCollector _inputCollector;

        private NetworkRunner _runner;

        // Un personnage par joueur, pour pouvoir le retirer à la déconnexion.
        private readonly Dictionary<PlayerRef, NetworkObject> _avatars =
            new Dictionary<PlayerRef, NetworkObject>();

        // Points d'apparition de la scène, parcourus à tour de rôle.
        private PlayerSpawnPoint[] _spawnPoints;
        private int _nextSpawnIndex;

        private async void Start()
        {
            if (_inputCollector == null) _inputCollector = FindFirstObjectByType<InputCollector>();

            // On trie par nom : l'ordre de FindObjectsByType n'est pas garanti,
            // et on veut que « SpawnPoint_01 » soit toujours le premier attribué,
            // sinon deux lancements ne placent pas les joueurs pareil.
            _spawnPoints = FindObjectsByType<PlayerSpawnPoint>(FindObjectsSortMode.None);
            Array.Sort(_spawnPoints, (a, b) => string.CompareOrdinal(a.name, b.name));

            if (_spawnPoints.Length == 0)
                Debug.LogWarning("[Launcher] Aucun PlayerSpawnPoint dans la scène : " +
                                 "les joueurs apparaîtront à l'origine.");

            // Le Runner vit sur son propre GameObject, séparé de ce composant.
            // Raison : Fusion enregistre automatiquement les INetworkRunnerCallbacks
            // qu'il trouve sur le GameObject du Runner. En les séparant, on garde
            // un seul enregistrement — celui qu'on fait explicitement juste après —
            // et on évite un double appel d'OnPlayerJoined, qui ferait apparaître
            // deux personnages par joueur.
            GameObject runnerHost = new GameObject("NetworkRunner");
            runnerHost.transform.SetParent(transform, false);

            _runner = runnerHost.AddComponent<NetworkRunner>();
            _runner.ProvideInput = true;
            _runner.AddCallbacks(this);

            NetworkSceneManagerDefault sceneManager =
                runnerHost.AddComponent<NetworkSceneManagerDefault>();

            StartGameArgs args = new StartGameArgs
            {
                // Le premier lancé devient host, les suivants sont clients.
                // On remplacera ça par un vrai menu « créer / rejoindre » en Phase 11.
                GameMode = GameMode.AutoHostOrClient,
                SessionName = _sessionName,
                PlayerCount = _maxPlayers,
                SceneManager = sceneManager
            };

            Debug.Log($"[Launcher] Connexion à « {_sessionName} »…");
            StartGameResult result = await _runner.StartGame(args);

            if (result.Ok)
                Debug.Log($"[Launcher] Connecté en {(_runner.IsServer ? "HOST" : "CLIENT")} " +
                          $"(PlayerRef {_runner.LocalPlayer}).");
            else
                Debug.LogError($"[Launcher] Échec : {result.ShutdownReason} — {result.ErrorMessage}");
        }

        // =====================================================================
        //  Apparition des joueurs — host uniquement
        // =====================================================================

        public void OnPlayerJoined(NetworkRunner runner, PlayerRef player)
        {
            // Seul le host fait apparaître les objets réseau. Les clients les
            // reçoivent ensuite automatiquement.
            if (!runner.IsServer) return;

            Vector3 position = Vector3.zero;
            float yaw = 0f;
            if (_spawnPoints != null && _spawnPoints.Length > 0)
            {
                PlayerSpawnPoint point = _spawnPoints[_nextSpawnIndex % _spawnPoints.Length];
                _nextSpawnIndex++;
                position = point.Position;
                yaw = point.Yaw;
            }

            // On passe par onBeforeSpawned pour écrire l'orientation initiale
            // AVANT que Spawned() ne s'exécute : c'est le seul moment où l'on
            // peut initialiser des propriétés [Networked] sans que les clients
            // voient d'abord la valeur par défaut.
            float initialYaw = yaw;
            NetworkObject avatar = runner.Spawn(
                _playerPrefab,
                position,
                Quaternion.Euler(0f, yaw, 0f),
                player,
                (r, obj) =>
                {
                    PlayerAgent agent = obj.GetComponent<PlayerAgent>();
                    if (agent != null) agent.InitialiseSpawn(initialYaw);
                });

            _avatars[player] = avatar;
            Debug.Log($"[Launcher] Joueur {player} arrivé, personnage créé.");
        }

        public void OnPlayerLeft(NetworkRunner runner, PlayerRef player)
        {
            if (!runner.IsServer) return;

            NetworkObject avatar;
            if (!_avatars.TryGetValue(player, out avatar)) return;

            runner.Despawn(avatar);
            _avatars.Remove(player);
            Debug.Log($"[Launcher] Joueur {player} parti, personnage retiré.");
        }

        // =====================================================================
        //  Inputs — appelé une fois par tick sur le client local
        // =====================================================================

        public void OnInput(NetworkRunner runner, NetworkInput input)
        {
            if (_inputCollector == null) return;

            // Consume() vide la rotation de souris accumulée : à n'appeler qu'ici,
            // et une seule fois par tick.
            input.Set(_inputCollector.Consume());
        }

        public void OnInputMissing(NetworkRunner runner, PlayerRef player, NetworkInput input)
        {
            // Input perdu (paquet en retard). Fusion réutilise le dernier reçu,
            // ce qui est le bon comportement : le personnage continue son geste
            // au lieu de s'arrêter net.
        }

        // =====================================================================
        //  Reste de l'interface — journalisation ou sans effet pour l'instant
        // =====================================================================

        public void OnShutdown(NetworkRunner runner, ShutdownReason shutdownReason)
        {
            Debug.Log($"[Launcher] Arrêt du runner : {shutdownReason}");
            _avatars.Clear();
        }

        public void OnConnectedToServer(NetworkRunner runner)
        {
            Debug.Log("[Launcher] Connecté au host.");
        }

        public void OnDisconnectedFromServer(NetworkRunner runner, NetDisconnectReason reason)
        {
            Debug.LogWarning($"[Launcher] Déconnecté du host : {reason}");
        }

        public void OnConnectRequest(NetworkRunner runner,
            NetworkRunnerCallbackArgs.ConnectRequest request, byte[] token)
        {
            // Phase 11 : c'est ici qu'on vérifiera le mot de passe de la partie.
            request.Accept();
        }

        public void OnConnectFailed(NetworkRunner runner, NetAddress remoteAddress,
            NetConnectFailedReason reason)
        {
            Debug.LogError($"[Launcher] Connexion refusée : {reason}");
        }

        public void OnUserSimulationMessage(NetworkRunner runner, SimulationMessagePtr message) { }

        public void OnSessionListUpdated(NetworkRunner runner, List<SessionInfo> sessionList) { }

        public void OnCustomAuthenticationResponse(NetworkRunner runner,
            Dictionary<string, object> data) { }

        public void OnHostMigration(NetworkRunner runner, HostMigrationToken hostMigrationToken)
        {
            // Phase 12. Demande de sérialiser l'état du match pour le reprendre.
        }

        public void OnReliableDataReceived(NetworkRunner runner, PlayerRef player, ReliableKey key,
            ArraySegment<byte> data) { }

        public void OnReliableDataProgress(NetworkRunner runner, PlayerRef player, ReliableKey key,
            float progress) { }

        public void OnSceneLoadDone(NetworkRunner runner) { }

        public void OnSceneLoadStart(NetworkRunner runner) { }

        public void OnObjectEnterAOI(NetworkRunner runner, NetworkObject obj, PlayerRef player) { }

        public void OnObjectExitAOI(NetworkRunner runner, NetworkObject obj, PlayerRef player) { }
    }
}
