// AISideIncomeShorts.tsx
// 직장인이 AI로 퇴근 후 월 300만원 버는 법 — growth_green 팔레트

import React from 'react';
import {
  AbsoluteFill, Audio, interpolate, Sequence,
  spring, staticFile, useCurrentFrame,
} from 'remotion';
import { TransitionSeries, linearTiming, springTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { useAudioData, visualizeAudio } from '@remotion/media-utils';
import type { AudioData } from '@remotion/media-utils';
import { noise2D } from '@remotion/noise';
import { CaptionOverlay } from './components/CaptionOverlay';
import type { RawCaption } from './components/CaptionOverlay';

// ── 팔레트 ────────────────────────────────────────────────────────────────────
const C = {
  bg:        '#FFFFFF',
  text:      '#111111',
  sub:       '#555555',
  green:     '#34C759',
  blue:      '#007AFF',
  red:       '#FF3B30',
  amber:     '#FF9500',
  gold:      '#FFD60A',
  card:      '#F8F8FA',
  border:    '#E5E5EA',
  darkGreen: '#F0FFF4',
  darkBlue:  '#F0F5FF',
};

const FONT = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const FPS  = 30;
const ST   = 200;
const SB   = 380;
const SS   = 44;

export const AI_SIDE_INCOME_TOTAL_FRAMES = Math.ceil(41.0 * FPS);

const ci = (f: number, s: number, e: number, os = 0, oe = 1) =>
  interpolate(f, [s, e], [os, oe], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const sp = (frame: number, delay = 0, damping = 14, stiffness = 120) =>
  spring({ frame: frame - delay, fps: FPS, config: { damping, stiffness, mass: 0.5 } });
const msToF = (ms: number) => Math.round((ms / 1000) * FPS);

// ── SEGS ─────────────────────────────────────────────────────────────────────
interface Seg { startMs: number; endMs: number; text: string; hl?: string; accent?: string; scene: string; }

const SEGS: Seg[] = [
  { startMs:     0, endMs:  1600, text: '월급만으론 부족하죠',                                                   scene: 'hook'       },
  { startMs:  1600, endMs:  3400, text: '직장인도 AI로 부업합니다',                                              scene: 'hook'       },
  { startMs:  3400, endMs:  5200, text: '실제로 월 300만원 버는 사람들', hl: '300만원', accent: C.green,         scene: 'hook'       },
  { startMs:  5200, endMs:  6800, text: '퇴근 후 2시간으로요',            hl: '2시간',   accent: C.blue,         scene: 'hook'       },
  { startMs:  6800, endMs:  8800, text: '크몽·숨고 AI 의뢰 3배 증가',    hl: '3배',     accent: C.amber,        scene: 'stats'      },
  { startMs:  8800, endMs: 11000, text: 'AI 작업 단가 건당 30~150만원',  hl: '30~150만원', accent: C.green,     scene: 'stats'      },
  { startMs: 11000, endMs: 13500, text: '월 200만원+ 버는 직장인 늘고 있습니다', hl: '200만원+', accent: C.green, scene: 'stats'    },
  { startMs: 13500, endMs: 15000, text: 'AI 부업 5가지 알려드립니다',                                            scene: 'methods'    },
  { startMs: 15000, endMs: 17000, text: '① AI 블로그 수익화',                                                    scene: 'methods'    },
  { startMs: 17000, endMs: 18800, text: '② AI 썸네일 디자인 대행',                                              scene: 'methods'    },
  { startMs: 18800, endMs: 20600, text: '③ AI 영상 편집 대행',                                                  scene: 'methods'    },
  { startMs: 20600, endMs: 22400, text: '④ AI 콘텐츠 제작 대행',                                                scene: 'methods'    },
  { startMs: 22400, endMs: 24500, text: '⑤ AI 챗봇 구축 대행',          hl: '챗봇',    accent: C.blue,         scene: 'methods'    },
  { startMs: 24500, endMs: 25800, text: '시작은 간단합니다',                                                     scene: 'howto'      },
  { startMs: 25800, endMs: 28000, text: 'ChatGPT Plus 월 28,000원이면 충분합니다',                               scene: 'howto'      },
  { startMs: 28000, endMs: 30000, text: '크몽·숨고에 바로 등록하세요',                                           scene: 'howto'      },
  { startMs: 30000, endMs: 32500, text: '첫 달 목표 50만원으로 시작하면 됩니다',                                  scene: 'howto'      },
  { startMs: 32500, endMs: 34000, text: 'AI는 도구입니다',                                                       scene: 'conclusion' },
  { startMs: 34000, endMs: 35800, text: '쓰는 사람만 돈 법니다',         hl: '쓰는 사람만', accent: C.green,    scene: 'conclusion' },
  { startMs: 35800, endMs: 37800, text: '직장 다니면서도 됩니다',                                                scene: 'conclusion' },
  { startMs: 37800, endMs: 40100, text: '지금 시작이 6개월 후를 바꿉니다', hl: '6개월 후', accent: C.green,     scene: 'cta'        },
];

function getSeg(ms: number): Seg | null { return SEGS.find(s => ms >= s.startMs && ms < s.endMs) ?? null; }
function getScene(ms: number): string { return getSeg(ms)?.scene ?? 'hook'; }

const RAW_CAPTIONS: RawCaption[] = SEGS.map(s => ({ text: s.text, startMs: s.startMs, endMs: s.endMs }));

// ── Noise 배경 ─────────────────────────────────────────────────────────────────
const NoiseBg: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame * 0.016;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      {Array.from({ length: 24 }, (_, i) => {
        const nx = noise2D(`snx${i}`, i * 0.4, t);
        const ny = noise2D(`sny${i}`, i * 0.4 + 60, t);
        const ns = noise2D(`sns${i}`, i * 0.4 + 120, t * 0.5);
        const no = noise2D(`sno${i}`, i * 0.4 + 180, t * 0.3);
        return (
          <div key={i} style={{
            position: 'absolute',
            left: ((nx + 1) / 2) * 1080,
            top:  ((ny + 1) / 2) * 1920,
            width:  3 + ((ns + 1) / 2) * 8,
            height: 3 + ((ns + 1) / 2) * 8,
            borderRadius: '50%',
            background: i % 2 === 0 ? '#BBEECC' : '#CCDDFF',
            transform: 'translate(-50%,-50%)',
            opacity: 0.3 + ((no + 1) / 2) * 0.4,
          }} />
        );
      })}
    </div>
  );
};

