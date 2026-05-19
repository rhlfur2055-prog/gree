// effects/tuning.ts
// Vrew 스타일 통합 효과 튜닝 시스템
// - EffectTuning: 모든 효과의 세부값
// - vrewCodingClean: 깔끔한 기본 preset
// - mergeTuning: 전역 + scene override 병합
// - PartialEffectTuning: scene 단위 override 작성용

export type CaptionEffect =
  | 'vrew-chip'
  | 'big-bold'
  | 'typing'
  | 'karaoke'
  | 'word-pop'
  | 'minimal'
  | 'none';

export type CodeEffect =
  | 'typing'
  | 'line-by-line'
  | 'highlight-line'
  | 'fade-in'
  | 'none';

export type TerminalEffect =
  | 'typing'
  | 'command-run'
  | 'line-output'
  | 'none';

export type TransitionType =
  | 'cut'
  | 'fade'
  | 'slide'
  | 'zoom-pop'
  | 'wipe'
  | 'none';

export type BackgroundType =
  | 'dark-gradient'
  | 'glassmorphism'
  | 'clean-white'
  | 'purple-tech'
  | 'terminal'
  | 'neon-grid'
  | 'none';

export type Easing =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'spring';

export type CursorStyle = 'bar' | 'block' | 'underscore' | 'none';

export interface CaptionTuning {
  enabled: boolean;
  effect: CaptionEffect;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  maxCharsPerLine: number;
  activeWordScale: number;
  popScale: number;
  inactiveOpacity: number;
  appearDuration: number;     // seconds
  disappearDuration: number;  // seconds
  slideDistance: number;      // px
  bounceIntensity: number;    // 0~1
  chipPaddingX: number;
  chipPaddingY: number;
  chipRadius: number;
  chipGap: number;
  chipShadowBlur: number;
  textColor: string;
  highlightTextColor: string;
  chipBackground: string;
  highlightBackground: string;
  position: 'top' | 'center' | 'bottom';
  offsetY: number;
}

export interface CodeTuning {
  enabled: boolean;
  effect: CodeEffect;
  fontSize: number;
  lineHeight: number;
  typingSpeed: number;       // chars per second
  typingDelay: number;       // seconds
  cursorEnabled: boolean;
  cursorStyle: CursorStyle;
  cursorBlinkSpeed: number;  // seconds per cycle
  cursorColor: string;
  activeLineScale: number;
  activeLineGlow: number;    // px
  activeLineColor: string;
  highlightColor: string;
  scrollFollow: boolean;
  scrollSpeed: number;
  zoomToActiveLine: boolean;
  zoomScale: number;
  cardWidth: number;
  cardHeight: number;
  cardRadius: number;
  cardShadowBlur: number;
}

export interface TerminalTuning {
  enabled: boolean;
  effect: TerminalEffect;
  fontSize: number;
  lineHeight: number;
  typingSpeed: number;
  commandDelay: number;
  outputDelay: number;
  lineOutputDelay: number;
  cursorEnabled: boolean;
  cursorBlinkSpeed: number;
  successColor: string;
  errorColor: string;
  warningColor: string;
  normalColor: string;
  cardWidth: number;
  cardHeight: number;
}

export interface TransitionTuning {
  enabled: boolean;
  type: TransitionType;
  duration: number;          // seconds
  easing: Easing;
  zoomFrom: number;
  zoomTo: number;
  slideDirection: 'up' | 'down' | 'left' | 'right';
  slideDistance: number;
  blurAmount: number;
  wipeAngle: number;
}

export interface BackgroundTuning {
  enabled: boolean;
  type: BackgroundType;
  motionSpeed: number;
  gradientShift: number;
  particleCount: number;
  particleSpeed: number;
  blurAmount: number;
  opacity: number;
  accentColor: string;
  secondaryColor: string;
}

export interface EffectTuning {
  caption: CaptionTuning;
  code: CodeTuning;
  terminal: TerminalTuning;
  transition: TransitionTuning;
  background: BackgroundTuning;
}

// Deep partial — scene override를 작성할 때 어느 키만 골라 덮어쓸 수 있음
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type PartialEffectTuning = DeepPartial<EffectTuning>;

