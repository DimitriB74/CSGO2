using Fusion;
using UnityEngine;
using UnityEngine.InputSystem;

namespace PointDeRupture.Networking
{
    /// <summary>
    /// Lit le clavier et la souris **en local**, à la fréquence d'affichage, et
    /// accumule le résultat jusqu'au prochain tick réseau.
    ///
    /// Pourquoi accumuler : l'affichage tourne souvent à 144 Hz ou plus, la
    /// simulation à 64 Hz. Si on lisait la souris uniquement au moment du tick,
    /// on perdrait une partie du mouvement et la visée serait saccadée. Ici, tous
    /// les déplacements de souris entre deux ticks sont additionnés, puis envoyés
    /// d'un bloc.
    ///
    /// Ce composant ne contient aucune logique de jeu : il traduit du matériel en
    /// <see cref="NetInput"/>.
    /// </summary>
    public class InputCollector : MonoBehaviour
    {
        [Header("Visée")]
        [Tooltip("Sensibilité de la souris. 2 = valeur de départ confortable.")]
        [Range(0.1f, 10f)] public float Sensitivity = 2f;

        [Tooltip("Degrés par unité de déplacement souris. 0,022 est la référence " +
                 "des FPS tactiques : ne pas y toucher, régler la sensibilité.")]
        public float DegreesPerCount = 0.022f;

        [Tooltip("Inverser l'axe vertical.")]
        public bool InvertY;

        // Rotation accumulée depuis le dernier tick, en degrés.
        private Vector2 _pendingLook;

        // Le tableau de scores est un état maintenu, pas une impulsion : on le
        // garde hors de l'accumulation pour qu'il reste lisible tel quel.
        private bool _cursorLocked;

        private void Start()
        {
            LockCursor(true);
        }

        private void Update()
        {
            Mouse mouse = Mouse.current;
            Keyboard keyboard = Keyboard.current;
            if (mouse == null || keyboard == null) return;

            // Échap libère la souris (indispensable pour sortir du jeu en
            // fenêtré et pour cliquer dans l'éditeur).
            if (keyboard.escapeKey.wasPressedThisFrame) LockCursor(!_cursorLocked);

            // Clic dans la fenêtre : on reprend la souris.
            if (!_cursorLocked && mouse.leftButton.wasPressedThisFrame
                && Application.isFocused) LockCursor(true);

            if (!_cursorLocked) return;

            Vector2 delta = mouse.delta.ReadValue();
            float scale = Sensitivity * DegreesPerCount;

            _pendingLook.x += delta.x * scale;                              // lacet
            _pendingLook.y += delta.y * scale * (InvertY ? 1f : -1f);       // tangage
        }

        /// <summary>
        /// Construit l'input du tick et **remet à zéro** la rotation accumulée.
        /// Appelé une seule fois par tick, depuis
        /// <see cref="NetworkLauncher.OnInput"/>.
        /// </summary>
        public NetInput Consume()
        {
            NetInput input = new NetInput();

            Keyboard keyboard = Keyboard.current;
            Mouse mouse = Mouse.current;
            if (keyboard == null || mouse == null) return input;

            // --- déplacement ---------------------------------------------------
            Vector2 move = Vector2.zero;
            if (keyboard.wKey.isPressed) move.y += 1f;
            if (keyboard.sKey.isPressed) move.y -= 1f;
            if (keyboard.dKey.isPressed) move.x += 1f;
            if (keyboard.aKey.isPressed) move.x -= 1f;

            // On normalise pour que la diagonale n'aille pas 1,41 fois plus vite.
            input.Move = move.sqrMagnitude > 1f ? move.normalized : move;

            // --- visée ---------------------------------------------------------
            input.LookDelta = _pendingLook;
            _pendingLook = Vector2.zero;

            // --- boutons -------------------------------------------------------
            NetworkButtons buttons = default(NetworkButtons);
            buttons.Set((int)PlayerButton.Fire, _cursorLocked && mouse.leftButton.isPressed);
            buttons.Set((int)PlayerButton.AltFire, _cursorLocked && mouse.rightButton.isPressed);
            buttons.Set((int)PlayerButton.Reload, keyboard.rKey.isPressed);
            buttons.Set((int)PlayerButton.Jump, keyboard.spaceKey.isPressed);
            buttons.Set((int)PlayerButton.Crouch, keyboard.leftCtrlKey.isPressed);
            buttons.Set((int)PlayerButton.Walk, keyboard.leftShiftKey.isPressed);
            buttons.Set((int)PlayerButton.Use, keyboard.eKey.isPressed);
            buttons.Set((int)PlayerButton.Buy, keyboard.bKey.isPressed);
            buttons.Set((int)PlayerButton.Scoreboard, keyboard.tabKey.isPressed);
            input.Buttons = buttons;

            // --- slot d'arme (Phase 3) ----------------------------------------
            if (keyboard.digit1Key.isPressed) input.WeaponSlot = 1;
            else if (keyboard.digit2Key.isPressed) input.WeaponSlot = 2;
            else if (keyboard.digit3Key.isPressed) input.WeaponSlot = 3;
            else if (keyboard.digit4Key.isPressed) input.WeaponSlot = 4;
            else if (keyboard.digit5Key.isPressed) input.WeaponSlot = 5;

            return input;
        }

        private void LockCursor(bool locked)
        {
            _cursorLocked = locked;
            Cursor.lockState = locked ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !locked;
        }

        private void OnDisable()
        {
            // On rend la souris : sinon elle reste captive après un arrêt du jeu
            // depuis l'éditeur.
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }
    }
}
