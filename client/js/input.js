// Clavier et souris. Les angles de vue sont possédés par le client — c'est ce
// qui rend la visée instantanée — puis envoyés au serveur, qui les borne.

import { BTN } from '/shared/constants.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { left: false, right: false };
    this.yaw = 0;
    this.pitch = 0;
    this.respawnSeq = 0;
    this.slotRequest = 0;
    this.locked = false;
    this.sensitivity = 2.2;
    this.enabled = false;
    this.onToggleBuy = () => {};
    this.onToggleScoreboard = () => {};

    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('mousedown', (e) => this.onMouse(e, true));
    addEventListener('mouseup', (e) => this.onMouse(e, false));
    addEventListener('mousemove', (e) => this.onMove(e));
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.keys.clear();
        this.mouse.left = false;
        this.mouse.right = false;
      }
    });
  }

  lock() {
    if (!this.locked) this.canvas.requestPointerLock();
  }

  unlock() {
    if (this.locked) document.exitPointerLock();
  }

  onKey(event, down) {
    if (!this.enabled) return;
    const code = event.code;

    if (down && code === 'KeyB') {
      this.onToggleBuy();
      event.preventDefault();
      return;
    }
    if (code === 'Tab') {
      this.onToggleScoreboard(down);
      event.preventDefault();
      return;
    }
    if (down && code === 'Escape') {
      this.unlock();
      return;
    }
    if (down && /^Digit[1-3]$/.test(code)) {
      this.slotRequest = Number(code.slice(5));
    }

    if (down) this.keys.add(code);
    else this.keys.delete(code);

    // Espace et Tab font défiler la page sinon.
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(code)) event.preventDefault();
  }

  onMouse(event, down) {
    if (!this.enabled) return;
    if (event.button === 0) this.mouse.left = down;
    if (event.button === 2) this.mouse.right = down;
  }

  onMove(event) {
    if (!this.locked) return;
    // 0,022 degré par unité de souris : la référence des FPS tactiques. On règle
    // la vitesse avec la sensibilité, jamais avec ce coefficient.
    const scale = this.sensitivity * 0.022;
    this.yaw = (this.yaw + event.movementX * scale) % 360;
    this.pitch = Math.max(-89, Math.min(89, this.pitch + event.movementY * scale));
  }

  /** Une touche parmi les dispositions AZERTY et QWERTY. */
  held(...codes) {
    for (const code of codes) if (this.keys.has(code)) return true;
    return false;
  }

  build(seq) {
    let mx = 0;
    let mz = 0;
    if (this.locked) {
      if (this.held('KeyW', 'KeyZ', 'ArrowUp')) mz += 1;
      if (this.held('KeyS', 'ArrowDown')) mz -= 1;
      if (this.held('KeyD', 'ArrowRight')) mx += 1;
      if (this.held('KeyA', 'KeyQ', 'ArrowLeft')) mx -= 1;
    }

    // On normalise la diagonale, sinon elle irait 1,41 fois plus vite.
    const magnitude = Math.hypot(mx, mz);
    if (magnitude > 1) {
      mx /= magnitude;
      mz /= magnitude;
    }

    let btn = 0;
    if (this.locked) {
      if (this.mouse.left) btn |= BTN.FIRE;
      if (this.mouse.right) btn |= BTN.ALT;
      if (this.held('KeyR')) btn |= BTN.RELOAD;
      if (this.held('Space')) btn |= BTN.JUMP;
      if (this.held('ControlLeft', 'ControlRight')) btn |= BTN.CROUCH;
      if (this.held('ShiftLeft', 'ShiftRight')) btn |= BTN.WALK;
      if (this.held('KeyE')) btn |= BTN.USE;
    }

    const slot = this.slotRequest;
    this.slotRequest = 0;

    // `rs` dit au serveur quelle apparition on a déjà vue : il ignore notre
    // orientation tant qu'on n'a pas pris connaissance de la dernière.
    return { t: 'input', seq, rs: this.respawnSeq, mx, mz, yaw: this.yaw, pitch: this.pitch, btn, slot };
  }
}