// ── 씬 전환 플래시 ──────────────────────────────────────────────────────────────
const BOUNDS_MS = [6800, 13500, 24500, 32500, 37800];
const SceneFlash: React.FC<{ frame: number }> = ({ frame }) => {
  let op = 0;
  for (const bMs of BOUNDS_MS) {
    const d = frame - msToF(bMs);
    if (d >= -2 && d <= 5)
      op = Math.max(op, d <= 0
        ? interpolate(d, [-2, 0], [0, 0.7], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        : interpolate(d, [0, 5], [0.7, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  }
  if (op < 0.01) return null;
  return <div style={{ position: 'absolute', inset: 0, background: C.green, opacity: op * 0.3, pointerEvents: 'none', zIndex: 95 }} />;
};

// ── Scene: Hook ──────────────────────────────────────────────────────────────
const SceneHook: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF  = msToF(absMs);
  const op    = ci(relF, 0, 12);
  const t1    = interpolate(sp(relF, 0,  20, 140), [0, 1], [50, 0]);
  const t2    = interpolate(sp(relF, 5,  24, 140), [0, 1], [50, 0]);
  const t3    = interpolate(sp(relF, 12, 30, 140), [0, 1], [50, 0]);
  const t4    = interpolate(sp(relF, 20, 38, 140), [0, 1], [50, 0]);
  const pulse = 0.97 + 0.03 * Math.sin(relF * 0.1);

  const income = absMs >= 3400 ? Math.round(ci(msToF(absMs - 3400), 0, 45) * 300) : 0;
  const incomeOp = absMs >= 3400 ? ci(msToF(absMs - 3400), 0, 10) : 0;

  return (
    <div style={{
      position: 'absolute', top: ST + 20, bottom: SB + 200,
      left: SS, right: SS,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      opacity: op,
    }}>
      {/* 채널 뱃지 */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: `linear-gradient(135deg, ${C.green}, #22A44A)`,
        borderRadius: 40, padding: '14px 28px', alignSelf: 'flex-start',
        transform: `translateY(${t1}px) scale(${pulse})`,
        boxShadow: `0 8px 28px ${C.green}50`,
      }}>
        <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 900, color: '#FFF' }}>⚡ codemasterAI</span>
      </div>

      {/* 메인 헤드라인 */}
      <div style={{ transform: `translateY(${t2}px)` }}>
        <div style={{ fontFamily: FONT, fontWeight: 900, letterSpacing: -2, lineHeight: 1.1 }}>
          <div style={{ fontSize: 48, color: C.sub, marginBottom: 4 }}>직장인도</div>
          <div style={{ fontSize: 100, color: C.green, textShadow: `0 8px 40px ${C.green}40` }}>AI 부업</div>
          <div style={{ fontSize: 48, color: C.sub }}>합니다</div>
        </div>
      </div>

      {/* 수익 카운터 */}
      <div style={{
        transform: `translateY(${t3}px)`,
        opacity: incomeOp,
        background: `linear-gradient(135deg, ${C.darkGreen}, #E8FFF0)`,
        borderRadius: 24, padding: '28px 32px',
        border: `2.5px solid ${C.green}50`,
        boxShadow: `0 10px 40px ${C.green}20`,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 20, color: C.green, fontWeight: 700, marginBottom: 8 }}>
          💰 실제 월 수익
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 88, fontWeight: 900,
          color: C.text, letterSpacing: -3, lineHeight: 1,
        }}>
          {income.toLocaleString()}
          <span style={{ fontSize: 40, color: C.green }}>만원</span>
        </div>
        <div style={{ fontFamily: FONT, fontSize: 28, color: C.sub, fontWeight: 600, marginTop: 8 }}>
          퇴근 후 2시간 · AI 툴만으로
        </div>
      </div>

      {/* 태그 */}
      <div style={{
        transform: `translateY(${t4}px)`,
        display: 'flex', gap: 14, flexWrap: 'wrap',
      }}>
        {['ChatGPT', 'Midjourney', 'Claude', 'Runway'].map((tag, i) => (
          <div key={i} style={{
            background: C.card, borderRadius: 40, padding: '14px 24px',
            border: `1.5px solid ${C.border}`,
            fontFamily: FONT, fontSize: 26, fontWeight: 700, color: C.sub,
          }}>
            {tag}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Scene: Stats ──────────────────────────────────────────────────────────────
const STATS = [
  { startMs: 6800,  label: '크몽·숨고 AI 의뢰 증가', value: 3,   unit: '배↑', sub: '2024 대비',         color: C.amber, icon: '📈' },
  { startMs: 8800,  label: 'AI 작업 평균 단가',       value: 150, unit: '만원', sub: '건당 최대 단가',   color: C.green, icon: '💰' },
  { startMs: 11000, label: '월 200만원+ 직장인',      value: 340, unit: '%↑',  sub: '2023년 대비 증가', color: C.blue,  icon: '🚀' },
];

const SceneStats: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF = msToF(absMs - 6800);
  const op   = ci(relF, 0, 12);

  return (
    <div style={{
      position: 'absolute', top: ST + 10, bottom: SB + 200,
      left: SS, right: SS,
      display: 'flex', flexDirection: 'column', gap: 18, opacity: op,
    }}>
      <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 800, color: C.sub, textAlign: 'center', flexShrink: 0, letterSpacing: 1 }}>
        📊 AI 부업 시장 데이터
      </div>

      {STATS.map((item, i) => {
        const shown  = absMs >= item.startMs;
        const itemF  = shown ? msToF(absMs - item.startMs) : 0;
        const itemOp = shown ? ci(itemF, 0, 14) : 0;
        const barW   = shown ? ci(itemF, 4, 55) : 0;
        const numVal = shown ? Math.round(ci(itemF, 4, 55) * item.value) : 0;

        return (
          <div key={i} style={{
            flex: 1, background: C.card, borderRadius: 24,
            border: `1.5px solid ${item.color}25`,
            padding: '0 32px',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14,
            opacity: itemOp,
            boxShadow: `0 4px 24px ${item.color}10`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 36 }}>{item.icon}</span>
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: C.sub }}>{item.label}</div>
                  <div style={{ fontFamily: FONT, fontSize: 15, color: `${item.color}99`, fontWeight: 600 }}>{item.sub}</div>
                </div>
              </div>
              <div style={{ fontFamily: FONT, fontSize: 64, fontWeight: 900, color: item.color, letterSpacing: -2, lineHeight: 1 }}>
                {numVal.toLocaleString()}<span style={{ fontSize: 28 }}>{item.unit}</span>
              </div>
            </div>
            <div style={{ height: 14, background: `${item.color}18`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{
                width: `${barW * 100}%`, height: '100%',
                background: `linear-gradient(90deg, ${item.color}88, ${item.color})`,
                borderRadius: 10, boxShadow: `0 0 12px ${item.color}50`,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Scene: Methods ────────────────────────────────────────────────────────────
const METHODS = [
  { startMs: 15000, num: '①', title: 'AI 블로그 수익화',     income: '월 50~200만원', tool: 'ChatGPT + 티스토리', icon: '✍️', color: C.blue  },
  { startMs: 17000, num: '②', title: 'AI 썸네일 디자인',     income: '건당 3~10만원', tool: 'Midjourney · Canva',  icon: '🎨', color: C.amber },
  { startMs: 18800, num: '③', title: 'AI 영상 편집 대행',    income: '건당 10~50만원', tool: 'Runway · CapCut AI', icon: '🎬', color: C.red   },
  { startMs: 20600, num: '④', title: 'AI 콘텐츠 제작',       income: '건당 5~30만원',  tool: 'Claude · GPT-4o',   icon: '📝', color: C.sub   },
  { startMs: 22400, num: '⑤', title: 'AI 챗봇 구축 대행',   income: '건당 50~200만원', tool: 'GPT API · n8n',     icon: '🤖', color: C.green },
];

const SceneMethods: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF = msToF(absMs - 13500);
  const op   = ci(relF, 0, 10);
  const titleOp = ci(relF, 0, 12);

  return (
    <div style={{
      position: 'absolute', top: ST + 10, bottom: SB + 200,
      left: SS, right: SS,
      display: 'flex', flexDirection: 'column', gap: 14, opacity: op,
    }}>
      <div style={{
        fontFamily: FONT, fontSize: 28, fontWeight: 900,
        color: C.text, flexShrink: 0, opacity: titleOp,
        borderBottom: `3px solid ${C.green}`,
        paddingBottom: 14,
      }}>
        💼 AI 부업 5가지
      </div>

      {METHODS.map((m, i) => {
        const shown  = absMs >= m.startMs;
        const itemF  = shown ? msToF(absMs - m.startMs) : 0;
        const itemOp = shown ? ci(itemF, 0, 10) : 0;
        const slideX = shown ? interpolate(sp(itemF, 0, 18, 130), [0, 1], [40, 0]) : 40;

        return (
          <div key={i} style={{
            flex: 1,
            background: shown && absMs >= m.startMs ? C.card : 'transparent',
            borderRadius: 20,
            border: `1.5px solid ${shown ? m.color + '40' : C.border}`,
            padding: '0 22px',
            display: 'flex', alignItems: 'center', gap: 18,
            opacity: itemOp,
            transform: `translateX(${slideX}px)`,
            boxShadow: shown ? `0 4px 20px ${m.color}12` : 'none',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: `${m.color}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, flexShrink: 0,
            }}>{m.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontFamily: FONT, fontSize: 18, fontWeight: 900, color: m.color }}>{m.num}</span>
                <span style={{ fontFamily: FONT, fontSize: 24, fontWeight: 900, color: C.text }}>{m.title}</span>
              </div>
              <div style={{ fontFamily: FONT, fontSize: 16, color: C.sub }}>{m.tool}</div>
            </div>
            <div style={{
              background: `${m.color}20`, borderRadius: 12, padding: '8px 16px',
              fontFamily: FONT, fontSize: 18, fontWeight: 800, color: m.color,
              flexShrink: 0, textAlign: 'right',
            }}>
              {m.income}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Scene: HowTo ──────────────────────────────────────────────────────────────
const STEPS = [
  { startMs: 25800, step: '1', title: 'ChatGPT Plus 가입',   sub: '월 28,000원 · 모든 AI 기능 활용', icon: '🔑', color: C.blue  },
  { startMs: 28000, step: '2', title: '크몽·숨고 등록',       sub: '프로필 작성 · AI 서비스 리스팅',   icon: '📋', color: C.amber },
  { startMs: 30000, step: '3', title: '첫 달 목표 50만원',   sub: '3건만 수주해도 달성 가능',          icon: '🎯', color: C.green },
];

const SceneHowTo: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF = msToF(absMs - 24500);
  const op   = ci(relF, 0, 10);

  return (
    <div style={{
      position: 'absolute', top: ST + 10, bottom: SB + 200,
      left: SS, right: SS,
      display: 'flex', flexDirection: 'column', gap: 20, opacity: op,
    }}>
      <div style={{
        fontFamily: FONT, fontSize: 28, fontWeight: 900, color: C.text,
        flexShrink: 0, textAlign: 'center',
      }}>
        🚀 지금 바로 시작하는 법
      </div>

      {STEPS.map((s, i) => {
        const shown  = absMs >= s.startMs;
        const itemF  = shown ? msToF(absMs - s.startMs) : 0;
        const itemOp = shown ? ci(itemF, 0, 12) : 0;
        const slideY = shown ? interpolate(sp(itemF, 0, 18, 130), [0, 1], [30, 0]) : 30;

        return (
          <div key={i} style={{
            flex: 1,
            background: C.card, borderRadius: 24,
            border: `2px solid ${s.color}40`,
            padding: '0 32px',
            display: 'flex', alignItems: 'center', gap: 24,
            opacity: itemOp, transform: `translateY(${slideY}px)`,
            boxShadow: `0 6px 30px ${s.color}15`,
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: `linear-gradient(135deg, ${s.color}, ${s.color}99)`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, boxShadow: `0 6px 20px ${s.color}40`,
            }}>
              <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>STEP</div>
              <div style={{ fontFamily: FONT, fontSize: 28, fontWeight: 900, color: '#FFF', lineHeight: 1 }}>{s.step}</div>
            </div>
            <div>
              <div style={{ fontFamily: FONT, fontSize: 32, fontWeight: 900, color: C.text, marginBottom: 6 }}>{s.title}</div>
              <div style={{ fontFamily: FONT, fontSize: 22, color: C.sub, fontWeight: 600 }}>{s.sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Scene: Conclusion ─────────────────────────────────────────────────────────
const SceneConclusion: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF = msToF(absMs - 32500);
  const op   = ci(relF, 0, 12);
  const pulse = 0.5 + 0.5 * Math.sin(relF * 0.1);

  const l1op = ci(relF, 0, 14);
  const l1y  = interpolate(sp(relF, 0, 18, 130), [0, 1], [40, 0]);
  const l2op = absMs >= 34000 ? ci(msToF(absMs - 34000), 0, 14) : 0;
  const l2y  = absMs >= 34000 ? interpolate(sp(msToF(absMs - 34000), 0, 18, 130), [0, 1], [40, 0]) : 40;
  const l3op = absMs >= 35800 ? ci(msToF(absMs - 35800), 0, 14) : 0;
  const l3y  = absMs >= 35800 ? interpolate(sp(msToF(absMs - 35800), 0, 18, 130), [0, 1], [40, 0]) : 40;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      opacity: op, gap: 32,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 60% 40% at 50% 50%, ${C.green}${Math.round(pulse * 12).toString(16).padStart(2,'0')} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div style={{ opacity: l1op, transform: `translateY(${l1y}px)`, textAlign: 'center' }}>
        <div style={{ fontFamily: FONT, fontSize: 56, fontWeight: 900, color: C.sub }}>AI는</div>
        <div style={{ fontFamily: FONT, fontSize: 80, fontWeight: 900, color: C.text, letterSpacing: -2 }}>도구입니다</div>
      </div>

      <div style={{
        width: '70%', height: 3,
        background: `linear-gradient(90deg, transparent, ${C.green}, transparent)`,
        opacity: l1op,
      }} />

      <div style={{ opacity: l2op, transform: `translateY(${l2y}px)`, textAlign: 'center', padding: '0 40px' }}>
        <span style={{ fontFamily: FONT, fontSize: 56, fontWeight: 900, color: C.green, textShadow: `0 0 30px ${C.green}60` }}>
          쓰는 사람만
        </span>
        <span style={{ fontFamily: FONT, fontSize: 56, fontWeight: 900, color: C.text }}>
          {' '}돈 법니다
        </span>
      </div>

      <div style={{ opacity: l3op, transform: `translateY(${l3y}px)`, textAlign: 'center' }}>
        <div style={{
          fontFamily: FONT, fontSize: 36, fontWeight: 700, color: C.sub,
          background: C.card, padding: '16px 32px', borderRadius: 40,
          border: `1.5px solid ${C.border}`,
        }}>직장 다니면서도 됩니다 ✓</div>
      </div>
    </div>
  );
};

// ── Scene: CTA ────────────────────────────────────────────────────────────────
const SceneCTA: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF  = msToF(absMs - 37800);
  const op    = ci(relF, 0, 16);
  const pulse = 0.97 + 0.03 * Math.sin(relF * 0.14);
  const btnOp = ci(relF, 8, 22);

  return (
    <div style={{
      position: 'absolute', top: ST + 16, bottom: SB + 10,
      left: SS, right: SS,
      display: 'flex', flexDirection: 'column', gap: 22, opacity: op,
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: `linear-gradient(135deg, ${C.green}, #22A44A)`,
        borderRadius: 40, padding: '14px 28px', alignSelf: 'flex-start', flexShrink: 0,
        boxShadow: `0 6px 28px ${C.green}50`,
      }}>
        <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 900, color: '#FFF' }}>⚡ codemasterAI</span>
      </div>

      <div style={{
        flex: 1, background: C.card, borderRadius: 28,
        border: `3px solid ${C.green}`,
        boxShadow: `0 12px 60px ${C.green}20`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
        padding: '0 40px', textAlign: 'center',
        transform: `scale(${pulse})`,
      }}>
        <div style={{ fontSize: 72 }}>💰</div>
        <div style={{ fontFamily: FONT, fontSize: 60, fontWeight: 900, color: C.text, lineHeight: 1.2, letterSpacing: -2 }}>
          지금 시작이
        </div>
        <div style={{ fontFamily: FONT, fontSize: 72, fontWeight: 900, color: C.green, letterSpacing: -2.5, textShadow: `0 0 40px ${C.green}50` }}>
          6개월 후
        </div>
        <div style={{ fontFamily: FONT, fontSize: 52, fontWeight: 900, color: C.text, letterSpacing: -1.5 }}>
          를 바꿉니다
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, opacity: btnOp, flexShrink: 0 }}>
        <div style={{
          flex: 1, background: C.red, borderRadius: 22, padding: '30px 0',
          textAlign: 'center', fontFamily: FONT, fontSize: 34, fontWeight: 900, color: '#FFF',
          boxShadow: `0 10px 40px ${C.red}55`,
        }}>🔔 구독</div>
        <div style={{
          flex: 1, background: C.green, borderRadius: 22, padding: '30px 0',
          textAlign: 'center', fontFamily: FONT, fontSize: 34, fontWeight: 900, color: '#FFF',
          boxShadow: `0 10px 40px ${C.green}55`,
        }}>👍 좋아요</div>
      </div>
    </div>
  );
};

// ── BGM 시각화 ─────────────────────────────────────────────────────────────────
const BgmViz: React.FC<{ audioData: AudioData | null }> = ({ audioData }) => {
  const frame = useCurrentFrame();
  if (!audioData) return null;
  const viz = visualizeAudio({ fps: FPS, frame, audioData, numberOfSamples: 64, smoothing: true });
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 72, display: 'flex', alignItems: 'flex-end', gap: 2, padding: '0 6px', opacity: 0.15, pointerEvents: 'none' }}>
      {viz.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: `${Math.max(2, v * 72)}px`,
          background: i < 32 ? `linear-gradient(to top, ${C.green}, #88EEB0)` : `linear-gradient(to top, ${C.blue}, #88BBFF)`,
          borderRadius: '2px 2px 0 0',
        }} />
      ))}
    </div>
  );
};

