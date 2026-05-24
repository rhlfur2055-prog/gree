/**
 * DevMemeShorts — 개발자 밈 12 시나리오 모션 클립 시퀀스
 *
 * 각 scene은 AnimateDiff로 생성된 2초 mp4 클립 (512×512 @ 8fps)
 * Remotion에서 OffthreadVideo로 재생 + 한국어 라벨 + 자막 overlay
 */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  Series,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";
import { loadFont as loadNotoSansKR } from "@remotion/google-fonts/NotoSansKR";

const { fontFamily: KR_FONT } = loadNotoSansKR("normal", { weights: ["400", "700", "900"] });

export type DevMemeScene = {
  key: string;
  label_ko: string;
  label_en?: string;          // 다국어 자막 (말없이 + 텍스트로 범용성 확보)
  label_jp?: string;
  file: string;
  duration?: number;          // 초, 기본 2.0
  caption?: string;           // 화면 자막 override (없으면 lang 따라 자동)
};

export type DevMemeProps = {
  scenes: DevMemeScene[];
  /** 말없이 컨셉 — TTS 없이 BGM만 (기본 true) */
  silent?: boolean;
  /** BGM 파일 경로 (silent=true일 때 사용, 없으면 무성) */
  bgmFile?: string;
  /** silent=false일 때만 사용되는 내레이션 */
  audioFile?: string;
  /** 자막 언어 — 'ko'/'en'/'jp' */
  lang?: "ko" | "en" | "jp";
  title?: string;
  titleEn?: string;
  titleJp?: string;
  fps?: number;
};

// 12 시나리오 기본값 (catalog.json 키와 1:1) — 한/영/일 자막
const DEFAULT_SCENES: DevMemeScene[] = [
  { key: "compile_error",    file: "compile_error.mp4",
    label_ko: "컴파일 에러",            label_en: "Compile Error",      label_jp: "コンパイルエラー" },
  { key: "it_works",          file: "it_works.mp4",
    label_ko: "내 컴에선 됐는데",       label_en: "Works on my machine",label_jp: "私のPCでは動く" },
  { key: "401_unauthorized",  file: "401_unauthorized.mp4",
    label_ko: "401 Unauthorized",       label_en: "401 Unauthorized",   label_jp: "401 認証失敗" },
  { key: "prod_bug_3am",      file: "prod_bug_3am.mp4",
    label_ko: "새벽 3시 프로덕션 버그", label_en: "3 AM Prod Bug",      label_jp: "深夜3時の本番バグ" },
  { key: "friday_deploy",     file: "friday_deploy.mp4",
    label_ko: "금요일 배포",            label_en: "Friday Deploy",      label_jp: "金曜デプロイ" },
  { key: "code_review",       file: "code_review.mp4",
    label_ko: "코드 리뷰",              label_en: "Code Review",        label_jp: "コードレビュー" },
  { key: "git_force_push",    file: "git_force_push.mp4",
    label_ko: "git push --force",       label_en: "git push --force",   label_jp: "git push --force" },
  { key: "stack_overflow",    file: "stack_overflow.mp4",
    label_ko: "스택오버플로우",         label_en: "Stack Overflow ftw", label_jp: "Stack Overflow最高" },
  { key: "why_works",         file: "why_works.mp4",
    label_ko: "왜 되지?",               label_en: "Why does it work?",  label_jp: "なぜ動く?" },
  { key: "null_pointer",      file: "null_pointer.mp4",
    label_ko: "NullPointerException",   label_en: "NullPointerException",label_jp: "NullPointerException" },
  { key: "merge_conflict",    file: "merge_conflict.mp4",
    label_ko: "머지 컨플릭트",          label_en: "Merge Conflict",     label_jp: "マージコンフリクト" },
  { key: "ship_friday",       file: "ship_friday.mp4",
    label_ko: "금요일 칼퇴",            label_en: "Friday 6PM Exit",    label_jp: "金曜定時退社" },
];

