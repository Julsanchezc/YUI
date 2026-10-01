// Emote types and presets for YUI companion

export type EyeShape =
  | 'pill' | 'wide' | 'dot' | 'line' | 'flat' | 'happy' | 'closed'
  | 'spiral' | 'heart' | 'star' | 'tired' | 'wink';

export type BotState =
  | 'idle' | 'listening' | 'thinking' | 'speaking'
  | 'approval' | 'working' | 'finished' | 'dizzy' | 'error';

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export const STATE_COLORS: Record<BotState, RGBColor> = {
  idle: { r: 235, g: 236, b: 240 },        // Soft pearl white/silver
  listening: { r: 56, g: 189, b: 248 },    // Sky cyan
  thinking: { r: 168, g: 85, b: 247 },     // Violet amethyst
  speaking: { r: 45, g: 212, b: 191 },     // Vibrant teal
  approval: { r: 251, g: 191, b: 36 },     // Warm amber
  working: { r: 59, g: 130, b: 246 },      // Electric blue
  finished: { r: 52, g: 211, b: 153 },     // Emerald green
  dizzy: { r: 244, g: 114, b: 182 },       // Bubblegum pink
  error: { r: 248, g: 113, b: 113 }        // Soft ruby
};
