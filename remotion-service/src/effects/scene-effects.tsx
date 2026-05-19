// effects/scene-effects.tsx
// scene.effect 의 6가지 고정 효과 + 레지스트리.
//
//  terminal-type   : 터미널 창에 명령어/응답이 타이핑됨        (HOOK)
//  code-typing     : 코드 카드에 라인이 한 줄씩 타이핑됨       (SETUP)
//  log-stream      : 로그가 위에서 아래로 스트리밍됨          (CAUSE)
//  workflow-nodes  : n8n 풍 워크플로 노드가 좌→우로 점등       (REVEAL)
//  checklist-run   : 체크리스트 항목이 ✓ 되며 통과            (SOLUTION)
//  cursor-blink    : 결과/CTA 라인 + 깜빡이는 커서             (CTA)
//
// 모든 컴포넌트는 useCurrentFrame() 기반으로 동작하며, useEffectTuning()의
// 관련 섹션(code / terminal / caption / background)을 참조해 색상/폰트/속도를 맞춘다.

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { useEffectTuning } from './EffectTuningContext';
import { TypingCodeBlock } from './TypingCodeBlock';
import type { CodeLine } from './TypingCodeBlock';
import { TerminalTypingBlock } from './TerminalTypingBlock';
import type { TerminalLine } from './TerminalTypingBlock';

const MONO = "Menlo,'JetBrains Mono','Consolas',monospace";
const FONT = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif";

// ────────────────────────────────────────────────────────────────────────
// 공통 입력 + 사용자 segment 단위 override
// ────────────────────────────────────────────────────────────────────────
export interface SegmentStyle {
  /** 효과 카드 전체 scale (0.5 ~ 2) */
  scale?: number;
  /** 효과 카드 전체 opacity (0 ~ 1) */
  opacity?: number;
  /** 효과 카드의 X/Y 오프셋(px) — 기본 중앙에서 더하기 */
  x?: number;
  y?: number;
  /** 효과 카드 폭 강제(px). undefined면 default */
  width?: number;
  /** 효과 카드 높이 강제(px). undefined면 default */
  height?: number;
  /** 타이핑/노드 등장 속도 배수. 1=기본, 2=2배 빠름, 0.5=절반 */
  speed?: number;
  /** 효과 시작 지연(seconds) — scene 안에서 effect가 늦게 등장 */
  delay?: number;
}

export interface SceneEffectInput {
  /** scene id (디버깅용) */
  sceneId?: string;
  /** section 라벨 (hook/setup/...) — 색상 hint */
  section?: string;
  /** 자막/내레이션 텍스트 (효과 내부에서 추출해 라벨로 사용) */
  caption?: string;
  narration?: string;
  /** 명시적인 코드 라인 — code-typing에서 사용. 없으면 caption을 분해해 생성 */
  codeLines?: CodeLine[];
  /** 터미널 라인 — terminal-type / log-stream 에서 사용. 없으면 caption 기반 생성 */
  terminalLines?: TerminalLine[];
  /** 체크리스트 — checklist-run에서 사용. 없으면 caption을 라인 분리해 생성 */
  checklist?: string[];
  /** workflow 노드 라벨 — workflow-nodes에서 사용. 없으면 caption을 콤마/→로 분리 */
  nodes?: string[];
  /** 사용자가 editor에서 조절한 visual override */
  style?: SegmentStyle;
  /** true 일 때만 EffectHeaderBadge/SectionPill 렌더 (기본 false) */
  debug?: boolean;
}

