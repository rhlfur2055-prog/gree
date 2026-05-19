import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { createTikTokStyleCaptions } from '@remotion/captions';

export interface RawCaption {
  text: string;
  startMs: number;
  endMs: number;
}

interface CaptionToken {
  text: string;
  fromMs: number;
  toMs: number;
}

interface CaptionPage {
  startMs: number;
  durationMs: number;
  tokens: CaptionToken[];
}

interface CaptionOverlayProps {
  captions: RawCaption[];
  // 스타일
  accent?: string;
  fontSize?: number;
  position?: 'top' | 'center' | 'bottom';
  wordsPerPage?: number; // combineTokensWithinMilliseconds 조정용 (ms)
}

const ActiveWord: React.FC<{
  text: string;
  accent: string;
  fontSize: number;
  entryFrame: number;
}> = ({ text, accent, fontSize, entryFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const relFrame = frame - entryFrame;
  const scale = spring({
    frame: relFrame,
    fps,
    config: { stiffness: 400, damping: 22, mass: 0.6 },
    from: 0.75,
    to: 1,
  });

  return (
    <span style={{
      color: accent,
      transform: `scale(${scale})`,
      display: 'inline-block',
      textShadow: `0 0 20px ${accent}99, 0 0 40px ${accent}44`,
      fontWeight: 900,
    }}>
      {text}
    </span>
  );
};

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({
  captions,
  accent = '#FF3B30',
  fontSize = 52,
  position = 'bottom',
  wordsPerPage = 1500,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentMs = (frame / fps) * 1000;

  // TikTok 스타일 페이지 생성
  const { pages } = createTikTokStyleCaptions({
    captions: captions.map((c) => ({
      text: c.text,
      startMs: c.startMs,
      endMs: c.endMs,
      confidence: null,
      timestampMs: null,
    })),
    combineTokensWithinMilliseconds: wordsPerPage,
  }) as { pages: CaptionPage[] };

  // 현재 페이지 찾기
  const currentPage = pages.find(
    (p) => currentMs >= p.startMs && currentMs < p.startMs + p.durationMs
  );

  if (!currentPage) return null;

  // 페이지 등장 애니메이션
  const pageStartFrame = Math.floor((currentPage.startMs / 1000) * fps);
  const relFrame = frame - pageStartFrame;
  const pageOpacity = interpolate(relFrame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  const pageY = interpolate(relFrame, [0, 8], [12, 0], { extrapolateRight: 'clamp' });

  // 숏츠 안전 영역: 하단 400px은 유튜브 UI가 덮음
  const positionStyle: React.CSSProperties =
    position === 'bottom'
      ? { bottom: 400 }
      : position === 'top'
      ? { top: 200 }
      : { top: '50%', transform: `translateY(calc(-50% + ${pageY}px))` };

  return (
    <div style={{
      position: 'absolute',
      left: 0, right: 0,
      ...positionStyle,
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '0 8px',
      padding: '12px 48px 16px',
      opacity: pageOpacity,
      transform: position !== 'center' ? `translateY(${pageY}px)` : undefined,
      zIndex: 100,
      background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(8px)',
      borderRadius: 20,
      marginLeft: 32,
      marginRight: 32,
    }}>
      {(() => {
        const remaining = currentPage.tokens.filter((t) => currentMs < t.toMs);
        const activeIdx = remaining.findIndex((t) => currentMs >= t.fromMs && currentMs < t.toMs);
        // active 기준 앞뒤 1개씩만 표시 (최대 3개)
        const start = Math.max(0, activeIdx === -1 ? 0 : activeIdx);
        const visible = remaining.slice(start, start + 3);
        return visible;
      })().map((token, i) => {
          const isActive = currentMs >= token.fromMs && currentMs < token.toMs;
          const tokenStartFrame = Math.floor((token.fromMs / 1000) * fps);

          return (
            <span
              key={i}
              style={{
                fontSize,
                fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
                fontWeight: isActive ? 900 : 600,
                lineHeight: 1.4,
                letterSpacing: '-1px',
                padding: '2px 8px',
                borderRadius: 10,
                background: isActive ? `${accent}44` : 'transparent',
                color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.5)',
                transition: 'color 0.1s, background 0.1s',
              }}
            >
              {isActive ? (
                <ActiveWord
                  text={token.text}
                  accent={accent}
                  fontSize={fontSize}
                  entryFrame={tokenStartFrame}
                />
              ) : (
                token.text
              )}
            </span>
          );
        })}
    </div>
  );
};
