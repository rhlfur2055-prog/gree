// VrewCodingCleanShorts.tsx
// 새 effect tuning 시스템을 실제로 사용하는 메인 컴포지션.
// 두 가지 입력 형태를 모두 받는다:
//
//  A) 새 형식 (직접 작성)
//     - words: CaptionWord[]
//     - scenes: SceneSpec[]
//
//  B) 호환 형식 (server-local.js의 /render-auto가 보내는 그대로)
//     - captions: Array<{ text, startMs, endMs, isHighlight, words: [...] }>
//     - subtitle_segments: 자막 chunk
//     - scenes? (script_result.json의 scenes — narration/caption/overlay/transition)
//
// 공통:
//   - effectTuning?: 전역 tuning
//   - sceneOverrides?: { [sceneId]: PartialEffectTuning }
//   - audioSrc?: 오디오
//   - durationSeconds: composition duration

import React from 'react';
import { AbsoluteFill, Audio, useVideoConfig, useCurrentFrame } from 'remotion';
import { SceneRenderer } from './effects/SceneRenderer';
import type { SceneSpec } from './effects/SceneRenderer';
import { VrewCaption } from './effects/VrewCaption';
import type { CaptionWord, CaptionChunk } from './effects/VrewCaption';
import { TypingCodeBlock } from './effects/TypingCodeBlock';
import type { CodeLine } from './effects/TypingCodeBlock';
import { TerminalTypingBlock } from './effects/TerminalTypingBlock';
import type { TerminalLine } from './effects/TerminalTypingBlock';
import { vrewCodingClean, mergeTuning, presets } from './effects/tuning';
import type { EffectTuning, PartialEffectTuning } from './effects/tuning';
import {
  renderSceneEffect,
  defaultEffectForSection,
  SCENE_EFFECT_NAMES,
} from './effects/scene-effects';
import type { SceneEffectKind, SegmentStyle } from './effects/scene-effects';
import { loadPretendard } from './fonts';

// ── 입력 타입 (legacy + new 모두 수용) ─────────────────────────────────────
interface LegacyCaptionWord {
  text: string;
  startMs: number;
  endMs: number;
}
interface LegacyCaption {
  index?: number;
  text: string;
  startMs: number;
  endMs: number;
  isHighlight?: boolean;
  words?: LegacyCaptionWord[];
}
interface LegacyScriptScene {
  scene_id?: string;
  section?: string;          // hook / setup / reveal / cause / solution / cta
  duration?: number;
  narration?: string;
  caption?: string;
  visual_prompt?: string;
  transition?: string;
  emotion?: string;
  overlay?: { type?: string; text?: string };
  /** 6 효과 중 하나. 없으면 section→effect 기본 매핑 사용 */
  effect?: SceneEffectKind;
  // 효과별 입력 (있으면 사용)
  code_lines?: CodeLine[];
  code_title?: string;
  terminal_lines?: TerminalLine[];
  nodes?: string[];
  checklist?: string[];
  /** editor에서 조절한 효과 외형 override (scale/opacity/x/y/speed/delay/width/height) */
  style?: SegmentStyle;
}

export interface VrewCodingCleanProps {
  // 새 형식 (직접 작성한 경우)
  words?: CaptionWord[];
  chunks?: CaptionChunk[];
  scenes?: SceneSpec[];

  // 호환 형식 (server가 보내는 입력)
  captions?: LegacyCaption[];
  subtitle_segments?: unknown[];
  scriptScenes?: LegacyScriptScene[]; // 명시적 키 분리. legacy script.scenes는 자동 매핑
  scriptScenesRaw?: LegacyScriptScene[]; // 동일 (alias)

  // tuning
  effectTuning?: EffectTuning | PartialEffectTuning;
  effectPreset?: string; // 'vrew-coding-clean' 등 — preset 이름만으로도 지정 가능
  sceneOverrides?: Record<string, PartialEffectTuning>;
  /** scene id 또는 section 이름 → SceneEffectKind. scriptScenes[].effect를 덮어쓸 수 있음 */
  sceneEffects?: Record<string, SceneEffectKind>;
  /** scene id 또는 section 이름 → SegmentStyle. editor에서 슬라이더로 만든 visual override */
  segmentStyles?: Record<string, SegmentStyle>;

