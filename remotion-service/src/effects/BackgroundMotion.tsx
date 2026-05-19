// effects/BackgroundMotion.tsx
// 깔끔한 절제된 배경. tuning.background 적용.
// - dark-gradient: 다크 그라데이션 + 미세 shift
// - glassmorphism: 어두운 톤 + blurred blob
// - clean-white: 밝은 톤
// - purple-tech: 보라색 그라데이션 + 약한 노이즈
// - terminal: 거의 검은색 + 약한 grid
// - neon-grid: 다크 + 미세 격자

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { useEffectTuning } from './EffectTuningContext';

export const BackgroundMotion: React.FC = () => {
  const t = useEffectTuning().background;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!t.enabled || t.type === 'none') {
    return <AbsoluteFill style={{ background: '#000' }} />;
  }

  const time = (frame / fps) * t.motionSpeed;
  const shift = Math.sin(time) * t.gradientShift * 40;

  const renderByType = () => {
    switch (t.type) {
      case 'dark-gradient':
        return (
          <>
            <AbsoluteFill
              style={{
                background: `linear-gradient(${135 + shift}deg, ${t.secondaryColor} 0%, ${t.accentColor}30 50%, ${t.secondaryColor} 100%)`,
              }}
            />
            {t.blurAmount > 0 && (
              <AbsoluteFill
                style={{
                  background: `radial-gradient(circle at ${50 + shift}% 30%, ${t.accentColor}40 0%, transparent 60%)`,
                  filter: `blur(${t.blurAmount}px)`,
                }}
              />
            )}
          </>
        );
      case 'glassmorphism':
        return (
          <>
            <AbsoluteFill style={{ background: t.secondaryColor }} />
            <div
              style={{
                position: 'absolute',
                top: `${20 + shift}%`,
                left: `${10 - shift * 0.5}%`,
                width: 700,
                height: 700,
                borderRadius: '50%',
                background: `${t.accentColor}55`,
                filter: `blur(${80 + t.blurAmount}px)`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: `${10 + shift}%`,
                right: `${5 + shift * 0.4}%`,
                width: 540,
                height: 540,
                borderRadius: '50%',
                background: `${t.accentColor}33`,
                filter: `blur(${100 + t.blurAmount}px)`,
              }}
            />
          </>
        );
      case 'clean-white':
        return (
          <AbsoluteFill
            style={{
              background: `linear-gradient(${180 + shift}deg, #ffffff 0%, #f4f6fb 100%)`,
            }}
          />
        );
      case 'purple-tech':
        return (
          <>
            <AbsoluteFill
              style={{
                background: `linear-gradient(135deg, #0f172a 0%, ${t.accentColor} 60%, #1e1b4b 100%)`,
                opacity: t.opacity,
              }}
            />
            <AbsoluteFill
              style={{
                background: `radial-gradient(ellipse at ${50 + shift}% 30%, rgba(255,255,255,0.06) 0%, transparent 60%)`,
              }}
            />
          </>
        );
      case 'terminal':
        return (
          <>
            <AbsoluteFill style={{ background: '#020617' }} />
            <AbsoluteFill
              style={{
                backgroundImage:
                  'repeating-linear-gradient(0deg, rgba(34,197,94,0.04) 0px, rgba(34,197,94,0.04) 1px, transparent 1px, transparent 4px)',
                opacity: 0.4,
              }}
            />
          </>
        );
      case 'neon-grid':
        return (
          <>
            <AbsoluteFill style={{ background: t.secondaryColor }} />
            <AbsoluteFill
              style={{
                backgroundImage: `
                  linear-gradient(${t.accentColor}22 1px, transparent 1px),
                  linear-gradient(90deg, ${t.accentColor}22 1px, transparent 1px)`,
                backgroundSize: '80px 80px',
                transform: `translate(${shift}px, ${shift * 0.5}px)`,
                opacity: 0.45,
              }}
            />
          </>
        );
      default:
        return null;
    }
  };

  // particles: motionSpeed/particleCount는 0 기본값 → 절제된 배경
  const particles = t.particleCount > 0 ? (
    <>
      {Array.from({ length: t.particleCount }).map((_, i) => {
        const phase = i * 1.7;
        const x = ((Math.sin(time * t.particleSpeed + phase) + 1) / 2) * 100;
        const y = ((Math.cos(time * t.particleSpeed + phase * 1.3) + 1) / 2) * 100;
        const size = 2 + ((i % 5) / 5) * 4;
        const op = interpolate((i % 7) / 7, [0, 1], [0.06, 0.18]);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              borderRadius: '50%',
              background: t.accentColor,
              opacity: op,
              boxShadow: `0 0 ${size * 2}px ${t.accentColor}88`,
            }}
          />
        );
      })}
    </>
  ) : null;

  return (
    <AbsoluteFill style={{ opacity: t.opacity }}>
      {renderByType()}
      {particles}
    </AbsoluteFill>
  );
};