// 모든 효과 컴포넌트의 outer wrapper.
// transform(scale + translate), opacity, delay를 통일된 방식으로 입힌다.
export const SegmentStyleWrap: React.FC<{
  style?: SegmentStyle;
  children: React.ReactNode;
}> = ({ style, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delayFrames = Math.max(0, Math.round((style?.delay ?? 0) * fps));
  if (frame < delayFrames) {
    // delay 동안은 완전 투명 (delay 끝나면 그 시점부터 effect 등장)
    return null;
  }
  const sc = style?.scale ?? 1;
  const op = style?.opacity ?? 1;
  const tx = style?.x ?? 0;
  const ty = style?.y ?? 0;
  return (
    <AbsoluteFill
      style={{
        transform: `translate(${tx}px, ${ty}px) scale(${sc})`,
        transformOrigin: 'center center',
        opacity: op,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const SECTION_HINT: Record<string, string> = {
  hook: '#fb923c',
  setup: '#60a5fa',
  intro: '#60a5fa',
  problem: '#f87171',
  reveal: '#a78bfa',
  cause: '#f87171',
  solution: '#22c55e',
  demo: '#22c55e',
  cta: '#facc15',
  conclusion: '#facc15',
};

const sectionAccent = (section?: string) =>
  SECTION_HINT[section?.toLowerCase() ?? ''] ?? '#7c3aed';

const splitToLines = (text?: string, max = 6): string[] => {
  if (!text) return [];
  // 한국어/영어 모두 . , 줄바꿈 기준 분리, 너무 길면 자름
  const raw = text
    .split(/[.\n·•]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return raw.slice(0, max);
};

// ────────────────────────────────────────────────────────────────────────
// 1. TerminalTypeScene  — HOOK 기본
// ────────────────────────────────────────────────────────────────────────
export const TerminalTypeScene: React.FC<SceneEffectInput> = (p) => {
  const accent = sectionAccent(p.section);
  const cap = (p.caption || p.narration || '').trim();
  // caption을 한 줄 명령어 + 한 줄 결과로
  const lines: TerminalLine[] =
    p.terminalLines ??
    [
      { text: cap ? cap : 'ai-shorts run', kind: 'command' as const },
      { text: '', kind: 'output' as const },
      ...(p.narration && p.narration !== p.caption ? [{ text: p.narration, kind: 'output' as const }] : []),
      { text: '✓ ready', kind: 'success' as const },
    ];

  return (
    <SegmentStyleWrap style={p.style}>
      <AbsoluteFill style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 180 }}>
        <TerminalTypingBlock lines={lines} title="bash" />
        {p.debug && <EffectHeaderBadge label="HOOK · terminal-type" color={accent} />}
        {p.debug && <SectionPill section={p.section} color={accent} />}
      </AbsoluteFill>
    </SegmentStyleWrap>
  );
};
// (다른 효과 컴포넌트들도 모두 EffectHeaderBadge를 사용함 — 아래에 일괄 추가)

// ────────────────────────────────────────────────────────────────────────
// 2. CodeTypingScene — SETUP 기본
// ────────────────────────────────────────────────────────────────────────
export const CodeTypingScene: React.FC<SceneEffectInput> = (p) => {
  const accent = sectionAccent(p.section);
  const lines: CodeLine[] =
    p.codeLines ??
    splitToLines(p.caption || p.narration, 8).map((s, i) => ({
      text: `// ${i + 1}. ${s}`,
    }));

  // 빈 라인이면 안내문 한 줄
  const safe = lines.length ? lines : [{ text: '// setup' }, { text: '// (코드 없음)' }];

  return (
    <SegmentStyleWrap style={p.style}>
      <AbsoluteFill style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 180 }}>
        <TypingCodeBlock lines={safe} title={`${p.section ?? 'scene'}.ts`} />
        {p.debug && <EffectHeaderBadge label="SETUP · code-typing" color={accent} />}
        {p.debug && <SectionPill section={p.section} color={accent} />}
      </AbsoluteFill>
    </SegmentStyleWrap>
  );
};

// ────────────────────────────────────────────────────────────────────────
// 3. LogStreamScene — CAUSE 기본
// ────────────────────────────────────────────────────────────────────────
export const LogStreamScene: React.FC<SceneEffectInput> = (p) => {
  const t = useEffectTuning().terminal;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = sectionAccent(p.section);

  const baseLines =
    p.terminalLines?.map((l) => l.text) ??
    splitToLines(p.narration || p.caption, 8);

  // 한 줄당 노출 간격 (speed로 가속)
  const speedMul = p.style?.speed ?? 1;
  const perLineFrames = Math.max(4, Math.round(0.45 * fps / speedMul));
  return (
    <SegmentStyleWrap style={p.style}>
    <AbsoluteFill style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 160 }}>
      <div
        style={{
          width: 920,
          height: 760,
          background: '#0b1220',
          borderRadius: 22,
          padding: '28px 28px',
          border: `1px solid ${accent}44`,
          boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
          fontFamily: MONO,
          fontSize: t.fontSize - 2,
          lineHeight: 1.55,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            color: accent,
            fontWeight: 700,
            marginBottom: 16,
            letterSpacing: 1,
            fontSize: 18,
          }}
        >
          ▼ log_stream  /  {p.section?.toUpperCase() ?? 'CAUSE'}
        </div>
        {baseLines.map((line, i) => {
          const start = i * perLineFrames;
          const op = interpolate(frame, [start, start + 6], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const shift = interpolate(frame, [start, start + 10], [12, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          // 에러/경고 키워드 강조
          const isErr = /(error|fail|undefined|null|❌|✗|denied|미검증|취약)/i.test(line);
          const isOk = /(ok|success|done|✓|✅|safe)/i.test(line);
          const color = isErr ? t.errorColor : isOk ? t.successColor : t.normalColor;
          return (
            <div
              key={i}
              style={{
                opacity: op,
                transform: `translateY(${shift}px)`,
                color,
                marginBottom: 6,
                whiteSpace: 'pre-wrap',
              }}
            >
              <span style={{ color: '#475569' }}>{String(i + 1).padStart(2, '0')} │ </span>
              {line}
            </div>
          );
        })}
      </div>
      {p.debug && <EffectHeaderBadge label="CAUSE · log-stream" color={accent} />}
      {p.debug && <SectionPill section={p.section} color={accent} />}
    </AbsoluteFill>
    </SegmentStyleWrap>
  );
};

// ────────────────────────────────────────────────────────────────────────
// 4. WorkflowNodesScene — REVEAL 기본
// ────────────────────────────────────────────────────────────────────────
export const WorkflowNodesScene: React.FC<SceneEffectInput> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = sectionAccent(p.section);
  const speedMul = p.style?.speed ?? 1;

  const labels =
    p.nodes ??
    (p.caption || p.narration || '입력 → 변환 → 출력')
      .split(/→|->|>|,| - /)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);
  const N = Math.max(2, labels.length);
  const cardW = p.style?.width ? Math.round(p.style.width / Math.max(1,N) - 30) : 220;
  const gap = 40;
  const totalW = N * cardW + (N - 1) * gap;
  const startX = (1080 - totalW) / 2;
  const cy = 700;

  const stepFrames = Math.max(4, Math.round(0.5 * fps / speedMul));

  return (
    <SegmentStyleWrap style={p.style}>
    <AbsoluteFill>
      {/* 연결선 */}
      {labels.map((_, i) => {
        if (i === labels.length - 1) return null;
        const x1 = startX + i * (cardW + gap) + cardW;
        const x2 = startX + (i + 1) * (cardW + gap);
        const t = interpolate(frame, [i * stepFrames + 6, i * stepFrames + 16], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            key={`l-${i}`}
            style={{
              position: 'absolute',
              top: cy - 2,
              left: x1,
              height: 4,
              width: (x2 - x1) * t,
              background: accent,
              borderRadius: 2,
              boxShadow: `0 0 14px ${accent}aa`,
            }}
          />
        );
      })}
      {labels.map((label, i) => {
        const start = i * stepFrames;
        const sp = spring({
          frame: frame - start,
          fps,
          config: { damping: 18, stiffness: 200, mass: 0.6 },
          durationInFrames: 20,
        });
        const scale = interpolate(sp, [0, 1], [0.85, 1]);
        const op = interpolate(frame, [start, start + 8], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const x = startX + i * (cardW + gap);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: cy - 110,
              width: cardW,
              height: 220,
              borderRadius: 22,
              background: 'rgba(15,23,42,0.92)',
              border: `3px solid ${accent}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 14,
              transform: `scale(${scale})`,
              opacity: op,
              boxShadow: `0 0 36px ${accent}99, inset 0 0 18px ${accent}33`,
            }}
          >
            <div
              style={{
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: 30,
                color: '#fff',
                textAlign: 'center',
                lineHeight: 1.2,
              }}
            >
              {label}
            </div>
            <div
              style={{
                position: 'absolute',
                top: -22,
                left: -22,
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: accent,
                color: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: MONO,
                fontWeight: 900,
                fontSize: 20,
              }}
            >
              {i + 1}
            </div>
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          top: cy + 200,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: FONT,
          fontSize: 46,
          fontWeight: 900,
          color: '#fff',
          padding: '0 48px',
        }}
      >
        {p.caption}
      </div>
      {p.debug && <EffectHeaderBadge label="REVEAL · workflow-nodes" color={accent} />}
      {p.debug && <SectionPill section={p.section} color={accent} />}
    </AbsoluteFill>
    </SegmentStyleWrap>
  );
};

// ────────────────────────────────────────────────────────────────────────
// 5. ChecklistRunScene — SOLUTION 기본
// ────────────────────────────────────────────────────────────────────────
export const ChecklistRunScene: React.FC<SceneEffectInput> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = sectionAccent(p.section);
  const speedMul = p.style?.speed ?? 1;

  const items =
    p.checklist ?? splitToLines(p.caption || p.narration, 6).map((s) => s.replace(/^[-*•]\s*/, ''));
  const safe = items.length ? items : ['항목 1', '항목 2', '항목 3'];
  const stepFrames = Math.max(3, Math.round(0.35 * fps / speedMul));

  return (
    <SegmentStyleWrap style={p.style}>
    <AbsoluteFill style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 160 }}>
      <div
        style={{
          width: p.style?.width ?? 920,
          padding: '40px 44px',
          borderRadius: 28,
          background: 'rgba(15,23,42,0.85)',
          border: `1px solid ${accent}55`,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 38,
            color: '#fff',
            marginBottom: 24,
          }}
        >
          {p.caption ?? 'Checklist'}
        </div>
        {safe.map((line, i) => {
          const start = i * stepFrames;
          const checked = frame >= start + 6;
          const op = interpolate(frame, [start, start + 6], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const sp = spring({
            frame: frame - (start + 6),
            fps,
            config: { damping: 14, stiffness: 220, mass: 0.5 },
            durationInFrames: 14,
          });
          const checkScale = interpolate(sp, [0, 1], [0.4, 1]);
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                padding: '14px 0',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                opacity: op,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: checked ? accent : 'rgba(255,255,255,0.05)',
                  border: `2px solid ${checked ? accent : 'rgba(255,255,255,0.18)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0f172a',
                  fontWeight: 900,
                  fontSize: 28,
                  transform: `scale(${checked ? checkScale : 1})`,
                }}
              >
                {checked ? '✓' : ''}
              </div>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: 36,
                  fontWeight: 700,
                  color: checked ? '#fff' : 'rgba(255,255,255,0.65)',
                  textDecoration: 'none',
                  flex: 1,
                  lineHeight: 1.3,
                }}
              >
                {line}
              </div>
            </div>
          );
        })}
      </div>
      {p.debug && <EffectHeaderBadge label="SOLUTION · checklist-run" color={accent} />}
      {p.debug && <SectionPill section={p.section} color={accent} />}
    </AbsoluteFill>
    </SegmentStyleWrap>
  );
};

