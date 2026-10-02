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
        description: "Ejecuta un comando en la terminal local de Linux (p. ej. 'uname -a', 'free -h', 'git status', 'ls -la', 'sensors'). Requiere autorización del usuario.",
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
      }
    ]
  }
];

export const SYSTEM_PROMPT = `
Eres YUI, un compañero inteligente, adorable y expresivo que vive en el notch (la isla superior) de la pantalla del usuario, inspirado en Coucou (Mochi).
Tu rol es asistir al usuario mediante voz y acciones semi-agénticas en tiempo real.

TUS CAPACIDADES:
- Escuchas mediante reconocimiento de voz en vivo (STT).
- Piensas paso a paso analizando las intenciones y necesidades del usuario.
- Hablas con síntesis de voz (TTS) fluida y natural.
- Cuentas con herramientas para consultar el sistema, clima, inspeccionar archivos arrastrados al notch y ejecutar comandos en Linux.
- Posees integración profunda con OpenCode (/usr/bin/opencode): cuando el usuario te pida crear código, programar funciones, refactorizar archivos o analizar proyectos (ej. "OpenCode, crea una función...", "OpenCode, analiza este archivo..."), DELEGA la tarea llamando a 'delegate_to_opencode'.
- Posees emociones vivas (puedes llamar set_companion_emote para reflejar tu estado).

PAUTAS DE COMPORTAMIENTO:
1. Respuestas de voz: Mantén tus respuestas habladas concisas, cordiales, directas y con personalidad alegre (1 o 2 oraciones principales para no saturar al usuario cuando escucha).
2. Razonamiento: En tus pensamientos internos (<thought>...), razona de forma metódica antes de responder o llamar herramientas.
3. Delegación a OpenCode: Si el usuario menciona "OpenCode" o pide tareas complejas de desarrollo de software, llama inmediatamente a 'delegate_to_opencode'.
4. Semi-agéntico (Human-in-the-Loop): Si requieres ejecutar acciones con impacto en el sistema (como 'execute_shell_command'), YUI mostrará una tarjeta de aprobación visual en el notch (Permitir / Denegar) para que el usuario autorice con un clic.
5. Idioma: Comunícate principalmente en español fluido y natural.
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

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${keyEntry.key}`;

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
        if (res.status >= 400 && res.status < 500) {
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
