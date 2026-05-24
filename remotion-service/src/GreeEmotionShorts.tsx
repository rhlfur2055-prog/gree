/**
 * GreeEmotionShorts — 그리 12종 표정 + Whisper 단어 자막 컴포지션
 *
 * 입력 props:
 *   audioFile     — 'audio/<hash>.mp3' (staticFile 기준)
 *   captionsFile  — '/captions.json' 경로 (staticFile 기준)
 *   beats         — [{ emotion, start, end, text }] 표정 타이밍
 *   audioDuration — 초 단위
 */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";
import { loadFont as loadNotoSansKR } from "@remotion/google-fonts/NotoSansKR";

const { fontFamily: KR_FONT } = loadNotoSansKR("normal", { weights: ["400", "700", "900"] });

export type Emotion =
  | "neutral" | "happy" | "sad" | "angry"
  | "surprised" | "embarrassed" | "cry" | "excited"
  | "tired" | "dead_inside" | "panic" | "furious";

export type Beat = {
  emotion: Emotion;
  start: number;  // sec
  end: number;    // sec
  text?: string;  // optional override
};

export type WordCue = { word: string; start: number; end: number };

export type GreeEmotionProps = {
  audioFile?: string;            // ex: "audio/abc.mp3"
  captionsFile?: string;         // ex: "captions.json"
  captions?: WordCue[];          // 또는 직접 주입
  beats: Beat[];
  audioDuration?: number;        // 초
  title?: string;
};

export const GREE_EMOTION_DEFAULTS: GreeEmotionProps = {
  audioDuration: 12,
  title: "오늘의 그리",
  beats: [
    { emotion: "neutral",     start: 0,    end: 2.0 },
    { emotion: "surprised",   start: 2.0,  end: 4.0 },
    { emotion: "happy",       start: 4.0,  end: 6.0 },
    { emotion: "panic",       start: 6.0,  end: 8.0 },
    { emotion: "cry",         start: 8.0,  end: 10.0 },
    { emotion: "dead_inside", start: 10.0, end: 12.0 },
  ],
};

export const GreeEmotionShorts: React.FC<GreeEmotionProps> = (rawProps) => {
  const props = { ...GREE_EMOTION_DEFAULTS, ...rawProps };
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const t = frame / fps; // 현재 시각 (초)

  // 현재 활성 beat
  const beat =
    props.beats.find((b) => t >= b.start && t < b.end) ??
    props.beats[props.beats.length - 1];

  return (
    <AbsoluteFill style={{ fontFamily: KR_FONT, background: "linear-gradient(180deg,#fef9f3 0%,#fde4d4 100%)" }}>
      {/* 1. 배경 도트 패턴 */}
      <DotBackground />

      {/* 2. 오디오 (있을 때만) */}
      {props.audioFile && (
        <Audio src={staticFile(props.audioFile)} />
      )}

      {/* 3. 타이틀 */}
      {props.title && t < 1.5 && <TitleIntro text={props.title} />}

      {/* 4. 캐릭터 (현재 beat 의 표정) */}
      <CharacterStage beat={beat} t={t} />

      {/* 5. 표정 라벨 칩 */}
      <EmotionChip emotion={beat.emotion} key={beat.emotion} />

      {/* 6. 단어 단위 자막 (Whisper) */}
      <CaptionOverlay cues={props.captions ?? []} />

      {/* 7. 프로그레스 바 */}
      <ProgressBar />
    </AbsoluteFill>
  );
};

/* ─────────── 컴포넌트 ─────────── */

const DotBackground: React.FC = () => (
  <AbsoluteFill style={{ opacity: 0.18 }}>
    <svg width="100%" height="100%">
      <defs>
        <pattern id="dots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="20" cy="20" r="2" fill="#d3a070" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" />
    </svg>
  </AbsoluteFill>
);

const TitleIntro: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const opacity = interpolate(frame, [0, 6, fps * 1.2, fps * 1.5], [0, 1, 1, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 180, pointerEvents: "none" }}>
      <div
        style={{
          background: "#1f1f1f",
          color: "white",
          padding: "20px 56px",
          borderRadius: 999,
          fontSize: 72,
          fontWeight: 900,
          letterSpacing: -1.5,
          transform: `translateY(${(1 - enter) * 60}px) scale(${0.85 + enter * 0.15})`,
          opacity,
          boxShadow: "0 24px 48px rgba(0,0,0,0.25)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const CharacterStage: React.FC<{ beat: Beat; t: number }> = ({ beat, t }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  // beat 시작 시점부터의 로컬 프레임
  const localFrame = frame - Math.round(beat.start * fps);
  const enter = spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 100 }, durationInFrames: 18 });
  const breathe = Math.sin((t * 2 * Math.PI) / 2.4) * 8; // 2.4초 주기 호흡

  const src = staticFile(`gree/emotions/${beat.emotion}.png`);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        key={beat.emotion}
        style={{
          width: 820,
          height: 820,
          transform: `translateY(${breathe}px) scale(${0.6 + enter * 0.4})`,
          opacity: enter,
          filter: "drop-shadow(0 32px 48px rgba(0,0,0,0.18))",
        }}
      >
        <Img src={src} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    </AbsoluteFill>
  );
};

