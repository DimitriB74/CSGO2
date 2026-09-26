// =============================================================================
//  Sons synthétisés à la volée avec l'API Web Audio.
//
//  Aucun fichier audio dans le dépôt : tout est généré par oscillateurs et bruit
//  filtré. Le jeu reste léger à télécharger, et il n'y a aucune question de
//  droits sur des sons empruntés.
// =============================================================================

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.volume = 0.5;
  }

  /** À appeler depuis un clic : les navigateurs refusent l'audio autrement. */
  start() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    // Une seconde de bruit blanc, réutilisée pour tous les sons percussifs.
    const length = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  /** Atténuation selon la distance : un tir lointain doit rester discret. */
  gainFor(distance) {
    if (distance === undefined) return 1;
    return Math.max(0, 1 - distance / 90) ** 1.6;
  }

  noise({ duration, cutoff, gain, decay = 18, type = 'lowpass' }) {
    if (!this.ctx) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;

    const envelope = this.ctx.createGain();
    const now = this.ctx.currentTime;
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(filter).connect(envelope).connect(this.master);
    source.start(now);
    source.stop(now + duration);
  }

  tone({ freq, endFreq, duration, gain, type = 'sine' }) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    const now = this.ctx.currentTime;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + duration);

    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(envelope).connect(this.master);
    osc.start(now);
    osc.stop(now + duration);
  }

  /** Détonation : un claquement de bruit plus un coup de corps grave. */
  shot(category, distance) {
    const g = this.gainFor(distance);
    if (g <= 0.01) return;

    const profile = {
      pistol: { cut: 3200, dur: 0.16, body: 300, gain: 0.5 },
      smg: { cut: 3600, dur: 0.13, body: 380, gain: 0.44 },
      shotgun: { cut: 2000, dur: 0.3, body: 150, gain: 0.7 },
      rifle: { cut: 2600, dur: 0.22, body: 210, gain: 0.62 },
      sniper: { cut: 1700, dur: 0.42, body: 120, gain: 0.8 },
      mg: { cut: 2400, dur: 0.2, body: 190, gain: 0.6 },
      melee: { cut: 5000, dur: 0.1, body: 0, gain: 0.3 },
    }[category] ?? { cut: 2600, dur: 0.2, body: 220, gain: 0.55 };

    this.noise({ duration: profile.dur, cutoff: profile.cut, gain: profile.gain * g });
    if (profile.body) {
      this.tone({ freq: profile.body, endFreq: profile.body * 0.4, duration: profile.dur * 1.3, gain: 0.34 * g });
    }
  }

  impact(distance) {
    this.noise({ duration: 0.09, cutoff: 5200, gain: 0.22 * this.gainFor(distance), type: 'highpass' });
  }

  hit() {
    this.tone({ freq: 680, endFreq: 420, duration: 0.07, gain: 0.3, type: 'triangle' });
  }

  headshot() {
    this.tone({ freq: 1500, endFreq: 900, duration: 0.11, gain: 0.34, type: 'square' });
  }

  hurt() {
    this.noise({ duration: 0.18, cutoff: 700, gain: 0.5 });
    this.tone({ freq: 160, endFreq: 90, duration: 0.25, gain: 0.3 });
  }

  explosion(distance) {
    const g = this.gainFor(distance);
    this.noise({ duration: 1.1, cutoff: 800, gain: 0.85 * g, decay: 4 });
    this.tone({ freq: 70, endFreq: 28, duration: 1.2, gain: 0.55 * g });
  }

  beep() {
    this.tone({ freq: 1750, duration: 0.07, gain: 0.16, type: 'square' });
  }

  plant() {
    this.tone({ freq: 520, endFreq: 760, duration: 0.3, gain: 0.3, type: 'square' });
  }

  defuse() {
    this.tone({ freq: 880, endFreq: 1320, duration: 0.5, gain: 0.3, type: 'triangle' });
  }

  buy() {
    this.tone({ freq: 1200, duration: 0.06, gain: 0.2, type: 'square' });
  }

  roundStart() {
    for (const [i, freq] of [196, 294, 392].entries()) {
      setTimeout(() => this.tone({ freq, duration: 0.5, gain: 0.16, type: 'triangle' }), i * 90);
    }
  }
}
