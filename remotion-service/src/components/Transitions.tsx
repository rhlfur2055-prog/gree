// Transitions.tsx
// 5종 시네마틱 트랜지션 컴포넌트
// 각 트랜지션은 relFrame 기준 0~DURATION 프레임에서 효과 발생

import React from 'react';
import { interpolate, spring, useVideoConfig } from 'remotion';

// BibeCompareShorts에서만 WhipPan 사용 — types.ts 삭제 후 인라인
export type TransitionType = 'whip_pan' | 'glitch_cut' | 'smash_zoom' | 'light_leak' | 'data_morph' | 'cut';

// 각 트랜지션 지속 프레임 수
export const TRANSITION_DURATION: Record<TransitionType, number> = {
  whip_pan:   10,
  glitch_cut:  8,
  smash_zoom: 10,
  light_leak:  8,
  data_morph: 12,
  cut:         0,
};

interface TransitionProps {
  type?: TransitionType;  // 개별 컴포넌트는 자신의 타입을 알므로 optional
  relFrame: number;       // 트랜지션 시작 기준 프레임
  accent?: string;
}

// ── 1. WhipPan — 좌우 빠른 카메라 이동 (모션 블러 시뮬) ─────────────────
export const WhipPan: React.FC<TransitionProps & { dur?: number }> = ({ relFrame, accent = '#FF3B30', dur }) => {
  const { fps } = useVideoConfig();
  const DUR = dur ?? TRANSITION_DURATION.whip_pan;
  const t = Math.min(1, relFrame / DUR);

  // 화면 전체 가로 스트레치 + 빠른 이동
  const skewX = relFrame < DUR / 2
    ? interpolate(relFrame, [0, DUR / 2], [0, 12])
    : interpolate(relFrame, [DUR / 2, DUR], [12, 0]);

  const blurAmount = relFrame < DUR / 2
    ? interpolate(relFrame, [0, DUR / 2], [0, 24])
    : interpolate(relFrame, [DUR / 2, DUR], [24, 0]);

  const flashOp = interpolate(relFrame, [DUR / 2 - 1, DUR / 2, DUR / 2 + 1], [0, 0.25, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <>
      {/* 모션 블러 오버레이 */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 500,
        transform: `skewX(${skewX}deg)`,
        filter: `blur(${blurAmount}px)`,
        backgroundColor: accent + '08',
        pointerEvents: 'none',
      }} />
      {/* 중앙 섬광 */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 501,
        backgroundColor: '#FFFFFF',
        opacity: flashOp,
        pointerEvents: 'none',
      }} />
    </>
  );
};

// ── 2. GlitchCut — 디지털 RGB 분리 글리치 ──────────────────────────────
export const GlitchCut: React.FC<TransitionProps> = ({ relFrame, accent = '#0A84FF' }) => {
  const DUR = TRANSITION_DURATION.glitch_cut;
  if (relFrame >= DUR) return null;

  // 랜덤 글리치 레이어 (3개의 색 채널 분리)
  const progress = relFrame / DUR;
  const intensity = Math.sin(relFrame * 2.1) * 20 * (1 - progress);
  const rShift = Math.sin(relFrame * 3.7) * 12 * (1 - progress);
  const bShift = Math.sin(relFrame * 5.3 + 1) * 12 * (1 - progress);

  return (
    <>
      {/* Red 채널 오프셋 */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 500,
        backgroundColor: '#FF000022',
        transform: `translateX(${rShift}px)`,
        mixBlendMode: 'screen',
        pointerEvents: 'none',
      }} />
      {/* Blue 채널 오프셋 */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 501,
        backgroundColor: '#0000FF22',
        transform: `translateX(${-bShift}px)`,
        mixBlendMode: 'screen',
        pointerEvents: 'none',
      }} />
      {/* 수평 글리치 라인 */}
      {relFrame % 2 === 0 && (
        <div style={{
          position: 'absolute', zIndex: 502,
          left: 0, right: 0,
          top: `${30 + Math.sin(relFrame * 4.1) * 30}%`,
          height: 3 + Math.abs(Math.sin(relFrame * 7.2)) * 8,
          backgroundColor: accent + 'CC',
          transform: `translateX(${intensity}px)`,
          pointerEvents: 'none',
        }} />
      )}
      {/* 전체 디지털 노이즈 (약하게) */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 499,
        backgroundColor: '#FFFFFF',
        opacity: interpolate(relFrame, [0, 2, DUR - 2, DUR], [0.15, 0, 0, 0.1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        }),
        pointerEvents: 'none',
      }} />
    </>
  );
};

