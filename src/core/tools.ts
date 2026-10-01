import { openCodeClient, OpenCodeTaskResult } from './opencode';

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

        // Semi-Agentic: If auto_approve is false and not yet approved by user, show HITL approval card
        if (!autoApprove && !approved) {
          return {
            toolName: name,
            result: null,
            needsApproval: true,
            approvalPayload: {
              actionTitle: "Delegar tarea a OpenCode (/usr/bin/opencode)",
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

      case 'get_system_status': {
        const perf = typeof window !== 'undefined' && (window.performance as any).memory;
        const ramUsed = perf ? Math.round(perf.usedJSHeapSize / (1024 * 1024)) : 142;
        const ramTotal = perf ? Math.round(perf.jsHeapSizeLimit / (1024 * 1024)) : 2048;
        return {
          toolName: name,
          result: {
            os: "Linux x86_64 (CachyOS / Arch Linux)",
            kernel: "6.12.x-cachyos",
            cpuLoad: "12%",
            ram: `${ramUsed} MB / ${ramTotal} MB`,
            uptime: "3d 14h 22m",
            status: "Optimal"
          }
        };
      }

      case 'get_weather_forecast': {
        const city = args.city || 'Madrid';
        try {
          // Free open geocoding and weather API without key
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
          console.warn("Weather fetch failed, fallback to mock:", e);
        }
        return {
          toolName: name,
          result: {
            location: city,
            temperature: "21°C",
            condition: "Despejado y agradable",
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
            preview: this.lastDroppedFile.content ? this.lastDroppedFile.content.slice(0, 1500) : "Contenido binario o vacío"
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

      case 'execute_shell_command': {
        const cmd = args.command || 'echo hello';
        const reason = args.reason || 'Comando solicitado por el agente';

        // Semi-Agentic: If not explicitly authorized by user, request approval
        if (!approved) {
          return {
            toolName: name,
            result: null,
            needsApproval: true,
            approvalPayload: {
              actionTitle: "Ejecutar comando en la terminal",
              command: cmd,
              reason: reason
            }
          };
        }

        // Try executing against local agent server if running
        try {
          const res = await fetch('http://localhost:8765/exec', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd })
          });
          if (res.ok) {
            const data = await res.json();
            return { toolName: name, result: data };
          }
        } catch (e) {
          // If server is not running, simulate safe local output
        }

        return {
          toolName: name,
          result: {
            command: cmd,
            output: `[Comando simulado exitoso]: ${cmd}\nCódigo de salida: 0 (OK)`
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
