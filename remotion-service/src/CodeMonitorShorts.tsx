/**
 * CodeMonitorShorts — 모니터 화면 안에 IT 콘텐츠 + 그리 캐릭터 PIP
 *
 * 컨셉: 영상 프레임 = 모니터 화면. 좌측엔 코드/에러/브라우저/터미널,
 *      우측 하단엔 그리 캐릭터가 PIP로 리액션. 말없이 + 다국어 자막.
 *
 * Beat 구조:
 *   monitor: { kind, content, lang? }
 *   reaction: emotion ('panic', 'cry', 'surprised', 'happy' ...)
 *   caption: { ko, en?, jp? }
 *   duration: 초
 */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
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

export type Emotion =
  | "neutral" | "happy" | "sad" | "angry"
  | "surprised" | "embarrassed" | "cry" | "excited"
  | "tired" | "dead_inside" | "panic" | "furious";

export type MonitorKind = "code" | "terminal" | "browser" | "error" | "trending";

export type Beat = {
  monitor: {
    kind: MonitorKind;
    title?: string;        // 모니터 헤더 (파일명/URL)
    content: string;       // 코드/에러 본문
    lang?: "ts" | "js" | "py" | "json" | "sh" | "md";
  };
  reaction: Emotion;
  caption: { ko: string; en?: string; jp?: string };
  duration: number;        // 초
};

export type CodeMonitorProps = {
  topic: string;           // 프롬프트/주제
  topicEn?: string;
  topicJp?: string;
  beats: Beat[];
  lang?: "ko" | "en" | "jp";
  bgmFile?: string;
  silent?: boolean;
  fps?: number;
};

/* ─────────── 기본 props (데모) ─────────── */
export const CODE_MONITOR_DEMO: CodeMonitorProps = {
  topic: "Promise.all 으로 병렬 호출",
  topicEn: "Parallel fetch with Promise.all",
  topicJp: "Promise.all で並列処理",
  silent: true,
  lang: "ko",
  beats: [
    {
      monitor: { kind: "code", title: "api.ts", lang: "ts",
        content: "// 순차 호출\nconst a = await fetchA()\nconst b = await fetchB()\nconst c = await fetchC()" },
      reaction: "tired",
      caption: { ko: "이렇게 짜고 있죠?", en: "Writing it like this?", jp: "こう書いてませんか?" },
      duration: 2.5,
    },
    {
      monitor: { kind: "terminal", title: "$ time node script.ts",
        content: "real    0m9.012s\nuser    0m1.450s\nsys     0m0.122s" },
      reaction: "dead_inside",
      caption: { ko: "9초... 영혼이 나가요", en: "9 seconds... soul leaving", jp: "9秒...魂が抜ける" },
      duration: 2.2,
    },
    {
      monitor: { kind: "code", title: "api.ts", lang: "ts",
        content: "// 병렬 호출\nconst [a, b, c] = await Promise.all([\n  fetchA(),\n  fetchB(),\n  fetchC(),\n])" },
      reaction: "surprised",
      caption: { ko: "Promise.all 한 줄이면?", en: "One Promise.all line?", jp: "Promise.all 一行で?" },
      duration: 2.5,
    },
    {
      monitor: { kind: "terminal", title: "$ time node script.ts",
        content: "real    0m3.114s\nuser    0m1.380s\nsys     0m0.118s" },
      reaction: "excited",
      caption: { ko: "3초로 단축", en: "Down to 3 seconds", jp: "3秒に短縮" },
      duration: 2.2,
    },
    {
      monitor: { kind: "browser", title: "developer.mozilla.org",
        content: "Promise.all() — Settles when all input\npromises resolve, or rejects when any reject." },
      reaction: "happy",
      caption: { ko: "독립된 호출은 Promise.all 로!", en: "Independent calls → Promise.all", jp: "独立呼び出しはPromise.all!" },
      duration: 2.5,
    },
  ],
  fps: 30,
};

