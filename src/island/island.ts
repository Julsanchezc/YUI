// Dynamic Island State Machine & UI Manager

import { CharacterEngine } from '../companion/character';
import { Sound } from '../core/audio-sfx';
import { keyPool, callGemini } from '../core/gemini';
import { speechEngine } from '../core/speech';
import { toolRegistry } from '../core/tools';
import { ApprovalManager } from './approval';

export type IslandMode = 'hidden' | 'peek' | 'pill' | 'expanded';

export class DynamicIsland {
  public root: HTMLElement;
  public mode: IslandMode = 'pill';

  private companion: CharacterEngine;
  private approvalManager: ApprovalManager;

  // DOM Elements
  private notchElement: HTMLElement;
  private canvasElement: HTMLCanvasElement;
  private pillBadge: HTMLElement;
  private statusText: HTMLElement;
  private expandedPanel: HTMLElement;
  private messagesContainer: HTMLElement;
  private thinkingContainer: HTMLElement;
  private thinkingContent: HTMLElement;
  private textInput: HTMLInputElement;
  private micButton: HTMLButtonElement;
  private keyBadge: HTMLElement;
  private approvalContainer: HTMLElement;
  private waveBars: HTMLElement[];

  // Conversation Context
  private conversation: { role: 'user' | 'model'; parts: any[] }[] = [];
  private isProcessing: boolean = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.renderLayout();

    // Query elements
    this.notchElement = root.querySelector('#islandNotch')!;
    this.canvasElement = root.querySelector('#companionCanvas')!;
    this.pillBadge = root.querySelector('#pillBadge')!;
    this.statusText = root.querySelector('#statusText')!;
    this.expandedPanel = root.querySelector('#expandedPanel')!;
    this.messagesContainer = root.querySelector('#messagesContainer')!;
    this.thinkingContainer = root.querySelector('#thinkingContainer')!;
    this.thinkingContent = root.querySelector('#thinkingContent')!;
    this.textInput = root.querySelector('#textInput')!;
    this.micButton = root.querySelector('#micButton')!;
    this.keyBadge = root.querySelector('#keyBadge')!;
    this.approvalContainer = root.querySelector('#approvalContainer')!;
    this.waveBars = Array.from(root.querySelectorAll('.wave-bar'));

    // Init Companion Engine
    this.companion = new CharacterEngine(this.canvasElement);
    this.companion.startAnimation();

    // Init Approval Manager
    this.approvalManager = new ApprovalManager(this.approvalContainer);

    this.setupEventListeners();
    this.setupSpeechEvents();
    this.setupFileDropEvents();
    this.updateKeyBadge();

