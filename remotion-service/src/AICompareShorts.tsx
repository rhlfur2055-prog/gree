// AICompareShorts.tsx
// ChatGPT vs Claude vs Gemini — 직장인 실무 비교 (ai_purple 팔레트)

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
  bg:     '#0D0B1A',
  card:   '#1A1730',
  border: '#2A2550',
  text:   '#FFFFFF',
  sub:    '#A0A0C0',
  purple: '#BF5AF2',
  gpt:    '#10A37F',
  amber:  '#F59E0B',
  blue:   '#4285F4',
  red:    '#FF3B30',
  green:  '#30D158',
  gold:   '#FFD60A',
};

const FONT = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const FPS  = 30;
const ST   = 200;
const SB   = 380;

// ── SEGS (TTS 전 추정값 — node get_aicompare_timestamps.js 실행 후 교체) ──────
interface Seg { startMs: number; endMs: number; text: string; hl?: string; accent?: string; scene: string; }

const SEGS: Seg[] = [
  { startMs:      0, endMs:   2264, text: 'ChatGPT · Claude · Gemini',                              scene: 'hook'       },
  { startMs:   2264, endMs:   3541, text: '셋 다 써봤습니다',                                        scene: 'hook'       },
  { startMs:   3541, endMs:   5817, text: '직장인 실무 기준 비교',                                   scene: 'hook'       },
  { startMs:   5817, endMs:   7523, text: '승자 알려드립니다',      hl: '승자',   accent: C.purple,  scene: 'hook'       },
  { startMs:   7523, endMs:   8986, text: '글쓰기 업무 비교',                                        scene: 'writing'    },
  { startMs:   8986, endMs:  10380, text: '기획서 · 보고서 · 이메일',                                scene: 'writing'    },
  { startMs:  10380, endMs:  12075, text: 'Claude 압도적 1위',      hl: 'Claude', accent: C.amber,   scene: 'writing'    },
  { startMs:  12075, endMs:  13863, text: '코딩 자동화 비교',                                        scene: 'coding'     },
  { startMs:  13863, endMs:  15825, text: '엑셀 매크로 · 파이썬 스크립트',                           scene: 'coding'     },
  { startMs:  15825, endMs:  17903, text: 'Claude 1위 · ChatGPT 2위', hl: 'Claude', accent: C.amber, scene: 'coding'    },
  { startMs:  17903, endMs:  19877, text: '실시간 검색 비교',                                        scene: 'search'     },
  { startMs:  19877, endMs:  21629, text: '최신 뉴스 · 트렌드 조사',                                 scene: 'search'     },
  { startMs:  21629, endMs:  23824, text: 'Gemini 압도적 1위',      hl: 'Gemini', accent: C.blue,    scene: 'search'     },
  { startMs:  23824, endMs:  24892, text: '결론 나왔습니다',                                         scene: 'split'      },
  { startMs:  24892, endMs:  26668, text: '글쓰기 문서 → Claude',   hl: 'Claude', accent: C.amber,   scene: 'split'      },
  { startMs:  26668, endMs:  28549, text: '코딩 자동화 → ChatGPT',  hl: 'ChatGPT', accent: C.gpt,    scene: 'split'      },
  { startMs:  28549, endMs:  30023, text: '검색 리서치 → Gemini',   hl: 'Gemini', accent: C.blue,    scene: 'split'      },
  { startMs:  30023, endMs:  31544, text: '하나만 쓰면 손해입니다', hl: '손해',   accent: C.red,     scene: 'conclusion' },
  { startMs:  31544, endMs:  33239, text: '셋 다 무료 버전 있습니다', hl: '무료', accent: C.gpt,     scene: 'conclusion' },
  { startMs:  33239, endMs:  34342, text: '오늘부터 바꿔보세요',                                     scene: 'cta'        },
  { startMs:  34342, endMs:  35991, text: '월 5시간 이상 아낍니다', hl: '5시간', accent: C.purple,   scene: 'cta'        },
];

export const AI_COMPARE_TOTAL_FRAMES = Math.ceil(36.5 * FPS);

