// Dynamic Island State Machine & UI Manager
// Supports 3 Distinct Modes: Pill (380x42), Compact (480x56), Expanded (640x500)

import { CharacterEngine } from '../companion/character';
import { Sound } from '../core/audio-sfx';
import { keyPool, callGemini } from '../core/gemini';
import { speechEngine } from '../core/speech';
import { toolRegistry } from '../core/tools';
import { openCodeClient } from '../core/opencode';
import { kalaNative } from '../core/kala-native';
import { ApprovalManager } from './approval';

export type IslandMode = 'pill' | 'compact' | 'expanded';

export class DynamicIsland {
  public root: HTMLElement;
  public mode: IslandMode = 'pill';
  public isMobile: boolean = false;

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
  private collapseBtn: HTMLElement | null;
  private toggleBtn: HTMLElement | null;
  private audioWaveContainer: HTMLElement;

  // Conversation Context
  private conversation: { role: 'user' | 'model'; parts: any[] }[] = [];
  private isProcessing: boolean = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.isMobile = kalaNative.isMobile();
    this.renderLayout();

    // Query elements
    this.notchElement = (root.querySelector('#islandNotch') || root.querySelector('#kalaMobileContainer') || root) as HTMLElement;
    this.canvasElement = (root.querySelector('#companionCanvasHero') || root.querySelector('#companionCanvas')) as HTMLCanvasElement;
    this.pillBadge = root.querySelector('#pillBadge')!;
    this.statusText = root.querySelector('#statusText')!;
    this.expandedPanel = (root.querySelector('#expandedPanel') || root.querySelector('#mobileMainStream') || root) as HTMLElement;
    this.messagesContainer = root.querySelector('#messagesContainer')!;
    this.thinkingContainer = root.querySelector('#thinkingContainer')!;
    this.thinkingContent = root.querySelector('#thinkingContent')!;
    this.textInput = root.querySelector('#textInput')!;
    this.micButton = root.querySelector('#micButton')!;
    this.keyBadge = root.querySelector('#keyBadge')!;
    this.approvalContainer = root.querySelector('#approvalContainer')!;
    this.waveBars = Array.from(root.querySelectorAll('.wave-bar'));
    this.collapseBtn = root.querySelector('#collapseBtn') as HTMLElement || null;
    this.toggleBtn = root.querySelector('#toggleExpandBtn') as HTMLElement || null;
    this.audioWaveContainer = root.querySelector('#audioWaveContainer')!;

    // Init Companion Engine
    const canvasCssSize = this.isMobile ? 112 : 28;
    this.companion = new CharacterEngine(this.canvasElement, canvasCssSize, canvasCssSize);
    this.companion.startAnimation();

    // Init Approval Manager
    this.approvalManager = new ApprovalManager(this.approvalContainer);

    this.setupEventListeners();
    this.setupSpeechEvents();
    this.setupFileDropEvents();
    this.setupIpcEvents();
    this.updateKeyBadge();

    // Set initial mode cleanly
    this.applyModeStyles(this.isMobile ? 'expanded' : 'pill');