  // 데모/직접 전달용
  codeLines?: CodeLine[];
  codeTitle?: string;
  terminalLines?: TerminalLine[];
  hookTitle?: string;
  hookSubtitle?: string;

  audioSrc?: string;
  durationSeconds?: number;

  // 디버그
  debug?: boolean;
}

// ── default props ─────────────────────────────────────────────────────────
export const defaultVrewCodingCleanProps: VrewCodingCleanProps = {
  hookTitle: '한 줄로 끝나는',
  hookSubtitle: 'React 상태 관리',
  codeTitle: 'app.tsx',
  codeLines: [
    { text: "import { useState } from 'react';" },
    { text: '' },
    { text: 'export const Counter = () => {' },
    { text: '  const [count, setCount] = useState(0);' },
    { text: '  return (' },
    { text: '    <button onClick={() => setCount(c => c + 1)}>' },
    { text: '      Clicked {count} times' },
    { text: '    </button>' },
    { text: '  );' },
    { text: '};' },
  ],
  terminalLines: [
    { text: 'npm run dev', kind: 'command' },
    { text: '', kind: 'output' },
    { text: 'VITE v5.0.0  ready in 142 ms', kind: 'success' },
    { text: '➜  Local:   http://localhost:5173/', kind: 'output' },
    { text: '➜  Network: http://192.168.0.10:5173/', kind: 'output' },
  ],
  words: [
    { text: '한 줄로', startMs: 0, endMs: 600 },
    { text: '끝나는', startMs: 600, endMs: 1200 },
    { text: 'React', startMs: 1200, endMs: 1900, highlight: true },
    { text: '상태', startMs: 1900, endMs: 2400 },
    { text: '관리.', startMs: 2400, endMs: 3000 },
    { text: '코드는', startMs: 3000, endMs: 3600 },
    { text: '아래처럼', startMs: 3600, endMs: 4200 },
    { text: '간결합니다.', startMs: 4200, endMs: 5200, highlight: true },
    { text: '터미널에서', startMs: 9000, endMs: 9800 },
    { text: 'npm', startMs: 9800, endMs: 10300, highlight: true },
    { text: 'run', startMs: 10300, endMs: 10700 },
    { text: 'dev', startMs: 10700, endMs: 11400, highlight: true },
    { text: '한 번이면', startMs: 11400, endMs: 12200 },
    { text: '끝.', startMs: 12200, endMs: 13000 },
  ],
  durationSeconds: 15,
};

// ── legacy captions → 단어 단위 words[] 변환 ─────────────────────────────
const captionsToWords = (caps?: LegacyCaption[]): CaptionWord[] => {
  if (!caps?.length) return [];
  const out: CaptionWord[] = [];
  for (const c of caps) {
    if (c.words?.length) {
      for (const w of c.words) {
        out.push({
          text: w.text,
          startMs: w.startMs,
          endMs: w.endMs,
          highlight: c.isHighlight,
        });
      }
    } else if (c.text && c.text.trim()) {
      // 단어 타이밍이 없으면 chunk 전체를 한 단어로
      out.push({
        text: c.text,
        startMs: c.startMs,
        endMs: c.endMs,
        highlight: c.isHighlight,
      });
    }
  }
  return out;
};

// ── legacy script scenes → SceneSpec[] 변환 ───────────────────────────────
// 각 scene을 화면 중앙의 큰 카드로 그린다.
// overlay.type 에 따라 카드 종류 결정.
const FONT = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif";

