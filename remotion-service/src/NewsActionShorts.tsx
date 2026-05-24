/**
 * NewsActionShorts — 최신 IT 뉴스를 그리 캐릭터(들)가 직접 재연하는 silent shorts
 *
 * 컨셉:
 *   - 뉴스 사건을 단순 보도하는 게 아니라, 그리 2~3명이 사무실에서 그 사건을 직접 연기
 *   - 풀스크린 AnimateDiff 클립 시퀀스 (5장면)
 *   - 말없이 + 다국어 자막 (ko/en/jp)
 *   - 인트로: 뉴스 헤드라인 / 아웃트로: "더보기 →"
 *
 * 5장면 표준 구조 (catalog.json에서 입력):
 *   01 정상 → 02 사건 발생 → 03 진행 → 04 피해/리액션 → 05 결과/공허
 */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Series,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";
import { loadFont as loadNotoSansKR } from "@remotion/google-fonts/NotoSansKR";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";

const { fontFamily: KR_FONT } = loadNotoSansKR("normal", { weights: ["400", "700", "900"] });
const { fontFamily: MONO_FONT } = loadJetBrainsMono("normal", { weights: ["400", "700"] });

export type NewsScene = {
  key: string;
  file: string;           // mp4 파일명 (news_actions/<news_key>/ 기준)
  caption_ko: string;
  caption_en?: string;
  caption_jp?: string;
  duration?: number;      // 초, 기본 5.0
};

export type NewsActionProps = {
  news_key: string;       // 폴더명 (news_actions/<key>/)
  category?: string;      // "보안유출", "장애", "출시" 등
  headline_ko: string;
  headline_en?: string;
  headline_jp?: string;
  scenes: NewsScene[];
  lang?: "ko" | "en" | "jp";
  bgmFile?: string;
  silent?: boolean;
  fps?: number;
};

/* ─────────── 기본 props (OpenAI breach 데모) ─────────── */
export const NEWS_ACTION_DEMO: NewsActionProps = {
  news_key: "openai_breach",
  category: "보안유출",
  headline_ko: "OpenAI 사용자 데이터 유출",
  headline_en: "OpenAI user data breach",
  headline_jp: "OpenAIユーザーデータ流出",
  silent: true,
  lang: "ko",
  fps: 30,
  scenes: [
    { key: "scene_01_normal",     file: "scene_01_normal.mp4",
      caption_ko: "여느 날과 같은 오피스",      caption_en: "Just another day",          caption_jp: "いつものオフィス" },
    { key: "scene_02_intrusion",  file: "scene_02_intrusion.mp4",
      caption_ko: "갑자기 침입한 외부인",       caption_en: "An intruder appears",       caption_jp: "突然侵入者が" },
    { key: "scene_03_theft",      file: "scene_03_theft.mp4",
      caption_ko: "데이터가 빠져나가고 있다",   caption_en: "Data being stolen",         caption_jp: "データ流出中" },
    { key: "scene_04_panic",      file: "scene_04_panic.mp4",
      caption_ko: "이미 1,000명이 털렸다",      caption_en: "1,000 users breached",     caption_jp: "1,000人が被害" },
    { key: "scene_05_aftermath",  file: "scene_05_aftermath.mp4",
      caption_ko: "남은건 공허뿐",              caption_en: "Only emptiness remains",   caption_jp: "残ったのは空虚だけ" },
  ],
};

