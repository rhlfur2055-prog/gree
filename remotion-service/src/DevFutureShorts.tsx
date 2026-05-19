// DevFutureShorts.tsx
// 살아남는 개발자 vs 사라지는 개발자 — data_blue 다크 팔레트

import React from 'react';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
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

// ── 팔레트 (다크 / data_blue) ────────────────────────────────────────────────
const C = {
  bg:       '#FFFFFF',
  text:     '#111111',
  sub:      '#555555',
  blue:     '#007AFF',
  cyan:     '#00AAFF',
  red:      '#FF3B30',
  green:    '#34C759',
  amber:    '#FF9500',
  card:     '#F8F8FA',
  border:   '#E5E5EA',
  darkRed:  '#FFF5F5',
  darkBlue: '#F0F5FF',
};

const FONT = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const MONO = "Menlo,'Courier New',monospace";
const FPS  = 30;
const ST   = 200;
const SB   = 380;
const SS   = 44;

export const DEV_FUTURE_TOTAL_FRAMES = Math.ceil(41.0 * FPS);

// ── 유틸 ────────────────────────────────────────────────────────────────────
const ci = (f: number, s: number, e: number, os = 0, oe = 1) =>
  interpolate(f, [s, e], [os, oe], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

const sp = (frame: number, delay = 0, damping = 14, stiffness = 120) =>
  spring({ frame: frame - delay, fps: FPS, config: { damping, stiffness, mass: 0.5 } });

// ── SEGS (ElevenLabs timestamps 실행 후 교체) ────────────────────────────────
interface Seg {
  startMs: number;
  endMs:   number;
  text:    string;
  hl?:     string;
  accent?: string;
  scene:   string;
}

const SEGS: Seg[] = [
  { startMs:     0, endMs:  1800, text: '바이브코딩 열풍 그거 압니다',                                       scene: 'hook'       },
  { startMs:  1800, endMs:  4000, text: '개발자 직업 AI가 뺏는다고요?',                                      scene: 'hook'       },
  { startMs:  4000, endMs:  5500, text: '진짜로 그렇게 될까요',                                              scene: 'hook'       },
  { startMs:  5500, endMs:  6900, text: '데이터가 답했습니다',               hl: '데이터', accent: C.cyan,   scene: 'hook'       },
  { startMs:  6900, endMs:  8500, text: '이미 빅테크가 움직였습니다',                                        scene: 'layoff'     },
  { startMs:  8500, endMs: 11000, text: 'Google · MS 개발자 10,000명 해고',  hl: '10,000명', accent: C.red, scene: 'layoff'     },
  { startMs: 11000, endMs: 12800, text: 'AI 자동화가 이유였습니다',                                          scene: 'layoff'     },
  { startMs: 12800, endMs: 15300, text: 'Stack Overflow 개발자 9만 명 조사',                                 scene: 'stats'      },
  { startMs: 15300, endMs: 17800, text: '이미 76%가 AI 툴 씁니다',           hl: '76%',     accent: C.blue, scene: 'stats'      },
  { startMs: 17800, endMs: 20300, text: 'GitHub Copilot 생산성 +55%',        hl: '+55%',    accent: C.green,scene: 'stats'      },
  { startMs: 20300, endMs: 23100, text: '단순 코딩 30% AI가 대체 중',        hl: '30%',     accent: C.amber,scene: 'stats'      },
  { startMs: 23100, endMs: 24500, text: '경력이 많아도 안전하지 않습니다',                                   scene: 'split'      },
  { startMs: 24500, endMs: 25700, text: '구글 MS 시니어도 잘리고 있습니다',      hl: '시니어도', accent: C.red,  scene: 'split'      },
  { startMs: 25700, endMs: 27200, text: 'AI 전환 거부한 10년차 개발자',                                      scene: 'split'      },
  { startMs: 27200, endMs: 29000, text: 'CRUD API 반복 작업만 하는 개발자',                                  scene: 'split'      },
  { startMs: 29000, endMs: 30500, text: '반대로 살아남는 개발자가 있습니다',      hl: '살아남는', accent: C.blue, scene: 'split'      },
  { startMs: 30500, endMs: 32300, text: 'AI 코드를 검수하고 설계하는 개발자',                                 scene: 'split'      },
  { startMs: 32300, endMs: 34500, text: '도메인 지식으로 AI를 이끄는 개발자',                                 scene: 'split'      },
  { startMs: 34500, endMs: 36300, text: '개발자가 사라지는 게 아닙니다',                                     scene: 'conclusion' },
  { startMs: 36300, endMs: 38300, text: 'AI 못 쓰는 개발자가 사라집니다',    hl: 'AI 못 쓰는', accent: C.red, scene: 'conclusion' },
  { startMs: 38300, endMs: 40100, text: '지금이 배울 마지막 타이밍입니다',   hl: '마지막 타이밍', accent: C.cyan, scene: 'cta'    },
];

const msToF = (ms: number) => Math.round((ms / 1000) * FPS);

function getSeg(ms: number): Seg | null {
  return SEGS.find(s => ms >= s.startMs && ms < s.endMs) ?? null;
}
function getScene(ms: number): string {
  return getSeg(ms)?.scene ?? 'hook';
}

// ── Noise 배경 파티클 ─────────────────────────────────────────────────────────
const NoiseBackground: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame * 0.016;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      {Array.from({ length: 32 }, (_, i) => {
        const nx = noise2D(`dnx${i}`, i * 0.38, t);
        const ny = noise2D(`dny${i}`, i * 0.38 + 70, t);
        const ns = noise2D(`dns${i}`, i * 0.38 + 140, t * 0.55);
        const no = noise2D(`dno${i}`, i * 0.38 + 210, t * 0.4);
        const x = ((nx + 1) / 2) * 1080;
        const y = ((ny + 1) / 2) * 1920;
        const size = 2 + ((ns + 1) / 2) * 10;
        const opacity = 0.04 + ((no + 1) / 2) * 0.08;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: x, top: y,
            width: size, height: size,
            borderRadius: '50%',
            background: i % 3 === 0 ? '#BBDDFF' : i % 3 === 1 ? '#C0D8FF' : '#FFCCCC',
            transform: 'translate(-50%,-50%)',
            opacity,
          }} />
        );
      })}
    </div>
  );
};