const ci = (f: number, s: number, e: number, os = 0, oe = 1) =>
  interpolate(f, [s, e], [os, oe], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const msToF = (ms: number) => Math.round((ms / 1000) * FPS);

function getSeg(ms: number): Seg | null { return SEGS.find(s => ms >= s.startMs && ms < s.endMs) ?? null; }

const RAW_CAPTIONS: RawCaption[] = SEGS.map(s => ({ text: s.text, startMs: s.startMs, endMs: s.endMs }));

const BOUNDS_MS = [7523, 12075, 17903, 23824, 30023, 33239];

// ── Noise 배경 ─────────────────────────────────────────────────────────────────
const NoiseBg: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame * 0.014;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      {Array.from({ length: 20 }, (_, i) => {
        const nx = noise2D(`nx${i}`, i * 0.4, t);
        const ny = noise2D(`ny${i}`, i * 0.4 + 50, t);
        const ns = noise2D(`ns${i}`, i * 0.4 + 100, t * 0.5);
        const no = noise2D(`no${i}`, i * 0.4 + 150, t * 0.3);
        const colors = [C.purple, C.gpt, C.blue, C.amber];
        return (
          <div key={i} style={{
            position: 'absolute',
            left: ((nx + 1) / 2) * 1080,
            top:  ((ny + 1) / 2) * 1920,
            width:  2 + ((ns + 1) / 2) * 5,
            height: 2 + ((ns + 1) / 2) * 5,
            borderRadius: '50%',
            background: colors[i % 4],
            transform: 'translate(-50%,-50%)',
            opacity: 0.12 + ((no + 1) / 2) * 0.18,
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
    if (d >= -2 && d <= 5)
      op = Math.max(op, d <= 0
        ? ci(d, -2, 0, 0, 0.6)
        : ci(d, 0, 5, 0.6, 0));
  }
  if (op < 0.01) return null;
  return <div style={{ position: 'absolute', inset: 0, background: C.purple, opacity: op * 0.25, pointerEvents: 'none', zIndex: 95 }} />;
};

// ── AI 바 차트 행 ──────────────────────────────────────────────────────────────
const BarRow: React.FC<{
  name: string; color: string; score: number; maxScore: number;
  delay: number; frame: number; isWinner: boolean;
}> = ({ name, color, score, maxScore, delay, frame, isWinner }) => {
  const prog  = ci(frame, delay, delay + 28);
  const width = ci(frame, delay, delay + 28, 0, (score / maxScore) * 100);
  const num   = Math.round(ci(frame, delay, delay + 28, 0, score));
  const scale = isWinner ? 1 + 0.02 * Math.sin(frame * 0.12) : 1;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28,
      opacity: ci(frame, delay - 4, delay + 6),
      transform: `scale(${scale})`,
    }}>
      {/* AI 이름 뱃지 */}
      <div style={{
        width: 160, flexShrink: 0,
        background: isWinner ? color : 'transparent',
        border: `2px solid ${color}`,
        borderRadius: 12, padding: '8px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontFamily: FONT, fontSize: 28, fontWeight: 700, color: isWinner ? '#000' : C.text }}>{name}</span>
      </div>
      {/* 바 */}
      <div style={{ flex: 1, height: 32, background: `${color}22`, borderRadius: 8, overflow: 'hidden' }}>
        <div style={{
          width: `${width}%`, height: '100%',
          background: isWinner ? `linear-gradient(90deg,${color},${color}CC)` : `${color}88`,
          borderRadius: 8,
          boxShadow: isWinner ? `0 0 18px ${color}66` : 'none',
          transition: 'none',
        }} />
      </div>
      {/* 점수 */}
      <div style={{ width: 70, textAlign: 'right' }}>
        <span style={{ fontFamily: FONT, fontSize: 32, fontWeight: 800, color: isWinner ? color : C.sub }}>
          {num}
        </span>
        {isWinner && <span style={{ fontSize: 22, marginLeft: 4 }}>★</span>}
      </div>
    </div>
  );
};

// ── SceneHook ──────────────────────────────────────────────────────────────────
const SceneHook: React.FC<{ absMs: number }> = ({ absMs }) => {
  const f  = msToF(absMs);
  const t1 = ci(f, 0, 18, 60, 0);
  const t2 = ci(f, 8, 26, 60, 0);
  const t3 = ci(f, 16, 34, 60, 0);

  const AI_LIST = [
    { name: 'ChatGPT', sub: 'OpenAI', color: C.gpt  },
    { name: 'Claude',  sub: 'Anthropic', color: C.amber },
    { name: 'Gemini',  sub: 'Google', color: C.blue  },
  ];

  return (
    <div style={{ position: 'absolute', top: ST + 40, bottom: SB + 200, left: 44, right: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
      {/* 제목 */}
      <div style={{ opacity: ci(f, 0, 12), transform: `translateY(${t1}px)`, textAlign: 'center' }}>
        <div style={{ fontFamily: FONT, fontSize: 38, fontWeight: 700, color: C.sub, letterSpacing: 2, marginBottom: 8 }}>직장인 실무 AI 비교</div>
        <div style={{ fontFamily: FONT, fontSize: 72, fontWeight: 900, color: C.text, lineHeight: 1.1 }}>누가 진짜<br />강한가요?</div>
      </div>

      {/* AI 카드 3개 */}
      <div style={{ display: 'flex', gap: 24, width: '100%' }}>
        {AI_LIST.map((ai, i) => {
          const delays = [0, 8, 16];
          const translateYs = [t1, t2, t3];
          return (
            <div key={i} style={{
              flex: 1,
              opacity: ci(f, delays[i], delays[i] + 12),
              transform: `translateY(${translateYs[i]}px)`,
              background: C.card,
              border: `2px solid ${ai.color}`,
              borderRadius: 24,
              padding: '32px 20px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              boxShadow: `0 0 30px ${ai.color}33`,
            }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: ai.color, boxShadow: `0 0 12px ${ai.color}` }} />
              <div style={{ fontFamily: FONT, fontSize: 32, fontWeight: 800, color: C.text }}>{ai.name}</div>
              <div style={{ fontFamily: FONT, fontSize: 22, color: C.sub }}>{ai.sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── SceneCompare (글쓰기/코딩/검색 공통) ─────────────────────────────────────
interface CompareItem { name: string; color: string; score: number; }
interface CompareData { title: string; subtitle: string; items: CompareItem[]; winnerIdx: number; }

const SceneCompare: React.FC<{ absMs: number; startMs: number; data: CompareData }> = ({ absMs, startMs, data }) => {
  const f   = msToF(absMs - startMs);
  const max = Math.max(...data.items.map(x => x.score));

  return (
    <div style={{ position: 'absolute', top: ST + 30, bottom: SB + 200, left: 44, right: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40 }}>
      {/* 제목 */}
      <div style={{ opacity: ci(f, 0, 12) }}>
        <div style={{ fontFamily: FONT, fontSize: 36, fontWeight: 700, color: C.sub, marginBottom: 6 }}>{data.subtitle}</div>
        <div style={{ fontFamily: FONT, fontSize: 64, fontWeight: 900, color: C.text }}>{data.title}</div>
        <div style={{ width: 80, height: 4, background: data.items[data.winnerIdx].color, borderRadius: 2, marginTop: 12 }} />
      </div>

      {/* 바 차트 */}
      <div>
        {data.items.map((item, i) => (
          <BarRow
            key={i}
            name={item.name}
            color={item.color}
            score={item.score}
            maxScore={max}
            delay={i * 10}
            frame={f}
            isWinner={i === data.winnerIdx}
          />
        ))}
      </div>

      {/* 승자 뱃지 */}
      <div style={{
        opacity: ci(f, 35, 45),
        transform: `scale(${ci(f, 35, 45, 0.8, 1)})`,
        background: data.items[data.winnerIdx].color,
        borderRadius: 20, padding: '16px 40px',
        alignSelf: 'flex-start',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 28 }}>🏆</span>
        <span style={{ fontFamily: FONT, fontSize: 32, fontWeight: 800, color: '#000' }}>
          {data.items[data.winnerIdx].name} 승리
        </span>
      </div>
    </div>
  );
};

// ── SceneSplit (결론 — 용도별 추천) ──────────────────────────────────────────
const RECOMMEND = [
  { task: '글쓰기 · 문서', ai: 'Claude',  color: C.amber, icon: '✍️' },
  { task: '코딩 · 자동화', ai: 'ChatGPT', color: C.gpt,   icon: '💻' },
  { task: '검색 · 리서치', ai: 'Gemini',  color: C.blue,  icon: '🔍' },
];

const SceneSplit: React.FC<{ absMs: number; startMs: number }> = ({ absMs, startMs }) => {
  const f = msToF(absMs - startMs);
  return (
    <div style={{ position: 'absolute', top: ST + 30, bottom: SB + 200, left: 44, right: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 32 }}>
      <div style={{ opacity: ci(f, 0, 12) }}>
        <div style={{ fontFamily: FONT, fontSize: 38, fontWeight: 700, color: C.sub, marginBottom: 6 }}>결론</div>
        <div style={{ fontFamily: FONT, fontSize: 64, fontWeight: 900, color: C.text }}>용도별 최강 AI</div>
        <div style={{ width: 80, height: 4, background: C.purple, borderRadius: 2, marginTop: 12 }} />
      </div>

      {RECOMMEND.map((r, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 24,
          opacity: ci(f, i * 12, i * 12 + 14),
          transform: `translateX(${ci(f, i * 12, i * 12 + 14, -60, 0)}px)`,
          background: C.card,
          border: `2px solid ${r.color}33`,
          borderLeft: `6px solid ${r.color}`,
          borderRadius: 20, padding: '28px 32px',
        }}>
          <span style={{ fontSize: 44 }}>{r.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT, fontSize: 28, color: C.sub, marginBottom: 4 }}>{r.task}</div>
            <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 900, color: r.color }}>{r.ai}</div>
          </div>
          <div style={{
            background: r.color, borderRadius: 12, padding: '8px 20px',
            fontFamily: FONT, fontSize: 24, fontWeight: 700, color: '#000',
          }}>1위</div>
        </div>
      ))}
    </div>
  );
};

// ── SceneConclusion ────────────────────────────────────────────────────────────
const SceneConclusion: React.FC<{ absMs: number; startMs: number }> = ({ absMs, startMs }) => {
  const f     = msToF(absMs - startMs);
  const pulse = 1 + 0.025 * Math.sin(f * 0.15);

  return (
    <div style={{ position: 'absolute', top: ST + 30, bottom: SB + 200, left: 44, right: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 40, textAlign: 'center' }}>
      <div style={{ transform: `scale(${pulse})`, opacity: ci(f, 0, 14) }}>
        <div style={{ fontFamily: FONT, fontSize: 80, fontWeight: 900, color: C.red, lineHeight: 1.1, marginBottom: 16 }}>
          하나만 쓰면<br />손해입니다
        </div>
        <div style={{ width: 120, height: 5, background: C.red, borderRadius: 3, margin: '0 auto 32px' }} />
        <div style={{
          fontFamily: FONT, fontSize: 48, fontWeight: 700, color: C.gpt,
          background: `${C.gpt}22`, border: `2px solid ${C.gpt}`, borderRadius: 20, padding: '16px 40px',
          opacity: ci(f, 14, 26),
        }}>
          셋 다 무료입니다 ✓
        </div>
      </div>
    </div>
  );
};

// ── SceneCTA ──────────────────────────────────────────────────────────────────
const SceneCTA: React.FC<{ absMs: number; startMs: number }> = ({ absMs, startMs }) => {
  const f     = msToF(absMs - startMs);
  const pulse = 1 + 0.02 * Math.sin(f * 0.18);

  return (
    <div style={{ position: 'absolute', top: ST + 30, bottom: SB + 200, left: 44, right: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 32, textAlign: 'center' }}>
      <div style={{ opacity: ci(f, 0, 14), transform: `translateY(${ci(f, 0, 14, 40, 0)}px)` }}>
        <div style={{ fontFamily: FONT, fontSize: 40, color: C.sub, marginBottom: 12 }}>지금 바로 시작하면</div>
        <div style={{ fontFamily: FONT, fontSize: 88, fontWeight: 900, color: C.purple, lineHeight: 1.0, textShadow: `0 0 40px ${C.purple}88` }}>
          월 5시간<br />절약
        </div>
      </div>

      <div style={{
        opacity: ci(f, 16, 28),
        transform: `scale(${ci(f, 16, 28, 0.85, 1) * pulse})`,
        background: `linear-gradient(135deg, ${C.purple}, ${C.blue})`,
        borderRadius: 28, padding: '28px 60px',
        boxShadow: `0 0 50px ${C.purple}55`,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 40, fontWeight: 800, color: '#FFF' }}>
          📌 팔로우하면 더 알려드림
        </div>
      </div>

      <div style={{ opacity: ci(f, 24, 36), fontFamily: FONT, fontSize: 28, color: C.sub }}>
        @codemaser
      </div>
    </div>
  );
};

// ── 씬 경계 상수 ──────────────────────────────────────────────────────────────
const SCENE_START = {
  hook:       0,
  writing:    7523,
  coding:     12075,
  search:     17903,
  split:      23824,
  conclusion: 30023,
  cta:        33239,
};

const T = 10;
const DUR = {
  hook:       msToF(7523),
  writing:    msToF(12075 - 7523),
  coding:     msToF(17903 - 12075),
  search:     msToF(23824 - 17903),
  split:      msToF(30023 - 23824),
  conclusion: msToF(33239 - 30023),
  cta:        msToF(35991 - 33239) + T * 6,
};

const COMPARE_DATA: Record<string, CompareData> = {
  writing: {
    title: '글쓰기 업무',
    subtitle: '기획서 · 보고서 · 이메일',
    items: [
      { name: 'Claude',  color: C.amber, score: 95 },
      { name: 'ChatGPT', color: C.gpt,   score: 78 },
      { name: 'Gemini',  color: C.blue,  score: 62 },
    ],
    winnerIdx: 0,
  },
  coding: {
    title: '코딩 자동화',
    subtitle: '엑셀 매크로 · 파이썬 · SQL',
    items: [
      { name: 'Claude',  color: C.amber, score: 92 },
      { name: 'ChatGPT', color: C.gpt,   score: 85 },
      { name: 'Gemini',  color: C.blue,  score: 68 },
    ],
    winnerIdx: 0,
  },
  search: {
    title: '실시간 검색',
    subtitle: '최신 뉴스 · 트렌드 · 팩트체크',
    items: [
      { name: 'Gemini',  color: C.blue,  score: 94 },
      { name: 'ChatGPT', color: C.gpt,   score: 80 },
      { name: 'Claude',  color: C.amber, score: 55 },
    ],
    winnerIdx: 0,
  },
};

// ── Props ─────────────────────────────────────────────────────────────────────
export interface AICompareProps { audioDurationSeconds: number; }
export const defaultAICompareProps: AICompareProps = { audioDurationSeconds: 35.5 };

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export const AICompareShorts: React.FC<AICompareProps> = () => {
  const frame = useCurrentFrame();
  const ms    = (frame / FPS) * 1000;
  const seg   = getSeg(ms);

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <NoiseBg frame={frame} />

      <Audio src={staticFile('audio/aicompare_tts.mp3')} />

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={DUR.hook}>
          <AbsoluteFill>
            <SceneHook absMs={ms} />
          </AbsoluteFill>
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={springTiming({ durationInFrames: T, config: { damping: 14 } })} presentation={slide({ direction: 'from-right' })} />

        <TransitionSeries.Sequence durationInFrames={DUR.writing}>
          <AbsoluteFill>
            <SceneCompare absMs={ms} startMs={SCENE_START.writing} data={COMPARE_DATA.writing} />
          </AbsoluteFill>
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={wipe({ direction: 'from-left' })} />

        <TransitionSeries.Sequence durationInFrames={DUR.coding}>
          <AbsoluteFill>
            <SceneCompare absMs={ms} startMs={SCENE_START.coding} data={COMPARE_DATA.coding} />
          </AbsoluteFill>
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={wipe({ direction: 'from-right' })} />

        <TransitionSeries.Sequence durationInFrames={DUR.search}>
          <AbsoluteFill>
            <SceneCompare absMs={ms} startMs={SCENE_START.search} data={COMPARE_DATA.search} />
          </AbsoluteFill>
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={springTiming({ durationInFrames: T, config: { damping: 14 } })} presentation={slide({ direction: 'from-bottom' })} />

        <TransitionSeries.Sequence durationInFrames={DUR.split}>
          <AbsoluteFill>
            <SceneSplit absMs={ms} startMs={SCENE_START.split} />
          </AbsoluteFill>
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={fade()} />

        <TransitionSeries.Sequence durationInFrames={DUR.conclusion}>
          <AbsoluteFill>
            <SceneConclusion absMs={ms} startMs={SCENE_START.conclusion} />
          </AbsoluteFill>
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={springTiming({ durationInFrames: T, config: { damping: 12 } })} presentation={slide({ direction: 'from-bottom' })} />

        <TransitionSeries.Sequence durationInFrames={DUR.cta}>
          <AbsoluteFill>
            <SceneCTA absMs={ms} startMs={SCENE_START.cta} />
          </AbsoluteFill>
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {/* 캡션 + 플래시 — TransitionSeries 밖 */}
      <CaptionOverlay
        captions={RAW_CAPTIONS}
        accent={seg?.accent ?? C.purple}
        fontSize={44}
        position="bottom"
        wordsPerPage={1200}
      />
      <SceneFlash frame={frame} />
    </AbsoluteFill>
  );
};
