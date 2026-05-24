import React from 'react';
import { Composition } from 'remotion';
import { KoriniDailyShorts, defaultKoriniProps, KORINI_TOTAL_FRAMES } from './KoriniDailyShorts';
import {
  VibeCodingSecurityShorts,
  defaultVibeCodingSecurityProps,
  VIBE_SECURITY_TOTAL_FRAMES,
} from './VibeCodingSecurityShorts';
import {
  DevFutureShorts,
  defaultDevFutureProps,
  DEV_FUTURE_TOTAL_FRAMES,
} from './DevFutureShorts';
import {
  AISideIncomeShorts,
  defaultAISideIncomeProps,
  AI_SIDE_INCOME_TOTAL_FRAMES,
} from './AISideIncomeShorts';
import {
  AICompareShorts,
  defaultAICompareProps,
  AI_COMPARE_TOTAL_FRAMES,
} from './AICompareShorts';
import {
  AIPromptCompare,
  defaultAIPromptProps,
  AI_PROMPT_TOTAL_FRAMES,
} from './AIPromptCompare';
import {
  VrewCodingCleanShorts,
  defaultVrewCodingCleanProps,
  VREW_CODING_CLEAN_TOTAL_FRAMES,
} from './VrewCodingCleanShorts';
import {
  GreeEmotionShorts,
  GREE_EMOTION_DEFAULTS,
  ALL_EMOTIONS_DEMO,
  GREE_EMOTION_TOTAL_FRAMES,
} from './GreeEmotionShorts';
import {
  DevMemeShorts,
  DEV_MEME_DEFAULTS,
  DEV_MEME_TOTAL_FRAMES,
} from './DevMemeShorts';

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="KoriniDaily"
        component={KoriniDailyShorts as unknown as React.FC<Record<string, unknown>>}
        fps={30}
        width={1080}
        height={1920}
        durationInFrames={KORINI_TOTAL_FRAMES}
        defaultProps={defaultKoriniProps as unknown as Record<string, unknown>}
      />
      <Composition
        id="VibeCodingSecurity"
        component={VibeCodingSecurityShorts as unknown as React.FC<Record<string, unknown>>}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={VIBE_SECURITY_TOTAL_FRAMES}
        defaultProps={defaultVibeCodingSecurityProps as unknown as Record<string, unknown>}
        calculateMetadata={async ({ props }) => {
          const p = props as unknown as { audioDurationSeconds?: number };
          const sec = Number(p.audioDurationSeconds) || 71.5;
          return { durationInFrames: Math.max(FPS, Math.ceil((sec + 0.5) * FPS)) };
        }}
      />
      <Composition
        id="DevFuture"
        component={DevFutureShorts as unknown as React.FC<Record<string, unknown>>}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={DEV_FUTURE_TOTAL_FRAMES}
        defaultProps={defaultDevFutureProps as unknown as Record<string, unknown>}
        calculateMetadata={async ({ props }) => {
          const p = props as unknown as { audioDurationSeconds?: number };
          const sec = Number(p.audioDurationSeconds) || 41.0;
          return { durationInFrames: Math.max(FPS, Math.ceil((sec + 0.5) * FPS)) };
        }}
      />
      <Composition
        id="AIPromptCompare"
        component={AIPromptCompare as unknown as React.FC<Record<string, unknown>>}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={AI_PROMPT_TOTAL_FRAMES}
        defaultProps={defaultAIPromptProps as unknown as Record<string, unknown>}
        calculateMetadata={async ({ props }) => {
          const p = props as unknown as { audioDurationSeconds?: number };
          const sec = Number(p.audioDurationSeconds) || 36.3;
          return { durationInFrames: Math.max(FPS, Math.ceil((sec + 0.5) * FPS)) };
        }}
      />
      <Composition
        id="AICompare"
        component={AICompareShorts as unknown as React.FC<Record<string, unknown>>}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={AI_COMPARE_TOTAL_FRAMES}
        defaultProps={defaultAICompareProps as unknown as Record<string, unknown>}
        calculateMetadata={async ({ props }) => {
          const p = props as unknown as { audioDurationSeconds?: number };
          const sec = Number(p.audioDurationSeconds) || 35.5;
          return { durationInFrames: Math.max(FPS, Math.ceil((sec + 0.5) * FPS)) };
        }}
      />
      <Composition
        id="VrewCodingClean"
        component={VrewCodingCleanShorts as unknown as React.FC<Record<string, unknown>>}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={VREW_CODING_CLEAN_TOTAL_FRAMES}
        defaultProps={defaultVrewCodingCleanProps as unknown as Record<string, unknown>}
        calculateMetadata={async ({ props }) => {
          const p = props as unknown as { durationSeconds?: number; audioDurationSeconds?: number };
          const sec = Number(p.durationSeconds) || Number(p.audioDurationSeconds) || 15;
          return { durationInFrames: Math.max(FPS, Math.ceil(sec * FPS)) };
        }}
      />
      {/* 그리 — 개발자 밈 12 시나리오 (AnimateDiff 모션 클립) */}
      <Composition
        id="DevMemeShorts"
        component={DevMemeShorts as unknown as React.FC<Record<string, unknown>>}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={DEV_MEME_TOTAL_FRAMES}
        defaultProps={DEV_MEME_DEFAULTS as unknown as Record<string, unknown>}
      />
      {/* 그리 12종 표정 데모 */}
      <Composition
        id="GreeAllEmotions"
        component={GreeEmotionShorts as unknown as React.FC<Record<string, unknown>>}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={Math.ceil((ALL_EMOTIONS_DEMO.audioDuration || 24) * FPS)}
        defaultProps={ALL_EMOTIONS_DEMO as unknown as Record<string, unknown>}
      />
      {/* 그리 — 동적 길이 (오디오 + 비트로 자동 산정) */}
      <Composition
        id="GreeEmotion"
        component={GreeEmotionShorts as unknown as React.FC<Record<string, unknown>>}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={GREE_EMOTION_TOTAL_FRAMES}
        defaultProps={GREE_EMOTION_DEFAULTS as unknown as Record<string, unknown>}
        calculateMetadata={async ({ props }) => {
          const p = props as unknown as { audioDuration?: number; beats?: { end: number }[] };
          const fromBeats = p.beats?.length ? Math.max(...p.beats.map((b) => b.end)) : 0;
          const sec = Math.max(Number(p.audioDuration) || 0, fromBeats, 3);
          return { durationInFrames: Math.ceil((sec + 0.3) * FPS) };
        }}
      />
      <Composition
        id="AISideIncome"
        component={AISideIncomeShorts as unknown as React.FC<Record<string, unknown>>}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={AI_SIDE_INCOME_TOTAL_FRAMES}
        defaultProps={defaultAISideIncomeProps as unknown as Record<string, unknown>}
        calculateMetadata={async ({ props }) => {
          const p = props as unknown as { audioDurationSeconds?: number };
          const sec = Number(p.audioDurationSeconds) || 41.0;
          return { durationInFrames: Math.max(FPS, Math.ceil((sec + 0.5) * FPS)) };
        }}
      />
    </>
  );
};
