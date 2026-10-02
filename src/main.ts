// YUI Main Entry Point
import { DynamicIsland } from './island/island';
import { Sound } from './core/audio-sfx';

declare global {
  interface Window {
    electronAPI?: {
      isDesktop: boolean;
      platform: string;
      setMode: (mode: string) => void;
      resize: (width: number, height: number) => void;
      close: () => void;
      minimize: () => void;
      onCollapse?: (cb: () => void) => void;
      onToggleExpand?: (cb: () => void) => void;
    };
    __TAURI__?: any;
    yuiTriggerQuick?: (q: string) => void;
  }
}

function initYui() {
  const appRoot = document.getElementById('app');
  if (!appRoot) {
    console.error("No se encontró el elemento #app");
    return;
  }

  // Initialize Dynamic Island
  console.log("Inicializando YUI Dynamic Island...");
  const island = new DynamicIsland(appRoot);

  // Resume AudioContext on first user interaction (browser policy)
  const resumeAudio = () => {
    Sound.play('pop');
    window.removeEventListener('click', resumeAudio);
    window.removeEventListener('keydown', resumeAudio);
  };
  window.addEventListener('click', resumeAudio, { once: true });
  window.addEventListener('keydown', resumeAudio, { once: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initYui);
} else {
  initYui();
}
