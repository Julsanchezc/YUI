// Speech-to-Text (STT) and Text-to-Speech (TTS) Engine with Voice Activity Metering
// Supports ElevenLabs Primary Voice Engine (with auto-fallback to standard voices)
// Supports Multimodal Gemini Audio Recording STT for Linux Wayland & Electron

import { kalaNative } from './kala-native';

export interface SpeechCallbacks {
  onSpeechStart?: () => void;
  onSpeechResult?: (transcript: string, isFinal: boolean) => void;
  onSpeechEnd?: () => void;
  onAudioLevel?: (level: number) => void;
  onError?: (error: any) => void;
}

export class SpeechEngine {
  private isListening: boolean = false;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private levelAnimFrame: number | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  public ttsEnabled: boolean = true;
  public speechRate: number = 1.05;
  public speechPitch: number = 1.0;
  public onSpeakingChange?: (speaking: boolean) => void;
  public onSpeakingViseme?: (amplitude: number) => void;

  // ElevenLabs Primary Voice Engine Config
  public elevenLabsApiKey: string = '';
  public elevenLabsVoiceId: string = 'EXAVITQu4vr4xnSDxMaL';
  private currentAudioSource: AudioBufferSourceNode | null = null;
  private ttsAudioCtx: AudioContext | null = null;

  constructor() {
    this.loadElevenLabsConfig();
  }

  public loadElevenLabsConfig() {
    if (typeof window !== 'undefined') {
      const storedKey = localStorage.getItem('yui_elevenlabs_key');
      const storedVoice = localStorage.getItem('yui_elevenlabs_voice_id');
      const envKey = (import.meta as any).env?.VITE_ELEVENLABS_API_KEY;
      const envVoice = (import.meta as any).env?.VITE_ELEVENLABS_VOICE_ID;

      this.elevenLabsApiKey = storedKey || envKey || '';
      this.elevenLabsVoiceId = storedVoice || envVoice || 'EXAVITQu4vr4xnSDxMaL';
    }
  }

  public setElevenLabsConfig(key: string, voiceId?: string) {
    this.elevenLabsApiKey = key;
    if (voiceId) this.elevenLabsVoiceId = voiceId;
    if (typeof window !== 'undefined') {
      localStorage.setItem('yui_elevenlabs_key', key);
      if (voiceId) localStorage.setItem('yui_elevenlabs_voice_id', voiceId);
    }
  }

  // VAD & Voice Activity Detection Configuration
  private readonly RMS_SPEECH_THRESHOLD = 0.030;  // Umbral de amplitud RMS para detectar habla activa
  private readonly SILENCE_TIMEOUT_MS = 1500;     // 1.5s de silencio tras hablar detiene la grabación
  private readonly INITIAL_SILENCE_MS = 5500;     // 5.5s si el usuario no habla tras abrir el micrófono
  private readonly MAX_RECORDING_MS = 10000;      // 10s límite máximo absoluto