/* ─────────── 메인 컴포지션 ─────────── */
export const CodeMonitorShorts: React.FC<CodeMonitorProps> = (raw) => {
  const props = { ...CODE_MONITOR_DEMO, ...raw };
  const { fps } = useVideoConfig();
  const lang = props.lang || "ko";

  const TITLE_FRAMES = Math.round(1.3 * fps);
  const beats = props.beats || [];

  return (
    <AbsoluteFill style={{ fontFamily: KR_FONT, background: "#1a1a24" }}>
      {props.silent && props.bgmFile && (
        <Audio src={staticFile(props.bgmFile)} volume={0.35} />
      )}

      <Series>
        {/* 타이틀 신 */}
        <Series.Sequence durationInFrames={TITLE_FRAMES}>
          <TitleSlate topic={topicForLang(props, lang)} />
        </Series.Sequence>

        {beats.map((beat, i) => (
          <Series.Sequence key={i} durationInFrames={Math.round(beat.duration * fps)}>
            <BeatScene beat={beat} lang={lang} index={i + 1} total={beats.length} />
          </Series.Sequence>
        ))}
      </Series>

      <ProgressBar />
    </AbsoluteFill>
  );
};

function topicForLang(p: CodeMonitorProps, lang: "ko" | "en" | "jp"): string {
  if (lang === "en" && p.topicEn) return p.topicEn;
  if (lang === "jp" && p.topicJp) return p.topicJp;
  return p.topic;
}
function captionForLang(c: { ko: string; en?: string; jp?: string }, lang: "ko" | "en" | "jp"): string {
  if (lang === "en" && c.en) return c.en;
  if (lang === "jp" && c.jp) return c.jp;
  return c.ko;
}

/* ─────────── Title Slate ─────────── */
const TitleSlate: React.FC<{ topic: string }> = ({ topic }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 12, stiffness: 200 }, durationInFrames: 10 });
  const exit = interpolate(frame, [fps * 1.0, fps * 1.3], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(enter, exit);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: "#0a0a0f", padding: 64 }}>
      <div style={{ color: "#888", fontSize: 28, fontFamily: MONO_FONT, opacity }}>$ topic</div>
      <div style={{
        marginTop: 16, color: "#fff", fontSize: 84, fontWeight: 900, letterSpacing: -2,
        textAlign: "center", lineHeight: 1.15,
        transform: `scale(${0.85 + enter * 0.15})`, opacity,
      }}>
        {topic}
      </div>
      <div style={{ marginTop: 24, color: "#666", fontSize: 22, fontFamily: MONO_FONT, opacity: opacity * 0.7 }}>
        no words. just monitor.
      </div>
    </AbsoluteFill>
  );
};