/* ─────────── 메인 컴포지션 ─────────── */
export const NewsActionShorts: React.FC<NewsActionProps> = (raw) => {
  const props = { ...NEWS_ACTION_DEMO, ...raw };
  const { fps } = useVideoConfig();
  const lang = props.lang || "ko";

  const INTRO_FRAMES = Math.round(1.8 * fps);
  const SCENE_FRAMES = Math.round(5.0 * fps);
  const OUTRO_FRAMES = Math.round(1.5 * fps);

  return (
    <AbsoluteFill style={{ fontFamily: KR_FONT, background: "#000" }}>
      {props.silent && props.bgmFile && (
        <Audio src={staticFile(props.bgmFile)} volume={0.4} />
      )}

      <Series>
        {/* 인트로: 헤드라인 */}
        <Series.Sequence durationInFrames={INTRO_FRAMES}>
          <HeadlineSlate
            headline={headlineForLang(props, lang)}
            category={props.category}
            lang={lang}
          />
        </Series.Sequence>

        {/* 5 장면 */}
        {props.scenes.map((scene, i) => (
          <Series.Sequence key={scene.key} durationInFrames={Math.round((scene.duration || 5.0) * fps)}>
            <SceneShot
              scene={scene}
              newsKey={props.news_key}
              caption={captionForLang(scene, lang)}
              index={i + 1}
              total={props.scenes.length}
              category={props.category}
              durationSec={scene.duration || 5.0}
            />
          </Series.Sequence>
        ))}

        {/* 아웃트로 */}
        <Series.Sequence durationInFrames={OUTRO_FRAMES}>
          <OutroSlate lang={lang} />
        </Series.Sequence>
      </Series>

      <ProgressBar />
    </AbsoluteFill>
  );
};

function headlineForLang(p: NewsActionProps, lang: "ko" | "en" | "jp"): string {
  if (lang === "en" && p.headline_en) return p.headline_en;
  if (lang === "jp" && p.headline_jp) return p.headline_jp;
  return p.headline_ko;
}
function captionForLang(s: NewsScene, lang: "ko" | "en" | "jp"): string {
  if (lang === "en" && s.caption_en) return s.caption_en;
  if (lang === "jp" && s.caption_jp) return s.caption_jp;
  return s.caption_ko;
}

/* ─────────── Headline Slate ─────────── */
const HeadlineSlate: React.FC<{ headline: string; category?: string; lang: "ko" | "en" | "jp" }> = ({ headline, category, lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 12, stiffness: 200 }, durationInFrames: 12 });
  const exit  = interpolate(frame, [fps * 1.5, fps * 1.8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(enter, exit);

  const label = lang === "en" ? "BREAKING" : lang === "jp" ? "速報" : "속보";

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: "#0a0a0f", padding: 64 }}>
      {/* 상단 카테고리 + LIVE 표시 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        opacity, transform: `translateY(${(1 - enter) * -30}px)`,
        marginBottom: 32,
      }}>
        <div style={{
          background: "#ff0033", color: "#fff",
          padding: "8px 20px", borderRadius: 6,
          fontWeight: 900, fontSize: 28, letterSpacing: 1,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{
            width: 12, height: 12, borderRadius: "50%", background: "#fff",
            animation: "pulse 1s infinite",
          }} />
          {label}
        </div>
        {category && (
          <div style={{
            background: "rgba(255,255,255,0.08)", color: "#ccc",
            padding: "8px 20px", borderRadius: 6,
            fontWeight: 700, fontSize: 24, fontFamily: MONO_FONT,
          }}>
            #{category}
          </div>
        )}
      </div>

      {/* 헤드라인 */}
      <div style={{
        color: "#fff",
        fontSize: 96, fontWeight: 900, letterSpacing: -2,
        textAlign: "center", lineHeight: 1.15,
        transform: `scale(${0.85 + enter * 0.15})`,
        opacity,
        maxWidth: "90%",
        textShadow: "0 4px 24px rgba(255,0,51,0.2)",
      }}>
        {headline}
      </div>

      {/* 하단 표식 */}
      <div style={{
        position: "absolute", bottom: 80,
        color: "#666", fontSize: 22, fontFamily: MONO_FONT,
        opacity: opacity * 0.7,
      }}>
        gree news · silent reenactment
      </div>
    </AbsoluteFill>
  );
};

