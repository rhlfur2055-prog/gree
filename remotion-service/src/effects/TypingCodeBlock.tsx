// effects/TypingCodeBlock.tsx
// VS Code 풍 코드 카드. tuning.code 값을 그대로 반영.
// - typing: 글자 단위 타이핑
// - line-by-line: 한 줄씩 페이드 인
// - highlight-line: 모든 줄 즉시 노출 + activeLine만 강조/줌
// - fade-in: 전체 페이드 인
// scrollFollow + zoomToActiveLine: 카드 내부 transform 적용

import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { useEffectTuning } from './EffectTuningContext';

const MONO = "Menlo,'JetBrains Mono','Courier New',monospace";

export interface CodeLine {
  text: string;
  /** highlight를 강제로 true로 두면 그 줄이 active 처럼 보임 */
  highlight?: boolean;
  /** 토큰 색상 hint (간단하게 키워드 prefix만 지원). 비워두면 일반 색 */
  tokens?: Array<{ text: string; color?: string }>;
}

export interface TypingCodeBlockProps {
  lines: CodeLine[];
  /** 어느 프레임에 시작할지(상대). 기본 0 */
  startFrame?: number;
  /** active line index — useFrame에 따라 시간 기반으로 자동 추적할 수도 있게 함수 형태 허용 */
  activeLine?: number | ((frame: number) => number);
  language?: string; // 표시용
  title?: string;    // 카드 상단 파일명
}

const KEYWORD_COLORS: Record<string, string> = {
  const: '#c084fc',
  let: '#c084fc',
  var: '#c084fc',
  function: '#60a5fa',
  return: '#f472b6',
  if: '#f472b6',
  else: '#f472b6',
  import: '#60a5fa',
  from: '#60a5fa',
  export: '#60a5fa',
  default: '#60a5fa',
  await: '#f472b6',
  async: '#f472b6',
  true: '#fb923c',
  false: '#fb923c',
  null: '#fb923c',
  undefined: '#fb923c',
};

// 간단한 토크나이저 — 명시적으로 token이 안 들어왔을 때 fallback
const tokenize = (line: string): Array<{ text: string; color?: string }> => {
  const re = /(\s+|\/\/.*$|"[^"]*"|'[^']*'|`[^`]*`|[A-Za-z_][A-Za-z0-9_]*|[^A-Za-z_\s])/g;
  const out: Array<{ text: string; color?: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const t = m[0];
    if (t.startsWith('//')) {
      out.push({ text: t, color: '#6b7280' });
    } else if (t.startsWith('"') || t.startsWith("'") || t.startsWith('`')) {
      out.push({ text: t, color: '#a3e635' });
    } else if (KEYWORD_COLORS[t]) {
      out.push({ text: t, color: KEYWORD_COLORS[t] });
    } else if (/^[0-9]+$/.test(t)) {
      out.push({ text: t, color: '#fb923c' });
    } else {
      out.push({ text: t });
    }
  }
  return out;
};

