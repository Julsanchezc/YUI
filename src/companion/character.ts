// YUI Character Animation Engine — Canvas 2D at 60 FPS
// Implements squircle deformation, 3D spherical projected eyes, spring physics, and emotes

import { BotState, EyeShape, RGBColor, STATE_COLORS } from './emotes';
import { Sound } from '../core/audio-sfx';

export interface Particle {
  type: 'heart' | 'star' | 'spark' | 'sweat' | 'z';
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  rot: number;
  size: number;
}

export class CharacterEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 72;
  private height: number = 72;

  // Bot State
  public state: BotState = 'idle';
  public eyeShape: EyeShape = 'pill';
  private eyeOverride: EyeShape | null = null;
  private eyeOverrideUntil: number = 0;

  // Coordinates & Physics
  private yaw: number = 0;
  private pitch: number = 0;
  private targetYaw: number = 0;
  private targetPitch: number = 0;

  private sx: number = 1.0;
  private sy: number = 1.0;
  private oy: number = 0;
  private tilt: number = 0;
  private hands: number = 0;
  private blush: number = 0;
  private morph: number = 0; // 0 = squircle, 1 = open box / swallow
  private openBlink: number = 1.0;

  // Timers & Blinking
  private lastTime: number = 0;
  private nextBlink: number = 2.5;
  private blinkProgress: number = 0;
  private breathePhase: number = 0;
  private pokeHistory: number[] = [];

  // Speech Viseme Reactivity
  private speechVisemeAmp: number = 0;

  // Particles
  private particles: Particle[] = [];

  constructor(canvas: HTMLCanvasElement, cssW = 28, cssH = 28) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error("Canvas 2D context not available");
    this.ctx = context;
    this.resize(72, 72, cssW, cssH);
  }

  public resize(w: number, h: number, cssW?: number, cssH?: number) {
    this.width = w;
    this.height = h;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${cssW ?? w}px`;
    this.canvas.style.height = `${cssH ?? h}px`;
    this.ctx.scale(dpr, dpr);
  }

  public setState(newState: BotState) {
    if (this.state === newState) return;
    this.state = newState;

    switch (newState) {
      case 'listening':
        this.squash(1.05, 0.95);
        Sound.play('peek');
        break;
      case 'thinking':
        this.squash(0.95, 1.05);
        Sound.play('think');
        break;
      case 'speaking':
        this.squash(1.04, 0.96);
        break;
      case 'approval':
        this.triggerEmote('surprised', 1.5);
        Sound.play('approval');
        break;
      case 'finished':
        this.triggerEmote('proud', 1.8);
        Sound.play('finish');
        break;
      case 'dizzy':
        Sound.play('dizzy');
        break;
    }
  }

  public onCursorMove(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;

    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = 350;
    const factor = Math.min(1, dist / maxDist);

    this.targetYaw = (dx / (maxDist || 1)) * 0.45;
    this.targetPitch = (dy / (maxDist || 1)) * 0.35;
  }

  public poke() {
    const now = Date.now();
    this.pokeHistory = this.pokeHistory.filter(t => now - t < 1800);
    this.pokeHistory.push(now);

    Sound.play('slap');
    this.squash(1.28, 0.72);

    if (this.pokeHistory.length >= 3) {
      // Dizzy mode!
      this.state = 'dizzy';
      this.eyeOverride = 'spiral';
      this.eyeOverrideUntil = now + 4000;
      Sound.play('dizzy');
      setTimeout(() => {
        if (this.state === 'dizzy') this.setState('idle');
      }, 4000);
    } else {
      this.eyeOverride = 'line';
      this.eyeOverrideUntil = now + 700;
      setTimeout(() => Sound.play('annoyed'), 120);
    }
  }

  public greet() {
    Sound.play('greet');
    this.triggerEmote('happy', 2.0);
    this.hands = 1.0;
    this.squash(0.9, 1.15);
    setTimeout(() => {
      this.hands = 0;
    }, 1800);
  }

  public triggerEmote(emote: string, durationSec = 1.8) {
    const now = Date.now();
    this.eyeOverrideUntil = now + durationSec * 1000;

    switch (emote) {
      case 'happy':
        this.eyeOverride = 'happy';
        this.blush = 0.8;
        break;
      case 'love':
        this.eyeOverride = 'heart';
        this.blush = 1.0;
        this.emitParticles('heart', 5);
        Sound.play('love');
        break;
      case 'proud':
        this.eyeOverride = 'star';
        this.emitParticles('star', 4);
        Sound.play('proud');
        break;
      case 'surprised':
        this.eyeOverride = 'wide';
        this.squash(0.85, 1.2);
        this.emitParticles('spark', 4);
        break;
      case 'wink':
        this.eyeOverride = 'wink';
        this.tilt = 0.15;
        Sound.play('wink');
        break;
      case 'dizzy':
        this.eyeOverride = 'spiral';
        Sound.play('dizzy');
        break;
      case 'annoyed':
        this.eyeOverride = 'line';
        break;
      default:
        this.eyeOverride = 'happy';
    }
  }

  public setMorph(target: number) {
    this.morph = target;
    if (target > 0.5) {
      Sound.play('open');
    }
  }

  public setSpeechViseme(amplitude: number) {
    this.speechVisemeAmp = amplitude;
  }

  public squash(sx: number, sy: number) {
    this.sx = sx;
    this.sy = sy;
  }

  public emitParticles(type: Particle['type'], count: number) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        type,
        x: (Math.random() - 0.5) * 20,
        y: -10 - Math.random() * 10,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -(1.5 + Math.random() * 2),
        age: 0,
        life: 0.8 + Math.random() * 0.6,
        rot: Math.random() * Math.PI * 2,
        size: 8 + Math.random() * 6
      });
    }
  }

  // ── Render Loop ─────────────────────────────────────────────────────────────

  public update(dt: number) {
    const now = Date.now();

    // Smooth cursor look damping
    const lookSpeed = 0.12;
    this.yaw += (this.targetYaw - this.yaw) * lookSpeed;
    this.pitch += (this.targetPitch - this.pitch) * lookSpeed;

    // Breathing
    this.breathePhase += dt * 2.5;
    const breatheY = Math.sin(this.breathePhase) * 1.2;

    // Spring restoration for squash/stretch
    const springSpeed = 0.15;
    let targetSx = 1.0;
    let targetSy = 1.0;

    // React to speaking visemes
    if (this.state === 'speaking') {
      targetSy = 1.0 + this.speechVisemeAmp * 0.12;
      targetSx = 1.0 - this.speechVisemeAmp * 0.08;
    } else if (this.state === 'thinking') {
      // Slight wobbling
      targetSx = 1.0 + Math.sin(now * 0.008) * 0.04;
      targetSy = 1.0 - Math.sin(now * 0.008) * 0.04;
    }

    this.sx += (targetSx - this.sx) * springSpeed;
    this.sy += (targetSy - this.sy) * springSpeed;
    this.tilt += (0 - this.tilt) * 0.08;
    this.blush += (0 - this.blush) * 0.04;

    // Blinking logic
    if (now > this.nextBlink) {
      this.blinkProgress += dt * 10;
      if (this.blinkProgress >= 1.0) {
        this.blinkProgress = 0;
        this.nextBlink = now + 2000 + Math.random() * 3500;
        this.openBlink = 1.0;
      } else {
        // Sine dip for eyelid closure
        this.openBlink = Math.max(0.05, 1 - Math.sin(this.blinkProgress * Math.PI));
      }
    }

    // Check eye override expiry
    if (this.eyeOverride && now > this.eyeOverrideUntil) {
      this.eyeOverride = null;
    }

    // Particles update
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += dt * 2; // slight gravity
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
      }
    }

    // Thinking rotation simulation
    if (this.state === 'thinking') {
      this.targetYaw = Math.cos(now * 0.005) * 0.35;
      this.targetPitch = Math.sin(now * 0.005) * 0.25;
    }

    this.render(breatheY);
  }

  private render(breatheY: number) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const cx = this.width / 2;
    const cy = this.height / 2 + breatheY + this.oy;
    const radius = Math.min(this.width, this.height) * 0.42;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.tilt);
    ctx.scale(this.sx, this.sy);

    // 1. Draw Body (Squircle with radial gradient)
    const baseColor = STATE_COLORS[this.state] || STATE_COLORS.idle;
    const grad = ctx.createLinearGradient(0, -radius, 0, radius);
    grad.addColorStop(0, `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`);
    grad.addColorStop(1, `rgb(${Math.max(0, baseColor.r - 35)}, ${Math.max(0, baseColor.g - 35)}, ${Math.max(0, baseColor.b - 35)})`);

    ctx.fillStyle = grad;
    ctx.beginPath();

    if (this.morph > 0.5) {
      // Swallowing box morph
      const boxSize = radius * 1.8;
      const cornerR = radius * (1 - this.morph * 0.7);
      ctx.roundRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize, cornerR);
    } else {
      // Squircle
      const r = radius;
      ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.55);
    }
    ctx.fill();

    // Body soft shadow and inner highlight
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(255, 255, 255, 0.4)`;
    ctx.stroke();

    // 2. Blush Cheeks
    if (this.blush > 0.05) {
      ctx.fillStyle = `rgba(244, 114, 182, ${this.blush * 0.6})`;
      ctx.beginPath();
      ctx.arc(-radius * 0.55, radius * 0.2, 5, 0, Math.PI * 2);
      ctx.arc(radius * 0.55, radius * 0.2, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Waving Hand (if active)
    if (this.hands > 0.05) {
      ctx.save();
      const waveAngle = Math.sin(Date.now() * 0.015) * 0.4;
      ctx.translate(radius * 0.85, -radius * 0.2);
      ctx.rotate(waveAngle);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 12, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. Draw Eyes Projected on 3D Sphere
    const eyeSpacing = radius * 0.44;
    const eyeBaseY = -radius * 0.05;
    const lookX = this.yaw * radius * 0.65;
    const lookY = this.pitch * radius * 0.55;

    const leftEyeX = -eyeSpacing + lookX;
    const rightEyeX = eyeSpacing + lookX;
    const eyeY = eyeBaseY + lookY;

    const activeEye = this.eyeOverride || this.getEyeForState();

    this.drawEye(ctx, leftEyeX, eyeY, activeEye, false);
    this.drawEye(ctx, rightEyeX, eyeY, activeEye, activeEye === 'wink');

    // 5. Draw Mouth (especially when speaking or swallowing)
    if (this.morph > 0.5) {
      // Swallowing open mouth / vortex
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.ellipse(0, radius * 0.2, radius * 0.45 * this.morph, radius * 0.35 * this.morph, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.state === 'speaking') {
      const mouthHeight = Math.max(2, this.speechVisemeAmp * 9);
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.ellipse(lookX * 0.4, eyeBaseY + radius * 0.35 + lookY * 0.4, 7, mouthHeight, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // 6. Draw Particles
    this.drawParticles(ctx, cx, cy);
  }

  private getEyeForState(): EyeShape {
    switch (this.state) {
      case 'listening': return 'wide';
      case 'thinking': return 'pill';
      case 'speaking': return 'happy';
      case 'approval': return 'wide';
      case 'finished': return 'happy';
      case 'dizzy': return 'spiral';
      case 'error': return 'flat';
      default: return 'pill';
    }
  }

  private drawEye(ctx: CanvasRenderingContext2D, x: number, y: number, shape: EyeShape, isWink: boolean) {
    ctx.save();
    ctx.translate(x, y);

    const eyeScaleY = isWink ? 0.1 : this.openBlink;
    ctx.scale(1.0, eyeScaleY);

    ctx.fillStyle = '#111827'; // Dark obsidian ink

    const ew = 5.5;
    const eh = 9.5;

    switch (shape) {
      case 'happy':
        // Cute upward curve / anime crescent
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#111827';
        ctx.beginPath();
        ctx.arc(0, 0, 6, Math.PI * 1.15, Math.PI * 1.85, false);
        ctx.stroke();
        break;

      case 'line':
      case 'flat':
        ctx.fillRect(-ew, -1.5, ew * 2, 3);
        break;

      case 'heart':
        ctx.fillStyle = '#ec4899';
        ctx.beginPath();
        ctx.moveTo(0, 3);
        ctx.bezierCurveTo(-5, -4, -10, 2, 0, 10);
        ctx.bezierCurveTo(10, 2, 5, -4, 0, 3);
        ctx.fill();
        break;

      case 'star':
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * 8, -Math.sin((18 + i * 72) * Math.PI / 180) * 8);
          ctx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * 4, -Math.sin((54 + i * 72) * Math.PI / 180) * 4);
        }
        ctx.closePath();
        ctx.fill();
        break;

      case 'spiral':
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#db2777';
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.2) {
          const r = a * 1.6;
          ctx.lineTo(Math.cos(a + Date.now() * 0.01) * r, Math.sin(a + Date.now() * 0.01) * r);
        }
        ctx.stroke();
        break;

      case 'wide':
        ctx.beginPath();
        ctx.ellipse(0, 0, ew * 1.35, eh * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
        // Catchlight
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(2, -2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'pill':
      default:
        ctx.beginPath();
        ctx.roundRect(-ew, -eh, ew * 2, eh * 2, ew);
        ctx.fill();
        // Catchlight sparkle
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.beginPath();
        ctx.arc(1.5, -3, 1.8, 0, Math.PI * 2);
        ctx.fill();
        break;
    }

    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    for (const p of this.particles) {
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.save();
      ctx.translate(cx + p.x, cy + p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = alpha;

      if (p.type === 'heart') {
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(-2, -2, p.size * 0.35, 0, Math.PI * 2);
        ctx.arc(2, -2, p.size * 0.35, 0, Math.PI * 2);
        ctx.lineTo(0, p.size * 0.6);
        ctx.fill();
      } else if (p.type === 'star') {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  public startAnimation() {
    let prev = performance.now();
    let lastRender = 0;
    const targetFps = 30; // 30 FPS ensures buttery smooth expressions without pinning GPU
    const frameInterval = 1000 / targetFps;

    const frame = (now: number) => {
      requestAnimationFrame(frame);
      if (now - lastRender < frameInterval) return;
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      lastRender = now;
      this.update(dt);
    };
    requestAnimationFrame(frame);
  }
}