// ── 씬 전환 플래시 ─────────────────────────────────────────────────────────────
const BOUNDARIES_MS = [6900, 12800, 23100, 34500, 38300];

const SceneFlash: React.FC<{ frame: number }> = ({ frame }) => {
  let op = 0;
  for (const bMs of BOUNDARIES_MS) {
    const bF = msToF(bMs);
    const d = frame - bF;
    if (d >= -2 && d <= 5) {
      op = Math.max(op,
        d <= 0
          ? interpolate(d, [-2, 0], [0, 0.75], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
          : interpolate(d, [0, 5], [0.75, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      );
    }
  }
  if (op < 0.01) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: C.blue,
      opacity: op * 0.35,
      pointerEvents: 'none',
      zIndex: 95,
    }} />
  );
};

// ── Scene: Hook ──────────────────────────────────────────────────────────────
const SceneHook: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF = msToF(absMs);
  const op   = ci(relF, 0, 12);

  const t1 = interpolate(sp(relF, 0,  20, 140), [0, 1], [50, 0]);
  const t2 = interpolate(sp(relF, 5,  24, 140), [0, 1], [50, 0]);
  const t3 = interpolate(sp(relF, 12, 30, 140), [0, 1], [50, 0]);
  const t4 = interpolate(sp(relF, 20, 38, 140), [0, 1], [50, 0]);

  const glowPulse = 0.6 + 0.4 * Math.sin(relF * 0.1);
  const dataOp    = absMs >= 5500 ? ci(msToF(absMs - 5500), 0, 10) : 0;

  return (
    <div style={{
      position: 'absolute',
      top: ST + 20, bottom: SB + 10,
      left: SS, right: SS,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      opacity: op,
    }}>
      {/* 채널 뱃지 */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`,
        borderRadius: 40, padding: '14px 28px',
        alignSelf: 'flex-start',
        transform: `translateY(${t1}px)`,
        boxShadow: `0 8px 32px ${C.blue}55`,
      }}>
        <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 900, color: '#FFF' }}>
          ⚡ codemasterAI
        </span>
      </div>

      {/* vs 타이틀 — 한 줄 레이아웃 */}
      <div style={{ transform: `translateY(${t2}px)` }}>
        {/* 사라지는 개발자 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          marginBottom: 16,
        }}>
          <div style={{
            width: 10, height: 64, borderRadius: 5,
            background: C.red, flexShrink: 0,
          }} />
          <div style={{ fontFamily: FONT, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>
            <span style={{ fontSize: 56, color: C.red }}>사라지는</span>
            <span style={{ fontSize: 56, color: C.text }}> 개발자</span>
          </div>
        </div>

        {/* vs */}
        <div style={{
          fontFamily: FONT, fontSize: 38, fontWeight: 700,
          color: C.sub, paddingLeft: 24, marginBottom: 16,
          letterSpacing: 4,
        }}>vs</div>

        {/* 살아남는 개발자 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 10, height: 64, borderRadius: 5,
            background: C.blue, flexShrink: 0,
          }} />
          <div style={{ fontFamily: FONT, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>
            <span style={{ fontSize: 56, color: C.blue }}>살아남는</span>
            <span style={{ fontSize: 56, color: C.text }}> 개발자</span>
          </div>
        </div>
      </div>

      {/* 서브 메시지 */}
      <div style={{
        transform: `translateY(${t3}px)`,
        borderLeft: `5px solid ${C.cyan}`,
        paddingLeft: 22,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 36, fontWeight: 700, color: C.sub }}>
          AI가 개발자 직업을 뺏을까요?
        </div>
      </div>

      {/* 데이터 뱃지 */}
      <div style={{
        transform: `translateY(${t4}px)`,
        background: `linear-gradient(135deg, ${C.darkBlue}, ${C.card})`,
        borderRadius: 22, padding: '28px 32px',
        border: `2px solid ${C.blue}50`,
        display: 'flex', alignItems: 'center', gap: 18,
        boxShadow: `0 12px 48px ${C.blue}25`,
        opacity: dataOp,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, flexShrink: 0,
        }}>📊</div>
        <div>
          <div style={{ fontFamily: FONT, fontSize: 18, color: C.cyan, fontWeight: 700, marginBottom: 4 }}>
            실제 데이터 기반 분석
          </div>
          <div style={{ fontFamily: FONT, fontSize: 32, fontWeight: 900, color: C.text }}>
            데이터가 답했습니다
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Scene: Layoff ─────────────────────────────────────────────────────────────
const LAYOFFS = [
  { company: 'Google',    count: '12,000명', year: '2024', icon: '🔵' },
  { company: 'Microsoft', count: '10,000명', year: '2024', icon: '🟦' },
  { company: 'Amazon',    count: '27,000명', year: '2023', icon: '🟠' },
];

const SceneLayoff: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF = msToF(absMs - 6900);
  const op   = ci(relF, 0, 12);

  return (
    <div style={{
      position: 'absolute',
      top: ST + 10, bottom: SB + 200,
      left: SS, right: SS,
      display: 'flex', flexDirection: 'column', gap: 20,
      opacity: op,
    }}>
      {/* 헤더 */}
      <div style={{
        background: `linear-gradient(90deg, ${C.red}22, transparent)`,
        borderLeft: `5px solid ${C.red}`,
        borderRadius: '0 16px 16px 0',
        padding: '18px 24px',
        display: 'flex', alignItems: 'center', gap: 16,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 32 }}>🚨</span>
        <div>
          <div style={{ fontFamily: FONT, fontSize: 16, color: C.red, fontWeight: 700, letterSpacing: 3 }}>
            BREAKING — 빅테크 구조조정
          </div>
          <div style={{ fontFamily: FONT, fontSize: 28, fontWeight: 900, color: C.text }}>
            이미 움직였습니다
          </div>
        </div>
      </div>

      {/* 해고 카드 3장 */}
      {LAYOFFS.map((item, i) => {
        const cardDelay = i * 8;
        const cardOp = ci(relF, cardDelay, cardDelay + 12);
        const cardX  = interpolate(sp(relF, cardDelay, 18, 130), [0, 1], [-40, 0]);
        return (
          <div key={i} style={{
            flex: 1,
            background: C.card,
            borderRadius: 22,
            border: `1.5px solid ${C.red}30`,
            padding: '0 32px',
            display: 'flex', alignItems: 'center', gap: 24,
            opacity: cardOp,
            transform: `translateX(${cardX}px)`,
            boxShadow: `0 6px 30px rgba(0,0,0,0.3)`,
          }}>
            <div style={{ fontSize: 44, flexShrink: 0 }}>{item.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT, fontSize: 22, color: C.sub, fontWeight: 600, marginBottom: 4 }}>
                {item.company} · {item.year}
              </div>
              <div style={{ fontFamily: FONT, fontSize: 44, fontWeight: 900, color: C.text, letterSpacing: -1.5 }}>
                {item.count} 해고
              </div>
            </div>
            <div style={{
              background: `${C.red}20`,
              borderRadius: 12, padding: '10px 18px',
              fontFamily: FONT, fontSize: 16, fontWeight: 800, color: C.red,
              flexShrink: 0,
            }}>AI 대체</div>
          </div>
        );
      })}
    </div>
  );
};

// ── Scene: Stats ─────────────────────────────────────────────────────────────
const STAT_ITEMS = [
  { label: 'AI 툴 사용률',      source: 'Stack Overflow 2024', target: 76, color: C.blue,  suffix: '%',  icon: '👨‍💻', startMs: 12800 },
  { label: '생산성 향상',        source: 'GitHub Copilot 연구', target: 55, color: C.green, suffix: '%↑', icon: '🚀', startMs: 15300 },
  { label: '자동화된 코딩 업무', source: 'McKinsey 2024',       target: 30, color: C.amber, suffix: '%',  icon: '🤖', startMs: 17800 },
];

const SceneStats: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF = msToF(absMs - 12800);
  const op   = ci(relF, 0, 12);

  return (
    <div style={{
      position: 'absolute',
      top: ST + 10, bottom: SB + 200,
      left: SS, right: SS,
      display: 'flex', flexDirection: 'column', gap: 18,
      opacity: op,
    }}>
      {/* 타이틀 */}
      <div style={{
        textAlign: 'center', flexShrink: 0,
        fontFamily: FONT, fontSize: 28, fontWeight: 800,
        color: C.sub, letterSpacing: 2,
      }}>
        📊 실제 조사 데이터
      </div>

      {STAT_ITEMS.map((item, i) => {
        const itemRelF  = msToF(absMs - item.startMs);
        const itemOp    = absMs >= item.startMs ? ci(itemRelF, 0, 14) : 0;
        const barWidth  = absMs >= item.startMs ? ci(itemRelF, 4, 55) * item.target : 0;
        const numVal    = absMs >= item.startMs ? Math.round(ci(itemRelF, 4, 55) * item.target) : 0;

        return (
          <div key={i} style={{
            flex: 1,
            background: C.card,
            borderRadius: 24,
            border: `1.5px solid ${item.color}25`,
            padding: '0 32px',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16,
            opacity: itemOp,
            boxShadow: `0 4px 24px ${item.color}12`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 32 }}>{item.icon}</span>
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 20, color: C.sub, fontWeight: 600 }}>
                    {item.label}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 14, color: `${item.color}99`, fontWeight: 600 }}>
                    출처: {item.source}
                  </div>
                </div>
              </div>
              <div style={{
                fontFamily: FONT, fontSize: 64, fontWeight: 900,
                color: item.color, letterSpacing: -2, lineHeight: 1,
                textShadow: `0 0 30px ${item.color}60`,
              }}>
                {numVal}{item.suffix}
              </div>
            </div>
            {/* 바 */}
            <div style={{
              height: 16, background: `${item.color}18`,
              borderRadius: 12, overflow: 'hidden',
            }}>
              <div style={{
                width: `${(barWidth / item.target) * 100}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${item.color}88, ${item.color})`,
                borderRadius: 12,
                boxShadow: `0 0 16px ${item.color}60`,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Scene: Split ─────────────────────────────────────────────────────────────
const LOSING = [
  { ms: 24500, text: '구글·MS 시니어도 잘렸습니다',       icon: '🔴' },
  { ms: 25700, text: 'AI 전환 거부한 10년차 개발자',      icon: '💀' },
  { ms: 27200, text: 'CRUD·API 반복 작업만 하는 개발자',  icon: '🚫' },
];
const SURVIVING = [
  { ms: 30500, text: 'AI 코드를 검수하고 설계하는 개발자', icon: '🏗️' },
  { ms: 32300, text: '도메인 지식으로 AI를 이끄는 개발자', icon: '🧠' },
  { ms: 34500, text: 'AI로 혼자 5명 몫 하는 개발자',      icon: '🚀' },
];

const SceneSplit: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF = msToF(absMs - 23100);
  const op   = ci(relF, 0, 12);

  const isLosingPhase   = absMs < 29000;
  const isSurvivingPhase = absMs >= 29000;

  return (
    <div style={{
      position: 'absolute',
      top: ST + 10, bottom: SB + 210,
      left: SS, right: SS,
      opacity: op,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      {/* 양쪽 패널 */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* LEFT — 사라지는 */}
        <div style={{
          background: isLosingPhase
            ? `linear-gradient(180deg, ${C.darkRed}, #1A0A0E)`
            : `${C.darkRed}88`,
          borderRadius: 24,
          border: `2px solid ${isLosingPhase ? C.red : C.red + '40'}`,
          padding: '22px 20px',
          display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: isLosingPhase ? `0 0 40px ${C.red}25` : 'none',
        }}>
          <div style={{
            fontFamily: FONT, fontSize: 20, fontWeight: 900,
            color: C.red, textAlign: 'center',
            textShadow: isLosingPhase ? `0 0 20px ${C.red}80` : 'none',
          }}>
            ❌ 사라지는
          </div>

          {LOSING.map((item, i) => {
            const shown = absMs >= item.ms;
            const itemOp = shown ? ci(msToF(absMs - item.ms), 0, 12) : 0;
            return (
              <div key={i} style={{
                background: `${C.red}18`,
                borderRadius: 16,
                padding: '18px 16px',
                border: `1px solid ${C.red}25`,
                opacity: itemOp,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ fontSize: 28 }}>{item.icon}</span>
                <div style={{
                  fontFamily: FONT, fontSize: 22, fontWeight: 800,
                  color: '#FFAAAA', lineHeight: 1.3,
                }}>
                  {item.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* RIGHT — 살아남는 */}
        <div style={{
          background: isSurvivingPhase
            ? `linear-gradient(180deg, ${C.darkBlue}, #0A1525)`
            : `${C.darkBlue}88`,
          borderRadius: 24,
          border: `2px solid ${isSurvivingPhase ? C.blue : C.blue + '40'}`,
          padding: '22px 20px',
          display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: isSurvivingPhase ? `0 0 40px ${C.blue}25` : 'none',
        }}>
          <div style={{
            fontFamily: FONT, fontSize: 20, fontWeight: 900,
            color: C.blue, textAlign: 'center',
            textShadow: isSurvivingPhase ? `0 0 20px ${C.blue}80` : 'none',
          }}>
            ✅ 살아남는
          </div>

          {SURVIVING.map((item, i) => {
            const shown = absMs >= item.ms;
            const itemOp = shown ? ci(msToF(absMs - item.ms), 0, 12) : 0;
            return (
              <div key={i} style={{
                background: `${C.blue}18`,
                borderRadius: 16,
                padding: '18px 16px',
                border: `1px solid ${C.blue}25`,
                opacity: itemOp,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ fontSize: 28 }}>{item.icon}</span>
                <div style={{
                  fontFamily: FONT, fontSize: 22, fontWeight: 800,
                  color: '#AACCFF', lineHeight: 1.3,
                }}>
                  {item.text}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 가운데 divider 라인 (글로우) */}
      <div style={{
        position: 'absolute',
        top: '10%', bottom: '0%',
        left: '50%',
        width: 2,
        background: `linear-gradient(180deg, transparent, ${C.blue}80, ${C.red}80, transparent)`,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        opacity: 0.6,
      }} />
    </div>
  );
};

// ── Scene: Conclusion ────────────────────────────────────────────────────────
const SceneConclusion: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF = msToF(absMs - 34500);
  const op   = ci(relF, 0, 12);

  const line1Op = ci(relF, 0, 14);
  const line1Y  = interpolate(sp(relF, 0, 18, 130), [0, 1], [40, 0]);
  const line2Op = absMs >= 36300 ? ci(msToF(absMs - 36300), 0, 14) : 0;
  const line2Y  = absMs >= 36300 ? interpolate(sp(msToF(absMs - 36300), 0, 18, 130), [0, 1], [40, 0]) : 40;

  const glowPulse = 0.5 + 0.5 * Math.sin(relF * 0.12);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      opacity: op,
      gap: 40,
    }}>
      {/* 배경 글로우 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 70% 40% at 50% 50%, ${C.blue}${Math.round(glowPulse * 15).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div style={{
        opacity: line1Op,
        transform: `translateY(${line1Y}px)`,
        textAlign: 'center', padding: '0 40px',
      }}>
        <div style={{
          fontFamily: FONT, fontSize: 58, fontWeight: 900,
          color: C.text, letterSpacing: -2, lineHeight: 1.2,
        }}>
          개발자가 사라지는
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 58, fontWeight: 900,
          color: C.text, letterSpacing: -2, lineHeight: 1.2,
        }}>
          게 아닙니다
        </div>
      </div>

      <div style={{
        width: '80%', height: 3,
        background: `linear-gradient(90deg, transparent, ${C.blue}, transparent)`,
        opacity: line1Op,
        boxShadow: `0 0 20px ${C.blue}80`,
      }} />

      <div style={{
        opacity: line2Op,
        transform: `translateY(${line2Y}px)`,
        textAlign: 'center', padding: '0 40px',
      }}>
        <div style={{
          fontFamily: FONT, fontSize: 42, fontWeight: 700,
          color: C.sub, letterSpacing: -1, lineHeight: 1.3,
        }}>
          <span style={{ color: C.red, fontWeight: 900, textShadow: `0 0 30px ${C.red}60` }}>AI 못 쓰는 개발자</span>
          <span style={{ color: C.text }}>가</span>
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 54, fontWeight: 900,
          color: C.red, letterSpacing: -2,
          textShadow: `0 0 40px ${C.red}50`,
        }}>
          사라집니다
        </div>
      </div>
    </div>
  );
};

// ── Scene: CTA ───────────────────────────────────────────────────────────────
const SceneCTA: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF  = msToF(absMs - 38300);
  const op    = ci(relF, 0, 16);
  const pulse = 0.97 + 0.03 * Math.sin(relF * 0.14);
  const btnOp = ci(relF, 8, 22);

  return (
    <div style={{
      position: 'absolute',
      top: ST + 16, bottom: SB + 10,
      left: SS, right: SS,
      display: 'flex', flexDirection: 'column', gap: 22,
      opacity: op,
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`,
        borderRadius: 40, padding: '14px 28px',
        alignSelf: 'flex-start', flexShrink: 0,
        boxShadow: `0 6px 28px ${C.blue}50`,
      }}>
        <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 900, color: '#FFF' }}>⚡ codemasterAI</span>
      </div>

      {/* 메인 메시지 */}
      <div style={{
        flex: 1,
        background: C.card,
        borderRadius: 28,
        border: `2px solid ${C.cyan}50`,
        boxShadow: `0 12px 60px ${C.blue}20`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
        padding: '0 40px', textAlign: 'center',
        transform: `scale(${pulse})`,
      }}>
        <div style={{ fontSize: 72 }}>⏰</div>
        <div style={{
          fontFamily: FONT, fontSize: 52, fontWeight: 900,
          color: C.text, lineHeight: 1.25, letterSpacing: -2,
        }}>
          지금이 배울
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 68, fontWeight: 900,
          color: C.cyan, letterSpacing: -2.5, lineHeight: 1.0,
          textShadow: `0 0 40px ${C.cyan}60`,
        }}>
          마지막 타이밍
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 30, fontWeight: 700,
          color: C.sub,
        }}>
          입니다
        </div>
      </div>

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: 16, opacity: btnOp, flexShrink: 0 }}>
        <div style={{
          flex: 1, background: C.blue, borderRadius: 22, padding: '30px 0',
          textAlign: 'center',
          fontFamily: FONT, fontSize: 34, fontWeight: 900, color: '#FFF',
          boxShadow: `0 10px 40px ${C.blue}55`,
        }}>🔔 구독</div>
        <div style={{
          flex: 1, background: C.cyan, borderRadius: 22, padding: '30px 0',
          textAlign: 'center',
          fontFamily: FONT, fontSize: 34, fontWeight: 900, color: '#FFF',
          boxShadow: `0 10px 40px ${C.cyan}55`,
        }}>👍 좋아요</div>
      </div>
    </div>
  );
};