// ────────────────────────────────────────────────────────────────────────
// 6. CursorBlinkScene — CTA 기본
// ────────────────────────────────────────────────────────────────────────
export const CursorBlinkScene: React.FC<SceneEffectInput> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = sectionAccent(p.section);
  const text = p.caption || p.narration || '구독하고 알림 받기';
  const t = useEffectTuning().caption;

  // 타이핑 효과로 한 글자씩 노출 (speed override 가능)
  const speedMul = p.style?.speed ?? 1;
  const speed = 14 * speedMul; // chars per second
  const visible = Math.min(text.length, Math.floor((frame / fps) * speed));
  const blink = Math.floor(frame / Math.max(1, fps * 0.45)) % 2 === 0;

  return (
    <SegmentStyleWrap style={p.style}>
    <AbsoluteFill style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', flexDirection: 'column', gap: 36, paddingTop: 220, paddingLeft: 80, paddingRight: 80 }}>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 132,
          fontWeight: 900,
          color: '#fff',
          letterSpacing: -3,
          textAlign: 'center',
          lineHeight: 1.05,
          padding: '0 48px',
          textShadow: `0 8px 30px ${accent}66`,
        }}
      >
        {text.slice(0, visible)}
        <span
          style={{
            display: 'inline-block',
            width: 14,
            height: 110,
            background: accent,
            verticalAlign: 'text-bottom',
            marginLeft: 10,
            opacity: blink ? 1 : 0.15,
            boxShadow: `0 0 24px ${accent}cc`,
            borderRadius: 3,
          }}
        />
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 36,
          color: 'rgba(255,255,255,0.65)',
          fontWeight: 600,
          padding: '12px 26px',
          borderRadius: 14,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        ▶ 다음 영상도 보기
      </div>
      {p.debug && <EffectHeaderBadge label="CTA · cursor-blink" color={accent} />}
      {p.debug && <SectionPill section={p.section} color={accent} />}
    </AbsoluteFill>
    </SegmentStyleWrap>
  );
};

