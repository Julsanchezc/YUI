// Speech-to-Text (STT) and Text-to-Speech (TTS) Engine with Voice Activity Metering

export interface SpeechCallbacks {
  onSpeechStart?: () => void;
  onSpeechResult?: (transcript: string, isFinal: boolean) => void;
  onSpeechEnd?: () => void;
  onAudioLevel?: (level: number) => void;
  onError?: (error: any) => void;
}

export class SpeechEngine {
  private recognition: any = null;
  private isListening: boolean = false;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private levelAnimFrame: number | null = null;

  public ttsEnabled: boolean = true;
  public speechRate: number = 1.05;
  public speechPitch: number = 1.0;
  public onSpeakingChange?: (speaking: boolean) => void;
  public onSpeakingViseme?: (amplitude: number) => void;

  constructor() {
    this.initRecognition();
  }

  private initRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      this.recognition = new SpeechRec();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'es-ES';
    }
  }

  public isSupported(): boolean {
    return !!this.recognition;
  }

  public async startListening(callbacks: SpeechCallbacks): Promise<boolean> {
    if (this.isListening) return true;

    // Barge-in: Stop any speaking voice immediately when user initiates listening
    this.stopSpeaking();

    // Start Audio Level Analyser for reactive visuals
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
        this.audioCtx = new AudioCtor();
        const source = this.audioCtx.createMediaStreamSource(this.micStream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 64;
        source.connect(this.analyser);

        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        const checkLevel = () => {
          if (!this.isListening || !this.analyser) return;
          this.analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const normalized = Math.min(1, avg / 128);
          if (callbacks.onAudioLevel) {
            callbacks.onAudioLevel(normalized);
          }
          this.levelAnimFrame = requestAnimationFrame(checkLevel);
        };
        this.levelAnimFrame = requestAnimationFrame(checkLevel);
      }
    } catch (e) {
      console.warn("Microphone analyser not accessible:", e);
    }

    if (!this.recognition) {
      this.initRecognition();
      if (!this.recognition) return false;
    }

    this.recognition.onstart = () => {
      this.isListening = true;
      if (callbacks.onSpeechStart) callbacks.onSpeechStart();
    };

    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript && callbacks.onSpeechResult) {
        callbacks.onSpeechResult(finalTranscript.trim(), true);
      } else if (interimTranscript && callbacks.onSpeechResult) {
        callbacks.onSpeechResult(interimTranscript.trim(), false);
      }
    };

    this.recognition.onerror = (event: any) => {
      console.warn("Speech recognition error:", event.error);
      if (callbacks.onError) callbacks.onError(event);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.cleanAudioAnalyser();
      if (callbacks.onSpeechEnd) callbacks.onSpeechEnd();
    };

    try {
      this.recognition.start();
      return true;
    } catch (e) {
      console.error("Failed to start speech recognition:", e);
      return false;
    }
  }

  public stopListening() {
    if (!this.isListening) return;
    this.isListening = false;
    try {
      if (this.recognition) this.recognition.stop();
    } catch (e) {}
    this.cleanAudioAnalyser();
  }

  private cleanAudioAnalyser() {
    if (this.levelAnimFrame) {
      cancelAnimationFrame(this.levelAnimFrame);
      this.levelAnimFrame = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try { this.audioCtx.close(); } catch (e) {}
      this.audioCtx = null;
    }
  }

  // ── Text-to-Speech (TTS) ──────────────────────────────────────────────────

  public speak(text: string, onDone?: () => void) {
    if (!this.ttsEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onDone) onDone();
      return;
    }

    // Cancel any previous utterance
    window.speechSynthesis.cancel();

    // Clean markdown symbols or asterisks before speaking
    const cleanText = text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/#+\s+/g, '')
      .trim();

    if (!cleanText) {
      if (onDone) onDone();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-ES';
    utterance.rate = this.speechRate;
    utterance.pitch = this.speechPitch;

    // Pick best available Spanish voice
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.lang.startsWith('es') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Sabina') || v.name.includes('Mónica')));
    if (esVoice) utterance.voice = esVoice;

    let visemeInterval: number | null = null;

    utterance.onstart = () => {
      if (this.onSpeakingChange) this.onSpeakingChange(true);
      // Simulate viseme pulses for facial animation
      visemeInterval = window.setInterval(() => {
        if (this.onSpeakingViseme) {
          const amp = 0.2 + Math.random() * 0.8;
          this.onSpeakingViseme(amp);
        }
      }, 80);
    };

    const cleanup = () => {
      if (visemeInterval) {
        clearInterval(visemeInterval);
        visemeInterval = null;
      }
      if (this.onSpeakingChange) this.onSpeakingChange(false);
      if (this.onSpeakingViseme) this.onSpeakingViseme(0);
      if (onDone) onDone();
    };

    utterance.onend = cleanup;
    utterance.onerror = cleanup;

    window.speechSynthesis.speak(utterance);
  }

  public stopSpeaking() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      if (this.onSpeakingChange) this.onSpeakingChange(false);
      if (this.onSpeakingViseme) this.onSpeakingViseme(0);
    }
  }
}

export const speechEngine = new SpeechEngine();
