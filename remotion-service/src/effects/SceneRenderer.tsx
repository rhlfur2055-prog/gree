// effects/SceneRenderer.tsx
// 1080x1920 Composition 안에서 여러 scene을 순차로 그려준다.
// - 각 scene은 자기만의 override(부분 tuning)를 가질 수 있다
// - TransitionWrapper로 자동 감싼다 → 전환은 tuning.transition으로 통일
// - BackgroundMotion은 scene 외부에서 한 번만 그리고, scene이 override.background.type을 지정하면 그 구간만 다른 배경

import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { EffectTuningProvider } from './EffectTuningContext';
import { BackgroundMotion } from './BackgroundMotion';
import { TransitionWrapper } from './TransitionWrapper';
import type { EffectTuning, PartialEffectTuning } from './tuning';
import { vrewCodingClean, mergeTuning } from './tuning';

export interface SceneSpec {
  /** scene 식별자 (디버깅용) */
  id: string;
  /** 초 단위 — startSeconds, endSeconds 가 우선. 없으면 startFrame, endFrame */
  startSeconds?: number;
  endSeconds?: number;
  startFrame?: number;
  endFrame?: number;
  /** scene만의 override (부분 tuning) */
  override?: PartialEffectTuning;
  /** scene 콘텐츠 */
  content: React.ReactNode;
}

export interface SceneRendererProps {
  /** 전역 effect tuning. 없으면 vrew-coding-clean 사용 */
  tuning?: EffectTuning;
  scenes: SceneSpec[];
  /** 자막 / 글로벌 오버레이 — useEffectTuning을 그대로 쓸 수 있도록 Provider 내부에서 렌더된다 */
  globalOverlay?: React.ReactNode;
}

export const SceneRenderer: React.FC<SceneRendererProps> = ({
  tuning,
  scenes,
  globalOverlay,
}) => {
  const baseTuning = tuning ?? vrewCodingClean;
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      {/* 전역 배경: 첫 scene의 override가 없으면 baseTuning.background 사용 */}
      <EffectTuningProvider tuning={baseTuning}>
        <BackgroundMotion />
      </EffectTuningProvider>

      {scenes.map((scene) => {
        const startF =
          scene.startFrame !== undefined
            ? scene.startFrame
            : Math.round((scene.startSeconds ?? 0) * fps);
        const endF =
          scene.endFrame !== undefined
            ? scene.endFrame
            : Math.round((scene.endSeconds ?? 0) * fps);
        const dur = Math.max(1, endF - startF);
        const merged = mergeTuning(baseTuning, scene.override);

        return (
          <Sequence
            key={scene.id}
            from={startF}
            durationInFrames={dur}
            layout="none"
          >
            <EffectTuningProvider tuning={merged}>
              {/* scene이 background.type을 직접 바꿔야 할 때만 별도 BG 다시 그림 */}
              {scene.override?.background?.type ? <BackgroundMotion /> : null}
              <TransitionWrapper durationInFrames={dur}>
                {scene.content}
              </TransitionWrapper>
            </EffectTuningProvider>
          </Sequence>
        );
      })}

      {/* 자막 등 항상 위에 떠있는 글로벌 오버레이 */}
      {globalOverlay && (
        <EffectTuningProvider tuning={baseTuning}>
          <AbsoluteFill style={{ pointerEvents: 'none' }}>
            {globalOverlay}
          </AbsoluteFill>
        </EffectTuningProvider>
      )}
    </AbsoluteFill>
  );
};