/* ─────────── Beat (모니터 + 캐릭터 PIP + 자막) ─────────── */
const BeatScene: React.FC<{ beat: Beat; lang: "ko" | "en" | "jp"; index: number; total: number }> = ({ beat, lang, index, total }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 180 }, durationInFrames: 12 });
  const totalFrames = Math.round(beat.duration * fps);
  const exit = interpolate(frame, [totalFrames - 6, totalFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(enter, exit);

  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg,#1a1a24 0%,#0a0a0f 100%)" }}>
      {/* 도트 패턴 */}
      <DotBg />

      {/* 1) 모니터 (중앙 상단, 1080×1080 영역) */}
      <div style={{
        position: "absolute",
        top: 200,
        left: 60,
        right: 60,
        height: 1080,
        opacity,
        transform: `translateY(${(1 - enter) * 40}px) scale(${0.92 + enter * 0.08})`,
        filter: "drop-shadow(0 32px 64px rgba(0,0,0,0.6))",
      }}>
        <MonitorWindow kind={beat.monitor.kind} title={beat.monitor.title}>
          <MonitorContent kind={beat.monitor.kind} content={beat.monitor.content} lang={beat.monitor.lang} />
        </MonitorWindow>
      </div>

      {/* 2) 캐릭터 PIP (우측 하단) */}
      <div style={{
        position: "absolute",
        right: 60,
        bottom: 380,
        width: 360,
        height: 360,
        opacity,
        transform: `translateY(${(1 - enter) * 60}px) scale(${0.7 + enter * 0.3})`,
      }}>
        <CharacterPIP emotion={beat.reaction} />
      </div>

      {/* 3) 자막 (하단 풀폭) */}
      <div style={{
        position: "absolute",
        bottom: 120,
        left: 60,
        right: 60,
        opacity,
        transform: `translateY(${(1 - enter) * 30}px)`,
      }}>
        <CaptionBar text={captionForLang(beat.caption, lang)} />
      </div>

      {/* 4) 인덱스 칩 */}
      <div style={{
        position: "absolute",
        top: 60,
        left: "50%",
        transform: `translateX(-50%) translateY(${(1 - enter) * -20}px)`,
        opacity,
        background: "rgba(255,255,255,0.9)",
        color: "#0a0a0f",
        padding: "10px 28px",
        borderRadius: 999,
        fontSize: 28,
        fontWeight: 900,
        fontFamily: MONO_FONT,
      }}>
        {String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </div>
    </AbsoluteFill>
  );
};

/* ─────────── Monitor Window (chrome/title bar) ─────────── */
const KIND_THEME: Record<MonitorKind, { bg: string; titleBg: string; titleColor: string; icon: string }> = {
  code:     { bg: "#1e1e2e", titleBg: "#181825", titleColor: "#cba6f7", icon: "</>" },
  terminal: { bg: "#000",    titleBg: "#1a1a1a", titleColor: "#a6e3a1", icon: "$" },
  browser:  { bg: "#fff",    titleBg: "#f1f3f5", titleColor: "#212529", icon: "🌐" },
  error:    { bg: "#2a1a1a", titleBg: "#3a1818", titleColor: "#f38ba8", icon: "⚠" },
  trending: { bg: "#0a0a0f", titleBg: "#15151c", titleColor: "#ffd166", icon: "★" },
};

const MonitorWindow: React.FC<{ kind: MonitorKind; title?: string; children: React.ReactNode }> = ({ kind, title, children }) => {
  const t = KIND_THEME[kind];
  return (
    <div style={{
      width: "100%", height: "100%",
      background: t.bg,
      borderRadius: 16,
      overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      {/* 타이틀바 (macOS 신호등 + 타이틀) */}
      <div style={{
        background: t.titleBg,
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Dot color="#ff5f57" /><Dot color="#febc2e" /><Dot color="#28c840" />
        </div>
        <div style={{
          flex: 1,
          textAlign: "center",
          color: t.titleColor,
          fontFamily: MONO_FONT,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: -0.3,
        }}>
          <span style={{ marginRight: 12, opacity: 0.7 }}>{t.icon}</span>
          {title || kind}
        </div>
        <div style={{ width: 60 }} />
      </div>
      <div style={{ width: "100%", height: "calc(100% - 60px)", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
};
const Dot: React.FC<{ color: string }> = ({ color }) => (
  <div style={{ width: 16, height: 16, borderRadius: "50%", background: color }} />
);

/* ─────────── Monitor Content (kind별 렌더) ─────────── */
const MonitorContent: React.FC<{ kind: MonitorKind; content: string; lang?: string }> = ({ kind, content, lang }) => {
  if (kind === "code") return <CodeBlock content={content} lang={lang || "ts"} />;
  if (kind === "terminal") return <TerminalBlock content={content} />;
  if (kind === "browser") return <BrowserBlock content={content} />;
  if (kind === "error") return <ErrorBlock content={content} />;
  if (kind === "trending") return <TrendingBlock content={content} />;
  return <pre>{content}</pre>;
};

const CodeBlock: React.FC<{ content: string; lang: string }> = ({ content, lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 타이핑 애니메이션: 0.8초 동안 점진적으로 표시
  const typeFrames = Math.round(0.8 * fps);
  const charCount = Math.floor(interpolate(frame, [0, typeFrames], [0, content.length], { extrapolateRight: "clamp" }));
  const shown = content.slice(0, charCount);
  const lines = shown.split("\n");
  return (
    <div style={{
      padding: "32px 40px",
      fontFamily: MONO_FONT,
      fontSize: 36,
      lineHeight: 1.55,
      color: "#cdd6f4",
      whiteSpace: "pre",
    }}>
      {lines.map((line, i) => (
        <div key={i} style={{ display: "flex" }}>
          <span style={{ color: "#585b70", width: 60, textAlign: "right", marginRight: 24, userSelect: "none" }}>
            {i + 1}
          </span>
          <span dangerouslySetInnerHTML={{ __html: highlightTs(line) }} />
        </div>
      ))}
      {charCount < content.length && (
        <span style={{ color: "#cba6f7", animation: "blink 1s infinite" }}>▌</span>
      )}
    </div>
  );
};

function highlightTs(line: string): string {
  let h = escapeHtml(line);
  h = h.replace(/(\/\/.*)$/g, '<span style="color:#6c7086">$1</span>');
  h = h.replace(/\b(const|let|var|await|async|function|return|import|from|if|else|new)\b/g,
                '<span style="color:#cba6f7">$1</span>');
  h = h.replace(/\b(Promise|Array|Object|JSON|console)\b/g,
                '<span style="color:#f9e2af">$1</span>');
  h = h.replace(/(\w+)\(/g, '<span style="color:#89b4fa">$1</span>(');
  h = h.replace(/('[^']*'|"[^"]*"|`[^`]*`)/g, '<span style="color:#a6e3a1">$1</span>');
  h = h.replace(/(\b\d+\b)/g, '<span style="color:#fab387">$1</span>');
  return h;
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TerminalBlock: React.FC<{ content: string }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const typeFrames = Math.round(0.5 * fps);
  const charCount = Math.floor(interpolate(frame, [0, typeFrames], [0, content.length], { extrapolateRight: "clamp" }));
  return (
    <div style={{
      padding: "32px 40px",
      fontFamily: MONO_FONT,
      fontSize: 38,
      lineHeight: 1.6,
      color: "#a6e3a1",
      whiteSpace: "pre",
    }}>
      <div style={{ color: "#94e2d5" }}>$ {content.split("\n")[0]?.startsWith("real") ? "(output)" : ""}</div>
      <div style={{ color: "#cdd6f4", marginTop: 12 }}>{content.slice(0, charCount)}</div>
    </div>
  );
};

const BrowserBlock: React.FC<{ content: string }> = ({ content }) => (
  <div style={{ padding: "40px 48px", fontFamily: KR_FONT, fontSize: 38, color: "#212529", lineHeight: 1.5, background: "#fff" }}>
    {content}
  </div>
);

const ErrorBlock: React.FC<{ content: string }> = ({ content }) => (
  <div style={{
    padding: "40px 48px",
    fontFamily: MONO_FONT,
    fontSize: 32,
    color: "#f38ba8",
    background: "#2a1a1a",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
  }}>
    {content}
  </div>
);

const TrendingBlock: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split("\n").filter(Boolean);
  return (
    <div style={{ padding: "40px 48px", fontFamily: KR_FONT, fontSize: 36, color: "#fff" }}>
      {lines.map((line, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <span style={{ color: "#ffd166", marginRight: 16, width: 48, fontWeight: 900 }}>#{i + 1}</span>
          <span>{line}</span>
        </div>
      ))}
    </div>
  );
};

/* ─────────── Character PIP ─────────── */
const CharacterPIP: React.FC<{ emotion: Emotion }> = ({ emotion }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const breathe = Math.sin((t * 2 * Math.PI) / 2.4) * 4;
  return (
    <div style={{
      width: "100%", height: "100%",
      background: "radial-gradient(circle at 50% 50%, #fef9f3 0%, #fde4d4 70%, rgba(253,228,212,0) 100%)",
      borderRadius: "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <Img
        src={staticFile(`gree/emotions/${emotion}.png`)}
        style={{
          width: "100%", height: "100%", objectFit: "contain",
          transform: `translateY(${breathe}px)`,
        }}
      />
    </div>
  );
};

/* ─────────── Caption Bar ─────────── */
const CaptionBar: React.FC<{ text: string }> = ({ text }) => (
  <div style={{
    background: "linear-gradient(135deg, #ff006e 0%, #8338ec 100%)",
    color: "#fff",
    padding: "24px 40px",
    borderRadius: 24,
    fontSize: 60,
    fontWeight: 900,
    letterSpacing: -1.5,
    textAlign: "center",
    boxShadow: "0 24px 48px rgba(131, 56, 236, 0.4)",
    lineHeight: 1.2,
  }}>
    {text}
  </div>
);

const DotBg: React.FC = () => (
  <AbsoluteFill style={{ opacity: 0.04 }}>
    <svg width="100%" height="100%">
      <defs>
        <pattern id="codedots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="20" cy="20" r="1.5" fill="#fff" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#codedots)" />
    </svg>
  </AbsoluteFill>
);

const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = (frame / durationInFrames) * 100;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", pointerEvents: "none" }}>
      <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.1)" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#ff006e,#8338ec,#3a86ff)" }} />
      </div>
    </AbsoluteFill>
  );
};

// 데모 총 길이 = 1.3s + sum(beats)
export const CODE_MONITOR_DEMO_DURATION = Math.ceil((1.3 + CODE_MONITOR_DEMO.beats.reduce((a, b) => a + b.duration, 0)) * 30);
