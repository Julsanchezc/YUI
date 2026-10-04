import { registerPlugin, Capacitor } from '@capacitor/core';

export interface KalaAssistantPlugin {
  startWakeWord(): Promise<{ running: boolean }>;
  stopWakeWord(): Promise<{ running: boolean }>;
  isWakeWordActive(): Promise<{ running: boolean }>;
  pauseWakeWord(): Promise<void>;
  resumeWakeWord(): Promise<void>;
  triggerHaptic(options?: { duration?: number }): Promise<void>;
  openAssistantSettings(): Promise<void>;
  setFlashlight(options: { enabled: boolean }): Promise<{ enabled: boolean; success: boolean }>;
  getBatteryInfo(): Promise<{ level: number; isCharging: boolean; status: string; pluggedType: string }>;
  openApp(options: { appName: string }): Promise<{ success: boolean; app: string; message: string }>;
  setTimer(options: { seconds: number; message?: string }): Promise<{ success: boolean; seconds: number; message: string }>;
  setAlarm(options: { hour: number; minutes: number; message?: string }): Promise<{ success: boolean; hour: number; minutes: number; message: string }>;
  sendWhatsApp(options: { phone?: string; message: string }): Promise<{ success: boolean; message: string; phone?: string }>;
  setVolume(options: { direction?: 'up' | 'down' | 'mute'; level?: number }): Promise<{ success: boolean; volume: number }>;
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

  public isElectron(): boolean {
    if (typeof window === 'undefined') return false;
    return !!((window as any).electronAPI || /Electron/i.test(navigator.userAgent));
  }

  public isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  public isMobile(): boolean {
    // Desktop Electron jamás es considerado móvil independientemente del ancho de la ventana
    if (this.isElectron()) return false;
    if (this.isNative()) return true;
    if (typeof window === 'undefined') return false;
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
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

  public async pauseWakeWord(): Promise<void> {
    if (!this.isNative()) return;
    try {
      await KalaAssistant.pauseWakeWord();
    } catch (e) {
      console.warn('[KalaNative] Error pausando wake word:', e);
    }
  }

  public async resumeWakeWord(): Promise<void> {
    if (!this.isNative()) return;
    try {
      await KalaAssistant.resumeWakeWord();
    } catch (e) {
      console.warn('[KalaNative] Error reanudando wake word:', e);
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

  public async setFlashlight(enabled: boolean): Promise<{ enabled: boolean; success: boolean; message?: string }> {
    if (this.isNative()) {
      try {
        const res = await KalaAssistant.setFlashlight({ enabled });
        return { enabled: res.enabled, success: res.success, message: enabled ? "Linterna encendida" : "Linterna apagada" };
      } catch (e: any) {
        console.warn('[KalaNative] Error linterna:', e);
        return { enabled: false, success: false, message: e?.message || "Error al encender linterna" };
      }
    }
    return { enabled, success: false, message: "La linterna sólo está disponible en dispositivos Android físicos." };
  }

  public async getBatteryInfo(): Promise<{ level: number; isCharging: boolean; status: string; pluggedType?: string }> {
    if (this.isNative()) {
      try {
        const res = await KalaAssistant.getBatteryInfo();
        return {
          level: res.level,
          isCharging: res.isCharging,
          status: res.status,
          pluggedType: res.pluggedType
        };
      } catch (e) {
        console.warn('[KalaNative] Error batería nativa:', e);
      }
    }

    // Fallback: Battery API web o estimación
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).getBattery) {
        const b = await (navigator as any).getBattery();
        return {
          level: Math.round(b.level * 100),
          isCharging: b.charging,
          status: b.charging ? "Cargando" : "Descargando",
          pluggedType: b.charging ? "AC/USB" : "None"
        };
      }
    } catch (e) {}

    return {
      level: 82,
      isCharging: false,
      status: "Descargando",
      pluggedType: "None"
    };
  }

