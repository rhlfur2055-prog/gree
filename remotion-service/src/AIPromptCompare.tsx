// AIPromptCompare.tsx
// 같은 프롬프트 3 AI에 넣었습니다 — 실제 차이 비교
// 타이핑 애니메이션 + 채팅 UI 목업 + 헤드라인 하이라이트

import React from 'react';
import { AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { TransitionSeries, linearTiming, springTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { noise2D } from '@remotion/noise';
import { CaptionOverlay } from './components/CaptionOverlay';
import type { RawCaption } from './components/CaptionOverlay';

// ── 팔레트 ────────────────────────────────────────────────────────────────────
const C = {
  bg:      '#0D0B1A',
  panel:   '#161428',
  card:    '#1E1B35',
  border:  '#2E2A50',
  text:    '#F0EFFF',
  sub:     '#7B78A8',
  purple:  '#BF5AF2',
  amber:   '#F59E0B',
  blue:    '#4285F4',
  gpt:     '#10A37F',
  red:     '#FF453A',
  green:   '#30D158',
  good:    '#0D2818',
  bad:     '#1F0A0A',
};

const FONT  = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const MONO  = "'JetBrains Mono','Fira Code','Consolas',monospace";
const FPS   = 30;
const ST    = 200;
const SB    = 380;

// ── SEGS (실제 ElevenLabs 타이밍) ─────────────────────────────────────────────
interface Seg { startMs: number; endMs: number; text: string; hl?: string; accent?: string; scene: string; }

const SEGS: Seg[] = [
  { startMs:      0, endMs:   2926, text: '같은 프롬프트를 3 AI에 입력',                                scene: 'hook'    },
  { startMs:   2926, endMs:   4272, text: '결과가 달랐습니다',          hl: '달랐습니다', accent: C.red,   scene: 'hook'    },
  { startMs:   4272, endMs:   6583, text: '직장인 기획서 작성 테스트',                                   scene: 'hook'    },
  { startMs:   6583, endMs:   8197, text: '이 프롬프트 넣었습니다',                                      scene: 'hook'    },
  { startMs:   8197, endMs:   9485, text: 'ChatGPT 답변',                                               scene: 'writing' },
  { startMs:   9485, endMs:  10705, text: '구조가 평범합니다',           hl: '평범',      accent: C.sub,   scene: 'writing' },
  { startMs:  10705, endMs:  11761, text: 'Claude 답변',                                                scene: 'writing' },
  { startMs:  11761, endMs:  13061, text: '깊이가 완전히 다릅니다',     hl: '완전히 다릅니다', accent: C.amber, scene: 'writing' },
  { startMs:  13061, endMs:  14664, text: '코딩도 테스트했습니다',                                       scene: 'coding'  },
  { startMs:  14664, endMs:  16730, text: '엑셀 자동화 스크립트 요청',                                   scene: 'coding'  },
  { startMs:  16730, endMs:  18692, text: 'ChatGPT 기본 코드',                                          scene: 'coding'  },
  { startMs:  18692, endMs:  20341, text: 'Claude 에러처리까지 완성',   hl: '에러처리', accent: C.amber,  scene: 'coding'  },
  { startMs:  20341, endMs:  21711, text: '검색 테스트',                                                 scene: 'search'  },
  { startMs:  21711, endMs:  24439, text: '오늘 AI 뉴스 요약 요청',                                     scene: 'search'  },
  { startMs:  24439, endMs:  25821, text: 'Claude 답변',                                                scene: 'search'  },
  { startMs:  25821, endMs:  27597, text: '학습 데이터 없어서 모릅니다', hl: '모릅니다', accent: C.red,   scene: 'search'  },
  { startMs:  27597, endMs:  29942, text: 'Gemini 실시간 정보 바로',    hl: '실시간',   accent: C.blue,  scene: 'search'  },
  { startMs:  29942, endMs:  31266, text: '결론 나왔습니다',                                             scene: 'split'   },
  { startMs:  31266, endMs:  32891, text: '글쓰기 문서 → Claude',       hl: 'Claude',   accent: C.amber, scene: 'split'   },
  { startMs:  32891, endMs:  34366, text: '검색 리서치 → Gemini',       hl: 'Gemini',   accent: C.blue,  scene: 'split'   },
  { startMs:  34366, endMs:  35759, text: '하나만 쓰면 손해입니다',      hl: '손해',     accent: C.red,   scene: 'split'   },
];

export const AI_PROMPT_TOTAL_FRAMES = Math.ceil(36.3 * FPS);

const ci = (f: number, s: number, e: number, os = 0, oe = 1) =>
  interpolate(f, [s, e], [os, oe], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const msToF = (ms: number) => Math.round((ms / 1000) * FPS);

function getSeg(ms: number): Seg | null { return SEGS.find(s => ms >= s.startMs && ms < s.endMs) ?? null; }
const RAW_CAPTIONS: RawCaption[] = SEGS.map(s => ({ text: s.text, startMs: s.startMs, endMs: s.endMs }));

const BOUNDS_MS = [8197, 13061, 20341, 29942];

// ── Noise 배경 ─────────────────────────────────────────────────────────────────
const NoiseBg: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame * 0.012;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      {Array.from({ length: 18 }, (_, i) => {
        const nx = noise2D(`nx${i}`, i * 0.35, t);
        const ny = noise2D(`ny${i}`, i * 0.35 + 40, t);
        const ns = noise2D(`ns${i}`, i * 0.35 + 80, t * 0.4);
        const no = noise2D(`no${i}`, i * 0.35 + 120, t * 0.25);
        const cols = [C.purple, C.amber, C.blue, C.gpt];
        return (
          <div key={i} style={{
            position: 'absolute',
            left: ((nx + 1) / 2) * 1080,
            top:  ((ny + 1) / 2) * 1920,
            width:  2 + ((ns + 1) / 2) * 4,
            height: 2 + ((ns + 1) / 2) * 4,
            borderRadius: '50%',
            background: cols[i % 4],
            transform: 'translate(-50%,-50%)',
            opacity: 0.08 + ((no + 1) / 2) * 0.14,
          }} />
        );
      })}
    </div>
  );
};

// ── 씬 전환 플래시 ─────────────────────────────────────────────────────────────
const SceneFlash: React.FC<{ frame: number }> = ({ frame }) => {
  let op = 0;
  for (const bMs of BOUNDS_MS) {
    const d = frame - msToF(bMs);
    if (d >= -2 && d <= 5) op = Math.max(op, d <= 0 ? ci(d, -2, 0, 0, 0.5) : ci(d, 0, 5, 0.5, 0));
  }
  if (op < 0.01) return null;
  return <div style={{ position: 'absolute', inset: 0, background: '#FFF', opacity: op * 0.15, pointerEvents: 'none', zIndex: 95 }} />;
};

// ── 타이핑 애니메이션 텍스트 ──────────────────────────────────────────────────
const Typewriter: React.FC<{ text: string; frame: number; startF: number; speed?: number; style?: React.CSSProperties }> = ({ text, frame, startF, speed = 1.8, style }) => {
  const count = Math.floor(ci(frame, startF, startF + text.length / speed, 0, text.length));
  const showCursor = frame > startF && count < text.length;
  return (
    <span style={style}>
      {text.slice(0, count)}
      {showCursor && <span style={{ opacity: Math.floor(frame / 8) % 2 === 0 ? 1 : 0, color: C.purple }}>|</span>}
    </span>
  );
};

// ── 헤드라인 하이라이트 텍스트 ────────────────────────────────────────────────
interface HL { word: string; color: string; bg?: string; }
const HeadlineText: React.FC<{ lines: string[]; highlights: HL[]; frame: number; startF: number; fontSize?: number }> = ({ lines, highlights, frame, startF, fontSize = 52 }) => {
  return (
    <div style={{ fontFamily: FONT }}>
      {lines.map((line, li) => {
        const lineDelay = startF + li * 8;
        const words = line.split(' ');
        return (
          <div key={li} style={{ marginBottom: 8, opacity: ci(frame, lineDelay, lineDelay + 10) }}>
            {words.map((word, wi) => {
              const hl = highlights.find(h => word.includes(h.word) || word === h.word);
              const wDelay = lineDelay + wi * 2;
              return (
                <span key={wi} style={{
                  display: 'inline-block',
                  fontSize,
                  fontWeight: hl ? 900 : 700,
                  color: hl ? hl.color : C.text,
                  background: hl?.bg ? hl.bg : 'transparent',
                  padding: hl?.bg ? '2px 8px' : 0,
                  borderRadius: hl?.bg ? 6 : 0,
                  marginRight: 8,
                  opacity: ci(frame, wDelay, wDelay + 6),
                  transform: `translateY(${ci(frame, wDelay, wDelay + 8, 20, 0)}px)`,
                  textShadow: hl ? `0 0 20px ${hl.color}88` : 'none',
                }}>
                  {word}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

// ── 채팅 버블 ──────────────────────────────────────────────────────────────────
const ChatBubble: React.FC<{
  role: 'user' | 'ai'; aiName?: string; aiColor?: string;
  lines: string[]; highlights?: HL[];
  frame: number; startF: number; quality?: 'good' | 'bad' | 'normal';
}> = ({ role, aiName, aiColor = C.purple, lines, highlights = [], frame, startF, quality = 'normal' }) => {
  const isUser = role === 'user';
  const borderColor = quality === 'good' ? C.amber : quality === 'bad' ? C.sub : aiColor;
  const bgColor = quality === 'good' ? '#1A1200' : quality === 'bad' ? '#111' : C.card;
  const badgeColor = quality === 'good' ? C.amber : quality === 'bad' ? C.sub : aiColor;

  return (
    <div style={{
      opacity: ci(frame, startF, startF + 10),
      transform: `translateY(${ci(frame, startF, startF + 12, 30, 0)}px)`,
      background: bgColor,
      border: `2px solid ${borderColor}44`,
      borderLeft: isUser ? 'none' : `4px solid ${borderColor}`,
      borderRadius: 18,
      padding: '20px 24px',
      marginBottom: 16,
    }}>
      {/* 헤더 */}
      {!isUser && aiName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: badgeColor, boxShadow: `0 0 8px ${badgeColor}` }} />
          <span style={{ fontFamily: FONT, fontSize: 24, fontWeight: 700, color: badgeColor }}>{aiName}</span>
          {quality === 'good' && <span style={{ fontSize: 18, marginLeft: 4 }}>✨</span>}
          {quality === 'bad' && <span style={{ fontSize: 18, marginLeft: 4, color: C.sub }}>😐</span>}
        </div>
      )}
      {isUser && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontFamily: FONT, fontSize: 22, color: C.sub }}>👤 프롬프트</span>
        </div>
      )}
      {/* 내용 */}
      <div>
        {lines.map((line, i) => {
          const words = line.split(' ');
          const lineDelay = startF + (isUser ? i * 1 : 8 + i * 4);
          return (
            <div key={i} style={{ marginBottom: 4, opacity: ci(frame, lineDelay, lineDelay + 8) }}>
              {words.map((word, wi) => {
                const hl = highlights.find(h => word.includes(h.word));
                return (
                  <span key={wi} style={{
                    fontFamily: isUser ? MONO : FONT,
                    fontSize: isUser ? 26 : 28,
                    fontWeight: hl ? 800 : 500,
                    color: hl ? hl.color : isUser ? C.purple : C.text,
                    background: hl?.bg ? hl.bg : 'transparent',
                    padding: hl?.bg ? '1px 6px' : 0,
                    borderRadius: 4,
                    marginRight: 6,
                    textShadow: hl ? `0 0 12px ${hl.color}66` : 'none',
                  }}>
                    {word}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── 코드 블록 ──────────────────────────────────────────────────────────────────
const CodeBlock: React.FC<{
  aiName: string; aiColor: string; lines: string[];
  highlights: { line: number; color: string; label?: string }[];
  frame: number; startF: number; quality: 'good' | 'bad';
}> = ({ aiName, aiColor, lines, highlights, frame, startF, quality }) => {
  return (
    <div style={{
      opacity: ci(frame, startF, startF + 10),
      transform: `translateX(${ci(frame, startF, startF + 12, quality === 'bad' ? -40 : 40, 0)}px)`,
      background: '#0D0D14',
      border: `2px solid ${quality === 'good' ? C.amber : C.border}`,
      borderTop: `3px solid ${aiColor}`,
      borderRadius: 16,
      overflow: 'hidden',
      flex: 1,
    }}>
      {/* 상단 바 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#111', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: aiColor }} />
        <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: aiColor }}>{aiName}</span>
        {quality === 'good' && <span style={{ marginLeft: 'auto', fontSize: 16, color: C.amber }}>✨ 에러처리 포함</span>}
        {quality === 'bad' && <span style={{ marginLeft: 'auto', fontSize: 16, color: C.sub }}>😐 기본 코드만</span>}
      </div>
      {/* 코드 */}
      <div style={{ padding: '16px', fontFamily: MONO, fontSize: 22, lineHeight: 1.7 }}>
        {lines.map((line, i) => {
          const hl = highlights.find(h => h.line === i);
          const lineDelay = startF + 8 + i * 2;
          return (
            <div key={i} style={{
              opacity: ci(frame, lineDelay, lineDelay + 6),
              background: hl ? `${hl.color}18` : 'transparent',
              borderLeft: hl ? `3px solid ${hl.color}` : '3px solid transparent',
              paddingLeft: 8,
              borderRadius: 4,
              color: hl ? hl.color : C.sub,
              fontWeight: hl ? 700 : 400,
            }}>
              {hl?.label && <span style={{ fontSize: 16, marginRight: 8, color: hl.color }}>◄ {hl.label}</span>}
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── SceneHook ──────────────────────────────────────────────────────────────────
const SceneHook: React.FC<{ absMs: number }> = ({ absMs }) => {
  const f = msToF(absMs);
  const PROMPT = '신제품 런칭 기획서 작성해줘.\n타겟: 2030 직장인, 예산 500만원';

  return (
    <div style={{ position: 'absolute', top: ST + 30, bottom: SB + 200, left: 44, right: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 36 }}>
      <div style={{ opacity: ci(f, 0, 14) }}>
        <div style={{ fontFamily: FONT, fontSize: 36, color: C.sub, marginBottom: 8 }}>직접 테스트했습니다</div>
        <HeadlineText
          lines={['같은 프롬프트', '3 AI에 넣었더니']}
          highlights={[{ word: '3', color: C.purple }, { word: 'AI에', color: C.purple }]}
          frame={f} startF={2} fontSize={72}
        />
      </div>

      {/* 프롬프트 박스 */}
      <div style={{
        opacity: ci(f, 18, 28),
        background: C.card,
        border: `2px solid ${C.purple}66`,
        borderRadius: 20,
        padding: '24px 28px',
      }}>
        <div style={{ fontFamily: FONT, fontSize: 22, color: C.purple, marginBottom: 12 }}>👤 입력한 프롬프트</div>
        <div style={{ fontFamily: MONO, fontSize: 30, color: C.text, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
          <Typewriter text={PROMPT} frame={f} startF={20} speed={1.5} />
        </div>
      </div>

      {/* AI 3개 뱃지 */}
      <div style={{ display: 'flex', gap: 16, opacity: ci(f, 36, 46) }}>
        {[{ name: 'ChatGPT', color: C.gpt }, { name: 'Claude', color: C.amber }, { name: 'Gemini', color: C.blue }].map((ai, i) => (
          <div key={i} style={{
            flex: 1, textAlign: 'center',
            background: C.panel, border: `2px solid ${ai.color}66`, borderRadius: 16, padding: '16px 8px',
            fontFamily: FONT, fontSize: 28, fontWeight: 700, color: ai.color,
            opacity: ci(f, 36 + i * 4, 46 + i * 4),
            transform: `translateY(${ci(f, 36 + i * 4, 46 + i * 4, 20, 0)}px)`,
          }}>
            {ai.name}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── SceneWriting (기획서 비교) ────────────────────────────────────────────────
const SceneWriting: React.FC<{ absMs: number; startMs: number }> = ({ absMs, startMs }) => {
  const f = msToF(absMs - startMs);

  return (
    <div style={{ position: 'absolute', top: ST + 20, bottom: SB + 200, left: 44, right: 44, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ opacity: ci(f, 0, 10) }}>
        <div style={{ fontFamily: FONT, fontSize: 34, color: C.sub }}>기획서 작성 요청 결과</div>
        <div style={{ width: 60, height: 4, background: C.purple, borderRadius: 2, marginTop: 8 }} />
      </div>

      {/* ChatGPT 결과 (평범) */}
      <ChatBubble
        role="ai" aiName="ChatGPT" aiColor={C.gpt} quality="bad"
        lines={[
          '1. 제품 개요',
          '2. 타겟 분석',
          '3. 마케팅 전략',
          '4. 예산 계획',
        ]}
        highlights={[]}
        frame={f} startF={0}
      />

      {/* Claude 결과 (우수) */}
      <ChatBubble
        role="ai" aiName="Claude" aiColor={C.amber} quality="good"
        lines={[
          '[JTBD 프레임] 2030 직장인이',
          '"성장했다"고 느끼는 순간 공략',
          '→ 런칭 전 200명 사전예약 타겟',
          '→ 3주 바이럴 루프 설계안 포함',
        ]}
        highlights={[
          { word: 'JTBD', color: C.amber },
          { word: '바이럴', color: C.amber },
          { word: '사전예약', color: C.green },
        ]}
        frame={f} startF={10}
      />

      {/* 차이 레이블 */}
      <div style={{
        opacity: ci(f, 24, 34),
        display: 'flex', alignItems: 'center', gap: 12,
        background: `${C.amber}15`, border: `1px solid ${C.amber}44`,
        borderRadius: 14, padding: '14px 20px',
      }}>
        <span style={{ fontSize: 28 }}>💡</span>
        <span style={{ fontFamily: FONT, fontSize: 26, color: C.amber, fontWeight: 700 }}>
          Claude: 프레임워크 + 실행 전략까지
        </span>
      </div>
    </div>
  );
};

// ── SceneCoding (코딩 비교) ───────────────────────────────────────────────────
const SceneCoding: React.FC<{ absMs: number; startMs: number }> = ({ absMs, startMs }) => {
  const f = msToF(absMs - startMs);

  return (
    <div style={{ position: 'absolute', top: ST + 20, bottom: SB + 200, left: 44, right: 44, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ opacity: ci(f, 0, 10) }}>
        <div style={{ fontFamily: FONT, fontSize: 34, color: C.sub }}>엑셀 자동화 스크립트 요청</div>
        <div style={{ fontFamily: MONO, fontSize: 26, color: C.purple, marginTop: 6 }}>"매출 데이터 자동 정리 파이썬 코드 짜줘"</div>
        <div style={{ width: 60, height: 4, background: C.gpt, borderRadius: 2, marginTop: 10 }} />
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1 }}>
        <CodeBlock
          aiName="ChatGPT" aiColor={C.gpt} quality="bad"
          lines={[
            'import pandas as pd',
            '',
            'df = pd.read_excel("data.xlsx")',
            'df_sorted = df.sort_values("매출")',
            'df_sorted.to_excel("output.xlsx")',
          ]}
          highlights={[]}
          frame={f} startF={4}
        />
        <CodeBlock
          aiName="Claude" aiColor={C.amber} quality="good"
          lines={[
            'import pandas as pd',
            'from pathlib import Path',
            '',
            'try:',
            '  df = pd.read_excel(path)',
            'except FileNotFoundError:',
            '  raise SystemExit("파일 없음")',
            '',
            '# 중복 제거 + 정렬',
            'result = df.drop_duplicates()',
          ]}
          highlights={[
            { line: 3, color: C.amber, label: '에러처리' },
            { line: 5, color: C.amber },
            { line: 8, color: C.green, label: '품질' },
          ]}
          frame={f} startF={4}
        />
      </div>
    </div>
  );
};

// ── SceneSearch (검색 비교) ───────────────────────────────────────────────────
const SceneSearch: React.FC<{ absMs: number; startMs: number }> = ({ absMs, startMs }) => {
  const f = msToF(absMs - startMs);
  const claudeStart = msToF(24439 - 20341);
  const geminiStart = msToF(27597 - 20341);

  return (
    <div style={{ position: 'absolute', top: ST + 20, bottom: SB + 200, left: 44, right: 44, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ opacity: ci(f, 0, 10) }}>
        <div style={{ fontFamily: FONT, fontSize: 34, color: C.sub }}>검색 테스트</div>
        <div style={{ fontFamily: MONO, fontSize: 28, color: C.blue, marginTop: 6 }}>"오늘 AI 뉴스 3줄 요약해줘"</div>
        <div style={{ width: 60, height: 4, background: C.blue, borderRadius: 2, marginTop: 10 }} />
      </div>

      {/* Claude 답변 (실패) */}
      <ChatBubble
        role="ai" aiName="Claude" aiColor={C.amber} quality="bad"
        lines={[
          '저는 2024년 4월까지의',
          '데이터만 학습했습니다.',
          '최신 뉴스는 제공이 어렵습니다.',
        ]}
        highlights={[
          { word: '어렵습니다.', color: C.red },
        ]}
        frame={f} startF={claudeStart}
      />

      {/* X 표시 */}
      <div style={{
        opacity: ci(f, claudeStart + 14, claudeStart + 22),
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 18px',
        background: `${C.red}15`, border: `1px solid ${C.red}44`, borderRadius: 12,
      }}>
        <span style={{ fontSize: 26 }}>❌</span>
        <span style={{ fontFamily: FONT, fontSize: 24, color: C.red }}>실시간 정보 불가 — 검색 연동 없음</span>
      </div>

      {/* Gemini 답변 (성공) */}
      <ChatBubble
        role="ai" aiName="Gemini" aiColor={C.blue} quality="good"
        lines={[
          `[${new Date().toLocaleDateString('ko-KR')} 기준]`,
          '① OpenAI GPT-5 발표 임박 보도',
          '② 삼성 on-device AI 신규 특허',
          '③ 국내 AI 스타트업 투자 급증',
        ]}
        highlights={[
          { word: '기준]', color: C.blue },
          { word: '①', color: C.blue },
          { word: '②', color: C.blue },
          { word: '③', color: C.blue },
        ]}
        frame={f} startF={geminiStart}
      />

      {/* O 표시 */}
      <div style={{
        opacity: ci(f, geminiStart + 14, geminiStart + 22),
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 18px',
        background: `${C.blue}15`, border: `1px solid ${C.blue}44`, borderRadius: 12,
      }}>
        <span style={{ fontSize: 26 }}>✅</span>
        <span style={{ fontFamily: FONT, fontSize: 24, color: C.blue }}>Google 검색 연동 — 실시간 가능</span>
      </div>
    </div>
  );
};

// ── SceneSplit (결론) ─────────────────────────────────────────────────────────
const SceneSplit: React.FC<{ absMs: number; startMs: number }> = ({ absMs, startMs }) => {
  const f = msToF(absMs - startMs);

  const CARDS = [
    { icon: '✍️', task: '글쓰기 · 기획서 · 문서', ai: 'Claude', color: C.amber, reason: '구조 + 전략 + 깊이' },
    { icon: '💻', task: '코딩 · 자동화 스크립트', ai: 'Claude / ChatGPT', color: C.gpt, reason: '에러처리 + 완성도' },
    { icon: '🔍', task: '검색 · 뉴스 · 리서치', ai: 'Gemini', color: C.blue, reason: '실시간 Google 연동' },
  ];

  return (
    <div style={{ position: 'absolute', top: ST + 20, bottom: SB + 200, left: 44, right: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
      <div style={{ opacity: ci(f, 0, 12) }}>
        <div style={{ fontFamily: FONT, fontSize: 40, color: C.sub }}>테스트 결론</div>
        <div style={{ fontFamily: FONT, fontSize: 68, fontWeight: 900, color: C.text, lineHeight: 1.1 }}>
          용도별로<br />달랐습니다
        </div>
        <div style={{ width: 80, height: 5, background: C.purple, borderRadius: 3, marginTop: 14 }} />
      </div>

      {CARDS.map((c, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 20,
          opacity: ci(f, 12 + i * 10, 22 + i * 10),
          transform: `translateX(${ci(f, 12 + i * 10, 22 + i * 10, -60, 0)}px)`,
          background: C.card,
          borderLeft: `6px solid ${c.color}`,
          borderRadius: 18, padding: '22px 26px',
        }}>
          <span style={{ fontSize: 42 }}>{c.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT, fontSize: 26, color: C.sub, marginBottom: 4 }}>{c.task}</div>
            <div style={{ fontFamily: FONT, fontSize: 40, fontWeight: 900, color: c.color }}>{c.ai}</div>
          </div>
          <div style={{
            fontFamily: FONT, fontSize: 22, color: C.sub,
            background: C.panel, borderRadius: 10, padding: '6px 14px', textAlign: 'right',
          }}>{c.reason}</div>
        </div>
      ))}

      {/* 마무리 */}
      <div style={{
        opacity: ci(f, 42, 52),
        background: `${C.red}18`, border: `2px solid ${C.red}55`,
        borderRadius: 16, padding: '18px 24px', textAlign: 'center',
        fontFamily: FONT, fontSize: 38, fontWeight: 900, color: C.red,
      }}>
        하나만 쓰면 손해 — 셋 다 무료
      </div>
    </div>
  );
};

// ── 씬 경계 ──────────────────────────────────────────────────────────────────
const SCENE_START = {
  hook:    0,
  writing: 8197,
  coding:  13061,
  search:  20341,
  split:   29942,
};

const T = 10;
const DUR = {
  hook:    msToF(8197),
  writing: msToF(13061 - 8197),
  coding:  msToF(20341 - 13061),
  search:  msToF(29942 - 20341),
  split:   msToF(35759 - 29942) + T * 5,
};

// ── Props ──────────────────────────────────────────────────────────────────────
export interface AIPromptProps { audioDurationSeconds: number; }
export const defaultAIPromptProps: AIPromptProps = { audioDurationSeconds: 36.3 };

// ── 메인 ──────────────────────────────────────────────────────────────────────
export const AIPromptCompare: React.FC<AIPromptProps> = () => {
  const frame = useCurrentFrame();
  const ms    = (frame / FPS) * 1000;
  const seg   = getSeg(ms);

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <NoiseBg frame={frame} />
      <Audio src={staticFile('audio/aiprompt_tts.mp3')} />

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={DUR.hook}>
          <AbsoluteFill><SceneHook absMs={ms} /></AbsoluteFill>
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={springTiming({ durationInFrames: T, config: { damping: 14 } })} presentation={slide({ direction: 'from-right' })} />

        <TransitionSeries.Sequence durationInFrames={DUR.writing}>
          <AbsoluteFill><SceneWriting absMs={ms} startMs={SCENE_START.writing} /></AbsoluteFill>
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={wipe({ direction: 'from-left' })} />

        <TransitionSeries.Sequence durationInFrames={DUR.coding}>
          <AbsoluteFill><SceneCoding absMs={ms} startMs={SCENE_START.coding} /></AbsoluteFill>
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={wipe({ direction: 'from-right' })} />

        <TransitionSeries.Sequence durationInFrames={DUR.search}>
          <AbsoluteFill><SceneSearch absMs={ms} startMs={SCENE_START.search} /></AbsoluteFill>
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={springTiming({ durationInFrames: T, config: { damping: 12 } })} presentation={slide({ direction: 'from-bottom' })} />

        <TransitionSeries.Sequence durationInFrames={DUR.split}>
          <AbsoluteFill><SceneSplit absMs={ms} startMs={SCENE_START.split} /></AbsoluteFill>
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <CaptionOverlay captions={RAW_CAPTIONS} accent={seg?.accent ?? C.purple} fontSize={44} position="bottom" wordsPerPage={1200} />
      <SceneFlash frame={frame} />
    </AbsoluteFill>
  );
};