// ────────────────────────────────────────────────────────────────────────
// 화면 좌상단에 큰 글씨로 "어떤 효과가 그려지고 있는지" 박는 헤더 배지.
// 사용자가 mp4에서 효과 종류를 한눈에 확인할 수 있게 한다.
// ────────────────────────────────────────────────────────────────────────
export const EffectHeaderBadge: React.FC<{ label: string; color: string }> = ({ label, color }) => (
  <div
    style={{
      position: 'absolute',
      top: 90,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 200,
    }}
  >
    <div
      style={{
        padding: '14px 28px',
        background: `linear-gradient(135deg, ${color}28, ${color}08)`,
        border: `2px solid ${color}`,
        color: '#ffffff',
        fontFamily: MONO,
        fontWeight: 900,
        fontSize: 30,
        letterSpacing: 3,
        borderRadius: 14,
        backdropFilter: 'blur(10px)',
        boxShadow: `0 8px 28px ${color}55`,
        textShadow: `0 2px 8px ${color}aa`,
      }}
    >
      {label}
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────────────────
// 작은 상단 섹션 라벨 — 6개 효과 모두 공통으로 노출
// ────────────────────────────────────────────────────────────────────────
const SectionPill: React.FC<{ section?: string; color: string }> = ({ section, color }) => {
  if (!section) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 180,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 199,
      }}
    >
      <div
        style={{
          padding: '8px 20px',
          background: `${color}22`,
          border: `1px solid ${color}`,
          color,
          fontFamily: MONO,
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: 4,
          textTransform: 'uppercase',
          borderRadius: 999,
          backdropFilter: 'blur(8px)',
        }}
      >
        {section}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