/* ─────────── Scene Shot (풀스크린 클립) ─────────── */
const SceneShot: React.FC<{
  scene: NewsScene;
  newsKey: string;
  caption: string;
  index: number;
  total: number;
  category?: string;
  durationSec: number;
}> = ({ scene, newsKey, caption, index, total, category, durationSec }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const totalFrames = Math.round(durationSec * fps);

  // 진입 12프레임, 퇴장 마지막 8프레임
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 180 }, durationInFrames: 12 });
  const exit  = interpolate(frame, [totalFrames - 8, totalFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(enter, exit);

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* 풀스크린 영상 — 512×512 클립을 1080×1920에 cover 채움 */}
      <div style={{
        position: "absolute", inset: 0,
        transform: `scale(${1 + (1 - enter) * 0.04})`, // 살짝 줌인 효과
      }}>
        <OffthreadVideo
          src={staticFile(`gree/news_actions/${newsKey}/${scene.file}`)}
          startFrom={0}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          muted
        />
      </div>

      {/* 비네팅 — 자막 가독성 */}
      <AbsoluteFill style={{
        background: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 18%, transparent 65%, rgba(0,0,0,0.85) 100%)",
        pointerEvents: "none",
      }} />

      {/* 상단: 카테고리 + 인덱스 */}
      <div style={{
        position: "absolute", top: 60, left: 60, right: 60,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        opacity, transform: `translateY(${(1 - enter) * -20}px)`,
      }}>
        <div style={{
          background: "rgba(255,0,51,0.9)", color: "#fff",
          padding: "8px 18px", borderRadius: 6,
          fontWeight: 900, fontSize: 24, letterSpacing: 1,
        }}>
          ● LIVE {category ? `· ${category}` : ""}
        </div>
        <div style={{
          background: "rgba(255,255,255,0.95)", color: "#0a0a0f",
          padding: "10px 24px", borderRadius: 999,
          fontWeight: 900, fontSize: 26, fontFamily: MONO_FONT,
        }}>
          {String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
      </div>

      {/* 하단: 자막 */}
      <div style={{
        position: "absolute", bottom: 180, left: 60, right: 60,
        opacity, transform: `translateY(${(1 - enter) * 40}px)`,
      }}>
        <CaptionBar text={caption} />
      </div>
    </AbsoluteFill>
  );
};

const CaptionBar: React.FC<{ text: string }> = ({ text }) => (
  <div style={{
    background: "rgba(0,0,0,0.78)",
    color: "#fff",
    padding: "22px 36px",
    borderRadius: 20,
    fontSize: 64,
    fontWeight: 900,
    letterSpacing: -1.5,
    textAlign: "center",
    lineHeight: 1.2,
    border: "2px solid rgba(255,0,51,0.4)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  }}>
    {text}
  </div>
);

/* ─────────── Outro Slate ─────────── */
const OUTRO_TEXT: Record<"ko" | "en" | "jp", { main: string; cta: string }> = {
  ko: { main: "오늘의 사건사고", cta: "더보기 →" },
  en: { main: "Today's incidents", cta: "More →" },
  jp: { main: "今日の事件事故", cta: "もっと見る →" },
};
const OutroSlate: React.FC<{ lang: "ko" | "en" | "jp" }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 12, stiffness: 200 }, durationInFrames: 10 });
  const text = OUTRO_TEXT[lang] || OUTRO_TEXT.ko;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: "#0a0a0f" }}>
      <div style={{
        color: "#fff", fontSize: 72, fontWeight: 900,
        transform: `scale(${0.8 + enter * 0.2})`, opacity: enter,
        textAlign: "center", lineHeight: 1.3,
      }}>
        {text.main}<br />
        <span style={{
          background: "linear-gradient(135deg, #ff0033 0%, #ff006e 100%)",
          WebkitBackgroundClip: "text", backgroundClip: "text",
          WebkitTextFillColor: "transparent", fontSize: 92,
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
      <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.08)" }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: "linear-gradient(90deg, #ff0033, #ff006e, #8338ec)",
        }} />
      </div>
    </AbsoluteFill>
  );
};

// 데모 총 길이 = 1.8(인트로) + 5×5.0(장면) + 1.5(아웃트로) = 28.3초
export const NEWS_ACTION_DEMO_DURATION = Math.ceil((1.8 + NEWS_ACTION_DEMO.scenes.length * 5.0 + 1.5) * 30);