export const TypingCodeBlock: React.FC<TypingCodeBlockProps> = ({
  lines,
  startFrame = 0,
  activeLine,
  title,
  language = 'tsx',
}) => {
  const t = useEffectTuning().code;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!t.enabled || t.effect === 'none') return null;

  const rel = frame - startFrame - t.typingDelay * fps;

  // 전체 글자 수 (typing 모드에서만 사용)
  const totalChars = useMemo(
    () => lines.reduce((acc, l) => acc + l.text.length + 1, 0),
    [lines],
  );
  const charsPerFrame = t.typingSpeed / fps;
  const visibleChars = Math.max(0, Math.min(totalChars, rel * charsPerFrame));

  // active line 결정
  const activeIdx = (() => {
    if (typeof activeLine === 'function') return activeLine(frame);
    if (typeof activeLine === 'number') return activeLine;
    if (t.effect === 'typing') {
      // 현재 타이핑 중인 줄
      let acc = 0;
      for (let i = 0; i < lines.length; i++) {
        acc += lines[i].text.length + 1;
        if (visibleChars <= acc) return i;
      }
      return lines.length - 1;
    }
    return -1;
  })();

  // scroll/zoom
  const lineHeightPx = t.fontSize * t.lineHeight;
  const scrollY = (() => {
    if (!t.scrollFollow || activeIdx < 0) return 0;
    const targetCenter = (activeIdx + 0.5) * lineHeightPx;
    const cardCenter = t.cardHeight / 2;
    const want = targetCenter - cardCenter;
    return Math.max(0, want * t.scrollSpeed);
  })();
  const zoomFactor = (() => {
    if (!t.zoomToActiveLine || activeIdx < 0) return 1;
    const sp = spring({
      frame: rel,
      fps,
      config: { damping: 22, stiffness: 100, mass: 0.8 },
      durationInFrames: 20,
    });
    return interpolate(sp, [0, 1], [1, t.zoomScale]);
  })();

  // 누적 글자 계산용
  let charCursor = 0;

  // 카드 진입 애니메이션 (전체)
  const enter = interpolate(rel, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const enterY = interpolate(enter, [0, 1], [16, 0]);

  return (
    <div
      style={{
        width: t.cardWidth,
        height: t.cardHeight,
        background: '#0f172a',
        borderRadius: t.cardRadius,
        overflow: 'hidden',
        boxShadow: `0 ${Math.round(t.cardShadowBlur / 3)}px ${t.cardShadowBlur}px rgba(0,0,0,0.45)`,
        border: '1px solid rgba(255,255,255,0.07)',
        opacity: enter,
        transform: `translateY(${enterY}px) scale(${zoomFactor})`,
        transformOrigin: 'center center',
        position: 'relative',
      }}
    >
      {/* macOS 스타일 헤더 */}
      <div
        style={{
          height: 44,
          background: '#1e293b',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 8,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
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
          {title ?? `untitled.${language}`}
        </div>
      </div>

      {/* 코드 본문 */}
      <div
        style={{
          height: t.cardHeight - 44,
          padding: '20px 22px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: t.fontSize,
            lineHeight: t.lineHeight,
            color: '#e2e8f0',
            transform: `translateY(${-scrollY}px)`,
            transition: 'transform 200ms linear',
            whiteSpace: 'pre',
          }}
        >
          {lines.map((line, i) => {
            const lineStartChars = charCursor;
            charCursor += line.text.length + 1;
            const lineEndChars = charCursor;
            const isActive = i === activeIdx;
            const tokens = line.tokens && line.tokens.length ? line.tokens : tokenize(line.text);

            // 모드별 가시성
            const showLine = (() => {
              if (t.effect === 'fade-in') {
                return interpolate(rel, [0, 30], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                });
              }
              if (t.effect === 'line-by-line') {
                const lineDelay = i * 6;
                return interpolate(rel, [lineDelay, lineDelay + 8], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                });
              }
              return 1;
            })();

            // typing 모드에서 이 줄의 가시 글자 수
            const lineVisibleChars = (() => {
              if (t.effect !== 'typing') return line.text.length;
              const v = visibleChars - lineStartChars;
              if (v <= 0) return 0;
              return Math.min(line.text.length, Math.floor(v));
            })();

            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 8px',
                  borderRadius: 6,
                  background: isActive
                    ? `${t.highlightColor}1F`
                    : 'transparent',
                  boxShadow: isActive ? `0 0 ${t.activeLineGlow}px ${t.highlightColor}55` : 'none',
                  transform: isActive ? `scale(${t.activeLineScale})` : 'scale(1)',
                  transformOrigin: 'left center',
                  transition: 'background 120ms linear, transform 120ms ease-out',
                  opacity: showLine,
                  color: line.highlight ? '#fff' : undefined,
                }}
              >
                <span
                  style={{
                    width: 52,
                    color: '#475569',
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ flex: 1 }}>
                  <RenderTokens
                    tokens={tokens}
                    visibleChars={
                      t.effect === 'typing' ? lineVisibleChars : line.text.length
                    }
                  />
                  {t.effect === 'typing' &&
                    t.cursorEnabled &&
                    visibleChars >= lineStartChars &&
                    visibleChars < lineEndChars && (
                      <Cursor />
                    )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const RenderTokens: React.FC<{
  tokens: Array<{ text: string; color?: string }>;
  visibleChars: number;
}> = ({ tokens, visibleChars }) => {
  let used = 0;
  return (
    <>
      {tokens.map((tk, i) => {
        const remaining = visibleChars - used;
        if (remaining <= 0) return null;
        const slice = tk.text.slice(0, remaining);
        used += tk.text.length;
        return (
          <span key={i} style={{ color: tk.color ?? '#e2e8f0' }}>
            {slice}
          </span>
        );
      })}
    </>
  );
};

const Cursor: React.FC = () => {
  const t = useEffectTuning().code;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!t.cursorEnabled || t.cursorStyle === 'none') return null;
  const cyc = Math.max(0.1, t.cursorBlinkSpeed) * fps;
  const phase = Math.floor((frame / cyc) % 2);
  const visible = phase === 0;
  const style: React.CSSProperties =
    t.cursorStyle === 'block'
      ? {
          display: 'inline-block',
          width: t.fontSize * 0.55,
          height: t.fontSize,
          background: t.cursorColor,
          verticalAlign: 'text-bottom',
          marginLeft: 2,
          opacity: visible ? 0.9 : 0.1,
        }
      : t.cursorStyle === 'underscore'
      ? {
          display: 'inline-block',
          width: t.fontSize * 0.55,
          height: 3,
          background: t.cursorColor,
          verticalAlign: 'baseline',
          marginLeft: 2,
          opacity: visible ? 1 : 0.1,
        }
      : {
          // bar
          display: 'inline-block',
          width: 3,
          height: t.fontSize,
          background: t.cursorColor,
          verticalAlign: 'text-bottom',
          marginLeft: 2,
          opacity: visible ? 1 : 0.1,
        };
  return <span style={style} />;
};