export const DEV_MEME_DEFAULTS: DevMemeProps = {
  scenes: DEFAULT_SCENES,
  silent: true,                   // 말없이 = 범용성 (기본)
  lang: "ko",
  title:   "개발자의 하루",
  titleEn: "A Developer's Day",
  titleJp: "開発者の一日",
  fps: 30,
};

function getLabel(scene: DevMemeScene, lang: "ko" | "en" | "jp"): string {
  if (scene.caption) return scene.caption;
  if (lang === "en" && scene.label_en) return scene.label_en;
  if (lang === "jp" && scene.label_jp) return scene.label_jp;
  return scene.label_ko;
}

function getTitle(props: DevMemeProps): string {
  if (props.lang === "en" && props.titleEn) return props.titleEn;
  if (props.lang === "jp" && props.titleJp) return props.titleJp;
  return props.title || "";
}

export const DevMemeShorts: React.FC<DevMemeProps> = (rawProps) => {
  const props = { ...DEV_MEME_DEFAULTS, ...rawProps };
  const { fps } = useVideoConfig();
  const lang = props.lang || "ko";

  // 인트로 1초 + 각 scene 2.5초씩
  const INTRO_FRAMES = Math.round(1.0 * fps);
  const SCENE_FRAMES = Math.round(2.5 * fps);

  // silent 모드: BGM만 / 일반 모드: 내레이션
  const audioSrc = props.silent ? props.bgmFile : props.audioFile;

  return (
    <AbsoluteFill style={{ fontFamily: KR_FONT, background: "#0a0a0f" }}>
      {audioSrc && <Audio src={staticFile(audioSrc)} volume={props.silent ? 0.4 : 1.0} />}

      <Series>
        {/* 인트로 */}
        <Series.Sequence durationInFrames={INTRO_FRAMES}>
          <IntroScene title={getTitle(props)} silent={props.silent} />
        </Series.Sequence>

        {/* 12 시나리오 */}
        {props.scenes.map((scene, idx) => (
          <Series.Sequence key={scene.key} durationInFrames={SCENE_FRAMES}>
            <DevScene
              scene={scene}
              caption={getLabel(scene, lang)}
              index={idx + 1}
              total={props.scenes.length}
            />
          </Series.Sequence>
        ))}

        {/* 아웃트로 */}
        <Series.Sequence durationInFrames={Math.round(1.5 * fps)}>
          <OutroScene lang={lang} />
        </Series.Sequence>
      </Series>

      <ProgressBar />
    </AbsoluteFill>
  );
};

/* ─────────── Scenes ─────────── */

const IntroScene: React.FC<{ title: string; silent?: boolean }> = ({ title, silent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 빠른 진입 (8프레임), 막판 5프레임 페이드 아웃
  const enter = spring({ frame, fps, config: { damping: 12, stiffness: 200 }, durationInFrames: 8 });
  const exit = interpolate(frame, [fps * 1 - 5, fps * 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(enter, exit);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: "#0a0a0f", flexDirection: "column" }}>
      <div
        style={{
          color: "#fff",
          fontSize: 96,
          fontWeight: 900,
          letterSpacing: -2,
          transform: `scale(${0.7 + enter * 0.3})`,
          opacity,
          textShadow: "0 4px 24px rgba(255,255,255,0.1)",
          textAlign: "center",
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: "#888",
          fontSize: 36,
          marginTop: 24,
          opacity: opacity * 0.7,
          letterSpacing: -0.5,
        }}
      >
        {silent ? "♪ no words. just vibes ♪" : "— 그리의 개발자 일기 —"}
      </div>
    </AbsoluteFill>
  );
};

