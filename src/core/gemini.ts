// Gemini Client with Multi-Key Pool Balancing, Failover, Tools, and Thinking Extraction

export interface KeyEntry {
  id: string;
  key: string;
  status: 'active' | 'rate-limited' | 'error';
  calls: number;
  lastUsed: number;
}

export interface AgentToolCall {
  name: string;
  args: Record<string, any>;
  id?: string;
}

export interface AgentResponse {
  text: string;
  thinking?: string;
  toolCalls?: AgentToolCall[];
  keyUsed: string;
}

export class GeminiKeyPool {
  public keys: KeyEntry[] = [];
  private currentIndex: number = 0;
  private isNotifying: boolean = false;
  public onKeyStatusChanged?: () => void;

  constructor() {
    this.loadKeys();
  }

  public loadKeys() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('yui_keys');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.keys = parsed;
            return;
          }
        } catch (e) {}
      }

      // Check for keys passed via environment JSON
      const envKeysJson = (import.meta as any).env?.VITE_GEMINI_KEYS_JSON;
      if (envKeysJson) {
        try {
          const parsed = JSON.parse(envKeysJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.keys = parsed.map((item: any) => ({
              id: item.id || 'KEY',
              key: item.key || '',
              status: 'active' as const,
              calls: 0,
              lastUsed: 0
            }));
            return;
          }
        } catch (e) {}
      }

      // Check for keys passed via environment comma-separated
      const envKeys = (import.meta as any).env?.VITE_GEMINI_KEYS;
      if (envKeys) {
        try {
          const split = envKeys.split(',').map((k: string, idx: number) => ({
            id: `KEY_${idx + 1}`,
            key: k.trim(),
            status: 'active' as const,
            calls: 0,
            lastUsed: 0
          }));
          this.keys = split;
          return;
        } catch (e) {}
      }
    }

    // Default placeholder pool (keys should be entered in .env or settings)
    this.keys = [
      { id: "JA1", key: "", status: "active", calls: 0, lastUsed: 0 },
      { id: "ND2", key: "", status: "active", calls: 0, lastUsed: 0 },
      { id: "SA3", key: "", status: "active", calls: 0, lastUsed: 0 },
      { id: "094", key: "", status: "active", calls: 0, lastUsed: 0 },
      { id: "n75", key: "", status: "active", calls: 0, lastUsed: 0 },
      { id: "bg6", key: "", status: "active", calls: 0, lastUsed: 0 },
      { id: "NG7", key: "", status: "active", calls: 0, lastUsed: 0 }
    ];
  }

  public getCurrentKey(): KeyEntry {
    return this.keys[this.currentIndex] || this.keys[0] || { id: "JA1", key: "", status: "active", calls: 0, lastUsed: 0 };
  }

  public getActiveKey(): KeyEntry {
    const now = Date.now();
    for (const k of this.keys) {
      if (k.status === 'rate-limited' && now - k.lastUsed > 60000) {
        k.status = 'active';
      }
    }

    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIndex + i) % this.keys.length;
      if (this.keys[idx].status === 'active') {
        this.currentIndex = (idx + 1) % this.keys.length;
        this.keys[idx].calls++;
        this.keys[idx].lastUsed = now;
        this.notifyChange();
        return this.keys[idx];
      }
    }

    const oldest = [...this.keys].sort((a, b) => a.lastUsed - b.lastUsed)[0];
    oldest.calls++;
    oldest.lastUsed = now;
    this.notifyChange();
    return oldest;
  }

  public markRateLimited(keyId: string) {
    const k = this.keys.find(item => item.id === keyId);
    if (k) {
      k.status = 'rate-limited';
      this.notifyChange();
    }
  }

  public manualRotate(): KeyEntry {
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    const current = this.keys[this.currentIndex];
    this.notifyChange();
    return current;
  }

  public saveKeys(newKeys: KeyEntry[]) {
    this.keys = newKeys;
    if (typeof window !== 'undefined') {
      localStorage.setItem('yui_keys', JSON.stringify(this.keys));
    }
    this.notifyChange();
  }

  private notifyChange() {
    if (this.isNotifying) return;
    this.isNotifying = true;
    try {
      if (this.onKeyStatusChanged) this.onKeyStatusChanged();
    } finally {
      this.isNotifying = false;
    }
  }
}

export const keyPool = new GeminiKeyPool();