// ── BGM 시각화 ─────────────────────────────────────────────────────────────────
const BgmVisualizer: React.FC<{ audioData: AudioData | null }> = ({ audioData }) => {
  const frame = useCurrentFrame();
  if (!audioData) return null;
  const viz = visualizeAudio({ fps: FPS, frame, audioData, numberOfSamples: 64, smoothing: true });
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
      display: 'flex', alignItems: 'flex-end', gap: 2, padding: '0 6px',
      opacity: 0.22, pointerEvents: 'none',
    }}>
      {viz.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: `${Math.max(2, v * 80)}px`,
          background: i < 32
            ? `linear-gradient(to top, ${C.blue}, ${C.cyan})`
            : `linear-gradient(to top, ${C.blue}88, ${C.blue}44)`,
          borderRadius: '2px 2px 0 0',
        }} />
      ))}
    </div>
  );
};

// ── SFX ──────────────────────────────────────────────────────────────────────
const SFX_EVENTS = [
  { ms:  6900, file: 'sfx/impact_high.mp3', volume: 0.65 },
  { ms: 12800, file: 'sfx/whoosh.mp3',      volume: 0.50 },
  { ms: 23100, file: 'sfx/glitch.mp3',      volume: 0.55 },
  { ms: 29000, file: 'sfx/riser.mp3',       volume: 0.45 },
  { ms: 34500, file: 'sfx/chime.mp3',       volume: 0.60 },
  { ms: 38300, file: 'sfx/bass_drop.mp3',   volume: 0.65 },
];

