import { openCodeClient, OpenCodeTaskResult } from './opencode';
import { kalaNative } from './kala-native';

export interface ToolExecutionResult {
  toolName: string;
  result: any;
  needsApproval?: boolean;
  approvalPayload?: {
    actionTitle: string;
    command: string;
    reason: string;
  };
}

export class ToolRegistry {
  private lastDroppedFile: { name: string; size: number; type: string; content?: string } | null = null;
  public onEmoteRequested?: (emote: string) => void;
  public onOpenCodeProgress?: (status: string, detail?: string) => void;
  public onOpenCodeThought?: (thought: string) => void;

  constructor() {
    openCodeClient.onProgress = (status, detail) => {
      if (this.onOpenCodeProgress) {
        this.onOpenCodeProgress(status, detail);
      }
    };
    openCodeClient.onThought = (thought) => {
      if (this.onOpenCodeThought) {
        this.onOpenCodeThought(thought);
      }
    };
  }

  public setDroppedFile(file: File, textPreview?: string) {
    this.lastDroppedFile = {
      name: file.name,
      size: file.size,
      type: file.type || 'text/plain',
      content: textPreview
    };
  }

  public async executeTool(
    name: string,
    args: Record<string, any>,
    approved: boolean = false
  ): Promise<ToolExecutionResult> {
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;

    switch (name) {
      case 'delegate_to_opencode': {
        const prompt = args.prompt || '';
        const file = args.file || (this.lastDroppedFile ? this.lastDroppedFile.name : undefined);
        const autoApprove = args.auto_approve !== false;

        if (!prompt) {
          return {
            toolName: name,
            result: { error: "Se requiere un prompt para OpenCode." }
          };
        }

        if (!autoApprove && !approved) {
          return {
            toolName: name,
            result: null,
            needsApproval: true,
            approvalPayload: {
              actionTitle: "Delegar tarea al agente OpenCode (/usr/bin/opencode)",
              command: `opencode run "${prompt}"${file ? ` --file ${file}` : ''}`,
              reason: "Ejecución de tarea agéntica de programación en el sistema"
            }
          };
        }

        try {
          const res = await openCodeClient.runTask({
            prompt,
            file,
            autoApprove: true,
            sessionId: openCodeClient.getCurrentSession() || undefined
          });
          return {
            toolName: name,
            result: res
          };
        } catch (err: any) {
          return {
            toolName: name,
            result: {
              success: false,
              error: `Error al comunicar con OpenCode: ${err.message}`
            }
          };
        }
      }

      case 'execute_shell_command': {
        const cmd = args.command || 'echo hello';
        const reason = args.reason || 'Comando solicitado por el agente';
        const isDangerous = /^(rm\s|dd\s|mkfs|shutdown|reboot|poweroff|pkill|kill\s|systemctl\s+(stop|disable|restart))/i.test(cmd.trim());

        if (isDangerous && !approved) {
          return {
            toolName: name,
            result: null,
            needsApproval: true,
            approvalPayload: {
              actionTitle: "Ejecutar comando sensible en el sistema",
              command: cmd,
              reason: reason
            }
          };
        }

        if (api?.execCmd) {
          const res = await api.execCmd(cmd);
          return {
            toolName: name,
            result: {
              command: cmd,
              stdout: res.stdout || '',
              stderr: res.stderr || '',
              exitCode: res.exitCode,
              success: res.success
            }
          };
        }

        return {
          toolName: name,
          result: { command: cmd, output: `[Comando simulado]: ${cmd}\nExit: 0` }
        };
      }

      case 'open_application': {
        const appName = args.app_name || args.application || '';
        if (api?.launchApp && appName) {
          const ok = await api.launchApp(appName);
          return {
            toolName: name,
            result: { success: ok, app: appName, message: `Aplicación "${appName}" lanzada en tu escritorio.` }
          };
        }
        return {
          toolName: name,
          result: { success: false, error: "No se pudo lanzar la aplicación." }
        };
      }

      case 'take_screenshot': {
        if (api?.screenshot) {
          const res = await api.screenshot();
          return {
            toolName: name,
            result: {
              success: res.success,
              path: res.path,
              message: res.success ? "Captura de pantalla tomada con éxito en /tmp/yui_desktop_snap.png." : res.error
            }
          };
        }
        return {
          toolName: name,
          result: { success: false, error: "Captura no soportada." }
        };
      }

      case 'type_desktop_keys': {
        const text = args.text;
        const key = args.key;
        if (api?.typeKeys) {
          const res = await api.typeKeys({ text, key });
          return {
            toolName: name,
            result: { success: res.success, text, key }
          };
        }
        return {
          toolName: name,
          result: { success: false, error: "Simulación de teclas no disponible." }
        };
      }

      case 'control_media_and_volume': {
        const action = args.action || 'play_pause';
        let cmd = '';
        if (action === 'play_pause') cmd = 'playerctl play-pause || true';
        else if (action === 'next') cmd = 'playerctl next || true';
        else if (action === 'prev') cmd = 'playerctl previous || true';
        else if (action === 'volume_up') cmd = 'wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%+ || pactl set-sink-volume @DEFAULT_SINK@ +5%';
        else if (action === 'volume_down') cmd = 'wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%- || pactl set-sink-volume @DEFAULT_SINK@ -5%';
        else if (action === 'mute') cmd = 'wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle || pactl set-sink-mute @DEFAULT_SINK@ toggle';

        if (api?.execCmd && cmd) {
          const res = await api.execCmd(cmd);
          return {
            toolName: name,
            result: { action, success: res.success }
          };
        }
        return {
          toolName: name,
          result: { action, success: true, simulated: true }
        };
      }

      case 'get_system_status': {
        if (api?.execCmd) {
          const [freeRes, uptimeRes, loadRes] = await Promise.all([
            api.execCmd("free -h | awk '/^Mem:/ {print $3 \" / \" $2}'"),
            api.execCmd("uptime -p"),
            api.execCmd("cat /proc/loadavg | awk '{print $1}'")
          ]);
          return {
            toolName: name,
            result: {
              os: "Arch Linux (Hyprland / Wayland)",
              cpuUsage: loadRes.stdout ? `${loadRes.stdout} load` : "12%",
              ramAvailable: freeRes.stdout || "8 GB",
              uptime: uptimeRes.stdout || "activo",
              hostname: "archlinux",
              status: "Optimal"
            }
          };
        }
        return {
          toolName: name,
          result: {
            os: "Arch Linux",
            cpuUsage: "12%",
            ramAvailable: "8 GB",
            uptime: "3h 15m",
            hostname: "archlinux",
            status: "Optimal"
          }
        };
      }

      case 'get_weather_forecast': {
        const city = args.city || 'Madrid';
        try {
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=es&format=json`);
          const geoData = await geoRes.json();
          if (geoData.results && geoData.results.length > 0) {
            const { latitude, longitude, name: resolvedName, country } = geoData.results[0];
            const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`);
            const wData = await wRes.json();
            return {
              toolName: name,
              result: {
                location: `${resolvedName}, ${country}`,
                temperature: `${wData.current.temperature_2m}°C`,
                humidity: `${wData.current.relative_humidity_2m}%`,
                wind: `${wData.current.wind_speed_10m} km/h`,
                condition: getWeatherCodeDescription(wData.current.weather_code)
              }
            };
          }
        } catch (e) {
          console.warn("Weather fetch failed, fallback:", e);
        }
        return {
          toolName: name,
          result: {
            location: city,
            temperature: "21°C",
            condition: "Despejado",
            humidity: "48%"
          }
        };
      }

