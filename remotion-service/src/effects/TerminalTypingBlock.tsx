// effects/TerminalTypingBlock.tsx
// 터미널 카드. tuning.terminal 적용.
// - typing: 모든 줄을 글자 단위 타이핑
// - command-run: $ 줄은 타이핑, 그 뒤 outputDelay 후 결과 줄 노출
// - line-output: 모든 줄을 라인 단위로 순차 노출
// success / error / warning 줄은 색상 강조

import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { useEffectTuning } from './EffectTuningContext';

const MONO = "Menlo,'JetBrains Mono','Courier New',monospace";

export type TerminalLineKind = 'command' | 'output' | 'success' | 'error' | 'warning';

export interface TerminalLine {
  text: string;
  kind?: TerminalLineKind;
}

export interface TerminalTypingBlockProps {
  lines: TerminalLine[];
  startFrame?: number;
  title?: string;
}

export const TerminalTypingBlock: React.FC<TerminalTypingBlockProps> = ({
  lines,
  startFrame = 0,
  title = 'bash',
}) => {
  const t = useEffectTuning().terminal;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!t.enabled || t.effect === 'none') return null;

  const rel = frame - startFrame;
  const charsPerFrame = t.typingSpeed / fps;

  // 각 줄의 startFrame 계산 (모드에 따라 다름)
  const schedule = useMemo(() => {
    const out: Array<{
      startFrame: number;
      typingFrames: number;
    }> = [];
    let cursor = 0;
    for (const line of lines) {
      if (t.effect === 'typing') {
        const typingFrames = Math.max(2, Math.ceil(line.text.length / charsPerFrame));
        out.push({ startFrame: cursor, typingFrames });
        cursor += typingFrames + Math.round(t.lineOutputDelay * fps);
      } else if (t.effect === 'command-run') {
        if (line.kind === 'command') {
          const typingFrames = Math.max(2, Math.ceil(line.text.length / charsPerFrame));
          out.push({ startFrame: cursor, typingFrames });
          cursor += typingFrames + Math.round(t.commandDelay * fps);
        } else {
          // output 줄은 즉시 노출, 단 outputDelay 뒤
          out.push({ startFrame: cursor + Math.round(t.outputDelay * fps), typingFrames: 0 });
          cursor += Math.round(t.lineOutputDelay * fps) + Math.round(t.outputDelay * fps);
        }
      } else {
        // line-output
        out.push({ startFrame: cursor, typingFrames: 0 });
        cursor += Math.round(t.lineOutputDelay * fps);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, t.effect, t.typingSpeed, t.commandDelay, t.outputDelay, t.lineOutputDelay, fps]);

  // 카드 등장 애니메이션
  const enter = interpolate(rel, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        width: t.cardWidth,
        height: t.cardHeight,
        background: '#0b1220',
        borderRadius: 22,
        overflow: 'hidden',
        boxShadow: '0 10px 36px rgba(0,0,0,0.45)',
        border: '1px solid rgba(255,255,255,0.08)',
        opacity: enter,
        transform: `translateY(${(1 - enter) * 14}px)`,
      }}
    >
      <div
        style={{
          height: 44,
          background: '#111a2c',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 8,
        }}
      >
        {['#ef4444', '#f59e0b', '#22c55e'].map((c) => (
          <div key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
        ))}
        <div
          style={{
            marginLeft: 18,
            fontFamily: MONO,
            color: '#94a3b8',
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          padding: '20px 22px',
          fontFamily: MONO,
          fontSize: t.fontSize,
          lineHeight: t.lineHeight,
          height: t.cardHeight - 44,
          overflow: 'hidden',
        }}
      >
        {lines.map((line, i) => (
          <TerminalLineView
            key={i}
            line={line}
            slot={schedule[i]}
            absoluteRelFrame={rel}
            charsPerFrame={charsPerFrame}
            isLast={i === lines.length - 1}
          />
        ))}
      </div>
    </div>
  );
};

const colorFor = (
  kind: TerminalLineKind | undefined,
  t: ReturnType<typeof useEffectTuning>['terminal'],
): string => {
  switch (kind) {
    case 'success':
      return t.successColor;
    case 'error':
      return t.errorColor;
    case 'warning':
      return t.warningColor;
    case 'command':
      return t.normalColor;
    default:
      return t.normalColor;
  }
};

const TerminalLineView: React.FC<{
  line: TerminalLine;
  slot: { startFrame: number; typingFrames: number };
  absoluteRelFrame: number;
  charsPerFrame: number;
  isLast: boolean;
}> = ({ line, slot, absoluteRelFrame, charsPerFrame, isLast }) => {
  const t = useEffectTuning().terminal;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const local = absoluteRelFrame - slot.startFrame;
  if (local < 0) return null;

  const isTyping = t.effect === 'typing' || (t.effect === 'command-run' && line.kind === 'command');
  const visibleChars = isTyping
    ? Math.min(line.text.length, Math.floor(local * charsPerFrame))
    : line.text.length;

  const isDone = visibleChars >= line.text.length;
  const showCursor =
    t.cursorEnabled && isLast && (!isTyping || isDone);

  const cyc = Math.max(0.1, t.cursorBlinkSpeed) * fps;
  const cursorVisible = Math.floor((frame / cyc) % 2) === 0;

  const prefix =
    line.kind === 'command' ? (
      <span style={{ color: '#22c55e' }}>$ </span>
    ) : line.kind === 'error' ? (
      <span style={{ color: t.errorColor }}>✗ </span>
    ) : line.kind === 'success' ? (
      <span style={{ color: t.successColor }}>✓ </span>
    ) : line.kind === 'warning' ? (
      <span style={{ color: t.warningColor }}>⚠ </span>
    ) : null;

  return (
    <div
      style={{
        color: colorFor(line.kind, t),
        whiteSpace: 'pre',
        opacity: t.effect === 'line-output' && !isDone && local < 2 ? 0.5 : 1,
      }}
    >
      {prefix}
      {line.text.slice(0, visibleChars)}
      {showCursor && (
        <span
          style={{
            display: 'inline-block',
            width: 3,
            height: t.fontSize,
            background: t.normalColor,
            marginLeft: 2,
            verticalAlign: 'text-bottom',
            opacity: cursorVisible ? 1 : 0.1,
          }}
        />
      )}
    </div>
  );
};