const RAW_CAPTIONS: RawCaption[] = SEGS.map(s => ({
  text: s.text, startMs: s.startMs, endMs: s.endMs,
}));

// ── Props ─────────────────────────────────────────────────────────────────────
export interface DevFutureProps {
  audioDurationSeconds: number;
}
export const defaultDevFutureProps: DevFutureProps = {
  audioDurationSeconds: 41.0,
};

// ── 씬별 프레임 구간 (ms → frames) ──────────────────────────────────────────
// TransitionSeries 각 Sequence durationInFrames
const T = 10; // 전환 애니메이션 프레임 수 (0.33초)

const DUR = {
  hook:       msToF(6900),
  layoff:     msToF(12800 - 6900),
  stats:      msToF(23100 - 12800),
  split:      msToF(34500 - 23100),
  conclusion: msToF(38300 - 34500),
  cta:        msToF(40100 - 38300) + T * 5, // 5개 전환 overlap 보정
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export const DevFutureShorts: React.FC<DevFutureProps> = () => {
  const frame = useCurrentFrame(); // 전역 프레임 — Audio·Caption 기준
  const ms    = (frame / FPS) * 1000;

  const seg       = getSeg(ms);
  const bgmData   = useAudioData(staticFile('bgm/dark_tension.mp3'));
  const captionAccent = seg?.accent ?? C.cyan;

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {/* ── 오디오 (전역 프레임 기준, TransitionSeries 밖) ── */}
      {/* TTS 미생성 시 기존 파일로 임시 대체 — node get_devfuture_timestamps.js 실행 후 교체 */}
      <Audio src={staticFile('audio/security_tts.mp3')} volume={0} />
      <Audio src={staticFile('bgm/dark_tension.mp3')} volume={0.10} />
      {SFX_EVENTS.map(({ ms: sfxMs, file, volume }) => (
        <Sequence key={file} from={msToF(sfxMs)} durationInFrames={60}>
          <Audio src={staticFile(file)} volume={volume} />
        </Sequence>
      ))}

      {/* ── Noise 파티클 배경 (전역) ── */}
      <NoiseBackground frame={frame} />

      {/* ── 글로우 그라디언트 ── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 80% 40% at 50% 0%, ${C.blue}08 0%, transparent 60%)`,
        pointerEvents: 'none', zIndex: 1,
      }} />

      {/* ── @remotion/transitions — TransitionSeries ── */}
      {/* 각 씬은 전역 ms를 prop으로 받아 내부 타이밍을 유지함 */}
      <TransitionSeries style={{ zIndex: 2 }}>

        {/* Hook */}
        <TransitionSeries.Sequence durationInFrames={DUR.hook}>
          <SceneHook absMs={ms} />
        </TransitionSeries.Sequence>

        {/* hook → layoff: 슬라이드 (왼쪽에서 밀고 들어옴) */}
        <TransitionSeries.Transition
          timing={springTiming({ durationInFrames: T, config: { damping: 200 } })}
          presentation={slide({ direction: 'from-left' })}
        />

        {/* Layoff */}
        <TransitionSeries.Sequence durationInFrames={DUR.layoff}>
          <SceneLayoff absMs={ms} />
        </TransitionSeries.Sequence>

        {/* layoff → stats: 페이드 (차분하게 데이터로) */}
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: T })}
          presentation={fade()}
        />

        {/* Stats */}
        <TransitionSeries.Sequence durationInFrames={DUR.stats}>
          <SceneStats absMs={ms} />
        </TransitionSeries.Sequence>

        {/* stats → split: 와이프 (분할 화면 테마와 일치) */}
        <TransitionSeries.Transition
          timing={springTiming({ durationInFrames: T, config: { damping: 200 } })}
          presentation={wipe({ direction: 'from-left' })}
        />

        {/* Split */}
        <TransitionSeries.Sequence durationInFrames={DUR.split}>
          <SceneSplit absMs={ms} />
        </TransitionSeries.Sequence>

        {/* split → conclusion: 페이드 (여운 있게) */}
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: T })}
          presentation={fade()}
        />

        {/* Conclusion */}
        <TransitionSeries.Sequence durationInFrames={DUR.conclusion}>
          <SceneConclusion absMs={ms} />
        </TransitionSeries.Sequence>

        {/* conclusion → cta: 아래서 올라오는 슬라이드 (피날레) */}
        <TransitionSeries.Transition
          timing={springTiming({ durationInFrames: T, config: { damping: 180 } })}
          presentation={slide({ direction: 'from-bottom' })}
        />

        {/* CTA */}
        <TransitionSeries.Sequence durationInFrames={DUR.cta}>
          <SceneCTA absMs={ms} />
        </TransitionSeries.Sequence>

      </TransitionSeries>

      {/* ── BGM 시각화 (전역, TransitionSeries 위) ── */}
      <BgmVisualizer audioData={bgmData} />

      {/* ── TikTok 자막 — 하단 고정 ── */}
      <CaptionOverlay
        captions={RAW_CAPTIONS}
        accent={captionAccent}
        fontSize={44}
        position="bottom"
        wordsPerPage={1200}
      />
    </AbsoluteFill>
  );
};