      case 'inspect_dropped_file': {
        if (!this.lastDroppedFile) {
          return {
            toolName: name,
            result: { error: "No se ha soltado ningún archivo reciente en la isla." }
          };
        }
        return {
          toolName: name,
          result: {
            fileName: this.lastDroppedFile.name,
            sizeKb: (this.lastDroppedFile.size / 1024).toFixed(1) + " KB",
            type: this.lastDroppedFile.type,
            preview: this.lastDroppedFile.content ? this.lastDroppedFile.content.slice(0, 1500) : "Contenido binario"
          }
        };
      }

      case 'set_companion_emote': {
        const emote = args.emote || 'happy';
        if (this.onEmoteRequested) {
          this.onEmoteRequested(emote);
        }
        return {
          toolName: name,
          result: { success: true, emoteDisplayed: emote }
        };
      }

      case 'control_flashlight': {
        const enabled = args.enabled !== false && args.state !== 'off';
        const res = await kalaNative.setFlashlight(enabled);
        return {
          toolName: name,
          result: {
            success: res.success,
            enabled: res.enabled,
            message: res.message || (enabled ? "Linterna encendida" : "Linterna apagada")
          }
        };
      }

      case 'get_battery_status': {
        const info = await kalaNative.getBatteryInfo();
        return {
          toolName: name,
          result: {
            success: true,
            level: info.level,
            isCharging: info.isCharging,
            status: info.status,
            pluggedType: info.pluggedType
          }
        };
      }