// ────────────────────────────────────────────────────────────────────────
// 기본 preset: vrew-coding-clean
// ────────────────────────────────────────────────────────────────────────
export const vrewCodingClean: EffectTuning = {
  caption: {
    enabled: true,
    effect: 'karaoke',
    fontSize: 72,
    fontWeight: 900,
    lineHeight: 1.2,
    maxCharsPerLine: 14,
    activeWordScale: 1.12,
    popScale: 1.06,
    inactiveOpacity: 0.45,
    appearDuration: 0.15,
    disappearDuration: 0.10,
    slideDistance: 14,
    bounceIntensity: 0.12,
    chipPaddingX: 0,
    chipPaddingY: 0,
    chipRadius: 0,
    chipGap: 12,
    chipShadowBlur: 0,
    textColor: '#FFFFFF',
    highlightTextColor: '#FFD60A',
    chipBackground: 'transparent',
    highlightBackground: 'transparent',
    position: 'bottom',
    offsetY: -60,
  },
  code: {
    enabled: true,
    effect: 'typing',
    fontSize: 34,
    lineHeight: 1.6,
    typingSpeed: 38,
    typingDelay: 0.1,
    cursorEnabled: true,
    cursorStyle: 'bar',
    cursorBlinkSpeed: 0.55,
    cursorColor: '#e5e7eb',
    activeLineScale: 1.02,
    activeLineGlow: 20,
    activeLineColor: '#1f2937',
    highlightColor: '#60a5fa',
    scrollFollow: true,
    scrollSpeed: 1,
    zoomToActiveLine: true,
    zoomScale: 1.04,
    cardWidth: 920,
    cardHeight: 740,
    cardRadius: 22,
    cardShadowBlur: 32,
  },
  terminal: {
    enabled: true,
    effect: 'typing',
    fontSize: 34,
    lineHeight: 1.55,
    typingSpeed: 34,
    commandDelay: 0.25,
    outputDelay: 0.35,
    lineOutputDelay: 0.08,
    cursorEnabled: true,
    cursorBlinkSpeed: 0.55,
    successColor: '#22c55e',
    errorColor: '#ef4444',
    warningColor: '#f59e0b',
    normalColor: '#e5e7eb',
    cardWidth: 920,
    cardHeight: 700,
  },
  transition: {
    enabled: true,
    type: 'fade',
    duration: 0.22,
    easing: 'easeOut',
    zoomFrom: 0.98,
    zoomTo: 1,
    slideDirection: 'up',
    slideDistance: 24,
    blurAmount: 0,
    wipeAngle: 0,
  },
  background: {
    enabled: true,
    type: 'dark-gradient',
    motionSpeed: 0.4,
    gradientShift: 0.3,
    particleCount: 0,
    particleSpeed: 0,
    blurAmount: 18,
    opacity: 1,
    accentColor: '#7c3aed',
    secondaryColor: '#0f172a',
  },
};

// 추가 preset
export const vrewMinimal: EffectTuning = {
  ...vrewCodingClean,
  caption: { ...vrewCodingClean.caption, effect: 'minimal', fontSize: 60 },
  background: { ...vrewCodingClean.background, type: 'clean-white' },
};

export const vrewBoldHook: EffectTuning = {
  ...vrewCodingClean,
  caption: {
    ...vrewCodingClean.caption,
    effect: 'big-bold',
    fontSize: 84,
    activeWordScale: 1.18,
    position: 'center',
    offsetY: 0,
  },
  background: { ...vrewCodingClean.background, type: 'purple-tech' },
};

export const presets: Record<string, EffectTuning> = {
  'vrew-coding-clean': vrewCodingClean,
  'vrew-minimal': vrewMinimal,
  'vrew-bold-hook': vrewBoldHook,
};

// ────────────────────────────────────────────────────────────────────────
// merge — 전역 tuning + scene override
// ────────────────────────────────────────────────────────────────────────
function mergeOne<T extends object>(base: T, over: Partial<T> | undefined): T {
  if (!over) return base;
  return { ...base, ...over };
}

export const mergeTuning = (
  base: EffectTuning,
  override?: PartialEffectTuning,
): EffectTuning => {
  if (!override) return base;
  return {
    caption: mergeOne(base.caption, override.caption),
    code: mergeOne(base.code, override.code),
    terminal: mergeOne(base.terminal, override.terminal),
    transition: mergeOne(base.transition, override.transition),
    background: mergeOne(base.background, override.background),
  };
};

// 외부에서 partial(JSON 등)을 받을 때 사용
export const resolveTuning = (
  override?: PartialEffectTuning,
  basePresetName: string = 'vrew-coding-clean',
): EffectTuning => {
  const base = presets[basePresetName] ?? vrewCodingClean;
  return mergeTuning(base, override);
};

// scene별 override를 정의할 때 쓰는 타입
export type SceneEffectMap = Record<string, PartialEffectTuning>;
