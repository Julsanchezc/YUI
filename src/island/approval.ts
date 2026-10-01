// Semi-Agentic Human-In-The-Loop Approval Card

export interface ApprovalRequest {
  actionTitle: string;
  command: string;
  reason: string;
  onApprove: () => void;
  onDeny: () => void;
}

export class ApprovalManager {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public show(req: ApprovalRequest) {
    this.container.innerHTML = `
      <div class="p-3.5 bg-amber-950/40 border border-amber-500/50 rounded-xl space-y-2.5 shadow-xl animate-in fade-in slide-in-from-top-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-amber-400 font-semibold text-xs tracking-wider uppercase font-mono">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            <span>Aprobación Requerida (Semi-Agente)</span>
          </div>
          <span class="text-[10px] text-amber-300/80 bg-amber-900/40 px-2 py-0.5 rounded font-mono border border-amber-600/30">HITL</span>
        </div>

        <div class="text-xs text-slate-200">
          <p class="font-medium">${req.actionTitle}</p>
          <p class="text-[11px] text-slate-400 mt-0.5">${req.reason}</p>
        </div>

        <div class="bg-black/60 rounded-lg p-2 font-mono text-[11px] text-emerald-400 border border-slate-800 break-all select-all">
          <code>$ ${req.command}</code>
        </div>

        <div class="flex items-center justify-end gap-2 pt-1">
          <button id="btnDeny" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition active:scale-95">
            Denegar
          </button>
          <button id="btnApprove" class="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20 active:scale-95">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            <span>Permitir</span>
          </button>
        </div>
      </div>
    `;

    this.container.classList.remove('hidden');

    const btnApprove = this.container.querySelector('#btnApprove') as HTMLButtonElement;
    const btnDeny = this.container.querySelector('#btnDeny') as HTMLButtonElement;

    btnApprove.onclick = () => {
      this.hide();
      req.onApprove();
    };

    btnDeny.onclick = () => {
      this.hide();
      req.onDeny();
    };
  }

  public hide() {
    this.container.innerHTML = '';
    this.container.classList.add('hidden');
  }
}
