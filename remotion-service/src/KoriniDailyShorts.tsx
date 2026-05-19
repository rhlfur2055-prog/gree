// KoriniDailyShorts.tsx
// 코린이의 하루 - AI 의존증 10초 숏폼
// 캐릭터: scene1.webp 고정 (jeonggwichan)
// 모니터 내용만 씬별로 변경

import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  staticFile,
  Video,
} from 'remotion';
import { EffectTuningProvider } from './effects/EffectTuningContext';
import { TypingCodeBlock } from './effects/TypingCodeBlock';
import { TerminalTypingBlock } from './effects/TerminalTypingBlock';
import { vrewCodingClean, mergeTuning } from './effects/tuning';

const FPS = 30;
const SCENE_FRAMES = 60;
export const KORINI_TOTAL_FRAMES = SCENE_FRAMES * 5;

const CHAR_VIDEO = staticFile('korini/char_anim.mp4'); // 캐릭터 고정 (animated)

const SCENE_TITLES = [
  '오늘도 열코딩 중...',
  '😱 401 Unauthorized??',
  '🤯 이게 왜 안 돼!!!',
  '클로드야 살려줘...',
  '✅ 해결됨 (클로드 덕분에)',
];

const codingLines = [
  { text: 'const res = await fetch("/api/user", {' },
  { text: '  method: "GET",' },
  { text: '  headers: {' },
  { text: '    Authorization: `Bearer ${token}`' },
  { text: '  }' },
  { text: '});' },
];

const errorLines = [
  { text: 'GET /api/user', kind: 'command' as const },
  { text: '401 Unauthorized', kind: 'error' as const },
  { text: 'Token expired or invalid', kind: 'error' as const },
  { text: '{"error": "jwt expired"}', kind: 'error' as const },
];

const panicLines = [
  { text: '# 왜 안 돼...', kind: 'command' as const },
  { text: 'tried: refresh, retry, restart...', kind: 'error' as const },
  { text: 'still 401', kind: 'error' as const },
];

const claudeLines = [
  { text: '401 에러 복붙', kind: 'command' as const },
  { text: '클로드 분석 중...', kind: 'output' as const },
  { text: 'JWT 토큰 만료 → refresh 추가', kind: 'success' as const },
];

const successLines = [
  { text: 'GET /api/user', kind: 'command' as const },
  { text: '200 OK', kind: 'success' as const },
  { text: '{"id": 1, "name": "코린이"}', kind: 'success' as const },
];

const SceneTitle: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8, 52, 60], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, [0, 8], [16, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <div style={{
      position: 'absolute', top: 48, left: 0, right: 0,
      textAlign: 'center', opacity, transform: `translateY(${y}px)`,
      fontFamily: 'sans-serif', fontSize: 44, fontWeight: 900,
      color: '#fff', textShadow: '0 2px 16px rgba(0,0,0,0.9)',
      padding: '0 40px',
    }}>
      {text}
    </div>
  );
};

const SceneFade: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 6, 54, 60], [1, 0, 0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{ background: '#000', opacity, pointerEvents: 'none' }} />;
};

const Scene: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <AbsoluteFill style={{ background: '#111' }}>
    {/* 상단: 모니터 화면 영역 */}
    <div style={{
      position: 'absolute', top: 120, left: 40, right: 40,
      height: 780,
    }}>
      {children}
    </div>

    {/* 하단: 캐릭터 고정 */}
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: 900, overflow: 'hidden',
      display: 'flex', justifyContent: 'center',
    }}>
      <Video
        src={CHAR_VIDEO}
        style={{ width: 900, height: 900, objectFit: 'cover' }}
        muted
        loop
      />
    </div>

    {/* 타이틀 */}
    <SceneTitle text={title} />

    {/* 씬 전환 페이드 */}
    <SceneFade />
  </AbsoluteFill>
);

const codeTuning = mergeTuning(vrewCodingClean, {
  code: { enabled: true, effect: 'typing', cardWidth: 1000, cardHeight: 360, fontSize: 22 },
  terminal: { enabled: false },
});

const termTuning = mergeTuning(vrewCodingClean, {
  terminal: { enabled: true, effect: 'command-run', cardWidth: 1000, cardHeight: 280, fontSize: 26 },
  code: { enabled: false },
});

export const KoriniDailyShorts: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Sequence from={0} durationInFrames={SCENE_FRAMES}>
      <EffectTuningProvider tuning={codeTuning}>
        <Scene title={SCENE_TITLES[0]}>
          <TypingCodeBlock lines={codingLines} title="api.ts" startFrame={10} />
        </Scene>
      </EffectTuningProvider>
    </Sequence>

    <Sequence from={SCENE_FRAMES} durationInFrames={SCENE_FRAMES}>
      <EffectTuningProvider tuning={termTuning}>
        <Scene title={SCENE_TITLES[1]}>
          <TerminalTypingBlock lines={errorLines} title="terminal" startFrame={8} />
        </Scene>
      </EffectTuningProvider>
    </Sequence>

    <Sequence from={SCENE_FRAMES * 2} durationInFrames={SCENE_FRAMES}>
      <EffectTuningProvider tuning={termTuning}>
        <Scene title={SCENE_TITLES[2]}>
          <TerminalTypingBlock lines={panicLines} title="terminal" startFrame={8} />
        </Scene>
      </EffectTuningProvider>
    </Sequence>

    <Sequence from={SCENE_FRAMES * 3} durationInFrames={SCENE_FRAMES}>
      <EffectTuningProvider tuning={termTuning}>
        <Scene title={SCENE_TITLES[3]}>
          <TerminalTypingBlock lines={claudeLines} title="claude" startFrame={5} />
        </Scene>
      </EffectTuningProvider>
    </Sequence>

    <Sequence from={SCENE_FRAMES * 4} durationInFrames={SCENE_FRAMES}>
      <EffectTuningProvider tuning={termTuning}>
        <Scene title={SCENE_TITLES[4]}>
          <TerminalTypingBlock lines={successLines} title="terminal" startFrame={5} />
        </Scene>
      </EffectTuningProvider>
    </Sequence>
  </AbsoluteFill>
);

export const defaultKoriniProps = {};
