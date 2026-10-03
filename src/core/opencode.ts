// OpenCode Agent Client & Bridge Integration for YUI
// Handles sessions, streaming thoughts, tool executions, and bidirectional WebSocket/HTTP communication

export interface OpenCodeToolCall {
  tool: string;
  input: any;
  output?: any;
  status?: string;
}

export interface OpenCodeTaskOptions {
  prompt: string;
  file?: string;
  autoApprove?: boolean;
  sessionId?: string;
  model?: string;
  onThought?: (thought: string) => void;
  onStep?: (stepInfo: string) => void;
  onToolUse?: (toolName: string, input: any, output?: any) => void;
  onTextChunk?: (chunk: string) => void;
}

export interface OpenCodeTaskResult {
  success: boolean;
  sessionId?: string;
  text: string;
  reasoning?: string;
  toolsUsed: OpenCodeToolCall[];
  exitCode: number;
  error?: string;
}

export interface OpenCodeSession {
  id: string;
  title?: string;
  projectID?: string;
  agent?: string;
  model?: any;
  time?: {
    created?: number;
    updated?: number;
    idle?: number;
  };
}

export class OpenCodeClient {
  private wsBaseUrl: string;
  private httpBaseUrl: string;
  private currentSessionId: string | null = null;

  public onProgress?: (status: string, detail?: string) => void;
  public onThought?: (thought: string) => void;
  public onToolExecuted?: (tool: string, detail: string) => void;

  constructor() {
    const isBrowser = typeof window !== 'undefined';
    const host = isBrowser ? window.location.hostname || 'localhost' : 'localhost';
    const port = '8765';
    this.wsBaseUrl = `ws://${host}:${port}/opencode/run`;
    this.httpBaseUrl = `http://${host}:${port}/opencode`;

    // Restore cached session and remote PC URL if available in localStorage
    if (isBrowser) {
      this.currentSessionId = localStorage.getItem('kala_opencode_session') || localStorage.getItem('yui_opencode_session') || null;
      const remote = localStorage.getItem('kala_opencode_pc_url');
      if (remote) {
        this.setRemotePcUrl(remote);
      }
    }
  }