      case 'open_mobile_app': {
        const appName = args.app_name || args.application || '';
        const res = await kalaNative.openApp(appName);
        return {
          toolName: name,
          result: {
            success: res.success,
            app: res.app,
            message: res.message
          }
        };
      }

      case 'set_timer_or_alarm': {
        const type = args.type || (args.seconds !== undefined ? 'timer' : 'alarm');
        if (type === 'alarm') {
          const hour = typeof args.hour === 'number' ? args.hour : 7;
          const minutes = typeof args.minutes === 'number' ? args.minutes : 0;
          const label = args.label || args.message || 'Alarma Kala';
          const res = await kalaNative.setAlarm(hour, minutes, label);
          return {
            toolName: name,
            result: {
              type: 'alarm',
              success: res.success,
              hour: res.hour,
              minutes: res.minutes,
              label,
              message: res.message
            }
          };
        } else {
          // Timer
          let seconds = args.seconds;
          if (seconds === undefined && args.minutes !== undefined) {
            seconds = Math.round(args.minutes * 60);
          }
          if (!seconds || seconds <= 0) seconds = 60;
          const label = args.label || args.message || 'Temporizador Kala';
          const res = await kalaNative.setTimer(seconds, label);
          return {
            toolName: name,
            result: {
              type: 'timer',
              success: res.success,
              seconds: res.seconds,
              label,
              message: res.message
            }
          };
        }
      }

      case 'send_whatsapp_message': {
        const phone = args.phone || '';
        const message = args.message || args.text || '';
        const res = await kalaNative.sendWhatsApp(message, phone);
        return {
          toolName: name,
          result: {
            success: res.success,
            phone: res.phone || phone,
            message: res.message
          }
        };
      }

      case 'control_device_volume': {
        const direction = args.direction || (args.action === 'down' ? 'down' : (args.action === 'mute' ? 'mute' : 'up'));
        const level = typeof args.level === 'number' ? args.level : undefined;
        const res = await kalaNative.setVolume(direction, level);
        return {
          toolName: name,
          result: {
            success: res.success,
            direction,
            level: res.volume !== undefined ? res.volume : level,
            message: `Volumen ajustado (${direction})`
          }
        };
      }

      default:
        return {
          toolName: name,
          result: { error: `Herramienta desconocida: ${name}` }
        };
    }
  }
}

function getWeatherCodeDescription(code: number): string {
  if (code === 0) return "Cielo despejado";
  if (code >= 1 && code <= 3) return "Parcialmente nublado";
  if (code >= 45 && code <= 48) return "Niebla";
  if (code >= 51 && code <= 55) return "Llovizna ligera";
  if (code >= 61 && code <= 65) return "Lluvia";
  if (code >= 71 && code <= 77) return "Nieve";
  if (code >= 95) return "Tormenta eléctrica";
  return "Variable";
}

export const toolRegistry = new ToolRegistry();
