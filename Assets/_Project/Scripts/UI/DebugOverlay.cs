using PointDeRupture.Player;
using UnityEngine;
using UnityEngine.InputSystem;

namespace PointDeRupture.UI
{
    /// <summary>
    /// Affichage de debug, touche F3.
    ///
    /// Sert à valider objectivement la Phase 1 : on lit la vitesse en direct, ce
    /// qui permet de vérifier soi-même le counter-strafe (la vitesse doit tomber
    /// sous 0,5 m/s en ~0,11 s) et le plafond de vitesse.
    ///
    /// Volontairement en IMGUI (OnGUI) : aucun asset, aucun canvas à créer. Le
    /// vrai HUD arrivera en Phase 8 et sera, lui, en UI Toolkit / uGUI.
    /// </summary>
    public class DebugOverlay : MonoBehaviour
    {
        [Tooltip("Visible au lancement.")]
        public bool Visible = true;

        // Vitesse maximale observée depuis le dernier remise à zéro : pratique
        // pour mesurer le gain d'un air-strafe.
        private float _peakSpeed;
        private GUIStyle _style;

        private void Update()
        {
            // On passe par le nouvel Input System : la classe UnityEngine.Input
            // lève une exception quand Active Input Handling vaut
            // « Input System Package (New) », ce qui est notre réglage.
            Keyboard keyboard = Keyboard.current;
            if (keyboard != null)
            {
                if (keyboard.f3Key.wasPressedThisFrame) Visible = !Visible;
                if (keyboard.f4Key.wasPressedThisFrame) _peakSpeed = 0f;
            }

            PlayerAgent agent = PlayerAgent.Local;
            if (agent == null) return;

            float speed = agent.HorizontalSpeed;
            if (speed > _peakSpeed) _peakSpeed = speed;
        }

        private void OnGUI()
        {
            if (!Visible) return;

            PlayerAgent agent = PlayerAgent.Local;
            if (agent == null) return;

            if (_style == null)
            {
                _style = new GUIStyle(GUI.skin.label);
                _style.fontSize = 14;
                _style.normal.textColor = Color.white;
            }

            float speed = agent.HorizontalSpeed;

            GUI.Box(new Rect(10f, 10f, 260f, 132f), GUIContent.none);
            GUILayout.BeginArea(new Rect(20f, 18f, 245f, 120f));

            GUILayout.Label($"Vitesse      {speed:0.00} m/s", _style);
            GUILayout.Label($"Pic (F4=RAZ) {_peakSpeed:0.00} m/s", _style);
            GUILayout.Label($"Au sol       {(agent.IsGrounded ? "oui" : "non")}", _style);
            GUILayout.Label($"Accroupi     {agent.CrouchBlend:0.00}", _style);
            GUILayout.Label($"Vue          {agent.Yaw:0}° / {agent.Pitch:0}°", _style);
            GUILayout.Label("F3 masquer", _style);

            GUILayout.EndArea();
        }
    }
}
