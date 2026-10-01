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
    };
    __TAURI__?: any;
    yuiTriggerQuick?: (q: string) => void;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const isDesktop = !!(window.electronAPI || window.__TAURI__ || window.location.search.includes('desktop'));
  if (isDesktop) {
    document.documentElement.classList.add('desktop-mode');
    document.body.classList.add('desktop-mode');
  }

  const appRoot = document.getElementById('app');
  if (!appRoot) return;

  // Initialize Dynamic Island
  const island = new DynamicIsland(appRoot);

  // Resume AudioContext on first user interaction (browser policy)
  const resumeAudio = () => {
    Sound.play('pop');
    window.removeEventListener('click', resumeAudio);
    window.removeEventListener('keydown', resumeAudio);
  };
  window.addEventListener('click', resumeAudio, { once: true });
  window.addEventListener('keydown', resumeAudio, { once: true });

  // Keyboard shortcut: Cmd/Ctrl + K or Alt + Space to expand/collapse Notch
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      island.setMode(island.mode === 'expanded' ? 'pill' : 'expanded');
    }
  });
});