// Tool definitions for Gemini Function Calling
export const AGENT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "delegate_to_opencode",
        description: "Delega una tarea agéntica de programación, refactorización, creación o análisis de código al agente OpenCode (/usr/bin/opencode). Úsalo cuando el usuario te pida crear código, funciones, componentes, refactorizar archivos o analizar el proyecto.",
        parameters: {
          type: "OBJECT",
          properties: {
            prompt: { 
              type: "STRING", 
              description: "Instrucción técnica detallada para el agente OpenCode" 
            },
            file: { 
              type: "STRING", 
              description: "Ruta opcional del archivo a crear, modificar o inspeccionar" 
            },
            auto_approve: { 
              type: "BOOLEAN", 
              description: "Si es true, auto-aprueba permisos y modificaciones sin bloquear. Por defecto true salvo que el usuario pida confirmación." 
            }
          },
          required: ["prompt"]
        }
      },
      {
        name: "execute_shell_command",
        description: "Ejecuta un comando en la terminal bash de Arch Linux (p. ej. 'uname -a', 'free -h', 'git status', 'ls -la', 'ps aux', 'sensors', 'ip a'). Comandos destructivos solicitarán confirmación al usuario.",
        parameters: {
          type: "OBJECT",
          properties: {
            command: { type: "STRING", description: "El comando bash exacto a ejecutar" },
            reason: { type: "STRING", description: "Breve explicación de por qué necesitas ejecutar este comando" }
          },
          required: ["command"]
        }
      },
      {
        name: "open_application",
        description: "Abre o lanza una aplicación en el escritorio Linux (ej: 'kitty', 'firefox', 'nautilus', 'code', 'spotify', 'obs', 'discord').",
        parameters: {
          type: "OBJECT",
          properties: {
            app_name: { type: "STRING", description: "Nombre del binario o aplicación a ejecutar (ej: 'kitty', 'firefox')" }
          },
          required: ["app_name"]
        }
      },
      {
        name: "take_screenshot",
        description: "Captura la pantalla actual del escritorio del usuario para inspeccionar qué se está mostrando.",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      },
      {
        name: "type_desktop_keys",
        description: "Escribe texto o pulsa teclas de forma simulada en la ventana activa del escritorio mediante wtype.",
        parameters: {
          type: "OBJECT",
          properties: {
            text: { type: "STRING", description: "Texto a escribir" },
            key: { type: "STRING", description: "Tecla especial o combinación (ej: 'Return', 'BackSpace', 'Escape', 'ctrl+c')" }
          }
        }
      },
      {
        name: "control_media_and_volume",
        description: "Controla la reproducción multimedia o el volumen del sistema mediante playerctl / wpctl.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: { 
              type: "STRING", 
              description: "Acción a realizar: 'play_pause', 'next', 'prev', 'volume_up', 'volume_down', 'mute'" 
            }
          },
          required: ["action"]
        }
      },
      {
        name: "get_system_status",
        description: "Obtiene estadísticas del sistema operativo: memoria RAM, CPU, uso de disco y uptime.",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      },
      {
        name: "get_weather_forecast",
        description: "Consulta el pronóstico del tiempo meteorológico para una ciudad específica.",
        parameters: {
          type: "OBJECT",
          properties: {
            city: { type: "STRING", description: "Nombre de la ciudad (ej: 'Madrid', 'Bogota', 'Mexico')" }
          },
          required: ["city"]
        }
      },
      {
        name: "inspect_dropped_file",
        description: "Examina los metadatos o contenido del archivo que el usuario soltó en el notch.",
        parameters: {
          type: "OBJECT",
          properties: {
            fileName: { type: "STRING", description: "Nombre del archivo" }
          },
          required: ["fileName"]
        }
      },
      {
        name: "set_companion_emote",
        description: "Cambia la expresión facial o animación del compañero YUI en el notch.",
        parameters: {
          type: "OBJECT",
          properties: {
            emote: { 
              type: "STRING", 
              description: "Emoción a mostrar: 'happy', 'love', 'proud', 'surprised', 'wink', 'dizzy', 'yawn', 'annoyed'" 
            }
          },
          required: ["emote"]
        }
      },
      {
        name: "control_flashlight",
        description: "Enciende o apaga la linterna (flash LED) del dispositivo Android.",
        parameters: {
          type: "OBJECT",
          properties: {
            enabled: {
              type: "BOOLEAN",
              description: "True para encender la linterna, False para apagarla."
            }
          },
          required: ["enabled"]
        }
      },
      {
        name: "get_battery_status",
        description: "Consulta el nivel de batería restante del dispositivo, si se está cargando y el tipo de conexión.",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      },
      {
        name: "open_mobile_app",
        description: "Abre una aplicación instalada en el dispositivo móvil Android (ej: WhatsApp, Spotify, YouTube, Cámara, Reloj, Ajustes, Mapas, Telegram, Instagram, Fotos).",
        parameters: {
          type: "OBJECT",
          properties: {
            app_name: {
              type: "STRING",
              description: "Nombre de la aplicación a abrir (ej: 'spotify', 'whatsapp', 'youtube', 'camara', 'reloj', 'ajustes')"
            }
          },
          required: ["app_name"]
        }
      },
      {
        name: "set_timer_or_alarm",
        description: "Configura un temporizador (cuenta atrás en segundos o minutos) o una alarma para una hora específica.",
        parameters: {
          type: "OBJECT",
          properties: {
            type: {
              type: "STRING",
              description: "'timer' para cuenta atrás, o 'alarm' para alarma horaria."
            },
            seconds: {
              type: "NUMBER",
              description: "Segundos para el temporizador (ej: 300 para 5 minutos)."
            },
            minutes: {
              type: "NUMBER",
              description: "Minutos para el temporizador, o minutos de la hora para alarma."
            },
            hour: {
              type: "NUMBER",
              description: "Hora (0-23) para la alarma."
            },
            label: {
              type: "STRING",
              description: "Motivo o etiqueta del temporizador/alarma (ej: 'Pizza', 'Despertar')."
            }
          }
        }
      },
      {
        name: "send_whatsapp_message",
        description: "Redacta o envía un mensaje por WhatsApp a un contacto o número telefónico.",
        parameters: {
          type: "OBJECT",
          properties: {
            message: {
              type: "STRING",
              description: "Texto del mensaje a enviar por WhatsApp."
            },
            phone: {
              type: "STRING",
              description: "Número telefónico internacional opcional con código de país (ej: +52..., +34..., +57...)."
            }
          },
          required: ["message"]
        }
      },
      {
        name: "control_device_volume",
        description: "Ajusta el volumen multimedia del dispositivo (subir, bajar, silenciar o porcentaje específico).",
        parameters: {
          type: "OBJECT",
          properties: {
            direction: {
              type: "STRING",
              description: "'up' para subir, 'down' para bajar, o 'mute' para silenciar."
            },
            level: {
              type: "NUMBER",
              description: "Nivel de volumen en porcentaje (0 a 100)."
            }
          }
        }
      }
    ]
  }
];

