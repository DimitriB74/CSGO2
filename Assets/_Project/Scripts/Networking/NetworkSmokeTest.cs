using Fusion;
using UnityEngine;

namespace PointDeRupture.Networking
{
    /// <summary>
    /// Test de fumée de la Phase 0.
    ///
    /// Ce script ne fait qu'une chose : démarrer un NetworkRunner et afficher
    /// dans la console qui est connecté. Il sert uniquement à valider que
    /// l'installation est correcte (SDK importé, App ID renseigné, réseau
    /// joignable) AVANT d'écrire la moindre ligne de gameplay.
    ///
    /// Il sera supprimé en Phase 1 et remplacé par un vrai NetworkLauncher.
    ///
    /// Mise en place : un GameObject vide nommé "__SmokeTest" dans la scène
    /// 00_Bootstrap, avec ce composant. Rien d'autre.
    /// </summary>
    public class NetworkSmokeTest : MonoBehaviour
    {
        [Header("Session")]
        [Tooltip("Les deux instances doivent utiliser exactement le même nom " +
                 "de session pour se retrouver.")]
        [SerializeField] private string _sessionName = "PDR-TEST";

        [Tooltip("Nombre maximum de joueurs dans la session.")]
        [SerializeField] private int _playerCount = 10;

        private NetworkRunner _runner;

        // Dernier effectif connu, pour ne journaliser que les changements.
        private int _lastLoggedPlayerCount = -1;

        private async void Start()
        {
            // Le Runner est le coeur de Fusion : une instance = une connexion.
            _runner = gameObject.AddComponent<NetworkRunner>();

            // On déclare que ce pair fournira des inputs (indispensable dès
            // qu'on contrôlera un personnage, donc autant le mettre tout de suite).
            _runner.ProvideInput = true;

            // Le gestionnaire de scènes par défaut suffit tant qu'on ne charge
            // pas de map par le réseau. Si cette ligne ne compile pas chez toi,
            // supprime-la : elle est optionnelle à ce stade.
            NetworkSceneManagerDefault sceneManager =
                gameObject.AddComponent<NetworkSceneManagerDefault>();

            StartGameArgs args = new StartGameArgs
            {
                // AutoHostOrClient : le premier lancé devient host, les suivants
                // se connectent en clients. Parfait pour tester à deux sans
                // interface de menu.
                GameMode = GameMode.AutoHostOrClient,
                SessionName = _sessionName,
                PlayerCount = _playerCount,
                SceneManager = sceneManager
            };

            Debug.Log($"[SmokeTest] Connexion à la session « {_sessionName} »…");

            StartGameResult result = await _runner.StartGame(args);

            if (result.Ok)
            {
                Debug.Log($"[SmokeTest] Connecté. Rôle : " +
                          $"{(_runner.IsServer ? "HOST" : "CLIENT")} — " +
                          $"mon PlayerRef : {_runner.LocalPlayer}");
            }
            else
            {
                // Les deux causes les plus fréquentes ici : App ID absent ou
                // invalide, et pare-feu qui bloque la sortie UDP.
                Debug.LogError($"[SmokeTest] Échec de la connexion : " +
                               $"{result.ShutdownReason} — {result.ErrorMessage}");
            }
        }

        private void Update()
        {
            if (_runner == null || !_runner.IsRunning) return;

            int count = 0;
            foreach (PlayerRef unused in _runner.ActivePlayers) count++;

            if (count == _lastLoggedPlayerCount) return;
            _lastLoggedPlayerCount = count;

            Debug.Log($"[SmokeTest] Joueurs dans la session : {count}");
        }

        private void OnDestroy()
        {
            // On ferme proprement pour ne pas laisser une session fantôme
            // ouverte côté Photon entre deux lancements de l'éditeur.
            if (_runner != null && _runner.IsRunning) _runner.Shutdown();
        }
    }
}
