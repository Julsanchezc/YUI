// Procedural Sound Synthesizer using Web Audio API
// Generates clean, crisp UI micro-sounds without external WAV assets

export type SoundEffect =
  | 'peek' | 'open' | 'close' | 'hover' | 'blip' | 'slap' | 'annoyed'
  | 'dizzy' | 'greet' | 'work' | 'finish' | 'error' | 'approval'
  | 'question' | 'approve' | 'gulp' | 'tick' | 'send' | 'love'
  | 'pop' | 'proud' | 'wink' | 'think';

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;
  public volume: number = 0.2;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public play(name: SoundEffect) {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      switch (name) {
        case 'hover':
          this.playTone(880, 0.04, 'sine', 0.05);
          break;
        case 'peek':
          this.playSweep(400, 750, 0.08, 'sine', 0.1);
          break;
        case 'open':
          this.playSweep(300, 600, 0.12, 'sine', 0.15);
          break;
        case 'close':
          this.playSweep(600, 250, 0.1, 'sine', 0.12);
          break;
        case 'blip':
        case 'pop':
          this.playTone(1200, 0.03, 'triangle', 0.15);
          break;
        case 'greet':
          // Little cute double chirp
          this.playSweep(520, 880, 0.08, 'sine', 0.18);
          setTimeout(() => this.playSweep(880, 1320, 0.1, 'sine', 0.2), 90);
          break;
        case 'think':
          this.playTone(660, 0.05, 'sine', 0.08);
          setTimeout(() => this.playTone(740, 0.05, 'sine', 0.08), 70);
          break;
        case 'question':
          this.playSweep(440, 780, 0.15, 'triangle', 0.18);
          break;
        case 'approval':
          this.playSweep(500, 650, 0.1, 'sine', 0.2);
          setTimeout(() => this.playSweep(650, 850, 0.15, 'sine', 0.2), 110);
          break;
        case 'approve':
        case 'finish':
          // Harmonious happy chord
          this.playChord([523.25, 659.25, 783.99, 1046.50], 0.22, 'sine', 0.18);
          break;
        case 'slap':
          this.playNoise(0.06, 0.22);
          break;
        case 'annoyed':
          this.playSweep(340, 180, 0.18, 'sawtooth', 0.12);
          break;
        case 'dizzy':
          // Wobble
          this.playWobble(400, 0.45, 0.16);
          break;
        case 'gulp':
          // Drag & drop swallow sound
          this.playSweep(600, 200, 0.15, 'sine', 0.25);
          break;
        case 'error':
          this.playTone(180, 0.25, 'sawtooth', 0.2);
          break;
        case 'send':
          this.playSweep(400, 1200, 0.12, 'sine', 0.16);
          break;
        case 'love':
          this.playSweep(600, 900, 0.15, 'sine', 0.2);
          break;
        case 'proud':
        case 'wink':
          this.playSweep(700, 1100, 0.09, 'sine', 0.15);
          break;
        default:
          this.playTone(600, 0.05, 'sine', 0.1);
      }
    } catch (e) {
      // Audio autoplay policy or device busy
    }
  }

  private playTone(freq: number, duration: number, type: OscillatorType, gainLevel = 0.15) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(gainLevel * this.volume * 5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private playSweep(fStart: number, fEnd: number, duration: number, type: OscillatorType, gainLevel = 0.15) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fStart, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, fEnd), this.ctx.currentTime + duration);
    gain.gain.setValueAtTime(gainLevel * this.volume * 5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private playChord(freqs: number[], duration: number, type: OscillatorType, gainLevel = 0.1) {
    if (!this.ctx) return;
    freqs.forEach(freq => {
      this.playTone(freq, duration, type, gainLevel / freqs.length);
    });
  }

  private playWobble(baseFreq: number, duration: number, gainLevel = 0.15) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const now = this.ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      const t = now + (i * duration) / 8;
      const f = baseFreq + (i % 2 === 0 ? 120 : -120);
      osc.frequency.setValueAtTime(f, t);
    }
    gain.gain.setValueAtTime(gainLevel * this.volume * 5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(now + duration);
  }

  private playNoise(duration: number, gainLevel = 0.15) {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainLevel * this.volume * 5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    noise.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();
  }
}

export const Sound = new SoundSynthesizer();
