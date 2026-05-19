// effects/VrewCaption.tsx
// Vrew 스타일 깔끔한 자막. tuning.caption 값을 100% 반영.
// - vrew-chip: 흰색 칩 + 강조 단어만 노란 그라데이션
// - big-bold: 큰 글씨 fade+slide+scale
// - typing: 글자별 타이핑
// - karaoke: 단어 단위 강조
// - word-pop: 단어가 등장할 때 살짝 pop
// - minimal: 페이드만, 모션 최소

import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { useEffectTuning } from './EffectTuningContext';

export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
  highlight?: boolean;
}

export interface CaptionChunk {
  startMs: number;
  endMs: number;
  words: CaptionWord[];
}

export interface VrewCaptionProps {
  /** 단어 단위 타이밍. 없으면 chunks 사용 */
  words?: CaptionWord[];
  /** 미리 chunk 단위로 들어오는 경우 */
  chunks?: CaptionChunk[];
  /** 자막을 강제로 위치시키고 싶을 때 tuning.position 덮어쓰기 */
  positionOverride?: 'top' | 'center' | 'bottom';
}

// 한 줄 maxChars 기준으로 단어를 chunk로 분리.
// 단어 자체가 maxChars를 초과하면 그 단어를 글자 단위로 강제 분할(시간도 균등 분배).
const splitLongWord = (w: CaptionWord, maxChars: number): CaptionWord[] => {
  if (w.text.length <= maxChars) return [w];
  const out: CaptionWord[] = [];
  const totalMs = w.endMs - w.startMs;
  const parts = Math.ceil(w.text.length / maxChars);
  const perMs = totalMs / parts;
  for (let i = 0; i < parts; i++) {
    out.push({
      text: w.text.slice(i * maxChars, (i + 1) * maxChars),
      startMs: Math.round(w.startMs + i * perMs),
      endMs:   Math.round(w.startMs + (i + 1) * perMs),
      highlight: w.highlight,
    });
  }
  return out;
};

// startMs/endMs는 chunk 안에서 가장 빠른 word, 가장 늦은 word 기준.
const splitIntoChunks = (words: CaptionWord[], maxChars: number): CaptionChunk[] => {
  // 1) 너무 긴 단어 사전 분할
  const expanded: CaptionWord[] = [];
  for (const w of words) expanded.push(...splitLongWord(w, maxChars));

  // 2) maxChars 기준으로 chunk 묶기 (단어 길이 초과 안 함)
  const chunks: CaptionChunk[] = [];
  let cur: CaptionWord[] = [];
  let curLen = 0;
  for (const w of expanded) {
    const wLen = w.text.length;
    if (cur.length > 0 && curLen + wLen + 1 > maxChars) {
      chunks.push({
        startMs: cur[0].startMs,
        endMs: cur[cur.length - 1].endMs,
        words: cur,
      });
      cur = [];
      curLen = 0;
    }
    cur.push(w);
    curLen += wLen + 1;
  }
  if (cur.length > 0) {
    chunks.push({
      startMs: cur[0].startMs,
      endMs: cur[cur.length - 1].endMs,
      words: cur,
    });
  }
  return chunks;
};

const FONT = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif";

export const VrewCaption: React.FC<VrewCaptionProps> = ({
  words,
  chunks: chunksProp,
  positionOverride,
}) => {
  const t = useEffectTuning().caption;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const chunks = useMemo<CaptionChunk[]>(() => {
    if (chunksProp && chunksProp.length) return chunksProp;
    if (words && words.length) return splitIntoChunks(words, t.maxCharsPerLine);
    return [];
  }, [chunksProp, words, t.maxCharsPerLine]);

  if (!t.enabled || t.effect === 'none' || chunks.length === 0) return null;

  const currentMs = (frame / fps) * 1000;
  const chunk = chunks.find((c) => currentMs >= c.startMs && currentMs < c.endMs);
  if (!chunk) return null;

  // 페이지 등장/퇴장 progress
  const appearFrames = Math.max(1, t.appearDuration * fps);
  const disappearFrames = Math.max(1, t.disappearDuration * fps);
  const startFrame = (chunk.startMs / 1000) * fps;
  const endFrame = (chunk.endMs / 1000) * fps;

  const enterProg = interpolate(
    frame,
    [startFrame, startFrame + appearFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const exitProg = interpolate(
    frame,
    [endFrame - disappearFrames, endFrame],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const visibility = Math.min(enterProg, exitProg);

  // bounceIntensity는 spring damping에 영향 (강도가 높을수록 damping 낮음 = 더 튕김)
  const bounceSpring = spring({
    frame: frame - startFrame,
    fps,
    config: {
      damping: 22 - t.bounceIntensity * 14, // 0 → 22, 1 → 8
      stiffness: 220,
      mass: 0.6,
    },
    durationInFrames: appearFrames + 4,
  });
  const enterScale = interpolate(bounceSpring, [0, 1], [0.96, 1]);
  const enterY = interpolate(visibility, [0, 1], [t.slideDistance, 0]);

  // ── 위치 계산 ──
  const pos = positionOverride ?? t.position;
  const positionStyle: React.CSSProperties = (() => {
    if (pos === 'top') {
      return { top: 220 + t.offsetY, left: 0, right: 0 };
    }
    if (pos === 'center') {
      return {
        top: '50%',
        left: 0,
        right: 0,
        transform: `translateY(calc(-50% + ${enterY + t.offsetY}px))`,
      };
    }
    // bottom (default)
    return { bottom: 420 - t.offsetY, left: 0, right: 0 };
  })();

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyle,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: t.chipGap,
        padding: '0 48px',
        opacity: visibility,
        transform:
          pos === 'center'
            ? positionStyle.transform
            : `translateY(${enterY}px) scale(${enterScale})`,
        zIndex: 100,
      }}
    >
      {chunk.words.map((w, i) => (
        <CaptionWordView
          key={i}
          word={w}
          currentMs={currentMs}
          startMs={chunk.startMs}
          fps={fps}
        />
      ))}
    </div>
  );
};

