// Speech-to-Text (STT) and Text-to-Speech (TTS) Engine with Voice Activity Metering
// Supports ElevenLabs Primary Voice Engine (with auto-fallback to standard voices)
// Supports Multimodal Gemini Audio Recording STT for Linux Wayland & Electron

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
  public elevenLabsVoiceId: string = 'IqGIz3dgA7lYSRe3s8tS';
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
      this.elevenLabsVoiceId = storedVoice || envVoice || 'IqGIz3dgA7lYSRe3s8tS';
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

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  // ── Speech-to-Text (STT) via MediaRecorder + Gemini 3.5 Multimodal Audio ──

  public async startListening(callbacks: SpeechCallbacks): Promise<boolean> {
    if (this.isListening) return true;

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
          noiseSuppression: true
        }
      });

      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtor();
      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      // Realtime Audio Level Analyser for Wave Visualizer
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

      // Start MediaRecorder
      this.audioChunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm';

      this.mediaRecorder = new MediaRecorder(this.micStream, { mimeType });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.isListening = false;
        this.cleanAudioAnalyser();
        if (callbacks.onSpeechEnd) callbacks.onSpeechEnd();

        if (this.audioChunks.length === 0) return;
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        if (audioBlob.size < 600) return; // Audio too short or empty

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
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: blob.type.split(';')[0] || "audio/webm", data: base64Audio } },
            { text: "Transcribe exactamente en español lo que dice el usuario en este audio. Devuelve ÚNICAMENTE la transcripción exacta sin comentarios adicionales, sin prefijos y sin comillas." }
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
    return rawText.replace(/^["']|["']$/g, '').trim();
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