const buildSceneContent = (
  scene: LegacyScriptScene,
  idx: number,
  resolvedEffect: SceneEffectKind,
  resolvedStyle: SegmentStyle | undefined,
): React.ReactNode => {
  // 1) scene.effect가 6가지 중 하나면 그것을 우선 사용
  if (resolvedEffect && resolvedEffect !== 'none') {
    const node = renderSceneEffect(resolvedEffect, {
      sceneId: scene.scene_id,
      section: scene.section,
      caption: scene.caption,
      narration: scene.narration,
      codeLines: scene.code_lines,
      terminalLines: scene.terminal_lines,
      nodes: scene.nodes,
      checklist: scene.checklist,
      style: resolvedStyle,
    });
    if (node) return node;
  }

  // 2) effect=none 이거나 알 수 없는 경우 — 기존 fallback 카드
  const overlayType = scene.overlay?.type ?? 'text';
  const overlayText = scene.overlay?.text ?? scene.caption ?? scene.narration ?? '';

  if (scene.code_lines?.length) {
    return (
      <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TypingCodeBlock lines={scene.code_lines} title={scene.code_title ?? `scene_${idx}.tsx`} startFrame={0} />
      </AbsoluteFill>
    );
  }
  if (scene.terminal_lines?.length) {
    return (
      <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TerminalTypingBlock lines={scene.terminal_lines} startFrame={0} />
      </AbsoluteFill>
    );
  }

  // 기본: 큰 카드 + 헤드라인
  const isData = overlayType === 'data_chart' || overlayType === 'stat';
  const isKw = overlayType === 'keyword';

  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 64 }}>
      <div
        style={{
          width: 920,
          minHeight: 540,
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 28,
          padding: '56px 48px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
        }}
      >
        {scene.scene_id && (
          <div
            style={{
              fontFamily: FONT,
              fontSize: 22,
              fontWeight: 700,
              color: '#a78bfa',
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            {scene.scene_id}
          </div>
        )}
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: isKw ? 132 : isData ? 96 : 80,
            color: '#ffffff',
            lineHeight: 1.05,
            letterSpacing: -2,
          }}
        >
          {scene.caption || scene.narration || overlayText}
        </div>
        {scene.narration && scene.caption && scene.narration !== scene.caption && (
          <div
            style={{
              fontFamily: FONT,
              fontSize: 32,
              color: 'rgba(255,255,255,0.7)',
              lineHeight: 1.4,
              marginTop: 8,
            }}
          >
            {scene.narration}
          </div>
        )}
        {isData && (
          <div
            style={{
              marginTop: 16,
              padding: '14px 22px',
              background: 'linear-gradient(135deg, #facc15, #fb923c)',
              color: '#0f172a',
              alignSelf: 'flex-start',
              borderRadius: 14,
              fontFamily: FONT,
              fontSize: 36,
              fontWeight: 900,
            }}
          >
            {overlayText}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

const isValidEffect = (e: unknown): e is SceneEffectKind =>
  typeof e === 'string' && (SCENE_EFFECT_NAMES as string[]).includes(e);

const resolveEffect = (
  scene: LegacyScriptScene,
  sceneEffects: Record<string, SceneEffectKind> | undefined,
): SceneEffectKind => {
  // 우선순위: sceneEffects[scene_id] > sceneEffects[section] > scene.effect > section→default
  const byId = scene.scene_id ? sceneEffects?.[scene.scene_id] : undefined;
  const bySec = scene.section ? sceneEffects?.[scene.section.toLowerCase()] : undefined;
  const own = scene.effect;
  if (isValidEffect(byId)) return byId;
  if (isValidEffect(bySec)) return bySec;
  if (isValidEffect(own)) return own;
  return defaultEffectForSection(scene.section);
};

const resolveStyle = (
  scene: LegacyScriptScene,
  segmentStyles: Record<string, SegmentStyle> | undefined,
): SegmentStyle | undefined => {
  const byId = scene.scene_id ? segmentStyles?.[scene.scene_id] : undefined;
  const bySec = scene.section ? segmentStyles?.[scene.section.toLowerCase()] : undefined;
  // 셋 중 정의된 모든 키를 머지
  const merged: SegmentStyle = { ...(scene.style ?? {}), ...(bySec ?? {}), ...(byId ?? {}) };
  return Object.keys(merged).length ? merged : undefined;
};

const buildScenesFromLegacy = (
  legacy: LegacyScriptScene[] | undefined,
  totalSec: number,
  sceneEffects?: Record<string, SceneEffectKind>,
  segmentStyles?: Record<string, SegmentStyle>,
): SceneSpec[] => {
  if (!legacy?.length) return [];
  const totalGiven = legacy.reduce((acc, s) => acc + (s.duration ?? 0), 0);
  const scale = totalGiven > 0 ? totalSec / totalGiven : 1;
  let cursor = 0;
  return legacy.map((scene, i) => {
    const dur = Math.max(0.5, (scene.duration ?? totalSec / legacy.length) * scale);
    const start = cursor;
    cursor = start + dur;
    const eff = resolveEffect(scene, sceneEffects);
    const sty = resolveStyle(scene, segmentStyles);
    return {
      id: scene.scene_id ?? `scene_${i}`,
      startSeconds: start,
      endSeconds: cursor,
      content: buildSceneContent(scene, i, eff, sty),
    };
  });
};

// ── tuning 결정 ──────────────────────────────────────────────────────────
const resolveBaseTuning = (
  effectTuning: VrewCodingCleanProps['effectTuning'],
  presetName?: string,
): EffectTuning => {
  // preset 이름 우선
  if (presetName && presets[presetName]) {
    if (effectTuning) return mergeTuning(presets[presetName], effectTuning as PartialEffectTuning);
    return presets[presetName];
  }
  if (!effectTuning) return vrewCodingClean;
  const looksFull =
    (effectTuning as EffectTuning).caption?.effect !== undefined &&
    (effectTuning as EffectTuning).code?.effect !== undefined;
  if (looksFull) return effectTuning as EffectTuning;
  return mergeTuning(vrewCodingClean, effectTuning as PartialEffectTuning);
};

const mergeTuningOverride = (
  a: PartialEffectTuning | undefined,
  b: PartialEffectTuning,
): PartialEffectTuning => {
  if (!a) return b;
  return {
    caption: { ...(a.caption ?? {}), ...(b.caption ?? {}) },
    code: { ...(a.code ?? {}), ...(b.code ?? {}) },
    terminal: { ...(a.terminal ?? {}), ...(b.terminal ?? {}) },
    transition: { ...(a.transition ?? {}), ...(b.transition ?? {}) },
    background: { ...(a.background ?? {}), ...(b.background ?? {}) },
  };
};

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────
export const VrewCodingCleanShorts: React.FC<VrewCodingCleanProps> = (rawProps) => {
  loadPretendard();
  const { fps } = useVideoConfig();

  const props: VrewCodingCleanProps = { ...defaultVrewCodingCleanProps, ...rawProps };

  const baseTuning = resolveBaseTuning(props.effectTuning, props.effectPreset);

  // ── 자막 source 결정: words > chunks > captions ─────────────────────
  const words: CaptionWord[] = props.words?.length
    ? props.words
    : props.chunks?.length
    ? props.chunks.flatMap((c) =>
        c.words?.length ? c.words : [{ text: '', startMs: c.startMs, endMs: c.endMs } as CaptionWord],
      )
    : captionsToWords(props.captions);

  // ── scenes 결정: scenes > scriptScenes/scriptScenesRaw > captions auto ─
  const total = props.durationSeconds ?? defaultVrewCodingCleanProps.durationSeconds ?? 15;
  let scenes: SceneSpec[] = [];

  if (props.scenes?.length) {
    scenes = props.scenes;
  } else if (props.scriptScenes?.length || props.scriptScenesRaw?.length) {
    scenes = buildScenesFromLegacy(
      props.scriptScenes ?? props.scriptScenesRaw,
      total,
      props.sceneEffects,
      props.segmentStyles,
    );
  } else if (props.captions?.length) {
    // captions를 그대로 시간 기준으로 scene 잘라서 카드 형태로 보여줌
    scenes = buildScenesFromLegacy(
      props.captions.map((c, i) => ({
        scene_id: `cap_${i}`,
        duration: Math.max(0.5, (c.endMs - c.startMs) / 1000),
        caption: c.text,
        overlay: { type: c.isHighlight ? 'keyword' : 'text', text: c.text },
      })),
      total,
      props.sceneEffects,
      props.segmentStyles,
    );
  } else {
    // 데모용 hook / code / terminal scene
    scenes = [
      {
        id: 'hook',
        startSeconds: 0,
        endSeconds: Math.min(5, total * 0.3),
        content: (
          <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div
              style={{
                fontFamily: FONT,
                fontWeight: 900,
                color: '#fff',
                textAlign: 'center',
                padding: '0 48px',
                lineHeight: 1.05,
              }}
            >
              <div style={{ fontSize: 80, opacity: 0.85 }}>{props.hookTitle}</div>
              <div
                style={{
                  fontSize: 128,
                  marginTop: 16,
                  background: 'linear-gradient(135deg, #facc15, #fb923c)',
                  WebkitBackgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                {props.hookSubtitle}
              </div>
            </div>
          </AbsoluteFill>
        ),
      },
      {
        id: 'code',
        startSeconds: Math.min(5, total * 0.3),
        endSeconds: Math.min(10, total * 0.66),
        content: (
          <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TypingCodeBlock lines={props.codeLines ?? []} title={props.codeTitle} startFrame={0} />
          </AbsoluteFill>
        ),
      },
      {
        id: 'terminal',
        startSeconds: Math.min(10, total * 0.66),
        endSeconds: total,
        content: (
          <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TerminalTypingBlock lines={props.terminalLines ?? []} startFrame={0} />
          </AbsoluteFill>
        ),
        override: { background: { type: 'terminal' } },
      },
    ];
  }

  // ── scene override 적용 ─────────────────────────────────────────────
  if (props.sceneOverrides) {
    scenes = scenes.map((s) => {
      const ov = props.sceneOverrides?.[s.id];
      if (!ov) return s;
      return { ...s, override: mergeTuningOverride(s.override, ov) };
    });
  }

  // 화면 상단에 항상 어떤 scene/effect가 현재 활성인지 보여줌(검증용).
  // props.debug === false 로 명시하면 끔.
  const showDebug = props.debug === true;

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {props.audioSrc && <Audio src={props.audioSrc} />}
      <SceneRenderer
        tuning={baseTuning}
        scenes={scenes}
        globalOverlay={
          <>
            <VrewCaption words={words} chunks={props.chunks} />
            {showDebug && <ActiveSceneBadge scenes={scenes} sceneSpecs={scenes} />}
          </>
        }
      />
    </AbsoluteFill>
  );
};

// 현재 frame이 어느 scene 구간에 들어 있고 어떤 effect를 그려야 하는지
// 화면 우상단에 항상 표시하는 디버그 배지.
const ActiveSceneBadge: React.FC<{ scenes: SceneSpec[]; sceneSpecs: SceneSpec[] }> = ({ scenes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const idx = scenes.findIndex((s) => {
    const a = s.startSeconds ?? (s.startFrame ?? 0) / fps;
    const b = s.endSeconds ?? (s.endFrame ?? 0) / fps;
    return sec >= a && sec < b;
  });
  const cur = idx >= 0 ? scenes[idx] : null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 30,
        right: 30,
        padding: '10px 18px',
        background: 'rgba(15,23,42,0.85)',
        border: '1px solid rgba(255,255,255,0.18)',
        color: '#a3e635',
        fontFamily: 'Menlo,monospace',
        fontSize: 22,
        fontWeight: 700,
        borderRadius: 12,
        zIndex: 9999,
        letterSpacing: 0.5,
      }}
    >
      {idx >= 0
        ? `${idx + 1}/${scenes.length}  ${cur?.id ?? ''}  ${sec.toFixed(1)}s`
        : `(no scene @ ${sec.toFixed(1)}s)`}
    </div>
  );
};

const FPS = 30;
export const VREW_CODING_CLEAN_TOTAL_FRAMES = Math.ceil(15 * FPS);