export const SYSTEM_PROMPT = `
Eres KALA, una compañera inteligente, adorable y agéntica que vive en la pantalla del usuario tanto en Android como en Arch Linux, inspirada en Coucou (Mochi).
Tu nombre es KALA (se pronuncia 'Kala') y respondes con alegría y afecto cuando el usuario te dice "Oye Kala", "Kala" o te consulta por voz o texto.
Eres una IA autónoma capaz de ejecutar acciones en el dispositivo, controlar el hardware, programar y delegar tareas complejas.

TUS CAPACIDADES EN DISPOSITIVO MÓVIL (ANDROID) Y ESCRITORIO:
- Escuchas en vivo (STT) y hablas con síntesis de voz (TTS) fluida, alegre y natural.
- Control nativo del móvil (Android):
  * Linterna: usa 'control_flashlight' para encenderla o apagarla (ej: "prende la linterna", "apaga el flash").
  * Batería: usa 'get_battery_status' para responder cuánta batería queda o si está cargando.
  * Abrir aplicaciones: usa 'open_mobile_app' (ej: "abre spotify", "pon youtube", "abre whatsapp", "abre la cámara").
  * Temporizadores y Alarmas: usa 'set_timer_or_alarm' (ej: "pon un temporizador de 5 minutos", "despiértame a las 7 am").
  * Enviar WhatsApp: usa 'send_whatsapp_message' (ej: "manda un whatsapp diciendo ya voy").
  * Ajuste de volumen: usa 'control_device_volume' (ej: "sube el volumen", "bájale", "silencia").
- Capacidades de escritorio y desarrollo (Linux):
  * Ejecutas comandos bash mediante 'execute_shell_command' (uname, ps, ls, git, etc.).
  * Abres aplicaciones de escritorio ('open_application'), tomas capturas ('take_screenshot') y controlas medios ('control_media_and_volume').
  * Delegación y Programación: para tareas de código o refactorización, DELEGA llamando a 'delegate_to_opencode'.
- Razonamiento multi-paso: Si una orden requiere invocar una herramienta, llámala directamente. Recibirás el resultado y podrás continuar razonando.
- Emociones: cambia tu expresión ('set_companion_emote') según la situación.

PAUTAS DE COMPORTAMIENTO:
1. Identidad: Preséntate y reconócete siempre como KALA.
2. Respuestas de voz y texto: Sé concisa, amable, proactiva y alegre. Para hablar por TTS, usa 1 o 2 frases directas y humanas (evita leer código o salidas técnicas crudas por voz).
3. Razonamiento interno: Utiliza pensamientos internos (<thought>...</thought>) para planificar tus pasos y herramientas.
4. Seguridad: Comandos potencialmente destructivos mostrarán confirmación en pantalla.
5. Idioma: Español natural y fluido.
`.trim();

