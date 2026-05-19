// effects/TransitionWrapper.tsx
// scene 진입/퇴장 시 tuning.transition 에 따라 부드러운 전환을 입힌다.
// SceneRenderer에서 각 scene을 감싸 사용한다.
//
// ⚠️ 이 컴포넌트는 항상 <Sequence> 내부에서 사용된다.
// Sequence 내부의 useCurrentFrame()은 0부터 시작하는 sequence-relative frame을 반환하므로,
// startFrame/endFrame (절대 frame)이 아니라 duration(=scene 길이)로 비교해야 한다.

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { useEffectTuning } from './EffectTuningContext';

export interface TransitionWrapperProps {
  /** scene 길이(절대 frame 단위) */
  durationInFrames: number;
  children: React.ReactNode;
}

const easings = (e: string, x: number): number => {
  switch (e) {
    case 'linear':
      return x;
    case 'easeIn':
      return x * x;
    case 'easeOut':
      return 1 - (1 - x) * (1 - x);
    case 'easeInOut':
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    default:
      return x;
  }
};

export const TransitionWrapper: React.FC<TransitionWrapperProps> = ({
  durationInFrames,
  children,
}) => {
  const t = useEffectTuning().transition;
  const frame = useCurrentFrame(); // Sequence-relative: 0..durationInFrames-1
  const { fps } = useVideoConfig();
  const durFrames = Math.max(1, Math.round(t.duration * fps));

  if (!t.enabled || t.type === 'none' || t.type === 'cut') {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  // sequence-relative로 enter/exit 계산
  const enterRaw = interpolate(frame, [0, durFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exitRaw = interpolate(
    frame,
    [Math.max(0, durationInFrames - durFrames), durationInFrames],
    [1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );

  const enter =
    t.easing === 'spring'
      ? spring({
          frame,
          fps,
          config: { damping: 22, stiffness: 110, mass: 0.7 },
          durationInFrames: durFrames + 4,
        })
      : easings(t.easing, enterRaw);

  const exit = easings(t.easing, exitRaw);
  const vis = Math.min(enter, exit);

  // type별 transform
  let transform = '';
  let filter = '';
  let clipPath: string | undefined;

  if (t.type === 'fade') {
    // opacity만
  } else if (t.type === 'slide') {
    const dist = t.slideDistance;
    const direction = t.slideDirection;
    const sign = direction === 'down' || direction === 'right' ? -1 : 1;
    const off = (1 - vis) * dist * sign;
    if (direction === 'up' || direction === 'down') {
      transform += ` translateY(${off}px)`;
    } else {
      transform += ` translateX(${off}px)`;
    }
  } else if (t.type === 'zoom-pop') {
    const s = interpolate(vis, [0, 1], [t.zoomFrom, t.zoomTo]);
    transform += ` scale(${s})`;
  } else if (t.type === 'wipe') {
    const p = vis * 100;
    const ang = t.wipeAngle;
    clipPath = `polygon(0 0, ${p}% 0, ${p}% 100%, 0 100%)`;
    transform += ` rotate(${ang}deg)`;
  }

  if (t.blurAmount > 0) {
    const b = (1 - vis) * t.blurAmount;
    filter = `blur(${b}px)`;
  }

  return (
    <AbsoluteFill
      style={{
        opacity: vis,
        transform: transform || undefined,
        filter: filter || undefined,
        clipPath,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
