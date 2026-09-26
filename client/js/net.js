// Liaison WebSocket. Le client n'envoie que des intentions ; tout ce qui compte
// est décidé par le serveur.

export class Net {
  constructor() {
    this.socket = null;
    this.init = null;
    this.snapshots = [];
    this.lastMs = 0;
    this.latency = 0;
    this.onInit = () => {};
    this.onSnapshot = () => {};
    this.onStatus = () => {};
    this.onBuyResult = () => {};
  }

  connect(name) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.onStatus('Connexion au serveur…');

    this.socket.addEventListener('open', () => {
      this.socket.send(JSON.stringify({ t: 'join', name }));
      this.onStatus('Connecté.');
    });

    this.socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.t === 'init') {
        this.init = msg;
        this.onInit(msg);
      } else if (msg.t === 's') {
        // On mesure la latence sur l'horodatage renvoyé au tour suivant.
        if (this.lastMs > 0) {
          const rtt = Date.now() - this.lastSentAt;
          if (rtt >= 0 && rtt < 2000) this.latency = this.latency * 0.8 + rtt * 0.2;
        }
        this.lastMs = msg.ms;
        this.snapshots.push({ snap: msg, at: performance.now() });
        if (this.snapshots.length > 24) this.snapshots.shift();
        this.onSnapshot(msg);
      } else if (msg.t === 'buyResult') {
        this.onBuyResult(msg);
      }
    });

    this.socket.addEventListener('close', () => this.onStatus('Connexion perdue. Recharge la page.'));
    this.socket.addEventListener('error', () => this.onStatus('Erreur de connexion.'));
  }

  get ready() {
    return this.socket && this.socket.readyState === 1;
  }

  send(obj) {
    if (this.ready) this.socket.send(JSON.stringify(obj));
  }

  sendInput(input) {
    if (!this.ready) return;
    this.lastSentAt = Date.now();
    input.lastMs = this.lastMs;
    this.socket.send(JSON.stringify(input));
  }
}