  public getRemotePcUrl(): string {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('kala_opencode_pc_url') || '';
    }
    return '';
  }

  public setRemotePcUrl(rawUrl: string) {
    const clean = rawUrl.trim().replace(/\/+$/, '');
    if (typeof window !== 'undefined') {
      localStorage.setItem('kala_opencode_pc_url', clean);
    }
    if (clean) {
      const isHttps = clean.startsWith('https://');
      const noProto = clean.replace(/^https?:\/\//, '');
      const wsProto = isHttps ? 'wss://' : 'ws://';
      this.wsBaseUrl = `${wsProto}${noProto}/opencode/run`;
      this.httpBaseUrl = `${clean}/opencode`;
    }
  }

  public getCurrentSession(): string | null {
    return this.currentSessionId;
  }

  public setSession(sessionId: string) {
    this.currentSessionId = sessionId;
    if (typeof window !== 'undefined') {
      localStorage.setItem('kala_opencode_session', sessionId);
    }
  }

  public clearSession() {
    this.currentSessionId = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('kala_opencode_session');
    }
  }

  /**
   * Fetches active sessions from OpenCode bridge.
   */
  public async listSessions(): Promise<OpenCodeSession[]> {
    try {
      const res = await fetch(`${this.httpBaseUrl}/sessions`);
      if (res.ok) {
        const data = await res.json();
        return data.sessions || [];
      }
    } catch (e) {
      console.warn('[OpenCode] Could not list sessions:', e);
    }
    return [];
  }

  public async runTask(options: OpenCodeTaskOptions): Promise<OpenCodeTaskResult> {
    const effectiveSessionId = options.sessionId || this.currentSessionId || undefined;

    // 1. Direct native execution in Electron desktop
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;
    if (api?.runOpenCode) {
      return this.runTaskElectron(options);
    }

    // 2. Try remote PC bridge if configured
    const remoteUrl = this.getRemotePcUrl();
    if (remoteUrl) {
      try {
        this.notifyProgress('OpenCode: Conectando a PC...', `Conectando con ${remoteUrl}`);
        return await this.runTaskWebSocket({
          ...options,
          sessionId: effectiveSessionId
        });
      } catch (wsErr) {
        console.warn('[OpenCode] Remote WebSocket failed, trying HTTP:', wsErr);
        try {
          return await this.runTaskHttp({
            ...options,
            sessionId: effectiveSessionId
          });
        } catch (httpErr) {
          console.warn('[OpenCode] Remote PC unreachable, falling back to Gemini Flash Lite:', httpErr);
        }
      }
    }

    // 3. Fallback: Gemini 2.5 Flash Lite autonomous coding engine
    this.notifyProgress('Kala Code: Modo Autónomo', 'PC no conectada. Usando Gemini 2.5 Flash Lite...');
    return this.runTaskGeminiFallback(options);
  }

  public async runTaskGeminiFallback(options: OpenCodeTaskOptions): Promise<OpenCodeTaskResult> {
    this.notifyProgress('Kala Code: Pensando...', 'Generando código con Gemini 2.5 Flash Lite');
    const { keyPool } = await import('./gemini');
    const key = keyPool.getActiveKey();

    const systemPrompt = `Eres el motor agéntico de desarrollo y programación de KALA.
El usuario te solicita una tarea de programación, refactorización, creación o análisis de código.
Genera la solución técnica óptima con explicaciones breves, limpias y código modular listo para producción.
Si creas archivos o código, usa bloques de código markdown con el lenguaje especificado (ej. \`\`\`python, \`\`\`typescript).
Razona de forma metódica en bloques <thought>...</thought>.`;

    const userPrompt = options.file 
      ? `[Archivo de trabajo: ${options.file}]\n${options.prompt}`
      : options.prompt;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key.key}`;
    
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2500 }
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      let thought = '';
      let cleanText = rawText;
      const thoughtMatch = rawText.match(/<thought>([\s\S]*?)<\/thought>/);
      if (thoughtMatch) {
        thought = thoughtMatch[1].trim();
        cleanText = rawText.replace(/<thought>[\s\S]*?<\/thought>/, '').trim();
        this.notifyThought(thought);
      }

      this.notifyProgress('Kala Code: Completado ✓', 'Solución generada con Gemini 2.5 Flash Lite');

      return {
        success: true,
        text: cleanText,
        reasoning: thought,
        toolsUsed: [{ tool: 'gemini_flash_lite_engine', input: { prompt: options.prompt } }],
        exitCode: 0
      };
    } catch (err: any) {
      return {
        success: false,
        text: `Error al generar código: ${err.message}`,
        toolsUsed: [],
        exitCode: 1,
        error: err.message
      };
    }
  }

  private async runTaskElectron(options: OpenCodeTaskOptions): Promise<OpenCodeTaskResult> {
    const api = (window as any).electronAPI;
    this.notifyProgress('OpenCode: Iniciando...', 'Lanzando agente de desarrollo local');

    const toolsUsed: OpenCodeToolCall[] = [];
    const textParts: string[] = [];

    if (api.onOpenCodeStream) {
      api.onOpenCodeStream((event: any) => {
        if (!event) return;
        if (event.type === 'step_start') {
          this.notifyProgress('OpenCode: Pensando...', event.title || 'Planificando solución...');
        } else if (event.type === 'reasoning') {
          const thought = event.part?.text || event.text || '';
          if (thought) {
            this.notifyThought(thought);
            if (options.onThought) options.onThought(thought);
          }
        } else if (event.type === 'tool_use') {
          const tName = event.part?.tool || event.tool || 'tool';
          const input = event.part?.state?.input || event.input;
          toolsUsed.push({ tool: tName, input });
          this.notifyProgress('OpenCode: Ejecutando...', `Herramienta: ${tName}`);
        } else if (event.type === 'text') {
          const chunk = event.part?.text || event.text || '';
          textParts.push(chunk);
        }
      });
    }

    const res = await api.runOpenCode({ prompt: options.prompt, file: options.file });
    let finalText = res.output || '';
    if (textParts.length > 0 && (!finalText || finalText.startsWith('{'))) {
      finalText = textParts.join('');
    }

    this.notifyProgress('OpenCode: Finalizado ✓', 'Tarea de codificación terminada');

    return {
      success: res.success,
      text: finalText || (res.success ? "Tarea completada con éxito por OpenCode." : `Error: ${res.error}`),
      toolsUsed,
      exitCode: res.exitCode
    };
  }

  /**
   * WebSocket streaming implementation.
   */
  private runTaskWebSocket(options: OpenCodeTaskOptions): Promise<OpenCodeTaskResult> {
    return new Promise((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(this.wsBaseUrl);
      } catch (err) {
        return reject(err);
      }

      const toolsUsed: OpenCodeToolCall[] = [];
      const textParts: string[] = [];
      const thoughtParts: string[] = [];
      let capturedSessionId = options.sessionId;
      let hasCompleted = false;

      const connectionTimeout = setTimeout(() => {
        if (!hasCompleted && socket.readyState !== WebSocket.OPEN) {
          try { socket.close(); } catch {}
          reject(new Error('OpenCode Bridge WebSocket timeout'));
        }
      }, 7000);

      socket.onopen = () => {
        clearTimeout(connectionTimeout);
        this.notifyProgress('OpenCode: Conectado', 'Iniciando agente de codificación...');
        
        socket.send(JSON.stringify({
          action: 'run',
          prompt: options.prompt,
          file: options.file,
          session_id: options.sessionId,
          auto_approve: options.autoApprove !== false,
          model: options.model
        }));
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const type = msg.type;

          if (msg.sessionID && !capturedSessionId) {
            capturedSessionId = msg.sessionID;
            this.setSession(capturedSessionId!);
          }

          if (type === 'started') {
            this.notifyProgress('OpenCode: Codificando...', `Modelo: ${msg.model || 'auto'}`);
          } else if (type === 'step_start') {
            this.notifyProgress('OpenCode: Analizando...', 'Iniciando paso de ejecución');
            if (options.onStep) options.onStep('Nuevo paso de ejecución iniciado');
          } else if (type === 'reasoning') {
            const rawThought = msg.part?.text || '';
            if (rawThought) {
              thoughtParts.push(rawThought);
              this.notifyThought(rawThought);
              if (options.onThought) options.onThought(rawThought);
            } else {
              const info = 'Pensando en la solución arquitectónica...';
              this.notifyThought(info);
              if (options.onThought) options.onThought(info);
            }
          } else if (type === 'tool_use') {
            const part = msg.part || {};
            const toolName = part.tool || part.title || 'tool';
            const input = part.state?.input;
            const output = part.state?.output;
            const status = part.state?.status || 'completed';

            const toolCall: OpenCodeToolCall = {
              tool: toolName,
              input,
              output,
              status
            };
            toolsUsed.push(toolCall);

            const displayDetail = input?.path ? `${toolName} en ${input.path}` : toolName;
            this.notifyProgress(`OpenCode: [${toolName}]`, `Ejecutando herramienta local`);
            if (this.onToolExecuted) this.onToolExecuted(toolName, displayDetail);
            if (options.onToolUse) options.onToolUse(toolName, input, output);
          } else if (type === 'text') {
            const chunk = msg.part?.text || '';
            if (chunk) {
              textParts.push(chunk);
              this.notifyProgress('OpenCode: Escribiendo código...', chunk.slice(0, 40));
              if (options.onTextChunk) options.onTextChunk(chunk);
            }
          } else if (type === 'step_finish') {
            const reason = msg.part?.reason;
            if (reason) {
              this.notifyProgress('OpenCode: Paso completado', `Razón: ${reason}`);
            }
          } else if (type === 'done') {
            hasCompleted = true;
            const finalText = msg.text || textParts.join('');
            if (msg.session_id) {
              capturedSessionId = msg.session_id;
              this.setSession(capturedSessionId!);
            }

            this.notifyProgress('OpenCode: Tarea finalizada', 'Resultados generados correctamente');

            resolve({
              success: (msg.exit_code === 0 || msg.exit_code === undefined),
              sessionId: capturedSessionId,
              text: finalText || 'Tarea completada por OpenCode.',
              reasoning: thoughtParts.join('\n'),
              toolsUsed,
              exitCode: msg.exit_code ?? 0
            });
            try { socket.close(); } catch {}
          } else if (type === 'error') {
            const errMsg = msg.error?.message || msg.message || 'Error en OpenCode';
            console.error('[OpenCode Error Event]:', errMsg);
            this.notifyProgress('OpenCode: Error', errMsg);
          }
        } catch (parseErr) {
          console.warn('[OpenCode] JSON parse error on message:', parseErr, event.data);
        }
      };

      socket.onerror = (err) => {
        clearTimeout(connectionTimeout);
        if (!hasCompleted) {
          reject(err);
        }
      };

      socket.onclose = () => {
        clearTimeout(connectionTimeout);
        if (!hasCompleted) {
          // If closed prematurely with some text, resolve with what we have
          if (textParts.length > 0 || toolsUsed.length > 0) {
            resolve({
              success: true,
              sessionId: capturedSessionId,
              text: textParts.join(''),
              reasoning: thoughtParts.join('\n'),
              toolsUsed,
              exitCode: 0
            });
          } else {
            reject(new Error('Conexión con OpenCode cerrada inesperadamente'));
          }
        }
      };
    });
  }

  /**
   * HTTP POST / SSE fallback implementation.
   */
  private async runTaskHttp(options: OpenCodeTaskOptions): Promise<OpenCodeTaskResult> {
    this.notifyProgress('OpenCode: Conectando vía HTTP...', 'Ejecutando tarea...');

    const res = await fetch(`${this.httpBaseUrl}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        prompt: options.prompt,
        file: options.file,
        session_id: options.sessionId,
        auto_approve: options.autoApprove !== false,
        model: options.model
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenCode HTTP error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    if (data.session_id) {
      this.setSession(data.session_id);
    }

    this.notifyProgress('OpenCode: Completado', 'Ejecución HTTP finalizada.');

    return {
      success: !!data.success,
      sessionId: data.session_id,
      text: data.text || 'Tarea de OpenCode procesada.',
      reasoning: data.reasoning || '',
      toolsUsed: data.tools_executed || [],
      exitCode: data.exit_code ?? 0,
      error: data.stderr || undefined
    };
  }

  private notifyProgress(status: string, detail?: string) {
    if (this.onProgress) {
      this.onProgress(status, detail);
    }
  }

  private notifyThought(thought: string) {
    if (this.onThought) {
      this.onThought(thought);
    }
  }
}

export const openCodeClient = new OpenCodeClient();