    // Greeting on launch
    setTimeout(() => {
      this.companion.greet();
      if (this.isMobile) {
        this.addMessage('model', '¡Hola! Soy Kala, tu asistente de voz para Android con Gemini 3.5. Di **"Oye Kala"** en cualquier momento o pulsa el micrófono para hablar.');
      } else {
        this.addMessage('model', '¡Hola! Soy Kala. Estoy en tu isla lista para escuchar, pensar y asistirte con Gemini.');
      }
    }, 600);
  }

  private renderLayout() {
    if (this.isMobile) {
      this.renderMobileLayout();
    } else {
      this.renderDesktopLayout();
    }
  }

  private renderMobileLayout() {
    this.root.innerHTML = `
      <div id="kalaMobileContainer" class="kala-mobile-root text-slate-100 flex flex-col h-full w-full select-none">
        
        <!-- Mobile Top Bar -->
        <header class="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 flex-shrink-0 z-20">
          <div class="flex items-center gap-2">
            <div class="relative w-8 h-8 rounded-full bg-slate-900 border border-cyan-500/40 flex items-center justify-center overflow-hidden">
              <canvas id="companionCanvas" width="72" height="72" class="w-8 h-8 cursor-pointer"></canvas>
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-xs tracking-wider font-mono text-cyan-300">KALA</span>
                <span id="pillBadge" class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                <span class="text-[9px] font-mono bg-cyan-950/70 border border-cyan-800/50 text-cyan-300 px-1.5 py-0.2 rounded-full">3.5 Lite</span>
              </div>
              <div id="statusText" class="text-[9px] text-slate-400 font-mono truncate max-w-[120px]">En espera</div>
            </div>
          </div>

          <!-- Quick action buttons -->
          <div class="flex items-center gap-1.5">
            <!-- Background Wake Word Toggle -->
            <button id="wakeWordToggleBtn" class="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-900 border border-slate-700 text-slate-300 transition active:scale-95 shadow-sm" title="Activar/Desactivar escucha en segundo plano">
              <span id="wakeWordDot" class="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
              <span id="wakeWordText">Oye Kala</span>
            </button>

            <button id="keyBadge" class="text-[9px] font-mono bg-slate-900 border border-slate-700/60 px-1.5 py-0.5 rounded text-cyan-300 hover:border-cyan-500/50 transition">
              JA1
            </button>

            <button id="btnAssistantSettings" class="p-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono active:scale-95" title="Asistente predeterminado de Android">
              ⭐
            </button>
            <button id="btnPcOpenCode" class="p-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-mono active:scale-95" title="Conectar PC OpenCode">
              💻
            </button>
          </div>
        </header>

        <!-- Mobile Main Stream -->
        <main id="mobileMainStream" class="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
          <!-- Hero Stage (large Kala avatar in center when starting) -->
          <div id="heroCompanionStage" class="flex flex-col items-center justify-center py-4 text-center space-y-2.5">
            <div class="relative w-32 h-32 flex items-center justify-center">
              <div class="absolute inset-0 rounded-full bg-cyan-500/15 blur-2xl orb-pulse"></div>
              <div class="absolute inset-1 rounded-full border border-cyan-500/25"></div>
              <canvas id="companionCanvasHero" width="280" height="280" class="w-28 h-28 cursor-pointer z-10 transition-transform active:scale-95"></canvas>
            </div>
            <div>
              <h2 class="text-base font-bold text-slate-100 flex items-center justify-center gap-1.5">
                <span>Kala</span>
                <span class="text-[10px] text-cyan-400 font-mono px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-800/60">Android Assistant</span>
              </h2>
              <p class="text-[11px] text-slate-400 max-w-[260px] mx-auto mt-1 leading-relaxed">
                Di <span class="text-cyan-400 font-semibold font-mono">"Oye Kala"</span> o pulsa el micrófono inferior para hablar.
              </p>
            </div>
          </div>

          <!-- Approval container -->
          <div id="approvalContainer" class="hidden"></div>

          <!-- Thinking trace -->
          <details id="thinkingContainer" class="hidden bg-slate-900/90 border border-purple-500/40 rounded-2xl p-2.5 text-xs font-mono text-purple-200 group">
            <summary class="cursor-pointer font-bold uppercase text-[10px] tracking-wider text-purple-400 flex items-center justify-between select-none list-none">
              <div class="flex items-center gap-1.5">
                <span class="animate-spin">⚙</span>
                <span>Razonamiento Agéntico (Gemini 3.5)</span>
              </div>
              <span class="text-[9px] text-purple-400/80 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div id="thinkingContent" class="text-slate-300 text-[11px] leading-relaxed max-h-24 overflow-y-auto pl-2 border-l border-purple-500/40 mt-1.5"></div>
          </details>

          <!-- Messages Container -->
          <div id="messagesContainer" class="space-y-2.5 pb-2">
            <!-- Chat bubbles -->
          </div>
        </main>

        <!-- Mobile Bottom Thumb Dock -->
        <footer class="bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/90 px-3.5 pt-2 pb-3 flex flex-col gap-2 z-20">
          <!-- Horizontal Quick Chips -->
          <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-[11px] font-mono">
            <button onclick="window.yuiTriggerQuick('¿Cuál es el estado del sistema?')" class="flex-shrink-0 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-300 active:scale-95 shadow-sm">📊 Sistema</button>
            <button onclick="window.yuiTriggerQuick('¿Qué clima hace hoy?')" class="flex-shrink-0 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-300 active:scale-95 shadow-sm">🌤️ Clima</button>
            <button onclick="window.yuiTriggerQuick('Kala, crea una función en Python para ordenar un array')" class="flex-shrink-0 px-2.5 py-1 rounded-full bg-purple-950/50 border border-purple-800/50 text-purple-300 font-bold active:scale-95 shadow-sm">⚡ Código</button>
            <button onclick="window.kalaConfigurePcUrl && window.kalaConfigurePcUrl()" class="flex-shrink-0 px-2.5 py-1 rounded-full bg-blue-950/50 border border-blue-800/50 text-blue-300 active:scale-95 shadow-sm">💻 PC OpenCode</button>
            <button id="btnEmoteQuick" class="flex-shrink-0 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-300 active:scale-95 shadow-sm">🎭 Emote</button>
            <label class="flex items-center gap-1 text-[10px] text-slate-400 px-2 flex-shrink-0 cursor-pointer">
              <input type="checkbox" id="ttsToggle" checked class="accent-cyan-400">
              <span>Voz</span>
            </label>
          </div>

          <!-- Thumb Bar (Input + Giant Mic) -->
          <div class="flex items-center gap-2">
            <div class="flex-1 flex items-center bg-slate-900/90 border border-slate-700/80 rounded-2xl px-3 py-2 focus-within:border-cyan-500 shadow-inner">
              <input type="text" id="textInput" placeholder="Escribe a Kala o pulsa el micro..." class="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none min-w-0">
              <button id="sendBtn" class="text-cyan-400 hover:text-cyan-300 font-bold p-1 active:scale-95 flex-shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
              </button>
            </div>

            <!-- Giant Floating Mic Action Button -->
            <button id="micButton" title="Hablar con Kala" class="relative w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-cyan-400 text-slate-950 flex items-center justify-center shadow-lg shadow-cyan-500/20 active:scale-90 transition-transform flex-shrink-0">
              <div id="audioWaveContainer" class="flex items-center gap-0.5 h-3 px-1 pointer-events-none absolute hidden">
                <div class="w-0.5 bg-slate-950 rounded-full h-1 wave-bar"></div>
                <div class="w-0.5 bg-slate-950 rounded-full h-2.5 wave-bar"></div>
                <div class="w-0.5 bg-slate-950 rounded-full h-1 wave-bar"></div>
              </div>
              <svg id="micIcon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>
            </button>
          </div>
        </footer>
      </div>
    `;
  }

  private renderDesktopLayout() {
    this.root.innerHTML = `
      <div id="islandContainer" class="fixed top-0 left-0 right-0 flex justify-center z-50 pointer-events-none select-none">
        
        <!-- The Floating Notch / Dynamic Island -->
        <div id="islandNotch" class="pointer-events-auto yui-notch-acrylic w-[360px] max-w-[96vw] h-[42px] px-3 flex flex-col items-center bg-slate-950/90 backdrop-blur-xl transition-all duration-300 ease-out overflow-hidden shadow-2xl">
          
          <!-- Compact Island Bar (Always accessible, height adjusted per mode) -->
          <div id="notchHeader" class="w-full flex items-center justify-between h-[42px] gap-2 cursor-pointer transition flex-shrink-0">
            
            <!-- Left: Companion Avatar & Mini Info -->
            <div class="flex items-center gap-2 min-w-0">
              <div class="relative w-7 h-7 flex items-center justify-center flex-shrink-0">
                <canvas id="companionCanvas" width="72" height="72" class="w-7 h-7 cursor-pointer transition-transform hover:scale-110 active:scale-95"></canvas>
              </div>
              
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="font-bold text-xs tracking-wider text-slate-100 font-mono">KALA</span>
                  <span id="pillBadge" class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                </div>
                <span id="statusText" class="text-[9px] text-slate-400 font-mono truncate max-w-[130px]">En espera</span>
              </div>
            </div>

            <!-- Center: Audio Reactive Waves (Active on listening / speaking) -->
            <div id="audioWaveContainer" class="flex items-center gap-1 h-4 px-2">
              <div class="w-0.5 bg-cyan-400 rounded-full h-1.5 wave-bar transition-all"></div>
              <div class="w-0.5 bg-cyan-400 rounded-full h-3 wave-bar transition-all"></div>
              <div class="w-0.5 bg-cyan-400 rounded-full h-1 wave-bar transition-all"></div>
              <div class="w-0.5 bg-cyan-400 rounded-full h-3.5 wave-bar transition-all"></div>
              <div class="w-0.5 bg-cyan-400 rounded-full h-1.5 wave-bar transition-all"></div>
            </div>

            <!-- Right: Controls & Badges -->
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <button id="keyBadge" class="text-[9px] font-mono bg-slate-900 border border-slate-700/60 px-1.5 py-0.5 rounded text-cyan-300 hover:border-cyan-500/50 transition">
                JA1
              </button>

              <button id="micButton" title="Hablar con Kala (STT)" class="w-6 h-6 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center transition shadow-sm active:scale-95">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>
              </button>

              <!-- Minimize / Collapse Button (Visible in Expanded mode) -->
              <button id="collapseBtn" title="Colapsar a píldora (Ctrl+K)" class="hidden text-slate-400 hover:text-cyan-300 p-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:border-cyan-500 transition text-[11px] font-mono items-center gap-0.5">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
                <span>−</span>
              </button>

              <!-- Chevron Toggle Button -->
              <button id="toggleExpandBtn" title="Expandir chat (Ctrl+K)" class="text-slate-400 hover:text-slate-200 p-1 rounded transition">
                <svg id="expandIcon" class="w-3.5 h-3.5 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>

              <!-- Close Desktop Button -->
              <button id="closeDesktopBtn" title="Cerrar Kala" class="text-slate-500 hover:text-rose-400 p-1 rounded transition hidden">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

          </div>

          <!-- Expanded Body (Chat, Thinking trace, Tools, Drop-file) -->
          <div id="expandedPanel" class="w-full flex-1 flex flex-col min-h-0 space-y-2 pt-1 pb-3 px-1 hidden animate-in fade-in slide-in-from-top-2">
            
            <!-- Approval Card Container (Human-in-the-loop) -->
            <div id="approvalContainer" class="hidden"></div>

            <!-- Thinking Trace (Collapsible Accordion) -->
            <details id="thinkingContainer" class="hidden bg-slate-900/80 border border-purple-500/30 rounded-xl p-2 text-xs font-mono text-purple-200 group">
              <summary class="cursor-pointer font-bold uppercase text-[10px] tracking-wider text-purple-400 flex items-center justify-between select-none list-none">
                <div class="flex items-center gap-1.5">
                  <span class="animate-spin">⚙</span>
                  <span>Pensamiento Agéntico (Gemini 3.5)</span>
                </div>
                <span class="text-[9px] text-purple-400/80 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div id="thinkingContent" class="text-slate-300 text-[11px] leading-relaxed max-h-24 overflow-y-auto pl-2 border-l border-purple-500/40 mt-1.5"></div>
            </details>

            <!-- Messages Stream -->
            <div id="messagesContainer" class="flex-1 overflow-y-auto space-y-2 p-2.5 bg-slate-900/50 rounded-xl border border-slate-800 text-xs min-h-[160px] max-h-[260px]">
              <!-- Dynamically populated -->
            </div>

            <!-- Input Bar -->
            <div class="flex items-center gap-2 pt-0.5">
              <input type="text" id="textInput" placeholder="Escribe o habla con Kala... (&quot;Oye Kala&quot; o Ctrl+K)"
                     class="flex-1 bg-slate-900/90 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500">
              
              <button id="sendBtn" class="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 transition active:scale-95 shadow-sm">
                <span>Enviar</span>
              </button>
            </div>

            <!-- Quick Action Pills -->
            <div class="flex flex-wrap items-center justify-between text-[10px] text-slate-400 pt-0.5 font-mono">
              <div class="flex items-center gap-2">
                <span>Acciones:</span>
                <button onclick="window.yuiTriggerQuick('¿Cuál es el estado del sistema?')" class="hover:text-cyan-300 underline">📊 Sistema</button>
                <button onclick="window.yuiTriggerQuick('¿Qué clima hace hoy?')" class="hover:text-cyan-300 underline">🌤️ Clima</button>
                <button onclick="window.yuiTriggerQuick('Kala, crea una función en Python para ordenar un array')" class="hover:text-purple-300 text-purple-400 font-bold underline">⚡ Código</button>
                <button onclick="window.kalaConfigurePcUrl && window.kalaConfigurePcUrl()" class="hover:text-blue-300 text-blue-400 underline" title="Configurar conexión con tu PC">💻 PC OpenCode</button>
                <button onclick="window.yuiOpenAssistantSettings && window.yuiOpenAssistantSettings()" class="hover:text-amber-300 text-amber-400 font-bold underline" title="Configurar como asistente predeterminado de Android">⭐ Asistente</button>
              </div>

              <div class="flex items-center gap-2.5">
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

    // Header toggle (Desktop)
    const header = this.root.querySelector('#notchHeader');
    if (header) {
      header.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('canvas')) return;
        this.toggleExpand();
      });
    }

    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleExpand();
      });
    }

    // Collapse button in expanded header
    if (this.collapseBtn) {
      this.collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setMode('pill');
      });
    }

    // Background Wake Word Toggle Button (Android Foreground Service)
    const wakeWordToggleBtn = this.root.querySelector('#wakeWordToggleBtn') as HTMLElement;
    if (wakeWordToggleBtn) {
      const updateWakeWordUI = (active: boolean) => {
        const dot = this.root.querySelector('#wakeWordDot') as HTMLElement;
        const text = this.root.querySelector('#wakeWordText') as HTMLElement;
        if (dot) dot.className = `w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`;
        if (text) text.textContent = active ? 'Oye Kala: ON' : 'Oye Kala: OFF';
        if (wakeWordToggleBtn) {
          wakeWordToggleBtn.className = `flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border transition active:scale-95 shadow-sm ${
            active ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-300'
          }`;
        }
      };

      // Check current status or auto-start if previously enabled
      kalaNative.isWakeWordActive().then(active => {
        const pref = localStorage.getItem('kala_wake_word_enabled');
        if (kalaNative.isNative() && (pref === null || pref === 'true') && !active) {
          kalaNative.startWakeWord().then(running => updateWakeWordUI(running));
        } else {
          updateWakeWordUI(active);
        }
      });

      wakeWordToggleBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        Sound.play('blip');
        kalaNative.triggerHaptic(60);
        const current = await kalaNative.isWakeWordActive();
        if (current) {
          await kalaNative.stopWakeWord();
          updateWakeWordUI(false);
          this.addMessage('model', '💤 **Escucha en segundo plano desactivada.** Kala no responderá a "Oye Kala" con la app minimizada.');
        } else {
          const started = await kalaNative.startWakeWord();
          updateWakeWordUI(started);
          if (started) {
            this.addMessage('model', '🎙️ **¡Oye Kala activado!** El servicio nativo está activo en tu barra de notificaciones y responderá incluso con la pantalla apagada.');
          } else {
            this.addMessage('model', '⚠️ No se pudo iniciar el servicio en segundo plano. Comprueba los permisos de micrófono en Ajustes.');
          }
        }
      });
    }

    // Android Assistant Settings & PC Buttons
    const btnAssistantSettings = this.root.querySelector('#btnAssistantSettings');
    if (btnAssistantSettings) {
      btnAssistantSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        kalaNative.triggerHaptic(50);
        kalaNative.openAssistantSettings();
      });
    }

    const btnPcOpenCode = this.root.querySelector('#btnPcOpenCode');
    if (btnPcOpenCode) {
      btnPcOpenCode.addEventListener('click', (e) => {
        e.stopPropagation();
        kalaNative.triggerHaptic(50);
        (window as any).kalaConfigurePcUrl();
      });
    }

    // Hero canvas interaction
    const heroCanvas = this.root.querySelector('#companionCanvasHero');
    if (heroCanvas) {
      heroCanvas.addEventListener('click', (e) => {
        e.stopPropagation();
        kalaNative.triggerHaptic(40);
        this.companion.poke();
      });
    }

    // Close desktop button
    const closeDesktopBtn = this.root.querySelector('#closeDesktopBtn') as HTMLElement;
    if (closeDesktopBtn) {
      if ((window as any).electronAPI || (window as any).__TAURI__) {
        closeDesktopBtn.classList.remove('hidden');
      }
      closeDesktopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if ((window as any).electronAPI?.close) {
          (window as any).electronAPI.close();
        } else if ((window as any).__TAURI__?.process?.exit) {
          (window as any).__TAURI__.process.exit(0);
        } else {
          window.close();
        }
      });
    }

    // Key pool badge click -> Rotate key manually
    if (this.keyBadge) {
      this.keyBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        const newKey = keyPool.manualRotate();
        Sound.play('blip');
        this.updateKeyBadge();
        this.addMessage('model', `He rotado la clave activa a [${newKey.id}].`);
      });
    }

    keyPool.onKeyStatusChanged = () => this.updateKeyBadge();

    // Text Send
    const sendBtn = this.root.querySelector('#sendBtn');
    const sendMsg = () => {
      if (!this.textInput) return;
      const text = this.textInput.value.trim();
      if (!text || this.isProcessing) return;
      this.textInput.value = '';
      this.handleUserQuery(text);
    };

    if (sendBtn) {
      sendBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sendMsg();
      });
    }

    if (this.textInput) {
      this.textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendMsg();
        }
      });
    }

    // Global Keyboard Shortcuts (Ctrl+K to toggle, Escape to collapse)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggleExpand();
      } else if (e.key === 'Escape' && this.mode === 'expanded') {
        e.preventDefault();
        this.setMode('pill');
      }
    });

    // Click outside detection: click outside the notch collapses to pill (Desktop only)
    if (!this.isMobile) {
      document.addEventListener('click', (e) => {
        if (this.mode === 'expanded') {
          const target = e.target as HTMLElement;
          if (!this.notchElement.contains(target)) {
            this.setMode('pill');
          }
        }
      });
    }

    // Emote quick button
    const btnEmote = this.root.querySelector('#btnEmoteQuick');
    if (btnEmote) {
      const emotes = ['love', 'proud', 'surprised', 'wink', 'happy'];
      let emoteIdx = 0;
      btnEmote.addEventListener('click', (e) => {
        e.stopPropagation();
        const em = emotes[emoteIdx % emotes.length];
        emoteIdx++;
        this.companion.triggerEmote(em);
      });
    }

    // Expose quick query handler on window
    (window as any).yuiTriggerQuick = (q: string) => {
      this.setMode('expanded');
      this.handleUserQuery(q);
    };

    // System Assistant Invocation (Android Assist / Power Button / Swipe / Background Wake Word)
    (window as any).kalaTriggerAssistantVoice = () => {
      kalaNative.triggerHaptic(80);
      Sound.play('open');
      this.companion.triggerEmote('wink');
      if (!this.isMobile && this.mode !== 'expanded') {
        this.setMode('expanded');
      }
      // Only click mic if not already listening to avoid toggling off
      if (!speechEngine.isCurrentlyListening()) {
        setTimeout(() => {
          if (!speechEngine.isCurrentlyListening()) {
            this.micButton.click();
          }
        }, 150);
      }
    };

    // One-shot continuous spoken query direct from Wake Word Service
    (window as any).kalaProcessSpokenQuery = (query: string) => {
      if (!query || !query.trim()) return;
      kalaNative.triggerHaptic(60);
      Sound.play('open');
      this.companion.triggerEmote('think');
      if (!this.isMobile && this.mode !== 'expanded') {
        this.setMode('expanded');
      }
      this.handleUserQuery(query.trim());
    };
    (window as any).yuiTriggerVoiceAssistant = (window as any).kalaTriggerAssistantVoice;

    // Open Android Assistant Settings
    (window as any).yuiOpenAssistantSettings = async () => {
      kalaNative.triggerHaptic(50);
      await kalaNative.openAssistantSettings();
    };

    // Configure Remote PC OpenCode URL
    (window as any).kalaConfigurePcUrl = () => {
      const current = openCodeClient.getRemotePcUrl();
      const input = prompt(
        "Introduce la URL de OpenCode en tu PC (ej: http://100.64.0.1:4096 con Tailscale o http://192.168.1.50:4096).\n\nDeja vacío para usar el motor autónomo Gemini 3.5 Flash Lite en el móvil:",
        current
      );
      if (input !== null) {
        openCodeClient.setRemotePcUrl(input);
        const activeUrl = openCodeClient.getRemotePcUrl();
        if (activeUrl) {
          this.addMessage('model', `💻 **PC OpenCode Vinculada:** Se intentará delegar código a \`${activeUrl}\` con fallback automático a Gemini Flash Lite.`);
        } else {
          this.addMessage('model', `⚡ **Modo Autónomo:** Generación de código directa con Gemini 3.5 Flash Lite activa.`);
        }
      }
    };

    // Tool registry emote callback
    toolRegistry.onEmoteRequested = (emote) => {
      this.companion.triggerEmote(emote);
    };

    // OpenCode Live State & Thinking Trace
    toolRegistry.onOpenCodeProgress = (status: string, detail?: string) => {
      this.statusText.textContent = status;
      if (this.pillBadge) {
        this.pillBadge.className = 'w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse';
      }
      this.companion.setState('thinking');
      if (detail) {
        this.thinkingContainer.classList.remove('hidden');
        (this.thinkingContainer as HTMLDetailsElement).open = true;
        const stepEl = document.createElement('div');
        stepEl.className = 'text-cyan-300 text-[11px] font-mono py-0.5 border-l-2 border-cyan-400 pl-2 my-0.5';
        stepEl.textContent = `⚡ [${status}] ${detail}`;
        this.thinkingContent.appendChild(stepEl);
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
      }
    };

    toolRegistry.onOpenCodeThought = (thought: string) => {
      this.thinkingContainer.classList.remove('hidden');
      (this.thinkingContainer as HTMLDetailsElement).open = true;
      const thoughtEl = document.createElement('div');
      thoughtEl.className = 'text-purple-200 text-[11px] font-mono py-0.5 pl-2 border-l-2 border-purple-500 my-0.5 leading-relaxed';
      thoughtEl.textContent = thought;
      this.thinkingContent.appendChild(thoughtEl);
      this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    };
  }

  private setupIpcEvents() {
    const api = (window as any).electronAPI;
    if (api) {
      if (api.onCollapse) {
        api.onCollapse(() => {
          if (this.mode === 'expanded') {
            this.setMode('pill');
          }
        });
      }
      if (api.onToggleExpand) {
        api.onToggleExpand(() => {
          this.toggleExpand();
        });
      }
    }
  }

  public toggleExpand() {
    if (this.mode === 'expanded') {
      this.setMode('pill');
    } else {
      this.setMode('expanded');
    }
  }

  private setupSpeechEvents() {
    let isListening = false;

    this.micButton.addEventListener('click', async (e) => {
      e.stopPropagation();
      Sound.play('blip');

      if (isListening) {
        this.statusText.textContent = "Procesando voz...";
        speechEngine.stopListening();
        isListening = false;
        this.micButton.classList.remove('bg-red-500', 'animate-pulse');
        this.micButton.classList.add('bg-cyan-500');
        this.companion.setState('thinking');
      } else {
        // Expand to compact mode while speaking/listening
        if (this.mode === 'pill') {
          this.setMode('compact');
        }
        this.companion.setState('listening');
        this.statusText.textContent = "Escuchando... (clic para enviar)";
        this.micButton.classList.remove('bg-cyan-500');
        this.micButton.classList.add('bg-red-500', 'animate-pulse');

        const ok = await speechEngine.startListening({
          onSpeechStart: () => {
            isListening = true;
            this.companion.setState('listening');
            this.statusText.textContent = "Escuchando... (habla ahora)";
          },
          onAudioLevel: (level) => {
            this.waveBars.forEach((bar, idx) => {
              const h = Math.max(3, Math.min(18, level * 25 * (1 + (idx % 3) * 0.3)));
              bar.style.height = `${h}px`;
            });
          },
          onSpeechResult: (transcript, isFinal) => {
            if (transcript) {
              this.statusText.textContent = transcript;
            }
            if (isFinal) {
              isListening = false;
              this.micButton.classList.remove('bg-red-500', 'animate-pulse');
              this.micButton.classList.add('bg-cyan-500');
              if (transcript && transcript.trim()) {
                this.handleUserQuery(transcript.trim());
              } else {
                this.statusText.textContent = "Listo";
                this.companion.setState('idle');
                if (this.mode === 'compact') {
                  this.setMode('pill');
                }
              }
            }
          },
          onSpeechEnd: () => {
            isListening = false;
            this.micButton.classList.remove('bg-red-500', 'animate-pulse');
            this.micButton.classList.add('bg-cyan-500');
            if (this.companion.getState() === 'listening') {
              this.companion.setState('idle');
            }
          },
          onError: () => {
            isListening = false;
            this.micButton.classList.remove('bg-red-500', 'animate-pulse');
            this.micButton.classList.add('bg-cyan-500');
            this.statusText.textContent = "Listo";
            if (this.mode === 'compact') {
              this.setMode('pill');
            }
          }
        });

        if (!ok) {
          alert("Por favor concede permiso de micrófono a tu navegador para hablar con YUI.");
          if (this.mode === 'compact') {
            this.setMode('pill');
          }
        }
      }
    });

    // Viseme synchronization with TTS
    speechEngine.onSpeakingViseme = (amp) => {
      this.companion.setSpeechViseme(amp);
    };

    speechEngine.onSpeakingChange = (speaking) => {
      if (speaking) {
        if (this.mode === 'pill') {
          this.setMode('compact');
        }
        this.companion.setState('speaking');
        this.statusText.textContent = "Hablando...";
      } else {
        this.companion.setState('idle');
        this.statusText.textContent = "Listo";
        if (this.mode === 'compact') {
          this.setMode('pill');
        }
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
      this.companion.setMorph(1.0);
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
      Sound.play('gulp');
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

  private applyModeStyles(mode: IslandMode) {
    if (this.isMobile) {
      if (mode === 'expanded') {
        setTimeout(() => this.textInput?.focus(), 150);
      }
      return;
    }

    const notch = this.notchElement;
    const expandPanel = this.expandedPanel;
    const expandIcon = this.root.querySelector('#expandIcon');
    const collapseBtn = this.collapseBtn;
    const toggleBtn = this.toggleBtn;

    // Reset size classes
    notch.classList.remove(
      'w-[380px]', 'h-[42px]', 'w-[480px]', 'h-[56px]', 'w-[640px]', 'h-[500px]',
      'w-[95vw]', 'max-w-[640px]', 'h-[85vh]', 'max-h-[520px]', 'w-[92vw]', 'max-w-[480px]', 'w-[360px]', 'max-w-[96vw]'
    );

    if (mode === 'expanded') {
      notch.classList.add('w-[95vw]', 'max-w-[640px]', 'h-[85vh]', 'max-h-[520px]');
      expandPanel.classList.remove('hidden');
      expandPanel.classList.add('flex');
      if (collapseBtn) {
        collapseBtn.classList.remove('hidden');
        collapseBtn.classList.add('flex');
      }
      if (toggleBtn) toggleBtn.classList.add('hidden');
      if (expandIcon) expandIcon.classList.add('rotate-180');
      // Focus input field in expanded mode
      setTimeout(() => this.textInput.focus(), 150);
    } else if (mode === 'compact') {
      notch.classList.add('w-[92vw]', 'max-w-[480px]', 'h-[56px]');
      expandPanel.classList.add('hidden');
      expandPanel.classList.remove('flex');
      if (collapseBtn) {
        collapseBtn.classList.add('hidden');
        collapseBtn.classList.remove('flex');
      }
      if (toggleBtn) toggleBtn.classList.remove('hidden');
      if (expandIcon) expandIcon.classList.remove('rotate-180');
    } else { // pill
      notch.classList.add('w-[360px]', 'max-w-[96vw]', 'h-[42px]');
      expandPanel.classList.add('hidden');
      expandPanel.classList.remove('flex');
      if (collapseBtn) {
        collapseBtn.classList.add('hidden');
        collapseBtn.classList.remove('flex');
      }
      if (toggleBtn) toggleBtn.classList.remove('hidden');
      if (expandIcon) expandIcon.classList.remove('rotate-180');
    }
  }

  public setMode(mode: IslandMode) {
    if (this.mode === mode) return;
    const prevMode = this.mode;
    this.mode = mode;

    this.applyModeStyles(mode);

    if (mode === 'expanded') {
      Sound.play('open');
    } else if (prevMode === 'expanded') {
      Sound.play('close');
    }

    const api = (window as any).electronAPI;
    if (api?.setMode) {
      api.setMode(mode);
    } else if ((window as any).__TAURI__?.core?.invoke) {
      (window as any).__TAURI__.core.invoke('resize_notch', { mode });
    }
  }

  public updateKeyBadge() {
    const k = keyPool.getCurrentKey();
    this.keyBadge.textContent = `${k.id} (${k.calls})`;
  }

  private formatMarkdown(content: string): string {
    if (content.startsWith('<div') || content.startsWith('<ul')) return content;

    let html = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    html = html.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
      return `<pre class="bg-black/60 border border-slate-700/80 p-2.5 rounded-xl text-emerald-300 font-mono text-[11px] overflow-x-auto my-1.5 leading-relaxed shadow-inner"><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="bg-slate-900 border border-slate-700/80 px-1.5 py-0.5 rounded text-cyan-300 font-mono text-[10px]">$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em class="text-slate-300 italic">$1</em>');

    // Lists
    html = html.replace(/^-\s+(.*)$/gm, '<li class="ml-2 text-slate-200 list-disc list-inside">$1</li>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  private addMessage(role: 'user' | 'model', content: string) {
    const div = document.createElement('div');
    const isUser = role === 'user';

    div.className = `flex ${isUser ? 'justify-end' : 'justify-start'} gap-2 animate-in fade-in duration-200`;
    div.innerHTML = `
      <div class="${isUser ? 'bg-cyan-950/80 border-cyan-700/60 text-cyan-100' : 'bg-slate-900/90 border-slate-700/70 text-slate-100'} border rounded-2xl px-3 py-2 max-w-[88%] leading-relaxed shadow-md backdrop-blur-md">
        <div class="font-mono text-[9px] ${isUser ? 'text-cyan-400' : 'text-purple-300'} uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
          <span>${isUser ? '👤 Tú' : '✨ Kala'}</span>
        </div>
        <div class="break-words text-xs leading-relaxed space-y-1">${this.formatMarkdown(content)}</div>
      </div>
    `;

    this.messagesContainer.appendChild(div);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

    if (this.isMobile) {
      const hero = this.root.querySelector('#heroCompanionStage') as HTMLElement;
      if (hero && this.conversation.length > 0) {
        hero.classList.add('hidden');
      }
    }
  }

  private async handleUserQuery(query: string) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    // Barge-in: detener cualquier voz activa de Kala inmediatamente
    speechEngine.stopSpeaking();

    this.addMessage('user', query);
    this.conversation.push({ role: 'user', parts: [{ text: query }] });

    this.companion.setState('thinking');
    this.statusText.textContent = "Pensando...";
    this.thinkingContainer.classList.remove('hidden');
    (this.thinkingContainer as HTMLDetailsElement).open = true;
    this.thinkingContent.innerHTML = '<span class="text-purple-300">Iniciando ciclo agéntico...</span>';

    try {
      const maxSteps = 4;
      let lastToolResult: any = null;
      let lastAgentText: string = "";

      for (let step = 0; step < maxSteps; step++) {
        const response = await callGemini(this.conversation, (thought) => {
          this.thinkingContent.textContent = thought;
        });

        lastAgentText = response.text || "";

        // Check for tool calls
        if (response.toolCalls && response.toolCalls.length > 0) {
          const toolObservations: string[] = [];

          for (const tc of response.toolCalls) {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'text-cyan-300 text-[11px] font-mono py-1 border-l-2 border-cyan-400 pl-2 my-1';
            stepDiv.textContent = `⚡ [Paso ${step + 1}] Herramienta: ${tc.name}`;
            this.thinkingContent.appendChild(stepDiv);

            if (tc.name === 'set_companion_emote') {
              this.companion.triggerEmote(tc.args.emote || 'happy');
            }

            let execRes = await toolRegistry.executeTool(tc.name, tc.args, false);

            if (execRes.needsApproval && execRes.approvalPayload) {
              // Human in the Loop approval
              this.companion.setState('approval');
              this.statusText.textContent = "Esperando aprobación...";

              const approved = await new Promise<boolean>((resolve) => {
                this.approvalManager.show({
                  actionTitle: execRes.approvalPayload!.actionTitle,
                  command: execRes.approvalPayload!.command,
                  reason: execRes.approvalPayload!.reason,
                  onApprove: () => {
                    Sound.play('approve');
                    resolve(true);
                  },
                  onDeny: () => {
                    Sound.play('annoyed');
                    this.companion.triggerEmote('annoyed');
                    resolve(false);
                  }
                });
              });

              if (approved) {
                execRes = await toolRegistry.executeTool(tc.name, tc.args, true);
              } else {
                execRes = {
                  toolName: tc.name,
                  result: { error: "Acción cancelada por el usuario." }
                };
              }
            }

            lastToolResult = execRes.result;

            // Direct completion for OpenCode subagent
            if (tc.name === 'delegate_to_opencode') {
              this.finalizeTurn("OpenCode completó la tarea.", execRes.result);
              return;
            }

            const obsText = `[Resultado de ${tc.name}]: ${JSON.stringify(execRes.result)}`;
            toolObservations.push(obsText);
          }

          // Feed back observation to Gemini for subsequent reasoning
          this.conversation.push({
            role: 'model',
            parts: [{ text: response.text ? response.text : `Ejecutando acción...` }]
          });
          this.conversation.push({
            role: 'user',
            parts: [{ text: `${toolObservations.join('\n')}\nAnaliza el resultado obtenido y responde al usuario de forma clara, concisa y amigable, o continúa si se requieren pasos adicionales.` }]
          });

          this.companion.setState('thinking');
          this.statusText.textContent = `Procesando paso ${step + 2}...`;

        } else {
          // No tools called, Gemini gave the final response
          this.finalizeTurn(response.text || "¡Listo!", lastToolResult);
          return;
        }
      }

      this.finalizeTurn(lastAgentText || "Acciones completadas.", lastToolResult);

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
    let spokenSummary = agentText;

    if (this.pillBadge) {
      this.pillBadge.className = 'w-1.5 h-1.5 rounded-full bg-cyan-400';
    }

    if (toolResult) {
      if (toolResult.toolsUsed !== undefined || toolResult.sessionId !== undefined) {
        this.statusText.textContent = "OpenCode: Completado ✓";
        this.companion.triggerEmote('proud', 2.0);

        const toolsCount = toolResult.toolsUsed ? toolResult.toolsUsed.length : 0;
        const sessionId = toolResult.sessionId ? `ID: ${toolResult.sessionId.slice(0, 14)}...` : '';
        const opencodeText = toolResult.text || '';

        let toolsDetailHtml = '';
        if (toolResult.toolsUsed && toolResult.toolsUsed.length > 0) {
          const listItems = toolResult.toolsUsed.map((t: any) => {
            const inputSummary = t.input?.path || (typeof t.input === 'object' ? JSON.stringify(t.input) : t.input) || '';
            return `<li class="font-mono text-[10px] text-emerald-300">⚙ <strong>${t.tool || 'tool'}</strong> ${inputSummary ? `<span class="text-slate-400">(${inputSummary})</span>` : ''}</li>`;
          }).join('');
          toolsDetailHtml = `<ul class="my-1 pl-2 border-l border-emerald-500/40 space-y-0.5">${listItems}</ul>`;
        }

        displayText = `
          <div class="space-y-1.5">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="bg-violet-900/80 border border-violet-500/50 text-violet-200 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold shadow-sm">
                ⚡ OpenCode
              </span>
              ${sessionId ? `<span class="text-[9px] font-mono text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded">${sessionId}</span>` : ''}
              ${toolsCount > 0 ? `<span class="text-[9px] font-mono text-emerald-300 bg-emerald-950/80 border border-emerald-800/80 px-1.5 py-0.5 rounded">${toolsCount} herramienta${toolsCount > 1 ? 's' : ''}</span>` : ''}
            </div>
            ${toolsDetailHtml}
            <div class="leading-relaxed text-slate-100 whitespace-pre-wrap">${opencodeText ? opencodeText : agentText}</div>
          </div>
        `;

        const summaryText = opencodeText ? opencodeText.replace(/```[\s\S]*?```/g, 'código generado.').slice(0, 140) : 'La tarea de OpenCode se ha completado.';
        spokenSummary = `OpenCode ha terminado la tarea. ${summaryText}`;

      } else if (toolResult.command !== undefined && (toolResult.stdout !== undefined || toolResult.stderr !== undefined)) {
        // Shell command result
        const isSuccess = toolResult.exitCode === 0 || toolResult.success;
        const exitBadge = isSuccess 
          ? '<span class="text-emerald-400 font-mono text-[9px] bg-emerald-950/80 px-1.5 py-0.5 rounded">exit 0</span>' 
          : `<span class="text-rose-400 font-mono text-[9px] bg-rose-950/80 px-1.5 py-0.5 rounded">exit ${toolResult.exitCode}</span>`;
        const rawOutput = (toolResult.stdout || toolResult.stderr || '(sin salida)').trim();
        const output = rawOutput.length > 300 ? rawOutput.slice(0, 300) + '...' : rawOutput;
        displayText += `
          <div class="mt-2 p-2 bg-slate-950/80 border border-slate-800 rounded-xl font-mono text-xs shadow-sm">
            <div class="flex items-center justify-between text-slate-400 text-[10px] pb-1 border-b border-slate-800">
              <span class="text-cyan-300 truncate max-w-[200px]">$ ${toolResult.command}</span>
              ${exitBadge}
            </div>
            <pre class="mt-1 text-slate-300 text-[11px] overflow-x-auto whitespace-pre-wrap max-h-28">${output}</pre>
          </div>
        `;
      } else if (toolResult.app !== undefined && toolResult.success) {
        // App launched
        displayText += `
          <div class="mt-2 p-2 bg-slate-950/80 border border-cyan-800/50 rounded-xl flex items-center gap-2 text-xs font-mono text-cyan-300">
            <span>🚀</span>
            <span>Aplicación lanzada: <strong>${toolResult.app}</strong></span>
          </div>
        `;
      } else if (toolResult.path && typeof toolResult.path === 'string' && toolResult.path.includes('.png')) {
        // Screenshot captured
        displayText += `
          <div class="mt-2 p-2 bg-slate-950/80 border border-emerald-800/50 rounded-xl flex items-center justify-between text-xs font-mono text-emerald-300">
            <span>📸 Captura tomada: ${toolResult.path}</span>
          </div>
        `;
      } else if (toolResult.cpuUsage !== undefined || toolResult.ramAvailable !== undefined) {
        const cpu = toolResult.cpuUsage || 'N/A';
        const ram = toolResult.ramAvailable || 'N/A';
        const host = toolResult.hostname || 'Linux';
        const uptime = toolResult.uptime || '';

        displayText += `
          <div class="mt-2 p-2.5 bg-slate-950/60 border border-slate-700/50 rounded-xl grid grid-cols-2 gap-2 text-xs font-mono shadow-sm">
            <div class="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800">
              <span class="text-cyan-400">⚡ CPU:</span>
              <span class="font-bold text-slate-100">${cpu}</span>
            </div>
            <div class="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800">
              <span class="text-emerald-400">🧠 RAM:</span>
              <span class="font-bold text-slate-100">${ram}</span>
            </div>
            <div class="col-span-2 flex items-center justify-between text-[10px] text-slate-400 px-1 pt-0.5">
              <span>🖥️ ${host}</span>
              ${uptime ? `<span>⏱️ Activo: ${uptime}</span>` : ''}
            </div>
          </div>
        `;
      } else if (toolResult.temperature !== undefined || toolResult.condition !== undefined) {
        const temp = toolResult.temperature || 'N/A';
        const cond = toolResult.condition || 'Despejado';
        const loc = toolResult.location || 'Local';
        displayText += `
          <div class="mt-2 p-2.5 bg-slate-950/60 border border-slate-700/50 rounded-xl flex items-center justify-between text-xs font-mono shadow-sm">
            <div class="flex items-center gap-2">
              <span class="text-lg">🌤️</span>
              <div>
                <div class="font-bold text-slate-100">${temp}</div>
                <div class="text-[10px] text-slate-400">${cond}</div>
              </div>
            </div>
            <span class="text-[10px] text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded-full">${loc}</span>
          </div>
        `;
      }
    }

    this.addMessage('model', displayText);
    this.conversation.push({ role: 'model', parts: [{ text: agentText }] });

    // Speak using TTS
    speechEngine.speak(spokenSummary, () => {
      this.companion.setState('idle');
      this.statusText.textContent = "Listo";
      if (this.mode === 'compact') {
        this.setMode('pill');
      }
    });

    this.isProcessing = false;
  }
}