const DevScene: React.FC<{ scene: DevMemeScene; caption: string; index: number; total: number }> = ({ scene, caption, index, total }) => {
  const { fps, width, height } = useVideoConfig();
  const frame = useCurrentFrame();

  // 진입 애니메이션 (0~12프레임)
  const enter = spring({ frame, fps, config: { damping: 14 }, durationInFrames: 14 });
  // 퇴장 페이드 (마지막 8프레임)
  const totalFrames = Math.round(2.5 * fps);
  const exit = interpolate(frame, [totalFrames - 8, totalFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(enter, exit);

  // 클립이 2초, scene이 2.5초 → 처음엔 한 번 재생 후 마지막 프레임 유지
  const videoStartFrom = 0;

  return (
    <AbsoluteFill style={{ background: "#0a0a0f", justifyContent: "center", alignItems: "center" }}>
      {/* 영상 클립 — 정사각형(512×512)을 세로 1080×1920에 맞춰 중앙 배치 */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: width,
          height: width, // 1080×1080 정사각형 영역
          transform: `translate(-50%, -50%) scale(${0.85 + enter * 0.15})`,
          opacity,
          overflow: "hidden",
        }}
      >
        <OffthreadVideo
          src={staticFile(`gree/dev_memes/${scene.file}`)}
          startFrom={videoStartFrom}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          muted
        />
      </div>

      {/* 상단: 인덱스 칩 */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: "50%",
          transform: `translateX(-50%) translateY(${(1 - enter) * -30}px)`,
          opacity,
          background: "rgba(255,255,255,0.95)",
          color: "#0a0a0f",
          padding: "12px 32px",
          borderRadius: 999,
          fontSize: 36,
          fontWeight: 900,
          letterSpacing: -1,
        }}
      >
        #{String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </div>

      {/* 하단: 한국어 라벨 */}
      <div
        style={{
          position: "absolute",
          bottom: 200,
          left: "50%",
          transform: `translateX(-50%) translateY(${(1 - enter) * 40}px)`,
          opacity,
          background: "linear-gradient(135deg, #ff006e 0%, #8338ec 100%)",
          color: "#fff",
          padding: "20px 56px",
          borderRadius: 28,
          fontSize: 72,
          fontWeight: 900,
          letterSpacing: -1.5,
          maxWidth: "90%",
          textAlign: "center",
          boxShadow: "0 24px 48px rgba(131, 56, 236, 0.4)",
          whiteSpace: "nowrap",
        }}
      >
        {caption}
      </div>

      {/* 좌측 emotion ref 작은 칩 */}
      {scene.key && (
        <div
          style={{
            position: "absolute",
            bottom: 120,
            left: 60,
            opacity: opacity * 0.5,
            color: "#888",
            fontSize: 24,
            fontFamily: "monospace",
          }}
        >
          {scene.key}
        </div>
      )}
    </AbsoluteFill>
  );
};

const OUTRO_TEXT: Record<"ko" | "en" | "jp", { main: string; cta: string }> = {
  ko: { main: "오늘도 디버깅 화이팅",  cta: "♥ 구독" },
  en: { main: "Keep debugging today", cta: "♥ Subscribe" },
  jp: { main: "今日もデバッグ頑張れ", cta: "♥ チャンネル登録" },
};

const OutroScene: React.FC<{ lang: "ko" | "en" | "jp" }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 12, stiffness: 200 }, durationInFrames: 8 });
  const text = OUTRO_TEXT[lang] || OUTRO_TEXT.ko;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: "#0a0a0f" }}>
      <div style={{
        color: "#fff",
        fontSize: 80,
        fontWeight: 900,
        transform: `scale(${0.7 + enter * 0.3})`,
        opacity: enter,
        textAlign: "center",
        lineHeight: 1.3,
      }}>
        {text.main}<br />
        <span style={{
          color: "#fff",
          background: "linear-gradient(135deg, #ff006e 0%, #8338ec 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          fontSize: 96,
        }}>{text.cta}</span>
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
      <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,0.1)" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #ff006e, #8338ec, #3a86ff)" }} />
      </div>
    </AbsoluteFill>
  );
};

// 총 길이 = 인트로(1s) + 12 × 2.5s + 아웃트로(1.5s) = 32.5초
export const DEV_MEME_TOTAL_FRAMES = Math.ceil((1.0 + 12 * 2.5 + 1.5) * 30);