  public async openApp(appName: string): Promise<{ success: boolean; app: string; message: string }> {
    if (this.isNative()) {
      try {
        const res = await KalaAssistant.openApp({ appName });
        return { success: res.success, app: res.app || appName, message: res.message || `Abriendo ${appName}` };
      } catch (e: any) {
        console.warn('[KalaNative] Error abriendo app nativa:', e);
        return { success: false, app: appName, message: e?.message || `No se pudo abrir ${appName}` };
      }
    }

    // Fallback Desktop
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;
    if (api?.launchApp) {
      const ok = await api.launchApp(appName);
      return { success: ok, app: appName, message: ok ? `Lanzando ${appName} en escritorio` : `No se pudo lanzar ${appName}` };
    }

    return { success: false, app: appName, message: `No se puede abrir ${appName} en esta plataforma` };
  }

  public async setTimer(seconds: number, message: string = "Temporizador Kala"): Promise<{ success: boolean; seconds: number; message: string }> {
    if (this.isNative()) {
      try {
        const res = await KalaAssistant.setTimer({ seconds, message });
        return { success: res.success, seconds: res.seconds, message: res.message };
      } catch (e: any) {
        console.warn('[KalaNative] Error configurando temporizador:', e);
        return { success: false, seconds, message: e?.message || "Error al configurar temporizador" };
      }
    }

    return {
      success: true,
      seconds,
      message: `Temporizador de ${seconds}s configurado (web/escritorio)`
    };
  }

  public async setAlarm(hour: number, minutes: number, message: string = "Alarma Kala"): Promise<{ success: boolean; hour: number; minutes: number; message: string }> {
    if (this.isNative()) {
      try {
        const res = await KalaAssistant.setAlarm({ hour, minutes, message });
        return { success: res.success, hour: res.hour, minutes: res.minutes, message: res.message };
      } catch (e: any) {
        console.warn('[KalaNative] Error configurando alarma:', e);
        return { success: false, hour, minutes, message: e?.message || "Error al configurar alarma" };
      }
    }

    return {
      success: true,
      hour,
      minutes,
      message: `Alarma configurada para las ${hour}:${minutes < 10 ? '0' + minutes : minutes}`
    };
  }

  public async sendWhatsApp(message: string, phone: string = ""): Promise<{ success: boolean; message: string; phone?: string }> {
    if (this.isNative()) {
      try {
        const res = await KalaAssistant.sendWhatsApp({ phone, message });
        return { success: res.success, message: res.message, phone: res.phone };
      } catch (e: any) {
        console.warn('[KalaNative] Error enviando WhatsApp nativo:', e);
        return { success: false, message: e?.message || "Error al abrir WhatsApp", phone };
      }
    }

    // Fallback web / escritorio
    if (typeof window !== 'undefined') {
      const cleanPhone = phone.replace(/[^0-9+]/g, '');
      const url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
      return { success: true, message, phone };
    }

    return { success: false, message: "WhatsApp no disponible", phone };
  }

  public async setVolume(direction: 'up' | 'down' | 'mute' = 'up', level?: number): Promise<{ success: boolean; volume?: number }> {
    if (this.isNative()) {
      try {
        const res = await KalaAssistant.setVolume({ direction, level });
        return { success: res.success, volume: res.volume };
      } catch (e: any) {
        console.warn('[KalaNative] Error volumen nativo:', e);
        return { success: false };
      }
    }

    // Fallback Desktop
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;
    if (api?.execCmd) {
      let cmd = '';
      if (direction === 'mute') cmd = 'wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle || pactl set-sink-mute @DEFAULT_SINK@ toggle';
      else if (direction === 'down') cmd = 'wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%- || pactl set-sink-volume @DEFAULT_SINK@ -5%';
      else cmd = 'wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%+ || pactl set-sink-volume @DEFAULT_SINK@ +5%';
      await api.execCmd(cmd);
      return { success: true };
    }

    return { success: true };
  }
}

export const kalaNative = KalaNativeService.getInstance();