// ── 3. SmashZoom — 충격 줌인 (화면 전체 scale rush) ─────────────────────
export const SmashZoom: React.FC<TransitionProps> = ({ relFrame, accent = '#FF3B30' }) => {
  const { fps } = useVideoConfig();
  const DUR = TRANSITION_DURATION.smash_zoom;
  if (relFrame >= DUR) return null;

  const sp = spring({
    frame: relFrame,
    fps,
    config: { damping: 5, stiffness: 400, mass: 0.3 },
  });

  // 1.3 → 1.0 (튕겨오는 느낌)
  const scale = interpolate(sp, [0, 1], [1.3, 1.0]);
  const op    = interpolate(relFrame, [0, 3], [0, 1], { extrapolateRight: 'clamp' });
  const glow  = interpolate(relFrame, [0, 3, DUR], [0.8, 0, 0], { extrapolateRight: 'clamp' });

  return (
    <>
      {/* 줌 효과 오버레이 (배경 전체에 적용) */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 500,
        transform: `scale(${scale})`,
        backgroundColor: accent,
        opacity: glow * 0.3,
        transformOrigin: 'center center',
        pointerEvents: 'none',
      }} />
      {/* 진입 플래시 */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 501,
        backgroundColor: '#FFFFFF',
        opacity: interpolate(relFrame, [0, 2], [0.4, 0], { extrapolateRight: 'clamp' }),
        pointerEvents: 'none',
      }} />
    </>
  );
};

// ── 4. LightLeak — 빛 새는 전환 (소프트 빛기둥) ────────────────────────
export const LightLeak: React.FC<TransitionProps> = ({ relFrame, accent = '#FF9500' }) => {
  const DUR = TRANSITION_DURATION.light_leak;
  if (relFrame >= DUR) return null;

  const progress = relFrame / DUR;

  // 빛 기둥 위치 (좌상단 → 우하단)
  const leakX = interpolate(progress, [0, 1], [-200, 1280]);
  const leakOp = progress < 0.5
    ? interpolate(progress, [0, 0.5], [0, 0.7])
    : interpolate(progress, [0.5, 1], [0.7, 0]);

  return (
    <>
      {/* 메인 빛 기둥 */}
      <div style={{
        position: 'absolute',
        top: -200, left: leakX - 150,
        width: 300, height: 2400,
        background: `linear-gradient(135deg, transparent, ${accent}44, ${accent}88, ${accent}44, transparent)`,
        transform: 'rotate(-15deg)',
        opacity: leakOp,
        zIndex: 500,
        pointerEvents: 'none',
        filter: 'blur(30px)',
      }} />
      {/* 보조 빛 기둥 (약하게) */}
      <div style={{
        position: 'absolute',
        top: -100, left: leakX,
        width: 120, height: 2400,
        background: `linear-gradient(135deg, transparent, #FFFFFF33, transparent)`,
        transform: 'rotate(-15deg)',
        opacity: leakOp * 0.6,
        zIndex: 501,
        pointerEvents: 'none',
        filter: 'blur(10px)',
      }} />
    </>
  );
};

// ── 5. DataMorph — 숫자/데이터 모핑 전환 ──────────────────────────────
export const DataMorph: React.FC<TransitionProps> = ({ relFrame, accent = '#0A84FF' }) => {
  const DUR = TRANSITION_DURATION.data_morph;
  if (relFrame >= DUR) return null;

  const progress = relFrame / DUR;
  const fadeOp = progress < 0.3
    ? interpolate(progress, [0, 0.3], [0.9, 0])
    : 0;

  // 파티클 격자 효과 (5×8 그리드)
  const particles = Array.from({ length: 8 }, (_, row) =>
    Array.from({ length: 5 }, (_, col) => ({
      key: `${row}-${col}`,
      x: col * 216,
      y: row * 240,
      delay: (row + col) / 13,
    }))
  ).flat();

  return (
    <>
      {/* 페이드아웃 오버레이 */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 500,
        backgroundColor: '#000000',
        opacity: fadeOp,
        pointerEvents: 'none',
      }} />
      {/* 데이터 파티클 격자 */}
      {progress < 0.7 && particles.map(p => {
        const pOp = progress < p.delay
          ? 0
          : interpolate(progress, [p.delay, Math.min(p.delay + 0.2, 0.7)], [0, 0.6], {
              extrapolateRight: 'clamp',
            });
        return (
          <div
            key={p.key}
            style={{
              position: 'absolute',
              left: p.x, top: p.y,
              width: 2, height: 2,
              borderRadius: '50%',
              backgroundColor: accent,
              opacity: pOp,
              boxShadow: `0 0 6px ${accent}`,
              zIndex: 501,
              pointerEvents: 'none',
            }}
          />
        );
      })}
    </>
  );
};

// ── 통합 Transition 렌더러 ──────────────────────────────────────────────
export const TransitionOverlay: React.FC<{
  type: TransitionType;
  relFrame: number;
  accent?: string;
}> = ({ type, relFrame, accent }) => {
  switch (type) {
    case 'whip_pan':   return <WhipPan   relFrame={relFrame} accent={accent} />;
    case 'glitch_cut': return <GlitchCut relFrame={relFrame} accent={accent} />;
    case 'smash_zoom': return <SmashZoom relFrame={relFrame} accent={accent} />;
    case 'light_leak': return <LightLeak relFrame={relFrame} accent={accent} />;
    case 'data_morph': return <DataMorph relFrame={relFrame} accent={accent} />;
    case 'cut':        return null;
    default:           return null;
  }
};