const CaptionWordView: React.FC<{
  word: CaptionWord;
  currentMs: number;
  startMs: number;
  fps: number;
}> = ({ word, currentMs, startMs, fps }) => {
  const t = useEffectTuning().caption;
  const frame = useCurrentFrame();

  const isPast = currentMs >= word.endMs;
  const isActive = currentMs >= word.startMs && currentMs < word.endMs;
  const wordStartFrame = (word.startMs / 1000) * fps;
  const relFrame = frame - wordStartFrame;

  // typing / karaoke / word-pop: 각 단어 진입 시 pop scale
  const pop = spring({
    frame: relFrame,
    fps,
    config: { damping: 18 - t.bounceIntensity * 10, stiffness: 320, mass: 0.5 },
    durationInFrames: Math.max(6, t.appearDuration * fps),
  });
  const popScale = interpolate(pop, [0, 1], [1, t.popScale]);
  const activeScale = isActive ? t.activeWordScale : 1;

  // typing 모드: word.startMs 이전에는 글자 안 보임
  const visibleOpacity = (() => {
    if (t.effect === 'typing') {
      if (currentMs < word.startMs) return 0;
      return isPast ? t.inactiveOpacity : 1;
    }
    if (t.effect === 'karaoke') {
      return isActive ? 1 : isPast ? t.inactiveOpacity : t.inactiveOpacity * 0.9;
    }
    if (t.effect === 'minimal') {
      return 1;
    }
    if (t.effect === 'big-bold') {
      return 1;
    }
    // vrew-chip / word-pop
    return currentMs < word.startMs ? t.inactiveOpacity : isPast ? t.inactiveOpacity : 1;
  })();

  // 강조 단어 배경 (highlight)
  const isHL = !!word.highlight;
  const useChip = t.effect === 'vrew-chip';
  const isKaraoke = t.effect === 'karaoke';
  const showBG = useChip || isHL;
  const bg = isHL ? t.highlightBackground : (useChip ? t.chipBackground : 'transparent');

  // big-bold: 칩 없이 큰 흰 글자 + textShadow
  const isBigBold = t.effect === 'big-bold';
  const isMinimal = t.effect === 'minimal';

  // word-pop 전용: 단어 진입 시 popScale 적용
  const finalScale =
    t.effect === 'word-pop'
      ? popScale * activeScale
      : activeScale;

  // karaoke: 활성 단어는 highlight 색(노란색), 비활성은 흰색 반투명
  const color = (() => {
    if (isKaraoke) {
      if (isActive) return t.highlightTextColor;
      return isPast ? t.textColor : t.textColor;
    }
    return isHL ? t.highlightTextColor : t.textColor;
  })();

  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: FONT,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        lineHeight: t.lineHeight,
        letterSpacing: '-1px',
        color: isBigBold ? '#FFFFFF' : color,
        background: isMinimal || isBigBold ? 'transparent' : (showBG ? bg : 'transparent'),
        padding: isMinimal || isBigBold ? 0 : `${t.chipPaddingY}px ${t.chipPaddingX}px`,
        borderRadius: isMinimal || isBigBold ? 0 : t.chipRadius,
        boxShadow:
          isMinimal || isBigBold || isKaraoke
            ? 'none'
            : `0 ${Math.round(t.chipShadowBlur / 4)}px ${t.chipShadowBlur}px rgba(0,0,0,0.22)`,
        textShadow: isBigBold
          ? `0 4px 18px rgba(0,0,0,0.55), 0 0 24px ${isHL ? '#facc15aa' : 'rgba(255,255,255,0.18)'}`
          : isKaraoke && isActive
          ? `0 0 22px ${t.highlightTextColor}cc, 0 2px 10px rgba(0,0,0,0.6)`
          : isKaraoke
          ? '0 2px 8px rgba(0,0,0,0.55)'
          : 'none',
        transform: `scale(${finalScale})`,
        transformOrigin: 'center bottom',
        transition: 'color 80ms linear, background 80ms linear',
        opacity: visibleOpacity,
        whiteSpace: 'pre',
      }}
    >
      {word.text}
    </span>
  );
};