// 레지스트리
// ────────────────────────────────────────────────────────────────────────
export type SceneEffectKind =
  | 'terminal-type'
  | 'code-typing'
  | 'log-stream'
  | 'workflow-nodes'
  | 'checklist-run'
  | 'cursor-blink'
  | 'none';

export const SCENE_EFFECT_NAMES: SceneEffectKind[] = [
  'terminal-type',
  'code-typing',
  'log-stream',
  'workflow-nodes',
  'checklist-run',
  'cursor-blink',
  'none',
];

const REGISTRY: Record<Exclude<SceneEffectKind, 'none'>, React.FC<SceneEffectInput>> = {
  'terminal-type': TerminalTypeScene,
  'code-typing': CodeTypingScene,
  'log-stream': LogStreamScene,
  'workflow-nodes': WorkflowNodesScene,
  'checklist-run': ChecklistRunScene,
  'cursor-blink': CursorBlinkScene,
};

export const renderSceneEffect = (
  kind: SceneEffectKind,
  input: SceneEffectInput,
): React.ReactNode | null => {
  if (kind === 'none') return null;
  const Comp = REGISTRY[kind];
  if (!Comp) return null;
  return <Comp {...input} />;
};

// section → 기본 effect
export const SECTION_TO_EFFECT: Record<string, Exclude<SceneEffectKind, 'none'>> = {
  hook: 'terminal-type',
  setup: 'code-typing',
  intro: 'code-typing',
  reveal: 'workflow-nodes',
  problem: 'workflow-nodes',
  cause: 'log-stream',
  solution: 'checklist-run',
  demo: 'checklist-run',
  cta: 'cursor-blink',
  conclusion: 'cursor-blink',
};

export const defaultEffectForSection = (
  section?: string,
): Exclude<SceneEffectKind, 'none'> => {
  const key = (section ?? '').toLowerCase();
  return SECTION_TO_EFFECT[key] ?? 'code-typing';
};