const EMOTION_LABEL: Record<Emotion, { ko: string; color: string }> = {
  neutral:     { ko: "무표정",  color: "#a0a0a0" },
  happy:       { ko: "행복",    color: "#ffd166" },
  sad:         { ko: "슬픔",    color: "#88aacc" },
  angry:       { ko: "화남",    color: "#ef6f6c" },
  surprised:   { ko: "놀람",    color: "#9b5de5" },
  embarrassed: { ko: "당황",    color: "#f48fb1" },
  cry:         { ko: "울음",    color: "#5bc0eb" },
  excited:     { ko: "설렘",    color: "#ff77a9" },
  tired:       { ko: "피곤",    color: "#b8b8d1" },
  dead_inside: { ko: "공허",    color: "#4a4a4a" },
  panic:       { ko: "패닉",    color: "#ff8c42" },
  furious:     { ko: "분노",    color: "#d62828" },
};

const EmotionChip: React.FC<{ emotion: Emotion }> = ({ emotion }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 12, stiffness: 140 }, durationInFrames: 14 });
  const { ko, color } = EMOTION_LABEL[emotion];
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 380, pointerEvents: "none" }}>
      <div
        style={{
          background: color,
          color: "white",
          padding: "12px 40px",
          borderRadius: 999,
          fontSize: 48,
          fontWeight: 900,
          letterSpacing: -1,
          transform: `scale(${enter}) translateY(${(1 - enter) * 20}px)`,
          boxShadow: `0 12px 24px ${color}66`,
        }}
      >
        {ko}
      </div>
    </AbsoluteFill>
  );
};

const CaptionOverlay: React.FC<{ cues: WordCue[] }> = ({ cues }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const t = frame / fps;

  if (cues.length === 0) return null;

  // 현재 문장 (앞뒤 ±2초 윈도우 단어 모음)
  const active = cues.findIndex((c) => t >= c.start && t <= c.end);
  if (active < 0) {
    // 가장 가까운 단어 윈도우
    const upcoming = cues.find((c) => c.start > t);
    if (!upcoming || upcoming.start - t > 0.4) return null;
  }

  // 현재 단어 주변 9개 정도를 한 줄로
  const idx = active >= 0 ? active : 0;
  const winStart = Math.max(0, idx - 4);
  const winEnd = Math.min(cues.length, idx + 5);
  const window = cues.slice(winStart, winEnd);

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 220, pointerEvents: "none" }}>
      <div
        style={{
          maxWidth: 960,
          background: "rgba(0,0,0,0.78)",
          color: "white",
          padding: "20px 32px",
          borderRadius: 28,
          fontSize: 56,
          fontWeight: 900,
          lineHeight: 1.25,
          textAlign: "center",
          letterSpacing: -1,
          textShadow: "0 2px 4px rgba(0,0,0,0.5)",
        }}
      >
        {window.map((c, i) => {
          const isActive = t >= c.start && t <= c.end;
          return (
            <span
              key={`${c.word}-${winStart + i}`}
              style={{
                color: isActive ? "#ffd166" : "white",
                margin: "0 6px",
                display: "inline-block",
                transform: isActive ? "translateY(-4px)" : "translateY(0)",
                transition: "none", // frame 기반이므로 transition 금지
              }}
            >
              {c.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = (frame / durationInFrames) * 100;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", pointerEvents: "none" }}>
      <div style={{ width: "100%", height: 6, background: "rgba(0,0,0,0.1)" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "#1f1f1f" }} />
      </div>
    </AbsoluteFill>
  );
};

/* 12종 전체 순회 데모용 props */
export const ALL_EMOTIONS_DEMO: GreeEmotionProps = {
  audioDuration: 24,
  title: "그리 표정 12종",
  beats: ([
    "neutral", "happy", "sad", "angry",
    "surprised", "embarrassed", "cry", "excited",
    "tired", "dead_inside", "panic", "furious",
  ] as Emotion[]).map((emotion, i) => ({
    emotion,
    start: i * 2,
    end: (i + 1) * 2,
  })),
};

export const GREE_EMOTION_TOTAL_FRAMES = 360; // 12s @ 30fps default