    // Greeting on launch
    setTimeout(() => {
      this.companion.greet();
      this.addMessage('model', '¡Hola! Soy YUI. Estoy en tu notch lista para escuchar, pensar y asistirte con Gemini.');
    }, 600);
  }

  private renderLayout() {
    this.root.innerHTML = `
      <div id="islandContainer" class="fixed top-0 left-0 right-0 flex justify-center z-50 pointer-events-none select-none transition-all duration-300">
        
        <!-- The Floating Notch / Dynamic Island -->
        <div id="islandNotch" class="pointer-events-auto bg-slate-950/95 backdrop-blur-xl border border-slate-800/80 rounded-b-3xl shadow-2xl transition-all duration-300 flex flex-col items-center overflow-hidden">
          
          <!-- Compact Island Bar (Always accessible) -->
          <div id="notchHeader" class="w-full flex items-center justify-between px-4 py-2 gap-3 cursor-pointer hover:bg-slate-900/40 transition">
            
            <!-- Left: Companion Avatar & Mini Info -->
            <div class="flex items-center gap-3">
              <div class="relative w-10 h-10 flex items-center justify-center">
                <canvas id="companionCanvas" width="72" height="72" class="cursor-pointer transition-transform hover:scale-110 active:scale-95"></canvas>
              </div>
              
              <div class="flex flex-col">
                <div class="flex items-center gap-1.5">
                  <span class="font-bold text-xs tracking-wider text-slate-100 font-mono">YUI</span>
                  <span id="pillBadge" class="w-2 h-2 rounded-full bg-cyan-400"></span>
                </div>
                <span id="statusText" class="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">En espera</span>
              </div>
            </div>

            <!-- Center: Audio Reactive Waves (Visible when listening/speaking) -->
            <div id="audioWaveContainer" class="hidden md:flex items-center gap-1 h-5 px-3">
              <div class="w-1 bg-cyan-400 rounded-full h-2 wave-bar transition-all"></div>
              <div class="w-1 bg-cyan-400 rounded-full h-3 wave-bar transition-all"></div>
              <div class="w-1 bg-cyan-400 rounded-full h-1.5 wave-bar transition-all"></div>
              <div class="w-1 bg-cyan-400 rounded-full h-4 wave-bar transition-all"></div>
              <div class="w-1 bg-cyan-400 rounded-full h-2 wave-bar transition-all"></div>
            </div>

            <!-- Right: Quick Controls & Key Pool -->
            <div class="flex items-center gap-2">
              <button id="keyBadge" class="text-[10px] font-mono bg-slate-900 border border-slate-700/60 px-2 py-0.5 rounded text-cyan-300 hover:border-cyan-500/50 transition">
                Pool: JA1
              </button>

              <button id="micButton" title="Hablar con YUI (STT)" class="w-8 h-8 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center transition shadow-md shadow-cyan-500/20 active:scale-95">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>
              </button>

              <button id="toggleExpandBtn" class="text-slate-400 hover:text-slate-200 p-1 rounded transition">
                <svg id="expandIcon" class="w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>
            </div>

          </div>

          <!-- Expanded Body (Chat, Thinking trace, Tools, Drop-file) -->
          <div id="expandedPanel" class="w-full max-w-2xl px-4 pb-4 space-y-3 hidden animate-in fade-in slide-in-from-top-3">
            
            <!-- Approval Card Container (Human-in-the-loop) -->
            <div id="approvalContainer" class="hidden"></div>

            <!-- Thinking Trace (Agent Reasoning) -->
            <div id="thinkingContainer" class="hidden bg-slate-900/80 border border-purple-500/30 rounded-xl p-3 text-xs font-mono text-purple-200 space-y-1">
              <div class="flex items-center gap-1.5 text-purple-400 font-bold uppercase text-[10px] tracking-wider">
                <span class="animate-spin">⚙</span>
                <span>Pensamiento Agéntico (Gemini 2.0 Reasoning)</span>
              </div>
              <div id="thinkingContent" class="text-slate-300 text-[11px] leading-relaxed max-h-28 overflow-y-auto pl-2 border-l border-purple-500/40"></div>
            </div>

            <!-- Messages Stream -->
            <div id="messagesContainer" class="h-64 overflow-y-auto space-y-2.5 p-2 bg-slate-900/40 rounded-xl border border-slate-800 text-xs">
              <!-- Dynamically populated -->
            </div>

            <!-- Input Bar -->
            <div class="flex items-center gap-2 pt-1">
              <input type="text" id="textInput" placeholder="Escribe o habla con YUI... (o suelta un archivo aquí)"
                     class="flex-1 bg-slate-900/90 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500">
              
              <button id="sendBtn" class="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1 transition active:scale-95">
                <span>Enviar</span>
              </button>
            </div>

            <!-- Quick Action Pills -->
            <div class="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1 font-mono">
              <div class="flex items-center gap-2">
                <span>Acciones rápidas:</span>
                <button onclick="window.yuiTriggerQuick('¿Cuál es el estado del sistema?')" class="hover:text-cyan-300 underline">📊 Sistema</button>
                <button onclick="window.yuiTriggerQuick('¿Qué clima hace hoy?')" class="hover:text-cyan-300 underline">🌤️ Clima</button>
                <button onclick="window.yuiTriggerQuick('Cuéntame algo curioso')" class="hover:text-cyan-300 underline">💡 Curiosidad</button>
              </div>

              <div class="flex items-center gap-3">
                <label class="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" id="ttsToggle" checked class="accent-cyan-400">
                  <span>TTS</span>
                </label>
                <button id="btnEmoteQuick" class="hover:text-cyan-300 underline">🎭 Emote</button>
              </div>
            </div>

          </div>

        </div>

      </div>
    `;
  }

  private setupEventListeners() {
    // Canvas poke interaction
    this.canvasElement.addEventListener('click', (e) => {
      e.stopPropagation();
      this.companion.poke();
    });

    // Cursor tracking
    window.addEventListener('mousemove', (e) => {
      this.companion.onCursorMove(e.clientX, e.clientY);
    });

    // Expand/Collapse toggle
    const toggleBtn = this.root.querySelector('#toggleExpandBtn')!;
    const header = this.root.querySelector('#notchHeader')!;
    
    const toggleExpand = () => {
      if (this.mode === 'expanded') {
        this.setMode('pill');
      } else {
        this.setMode('expanded');
      }
    };

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleExpand();
    });

    header.addEventListener('click', () => {
      toggleExpand();
    });

    // Key pool badge click -> Rotate key manually
    this.keyBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      const newKey = keyPool.manualRotate();
      Sound.play('blip');
      this.updateKeyBadge();
      this.addMessage('model', `He rotado la clave activa a [${newKey.id}].`);
    });

    keyPool.onKeyStatusChanged = () => this.updateKeyBadge();

    // Text Send
    const sendBtn = this.root.querySelector('#sendBtn')!;
    const sendMsg = () => {
      const text = this.textInput.value.trim();
      if (!text || this.isProcessing) return;
      this.textInput.value = '';
      this.handleUserQuery(text);
    };

    sendBtn.addEventListener('click', sendMsg);
    this.textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMsg();
    });

    // Emote quick button
    const btnEmote = this.root.querySelector('#btnEmoteQuick')!;
    const emotes = ['love', 'proud', 'surprised', 'wink', 'happy'];
    let emoteIdx = 0;
    btnEmote.addEventListener('click', () => {
      const em = emotes[emoteIdx % emotes.length];
      emoteIdx++;
      this.companion.triggerEmote(em);
    });

    // Expose quick query handler on window
    (window as any).yuiTriggerQuick = (q: string) => {
      this.setMode('expanded');
      this.handleUserQuery(q);
    };

    // Tool registry emote callback
    toolRegistry.onEmoteRequested = (emote) => {
      this.companion.triggerEmote(emote);
    };
  }

  private setupSpeechEvents() {
    let isListening = false;

    this.micButton.addEventListener('click', async (e) => {
      e.stopPropagation();
      Sound.play('blip');

      if (isListening) {
        speechEngine.stopListening();
        isListening = false;
        this.micButton.classList.remove('bg-red-500', 'animate-pulse');
        this.micButton.classList.add('bg-cyan-500');
        this.companion.setState('idle');
        this.statusText.textContent = "Listo";
      } else {
        this.setMode('expanded');
        this.companion.setState('listening');
        this.statusText.textContent = "Escuchando...";
        this.micButton.classList.remove('bg-cyan-500');
        this.micButton.classList.add('bg-red-500', 'animate-pulse');

        const ok = await speechEngine.startListening({
          onSpeechStart: () => {
            isListening = true;
          },
          onAudioLevel: (level) => {
            // Animate wave bars
            this.waveBars.forEach((bar, idx) => {
              const h = Math.max(4, Math.min(24, level * 30 * (1 + (idx % 3) * 0.3)));
              bar.style.height = `${h}px`;
            });
          },
          onSpeechResult: (transcript, isFinal) => {
            this.statusText.textContent = transcript;
            if (isFinal) {
              speechEngine.stopListening();
              isListening = false;
              this.micButton.classList.remove('bg-red-500', 'animate-pulse');
              this.micButton.classList.add('bg-cyan-500');
              this.handleUserQuery(transcript);
            }
          },
          onSpeechEnd: () => {
            isListening = false;
            this.micButton.classList.remove('bg-red-500', 'animate-pulse');
            this.micButton.classList.add('bg-cyan-500');
            this.statusText.textContent = "Listo";
          },
          onError: () => {
            isListening = false;
            this.micButton.classList.remove('bg-red-500', 'animate-pulse');
            this.micButton.classList.add('bg-cyan-500');
            this.statusText.textContent = "Listo";
          }
        });

        if (!ok) {
          alert("Por favor concede permiso de micrófono a tu navegador para hablar con YUI.");
        }
      }
    });

    // Viseme synchronization with TTS
    speechEngine.onSpeakingViseme = (amp) => {
      this.companion.setSpeechViseme(amp);
    };

    speechEngine.onSpeakingChange = (speaking) => {
      if (speaking) {
        this.companion.setState('speaking');
        this.statusText.textContent = "Hablando...";
      } else {
        this.companion.setState('idle');
        this.statusText.textContent = "Listo";
      }
    };

    const ttsToggle = this.root.querySelector('#ttsToggle') as HTMLInputElement;
    if (ttsToggle) {
      ttsToggle.addEventListener('change', () => {
        speechEngine.ttsEnabled = ttsToggle.checked;
      });
    }
  }

  private setupFileDropEvents() {
    const notch = this.notchElement;

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.companion.setMorph(1.0); // Box swallow shape
      notch.classList.add('ring-2', 'ring-cyan-400', 'ring-dashed');
      this.statusText.textContent = "¡Suelta el archivo aquí!";
    });

    window.addEventListener('dragleave', (e) => {
      if (e.clientX <= 0 || e.clientY <= 0) {
        this.companion.setMorph(0);
        notch.classList.remove('ring-2', 'ring-cyan-400', 'ring-dashed');
        this.statusText.textContent = "Listo";
      }
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      this.companion.setMorph(0);
      notch.classList.remove('ring-2', 'ring-cyan-400', 'ring-dashed');

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      Sound.play('gulp'); // Swallow sound!
      this.companion.triggerEmote('love', 2.0);

      let textPreview = '';
      if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.json') || file.name.endsWith('.js') || file.name.endsWith('.ts')) {
        textPreview = await file.text();
      }

      toolRegistry.setDroppedFile(file, textPreview);
      this.setMode('expanded');

      this.addMessage('user', `📎 [Archivo soltado]: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      this.handleUserQuery(`He soltado el archivo "${file.name}". Inspecciónalo usando 'inspect_dropped_file' y dame un resumen.`);
    });
  }

  public setMode(mode: IslandMode) {
    this.mode = mode;
    const expandIcon = this.root.querySelector('#expandIcon')!;

    if (mode === 'expanded') {
      this.expandedPanel.classList.remove('hidden');
      expandIcon.classList.add('rotate-180');
      Sound.play('open');
    } else {
      this.expandedPanel.classList.add('hidden');
      expandIcon.classList.remove('rotate-180');
      Sound.play('close');
    }
  }

  public updateKeyBadge() {
    const k = keyPool.getActiveKey();
    this.keyBadge.textContent = `Key: ${k.id} (${k.calls})`;
  }

  private addMessage(role: 'user' | 'model', content: string) {
    const div = document.createElement('div');
    const isUser = role === 'user';

    div.className = `flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`;
    div.innerHTML = `
      <div class="${isUser ? 'bg-cyan-950/70 border-cyan-700/50 text-cyan-100' : 'bg-slate-800/80 border-slate-700 text-slate-200'} border rounded-xl p-2.5 max-w-[85%] leading-relaxed shadow-sm">
        <div class="font-mono text-[9px] ${isUser ? 'text-cyan-400' : 'text-slate-400'} uppercase font-bold mb-0.5">
          ${isUser ? 'Tú' : 'YUI'}
        </div>
        <div class="break-words">${content}</div>
      </div>
    `;

    this.messagesContainer.appendChild(div);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  private async handleUserQuery(query: string) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    this.addMessage('user', query);
    this.conversation.push({ role: 'user', parts: [{ text: query }] });

    this.companion.setState('thinking');
    this.statusText.textContent = "Pensando...";
    this.thinkingContainer.classList.remove('hidden');
    this.thinkingContent.innerHTML = 'Analizando intenciones y herramientas...';

    try {
      const response = await callGemini(this.conversation, (thought) => {
        this.thinkingContent.textContent = thought;
      });

      this.thinkingContainer.classList.add('hidden');

      // Check for tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const tc of response.toolCalls) {
          const execRes = await toolRegistry.executeTool(tc.name, tc.args, false);

          if (execRes.needsApproval && execRes.approvalPayload) {
            // Human in the Loop approval needed
            this.companion.setState('approval');
            this.statusText.textContent = "Esperando aprobación...";

            await new Promise<void>((resolve) => {
              this.approvalManager.show({
                actionTitle: execRes.approvalPayload!.actionTitle,
                command: execRes.approvalPayload!.command,
                reason: execRes.approvalPayload!.reason,
                onApprove: async () => {
                  Sound.play('approve');
                  const approvedRes = await toolRegistry.executeTool(tc.name, tc.args, true);
                  this.finalizeTurn(response.text || "Comando ejecutado con éxito.", approvedRes.result);
                  resolve();
                },
                onDeny: () => {
                  Sound.play('annoyed');
                  this.companion.triggerEmote('annoyed');
                  this.finalizeTurn("Acción cancelada por el usuario.");
                  resolve();
                }
              });
            });
            return;
          } else {
            // Auto tool executed
            if (response.text) {
              this.finalizeTurn(response.text, execRes.result);
            } else {
              this.finalizeTurn(`Herramienta [${tc.name}] completada: ${JSON.stringify(execRes.result)}`);
            }
            return;
          }
        }
      }

      this.finalizeTurn(response.text);

    } catch (err: any) {
      console.error(err);
      this.companion.setState('error');
      this.statusText.textContent = "Error";
      this.addMessage('model', `Lo siento, ocurrió un error: ${err.message}`);
      Sound.play('error');
    } finally {
      this.isProcessing = false;
    }
  }

  private finalizeTurn(agentText: string, toolResult?: any) {
    let displayText = agentText;
    if (toolResult) {
      displayText += `\n<pre class="mt-1 p-1.5 bg-black/40 rounded text-[10px] text-emerald-300 font-mono overflow-x-auto">${JSON.stringify(toolResult, null, 2)}</pre>`;
    }

    this.addMessage('model', displayText);
    this.conversation.push({ role: 'model', parts: [{ text: agentText }] });

    // Speak using TTS
    speechEngine.speak(agentText, () => {
      this.companion.setState('idle');
      this.statusText.textContent = "Listo";
    });

    this.isProcessing = false;
  }
}