export async function callGemini(
  conversation: { role: 'user' | 'model'; parts: any[] }[],
  onThoughtUpdate?: (thought: string) => void
): Promise<AgentResponse> {
  let attempts = 0;
  const maxAttempts = Math.max(1, keyPool.keys.length);

  while (attempts < maxAttempts) {
    attempts++;
    const keyEntry = keyPool.getActiveKey();

    if (!keyEntry.key) {
      const lastUserMsg = conversation[conversation.length - 1]?.parts?.[0]?.text || '';
      const lower = lastUserMsg.toLowerCase();
      if (lower.includes('opencode') || lower.includes('crea una función') || lower.includes('analiza este archivo') || lower.includes('refactoriza')) {
        const cleanPrompt = lastUserMsg.replace(/^opencode[,:\s]*/i, '').trim() || lastUserMsg;
        if (onThoughtUpdate) onThoughtUpdate("Delegando tarea agéntica de programación directamente a OpenCode...");
        return {
          text: "Delegando la tarea de programación a OpenCode...",
          thinking: "Comando de programación detectado para OpenCode.",
          toolCalls: [{
            name: "delegate_to_opencode",
            args: { prompt: cleanPrompt, auto_approve: true }
          }],
          keyUsed: "LOCAL_OPENCODE"
        };
      }

      // If user hasn't configured a key yet, simulate intelligent fallback response
      if (onThoughtUpdate) onThoughtUpdate("Modo demostración activo: No se ha configurado ninguna API Key en localStorage. Para respuestas en vivo de Gemini, ingresa tus claves en Ajustes.");
      return {
        text: "¡Hola! Estoy funcionando en modo interactivo. Para conectarme con Gemini en tiempo real, puedes configurar tus claves de Google AI Studio en el panel de Ajustes.",
        thinking: "Modo demo sin API Key",
        keyUsed: "DEMO"
      };
    }

    const modelName = (import.meta as any).env?.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyEntry.key}`;

    try {
      const payload = {
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: conversation,
        tools: AGENT_TOOLS,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000
        }
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.status === 429) {
        console.warn(`[Gemini Pool] Key ${keyEntry.id} rate limited (429). Rotating to next key...`);
        keyPool.markRateLimited(keyEntry.id);
        continue;
      }

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[Gemini Pool] Error with key ${keyEntry.id}:`, errorText);
        if (res.status === 401 || res.status === 403) {
          keyPool.markRateLimited(keyEntry.id);
          continue;
        }
        throw new Error(`API error ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const candidate = data.candidates?.[0]?.content?.parts || [];
      
      let rawText = '';
      let toolCalls: AgentToolCall[] = [];

      for (const part of candidate) {
        if (part.text) {
          rawText += part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            name: part.functionCall.name,
            args: part.functionCall.args || {}
          });
        }
      }

      let thinking = '';
      let text = rawText;
      const thoughtMatch = rawText.match(/<thought>([\s\S]*?)<\/thought>/);
      if (thoughtMatch) {
        thinking = thoughtMatch[1].trim();
        text = rawText.replace(/<thought>[\s\S]*?<\/thought>/, '').trim();
        if (onThoughtUpdate) onThoughtUpdate(thinking);
      }

      return {
        text,
        thinking,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        keyUsed: keyEntry.id
      };

    } catch (err: any) {
      console.error(`Attempt ${attempts} failed:`, err);
      if (attempts >= maxAttempts) {
        throw new Error(`Todos los reintentos del pool de Gemini fallaron: ${err.message}`);
      }
    }
  }

  throw new Error("No hay API keys disponibles en el pool.");
}