  private hasUserSpoken: boolean = false;
  private silenceStartTime: number | null = null;
  private recordingStartTime: number = 0;

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  private getBestMimeType(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];
    for (const type of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  // ── Speech-to-Text (STT) via MediaRecorder + Gemini 3.5 Multimodal Audio ──

  public async startListening(callbacks: SpeechCallbacks): Promise<boolean> {
    if (this.isListening) return true;

    // Trigger physical haptic feedback
    kalaNative.triggerHaptic(50);

    // Barge-in: Stop any speaking voice immediately when user initiates listening
    this.stopSpeaking();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("El navegador no soporta captura de micrófono.");
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtor();
      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      // Reset VAD state for this session
      this.hasUserSpoken = false;
      this.silenceStartTime = null;
      this.recordingStartTime = performance.now();

      const timeDomainData = new Float32Array(this.analyser.fftSize);
      const freqData = new Uint8Array(this.analyser.frequencyBinCount);

      // Realtime Audio Monitor & VAD (Silence Detector)
      const monitorAudio = () => {
        if (!this.isListening || !this.analyser) return;

        // 1. Wave visualizer audio level
        this.analyser.getByteFrequencyData(freqData);
        let freqSum = 0;
        for (let i = 0; i < freqData.length; i++) freqSum += freqData[i];
        const avgFreq = freqSum / freqData.length;
        const normalizedLevel = Math.min(1, avgFreq / 128);
        if (callbacks.onAudioLevel) {
          callbacks.onAudioLevel(normalizedLevel);
        }

        // 2. RMS Energy in time domain for Voice Activity Detection
        this.analyser.getFloatTimeDomainData(timeDomainData);
        let sumSquares = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
          const sample = timeDomainData[i];
          sumSquares += sample * sample;
        }
        const rms = Math.sqrt(sumSquares / timeDomainData.length);
        const now = performance.now();
        const elapsed = now - this.recordingStartTime;

        // 3. VAD State Machine
        if (!this.hasUserSpoken) {
          if (rms >= this.RMS_SPEECH_THRESHOLD) {
            this.hasUserSpoken = true;
            this.silenceStartTime = null;
          } else if (elapsed >= this.INITIAL_SILENCE_MS) {
            console.log("[VAD] Silencio inicial excedido (5.5s). Deteniendo escucha...");
            this.stopListening();
            return;
          }
        } else {
          // User already spoke: detect 1.5s of silence to finalize
          if (rms < this.RMS_SPEECH_THRESHOLD) {
            if (this.silenceStartTime === null) {
              this.silenceStartTime = now;
            } else if (now - this.silenceStartTime >= this.SILENCE_TIMEOUT_MS) {
              console.log("[VAD] 1.5s de silencio detectado tras locución. Finalizando grabación...");
              this.stopListening();
              return;
            }
          } else {
            // User resumed speaking
            this.silenceStartTime = null;
          }
        }

        // 4. Hard safety timeout (10s)
        if (elapsed >= this.MAX_RECORDING_MS) {
          console.log("[VAD] Timeout máximo (10s). Finalizando grabación...");
          this.stopListening();
          return;
        }

        this.levelAnimFrame = requestAnimationFrame(monitorAudio);
      };

      this.levelAnimFrame = requestAnimationFrame(monitorAudio);

      // Start MediaRecorder with best supported MIME type
      this.audioChunks = [];
      const chosenMime = this.getBestMimeType();
      const recorderOptions: MediaRecorderOptions = {};
      if (chosenMime) {
        recorderOptions.mimeType = chosenMime;
      }

      this.mediaRecorder = new MediaRecorder(this.micStream, recorderOptions);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.isListening = false;
        this.cleanAudioAnalyser();
        if (callbacks.onSpeechEnd) callbacks.onSpeechEnd();

        if (this.audioChunks.length === 0) {
          if (callbacks.onSpeechResult) callbacks.onSpeechResult("", false);
          return;
        }

        const mimeToUse = chosenMime || this.mediaRecorder?.mimeType || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type: mimeToUse });

        // If audio too short or user never spoke, gracefully return empty
        if (audioBlob.size < 600 || !this.hasUserSpoken) {
          if (callbacks.onSpeechResult) callbacks.onSpeechResult("", false);
          return;
        }

        try {
          if (callbacks.onSpeechResult) {
            callbacks.onSpeechResult("Escuchando y transcribiendo...", false);
          }
          const transcript = await this.transcribeWithGemini(audioBlob);
          if (transcript && transcript.trim()) {
            if (callbacks.onSpeechResult) {
              callbacks.onSpeechResult(transcript.trim(), true);
            }
          } else {
            if (callbacks.onSpeechResult) {
              callbacks.onSpeechResult("", false);
            }
          }
        } catch (err: any) {
          console.warn("[STT] Error transcribiendo audio con Gemini:", err);
          if (callbacks.onError) callbacks.onError(err);
        }
      };

      this.mediaRecorder.start(200);
      this.isListening = true;
      if (callbacks.onSpeechStart) callbacks.onSpeechStart();
      return true;

    } catch (e: any) {
      console.error("[STT] Error al acceder al micrófono:", e);
      this.isListening = false;
      this.cleanAudioAnalyser();
      if (callbacks.onError) callbacks.onError(e);
      return false;
    }
  }

  public stopListening() {
    if (!this.isListening) return;
    this.isListening = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    } else {
      this.cleanAudioAnalyser();
    }
  }

  public isCurrentlyListening(): boolean {
    return this.isListening;
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
    this.analyser = null;
  }

  private async transcribeWithGemini(blob: Blob): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Audio = btoa(binary);

    // Get active key from keyPool
    const { keyPool } = await import('./gemini');
    const key = keyPool.getActiveKey();
    const modelName = (import.meta as any).env?.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key.key}`;
    const cleanMime = (blob.type || "audio/webm").split(';')[0];

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: cleanMime, data: base64Audio } },
            { text: "Transcribe exactamente en español lo que dice el usuario en este audio. Si no hay voz inteligible o solo hay silencio, devuelve una cadena vacía. Devuelve ÚNICAMENTE la transcripción exacta sin comentarios adicionales, sin prefijos y sin comillas." }
          ]
        }]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn("[STT] Gemini transcription failed:", errText);
      return '';
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = rawText.replace(/^["']|["']$/g, '').trim();

    // Discard silence hallucinations
    const lower = cleaned.toLowerCase();
    if (
      lower === 'silencio' ||
      lower === '(silencio)' ||
      lower === '[silencio]' ||
      lower.includes('audio inaudible') ||
      lower.includes('no hay audio')
    ) {
      return '';
    }

    return cleaned;
  }

  // ── Text-to-Speech (TTS) ──────────────────────────────────────────────────

  public async speak(text: string, onDone?: () => void) {
    if (!this.ttsEnabled || typeof window === 'undefined') {
      if (onDone) onDone();
      return;
    }

    this.stopSpeaking();

    // Clean markdown symbols or asterisks before speaking
    const cleanText = text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/<[^>]+>/g, '') // remove HTML tags
      .replace(/#+\s+/g, '')
      .trim();

    if (!cleanText) {
      if (onDone) onDone();
      return;
    }

    // 1. Intentar primero con ElevenLabs como motor primario (con voz configurada o fallback estándar)
    if (this.elevenLabsApiKey) {
      const ok = await this.speakElevenLabs(cleanText, onDone);
      if (ok) return;
    }

    // 2. Fallback a Web Speech API del navegador
    this.speakBrowser(cleanText, onDone);
  }

  private async speakElevenLabs(text: string, onDone?: () => void, voiceOverride?: string): Promise<boolean> {
    try {
      if (this.onSpeakingChange) this.onSpeakingChange(true);

      const targetVoice = voiceOverride || this.elevenLabsVoiceId || 'EXAVITQu4vr4xnSDxMaL';
      const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'xi-api-key': this.elevenLabsApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8
          }
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson?.detail?.message || response.statusText;
        console.warn(`[ElevenLabs] Error con voz [${targetVoice}]:`, errMsg);

        // Auto fallback to free default voice (Bella: EXAVITQu4vr4xnSDxMaL) if library voice requires paid plan
        if (targetVoice !== 'EXAVITQu4vr4xnSDxMaL' && (response.status === 402 || response.status === 400 || errMsg.includes('library voices') || errMsg.includes('paid_plan'))) {
          console.log('[ElevenLabs] Usando voz estándar de alta fidelidad Bella (EXAVITQu4vr4xnSDxMaL)...');
          return this.speakElevenLabs(text, onDone, 'EXAVITQu4vr4xnSDxMaL');
        }
        return false;
      }

      const audioData = await response.arrayBuffer();
      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      this.ttsAudioCtx = new AudioCtor();
      const audioBuffer = await this.ttsAudioCtx.decodeAudioData(audioData);

      const source = this.ttsAudioCtx.createBufferSource();
      source.buffer = audioBuffer;

      const analyser = this.ttsAudioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyser.connect(this.ttsAudioCtx.destination);

      this.currentAudioSource = source;

      // Análisis FFT en tiempo real para visemas faciales de YUI
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let visemeFrame: number | null = null;

      const analyzeVisemes = () => {
        if (!this.currentAudioSource || !analyser) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const normalized = Math.min(1, avg / 110);
        if (this.onSpeakingViseme) this.onSpeakingViseme(normalized);
        visemeFrame = requestAnimationFrame(analyzeVisemes);
      };
      visemeFrame = requestAnimationFrame(analyzeVisemes);

      source.onended = () => {
        if (visemeFrame) cancelAnimationFrame(visemeFrame);
        if (this.onSpeakingChange) this.onSpeakingChange(false);
        if (this.onSpeakingViseme) this.onSpeakingViseme(0);
        this.currentAudioSource = null;
        if (onDone) onDone();
      };

      source.start(0);
      return true;

    } catch (e) {
      console.warn('[ElevenLabs] Error de reproducción TTS, usando fallback:', e);
      return false;
    }
  }

  private speakBrowser(cleanText: string, onDone?: () => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onDone) onDone();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-ES';
    utterance.rate = this.speechRate;
    utterance.pitch = this.speechPitch;

    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.lang.startsWith('es') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Sabina') || v.name.includes('Mónica')));
    if (esVoice) utterance.voice = esVoice;

    let visemeInterval: number | null = null;

    utterance.onstart = () => {
      if (this.onSpeakingChange) this.onSpeakingChange(true);
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
    if (this.currentAudioSource) {
      try { this.currentAudioSource.stop(); } catch (e) {}
      this.currentAudioSource = null;
    }
    if (this.ttsAudioCtx && this.ttsAudioCtx.state !== 'closed') {
      try { this.ttsAudioCtx.close(); } catch (e) {}
      this.ttsAudioCtx = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.onSpeakingChange) this.onSpeakingChange(false);
    if (this.onSpeakingViseme) this.onSpeakingViseme(0);
  }
}

export const speechEngine = new SpeechEngine();
