import { registerPlugin, Capacitor } from '@capacitor/core';

export interface KalaAssistantPlugin {
  startWakeWord(): Promise<{ running: boolean }>;
  stopWakeWord(): Promise<{ running: boolean }>;
  isWakeWordActive(): Promise<{ running: boolean }>;
  triggerHaptic(options?: { duration?: number }): Promise<void>;
  openAssistantSettings(): Promise<void>;
}

const KalaAssistant = registerPlugin<KalaAssistantPlugin>('KalaAssistant');

export class KalaNativeService {
  private static instance: KalaNativeService;

  public static getInstance(): KalaNativeService {
    if (!KalaNativeService.instance) {
      KalaNativeService.instance = new KalaNativeService();
    }
    return KalaNativeService.instance;
  }

  public isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  public isMobile(): boolean {
    if (this.isNative()) return true;
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 640 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  public async startWakeWord(): Promise<boolean> {
    if (!this.isNative()) {
      console.log('[KalaNative] Wake Word sólo disponible en Android Nativo');
      return false;
    }
    try {
      const res = await KalaAssistant.startWakeWord();
      localStorage.setItem('kala_wake_word_enabled', 'true');
      return res.running;
    } catch (e) {
      console.warn('[KalaNative] Error iniciando wake word:', e);
      return false;
    }
  }

  public async stopWakeWord(): Promise<boolean> {
    if (!this.isNative()) return false;
    try {
      const res = await KalaAssistant.stopWakeWord();
      localStorage.setItem('kala_wake_word_enabled', 'false');
      return res.running;
    } catch (e) {
      console.warn('[KalaNative] Error deteniendo wake word:', e);
      return false;
    }
  }

  public async isWakeWordActive(): Promise<boolean> {
    if (!this.isNative()) return false;
    try {
      const res = await KalaAssistant.isWakeWordActive();
      return res.running;
    } catch (e) {
      return false;
    }
  }

  public async triggerHaptic(duration: number = 60): Promise<void> {
    if (this.isNative()) {
      try {
        await KalaAssistant.triggerHaptic({ duration });
        return;
      } catch (e) {
        // Fallback
      }
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch (e) {}
    }
  }

  public async openAssistantSettings(): Promise<void> {
    if (this.isNative()) {
      try {
        await KalaAssistant.openAssistantSettings();
      } catch (e) {
        console.warn('[KalaNative] Error abriendo ajustes:', e);
      }
    } else {
      alert("En Android, ve a: Ajustes > Aplicaciones > Aplicaciones predeterminadas > Asistente digital > Selecciona Kala");
    }
  }
}

export const kalaNative = KalaNativeService.getInstance();