// ── SFX ───────────────────────────────────────────────────────────────────────
const SFX = [
  { ms:  6800, file: 'sfx/whoosh.mp3',      volume: 0.50 },
  { ms: 13500, file: 'sfx/impact_high.mp3', volume: 0.60 },
  { ms: 24500, file: 'sfx/riser.mp3',       volume: 0.45 },
  { ms: 32500, file: 'sfx/chime.mp3',       volume: 0.60 },
  { ms: 37800, file: 'sfx/bass_drop.mp3',   volume: 0.65 },
];

// ── TransitionSeries 구간 ────────────────────────────────────────────────────
const T = 10;
const DUR = {
  hook:       msToF(6800),
  stats:      msToF(13500 - 6800),
  methods:    msToF(24500 - 13500),
  howto:      msToF(32500 - 24500),
  conclusion: msToF(37800 - 32500),
  cta:        msToF(40100 - 37800) + T * 5,
};

// ── Props ─────────────────────────────────────────────────────────────────────
export interface AISideIncomeProps { audioDurationSeconds: number; }
export const defaultAISideIncomeProps: AISideIncomeProps = { audioDurationSeconds: 41.0 };

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export const AISideIncomeShorts: React.FC<AISideIncomeProps> = () => {
  const frame   = useCurrentFrame();
  const ms      = (frame / FPS) * 1000;
  const seg     = getSeg(ms);
  const bgmData = useAudioData(staticFile('bgm/dark_tension.mp3'));
  const accent  = seg?.accent ?? C.green;

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {/* 오디오 */}
      <Audio src={staticFile('audio/sideincome_tts.mp3')} volume={0} />
      <Audio src={staticFile('bgm/dark_tension.mp3')} volume={0.08} />
      {SFX.map(({ ms: m, file, volume }) => (
        <Sequence key={file} from={msToF(m)} durationInFrames={60}>
          <Audio src={staticFile(file)} volume={volume} />
        </Sequence>
      ))}

      <NoiseBg frame={frame} />

      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 80% 40% at 50% 0%, ${C.green}06 0%, transparent 60%)`, pointerEvents: 'none', zIndex: 1 }} />

      {/* TransitionSeries */}
      <TransitionSeries style={{ zIndex: 2 }}>
        <TransitionSeries.Sequence durationInFrames={DUR.hook}>
          <SceneHook absMs={ms} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={springTiming({ durationInFrames: T, config: { damping: 200 } })} presentation={slide({ direction: 'from-right' })} />

        <TransitionSeries.Sequence durationInFrames={DUR.stats}>
          <SceneStats absMs={ms} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={springTiming({ durationInFrames: T, config: { damping: 200 } })} presentation={wipe({ direction: 'from-left' })} />

        <TransitionSeries.Sequence durationInFrames={DUR.methods}>
          <SceneMethods absMs={ms} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={fade()} />

        <TransitionSeries.Sequence durationInFrames={DUR.howto}>
          <SceneHowTo absMs={ms} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={springTiming({ durationInFrames: T, config: { damping: 180 } })} presentation={slide({ direction: 'from-bottom' })} />

        <TransitionSeries.Sequence durationInFrames={DUR.conclusion}>
          <SceneConclusion absMs={ms} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={fade()} />

        <TransitionSeries.Sequence durationInFrames={DUR.cta}>
          <SceneCTA absMs={ms} />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <SceneFlash frame={frame} />
      <BgmViz audioData={bgmData} />

      <CaptionOverlay captions={RAW_CAPTIONS} accent={accent} fontSize={44} position="bottom" wordsPerPage={1200} />
    </AbsoluteFill>
  );
};
