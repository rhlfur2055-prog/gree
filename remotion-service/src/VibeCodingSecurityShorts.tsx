// VibeCodingSecurityShorts.tsx
// 바이브코딩 보안 숏츠 — TikTok 자막 + Noise 배경 + 씬 플래시 전환

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
import { useAudioData, visualizeAudio } from '@remotion/media-utils';
import type { AudioData } from '@remotion/media-utils';
import { noise2D } from '@remotion/noise';
import { CaptionOverlay } from './components/CaptionOverlay';
import type { RawCaption } from './components/CaptionOverlay';

// ── 팔레트 ──────────────────────────────────────────────────────────────────
const C = {
  bg:       '#FFFFFF',
  text:     '#111111',
  sub:      '#555555',
  red:      '#FF3B30',
  green:    '#34C759',
  blue:     '#007AFF',
  amber:    '#FF9500',
  border:   '#E5E5EA',
  cardBg:   '#F8F8FA',
  darkCard: '#1C1C1E',
};

const FONT  = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const MONO  = "Menlo,'Courier New',monospace";
const FPS   = 30;
const ST    = 200;  // 상단 안전지대
const SB    = 380;  // 하단 안전지대
const SS    = 44;   // 좌우 안전지대

export const VIBE_SECURITY_TOTAL_FRAMES = Math.ceil(51.8 * FPS);

// ── 유틸 ────────────────────────────────────────────────────────────────────
const ci = (f: number, s: number, e: number, os = 0, oe = 1) =>
  interpolate(f, [s, e], [os, oe], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

const sp = (frame: number, delay = 0, damping = 14, stiffness = 120) =>
  spring({ frame: frame - delay, fps: FPS, config: { damping, stiffness, mass: 0.5 } });

// ── 세그먼트 정의 (ms 기준) ──────────────────────────────────────────────────
interface Seg {
  startMs: number;
  endMs:   number;
  text:    string;
  hl?:     string;
  accent?: string;
  scene:   string;
}

const SEGS: Seg[] = [
  { startMs:     0, endMs:  1985, text: '바이브코딩 열풍 저도 압니다',                                          scene: 'hook'       },
  { startMs:  1985, endMs:  3924, text: '코딩 몰라도 앱 만든다 맞습니다',                                       scene: 'hook'       },
  { startMs:  3924, endMs:  5016, text: '근데 그 앱',                                                            scene: 'question'   },
  { startMs:  5016, endMs:  6943, text: '지금 공개해도 안전합니까',       hl: '안전합니까',  accent: C.red,      scene: 'question'   },
  { startMs:  6943, endMs:  8847, text: '해커가 주소창에 칩니다',                                                scene: 'hacker'     },
  { startMs:  8847, endMs: 11599, text: 'codemaster40.com/admin',                                                scene: 'hacker'     },
  { startMs: 11599, endMs: 13665, text: '관리자 페이지로 진입이 됐습니다', hl: '진입이 됐습니다', accent: C.red,  scene: 'hacker'     },
  { startMs: 13665, endMs: 16811, text: 'AI가 짠 코드에 인증 체크가 없습니다',                                   scene: 'hacker'     },
  { startMs: 16811, endMs: 19551, text: '고객 이름 연락처 결제정보 전부 꺼내갑니다',                             scene: 'hacker'     },
  { startMs: 19551, endMs: 23638, text: '국내 정보유출 신고 2025년 2383건',                                      scene: 'stats'      },
  { startMs: 23638, endMs: 26355, text: '1년 만에 26.3% 증가',             hl: '26.3%',       accent: C.amber,   scene: 'stats'      },
  { startMs: 26355, endMs: 30767, text: '실제 원인 GitHub API키 노출과 JWT 미검증',                              scene: 'stats'      },
  { startMs: 30767, endMs: 33100, text: '배포 전 이 네 가지 확인하세요',                                         scene: 'checklist'  },
  { startMs: 33100, endMs: 35991, text: 'GitHub에 API키 비밀번호 올라가 있는지',                                 scene: 'checklist'  },
  { startMs: 35991, endMs: 38441, text: 'JWT 토큰 서버에서 검증되는지',                                          scene: 'checklist'  },
  { startMs: 38441, endMs: 40809, text: '비밀번호 bcrypt 해시로 저장되는지',                                     scene: 'checklist'  },
  { startMs: 40809, endMs: 43375, text: '.env gitignore에 등록되어 있는지',                                      scene: 'checklist'  },
  { startMs: 43375, endMs: 45070, text: '앱은 AI가 만들어줍니다',                                                scene: 'conclusion' },
  { startMs: 45070, endMs: 46869, text: '보안은 만든 사람의 몫입니다',     hl: '만든 사람의 몫', accent: C.red,  scene: 'conclusion' },
  { startMs: 46869, endMs: 49191, text: '출시 전 보안 점검이 진짜 배포입니다',                                   scene: 'conclusion' },
  { startMs: 49191, endMs: 51316, text: '바이브코딩의 끝은 안전한 출시입니다',                                   scene: 'cta'        },
];

const msToF = (ms: number) => Math.round((ms / 1000) * FPS);

function getSeg(ms: number): Seg | null {
  return SEGS.find(s => ms >= s.startMs && ms < s.endMs) ?? null;
}

function getSceneName(ms: number): string {
  return getSeg(ms)?.scene ?? 'hook';
}

// ── @remotion/noise 배경 파티클 ───────────────────────────────────────────────
const NoiseBackground: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame * 0.018;
  const PARTICLES = 28;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none', overflow: 'hidden',
      zIndex: 0,
    }}>
      {Array.from({ length: PARTICLES }, (_, i) => {
        const nx = noise2D(`px${i}`, i * 0.42, t);
        const ny = noise2D(`py${i}`, i * 0.42 + 60, t);
        const ns = noise2D(`ps${i}`, i * 0.42 + 120, t * 0.6);
        const no = noise2D(`po${i}`, i * 0.42 + 180, t * 0.4);

        const x = ((nx + 1) / 2) * 1080;
        const y = ((ny + 1) / 2) * 1920;
        const size = 3 + ((ns + 1) / 2) * 9;
        const opacity = 0.025 + ((no + 1) / 2) * 0.055;
        // 씬별로 색상 변화: 상단 파랑, 하단 레드 느낌
        const isTop = y < 960;

        return (
          <div key={i} style={{
            position: 'absolute',
            left: x, top: y,
            width: size, height: size,
            borderRadius: '50%',
            background: isTop ? C.blue : C.red,
            transform: 'translate(-50%, -50%)',
            opacity,
          }} />
        );
      })}
    </div>
  );
};

// ── 씬 전환 플래시 (@remotion/transitions 대응) ───────────────────────────────
// 씬 경계에서 2프레임 빌드업 + 4프레임 페이드아웃으로 임팩트 있는 컷 연출
const SCENE_BOUNDARIES_MS = [3924, 6943, 19551, 30767, 43375, 49191];

const SceneFlash: React.FC<{ frame: number }> = ({ frame }) => {
  let flashOp = 0;

  for (const bMs of SCENE_BOUNDARIES_MS) {
    const bFrame = msToF(bMs);
    const dist = frame - bFrame;
    if (dist >= -2 && dist <= 5) {
      flashOp = Math.max(
        flashOp,
        dist <= 0
          ? interpolate(dist, [-2, 0], [0, 0.88], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
          : interpolate(dist, [0, 5], [0.88, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      );
    }
  }

  if (flashOp <= 0.01) return null;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: '#FFFFFF',
      opacity: flashOp,
      pointerEvents: 'none',
      zIndex: 95,
    }} />
  );
};

// ── Scene: Hook ──────────────────────────────────────────────────────────────
const SceneHook: React.FC<{ relMs: number }> = ({ relMs }) => {
  const relF  = Math.round((relMs / 1000) * FPS);
  const op    = ci(relF, 0, 12);
  const pulse = 0.97 + 0.03 * Math.sin(relF * 0.12);

  const t1 = interpolate(sp(relF, 0,  18, 130), [0, 1], [40, 0]);
  const t2 = interpolate(sp(relF, 4,  22, 130), [0, 1], [40, 0]);
  const t3 = interpolate(sp(relF, 8,  26, 130), [0, 1], [40, 0]);
  const t4 = interpolate(sp(relF, 14, 32, 130), [0, 1], [40, 0]);

  return (
    <div style={{
      position: 'absolute',
      top: ST + 16, bottom: SB + 10,
      left: SS, right: SS,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      opacity: op,
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: C.blue, borderRadius: 40,
        padding: '13px 26px',
        alignSelf: 'flex-start',
        transform: `translateY(${t1}px) scale(${pulse})`,
        boxShadow: '0 8px 28px rgba(0,122,255,0.38)',
      }}>
        <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 900, color: '#FFF' }}>
          ⚡ codemasterAI
        </span>
      </div>

      <div style={{ transform: `translateY(${t2}px)` }}>
        <div style={{
          fontFamily: FONT, fontWeight: 900,
          letterSpacing: -3, lineHeight: 1.05,
        }}>
          <span style={{ fontSize: 96, color: C.text }}>바이브코딩</span>
          <br />
          <span style={{
            fontSize: 112, color: C.blue,
            textShadow: `0 8px 40px ${C.blue}40`,
          }}>열풍</span>
        </div>
      </div>

      <div style={{
        transform: `translateY(${t3}px)`,
        borderLeft: `6px solid ${C.green}`,
        paddingLeft: 20,
      }}>
        <div style={{
          fontFamily: FONT, fontSize: 44, fontWeight: 700,
          color: C.sub, lineHeight: 1.4,
        }}>
          코딩 몰라도 앱 만든다
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 48, fontWeight: 900,
          color: C.green, marginTop: 4,
        }}>
          맞습니다 ✓
        </div>
      </div>

      <div style={{
        transform: `translateY(${t4}px)`,
        background: C.red,
        borderRadius: 22, padding: '28px 32px',
        display: 'flex', alignItems: 'center', gap: 16,
        boxShadow: `0 10px 40px ${C.red}45`,
      }}>
        <span style={{ fontSize: 44, flexShrink: 0 }}>⚠️</span>
        <span style={{
          fontFamily: FONT, fontSize: 38, fontWeight: 900,
          color: '#FFF', lineHeight: 1.3,
        }}>
          근데 그 앱<br />지금 안전합니까?
        </span>
      </div>
    </div>
  );
};

// ── Scene: Question ──────────────────────────────────────────────────────────
const SceneQuestion: React.FC<{ relMs: number; absMs: number }> = ({ relMs }) => {
  const relF = Math.round((relMs / 1000) * FPS);
  const op   = ci(relF, 0, 10);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      opacity: op,
      background: '#FFF5F5',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 80% 60% at 50% 45%, ${C.red}20 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'absolute',
        top: ST + 40, left: 0, right: 0,
        textAlign: 'center',
        fontFamily: FONT, fontSize: 48, fontWeight: 700, color: C.sub,
      }}>
        지금 공개해도
      </div>

      <div style={{
        position: 'absolute',
        top: 0, bottom: 0, left: SS, right: SS,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          fontFamily: FONT, fontSize: 124, fontWeight: 900,
          color: C.red, letterSpacing: -5, lineHeight: 1.0,
          textAlign: 'center',
          textShadow: `0 10px 50px ${C.red}35`,
        }}>
          안전합니까?
        </div>
      </div>

      <div style={{
        position: 'absolute',
        bottom: SB + 40, left: 0, right: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 28,
      }}>
        <div style={{ fontSize: 80 }}>⚠️</div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          {['인증', '암호화', 'API키', '.env'].map((tag, i) => {
            const tagOp = ci(relF, 10 + i * 6, 24 + i * 6);
            return (
              <div key={i} style={{
                background: C.red, borderRadius: 40,
                padding: '18px 32px',
                fontFamily: FONT, fontSize: 32, fontWeight: 800,
                color: '#FFF', opacity: tagOp,
                boxShadow: `0 6px 24px ${C.red}50`,
              }}>
                {tag}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Scene: Hacker ─────────────────────────────────────────────────────────────
const BrowserBar: React.FC<{ url: string; typed: number }> = ({ url, typed }) => {
  const shown = url.slice(0, Math.round(url.length * typed));
  return (
    <div style={{
      height: 52, background: '#EBEBED',
      borderBottom: '1px solid #D1D1D6',
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
    }}>
      {['#FF5F57','#FEBC2E','#28C840'].map((col, i) => (
        <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: col }} />
      ))}
      <div style={{
        flex: 1, marginLeft: 12, height: 32,
        background: '#FFF', borderRadius: 8, border: '1px solid #D1D1D6',
        display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6,
        fontFamily: MONO, fontSize: 15, color: '#333',
      }}>
        <span style={{ fontSize: 13 }}>🔒</span>
        <span>{shown}</span>
        {typed < 1 && (
          <span style={{ borderRight: '2px solid #333', height: 16, marginLeft: 2 }} />
        )}
      </div>
    </div>
  );
};

const AdminDashboard: React.FC<{ showAlarm: boolean }> = ({ showAlarm }) => (
  <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
    <div style={{
      width: 160, background: '#1C2333',
      padding: '28px 0', display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0,
    }}>
      {[
        { icon: '👥', label: '회원 목록', active: true },
        { icon: '💳', label: '결제 내역', active: false },
        { icon: '📦', label: '주문 관리', active: false },
        { icon: '⚙️', label: '설정',     active: false },
      ].map((item, i) => (
        <div key={i} style={{
          padding: '20px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          background: item.active ? 'rgba(255,59,48,0.25)' : 'transparent',
          borderLeft: item.active ? `4px solid ${C.red}` : '4px solid transparent',
        }}>
          <span style={{ fontSize: 22 }}>{item.icon}</span>
          <span style={{
            fontFamily: FONT, fontSize: 17,
            color: item.active ? '#FFF' : 'rgba(255,255,255,0.45)',
            fontWeight: item.active ? 700 : 400,
          }}>{item.label}</span>
        </div>
      ))}
    </div>

    <div style={{ flex: 1, background: '#F8F9FB', padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
      {showAlarm && (
        <div style={{
          background: C.red, borderRadius: 14,
          padding: '18px 22px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: `0 6px 24px ${C.red}50`,
        }}>
          <span style={{ fontSize: 28 }}>🚨</span>
          <span style={{ fontFamily: FONT, fontSize: 20, fontWeight: 900, color: '#FFF' }}>
            인증 없이 /admin 접근 허용됨
          </span>
        </div>
      )}

      <div style={{
        background: '#FFF', borderRadius: 16,
        border: '1.5px solid #E5E5EA', overflow: 'hidden',
        flex: 1, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '18px 22px',
          fontFamily: FONT, fontSize: 18, fontWeight: 800, color: C.text,
          borderBottom: '1.5px solid #E5E5EA',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <span>👥 회원 목록</span>
          <span style={{ color: C.red, fontSize: 15, fontWeight: 700 }}>🔓 로그인 없이 열람 중</span>
        </div>
        {[
          { name: '김민수', phone: '010-****-3821', card: '신한카드 **** 4821' },
          { name: '이지영', phone: '010-****-9104', card: '카카오페이 **** 2201' },
          { name: '박준혁', phone: '010-****-7732', card: '현대카드 **** 0093' },
        ].map((row, i) => (
          <div key={i} style={{
            padding: '22px 22px',
            borderBottom: i < 2 ? '1.5px solid #F0F0F5' : 'none',
            display: 'flex', gap: 18, alignItems: 'center',
            flex: 1,
          }}>
            <span style={{ fontFamily: FONT, fontSize: 18, fontWeight: 800, width: 72, color: C.text, flexShrink: 0 }}>{row.name}</span>
            <span style={{ fontFamily: MONO, fontSize: 16, color: C.sub, flex: 1 }}>{row.phone}</span>
            <span style={{ fontFamily: MONO, fontSize: 16, color: C.red, fontWeight: 700 }}>{row.card}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const CodeComparison: React.FC = () => (
  <div style={{
    flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr',
    background: '#1E1E1E',
  }}>
    <div style={{ padding: '20px', borderRight: '1px solid #333' }}>
      <div style={{
        fontFamily: FONT, fontSize: 13, fontWeight: 700,
        color: C.red, marginBottom: 12,
      }}>❌ AI가 생성한 코드</div>
      <pre style={{ fontFamily: MONO, fontSize: 13, color: '#D4D4D4', margin: 0, lineHeight: 1.7 }}>
{`// /admin 라우트
app.get('/admin',
  (req, res) => {
  // 인증 체크 없음
  res.render('admin');
});`}
      </pre>
      <div style={{
        marginTop: 12, background: `${C.red}20`,
        borderRadius: 8, padding: '8px 12px',
        fontFamily: FONT, fontSize: 12, color: C.red, fontWeight: 700,
      }}>⚠️ 누구나 접근 가능</div>
    </div>
    <div style={{ padding: '20px' }}>
      <div style={{
        fontFamily: FONT, fontSize: 13, fontWeight: 700,
        color: C.green, marginBottom: 12,
      }}>✅ 수정된 코드</div>
      <pre style={{ fontFamily: MONO, fontSize: 13, color: '#D4D4D4', margin: 0, lineHeight: 1.7 }}>
{`// /admin 라우트
app.get('/admin',
  requireAuth,
  (req, res) => {
  res.render('admin');
});`}
      </pre>
      <div style={{
        marginTop: 12, background: `${C.green}20`,
        borderRadius: 8, padding: '8px 12px',
        fontFamily: FONT, fontSize: 12, color: C.green, fontWeight: 700,
      }}>✓ 로그인 사용자만 접근</div>
    </div>
  </div>
);

const SceneHacker: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF13   = Math.round(((absMs - 6943) / 1000) * FPS);
  const op       = ci(relF13, 0, 12);
  const isTyping = absMs >= 8847 && absMs < 11599;
  const isCode   = absMs >= 13665 && absMs < 16811;

  const URL = 'codemaster40.com/admin';
  const urlTyped = isTyping
    ? ci(Math.round(((absMs - 8847) / 1000) * FPS), 0, 55)
    : absMs >= 11599 ? 1 : 0;
  const shownUrl = URL.slice(0, Math.round(URL.length * urlTyped));
  const cursorBlink = Math.sin(relF13 * 0.25) > 0;

  if (absMs < 11599) {
    const dropOp = isTyping ? ci(Math.round(((absMs - 9500) / 1000) * FPS), 0, 10) : 0;

    return (
      <div style={{
        position: 'absolute', inset: 0,
        background: '#F2F2F7',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 0, opacity: op,
      }}>
        <div style={{
          marginBottom: 32,
          fontFamily: FONT, fontSize: 34, fontWeight: 700,
          color: C.sub, textAlign: 'center',
        }}>
          🎯 해커가 주소창에 직접 입력합니다
        </div>

        <div style={{ width: '92%', position: 'relative' }}>
          <div style={{
            background: '#FFF',
            borderRadius: isTyping && dropOp > 0.1 ? '12px 12px 0 0' : 12,
            border: `2.5px solid ${isTyping ? C.blue : '#DADCE0'}`,
            padding: '0 22px',
            height: 100,
            display: 'flex', alignItems: 'center', gap: 16,
            boxShadow: isTyping
              ? `0 4px 30px rgba(0,122,255,0.20), 0 1px 6px rgba(0,0,0,0.12)`
              : '0 1px 6px rgba(0,0,0,0.12)',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: '#F1F3F4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 22 }}>🔒</span>
            </div>

            <div style={{
              flex: 1,
              fontFamily: MONO, fontSize: 44, fontWeight: 500,
              color: isTyping ? '#202124' : '#9AA0A6',
              display: 'flex', alignItems: 'center',
              overflow: 'hidden',
            }}>
              {isTyping ? (
                <>
                  <span style={{ color: '#1A73E8', fontWeight: 700 }}>
                    {shownUrl.split('/')[0]}
                  </span>
                  {shownUrl.includes('/') && (
                    <span style={{ color: C.red, fontWeight: 700 }}>
                      /{shownUrl.split('/').slice(1).join('/')}
                    </span>
                  )}
                  {cursorBlink && (
                    <span style={{
                      display: 'inline-block', width: 3, height: 46,
                      background: C.blue, borderRadius: 2, marginLeft: 2,
                      flexShrink: 0,
                    }} />
                  )}
                </>
              ) : (
                <span>주소 검색 또는 URL 입력</span>
              )}
            </div>

            {isTyping && (
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: '#F1F3F4',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                fontFamily: MONO, fontSize: 20, color: '#5F6368',
              }}>✕</div>
            )}
          </div>

          {isTyping && (
            <div style={{
              background: '#FFF',
              borderRadius: '0 0 16px 16px',
              border: '2.5px solid #DADCE0',
              borderTop: 'none',
              overflow: 'hidden',
              opacity: dropOp,
              boxShadow: '0 8px 30px rgba(0,0,0,0.14)',
            }}>
              <div style={{
                padding: '22px 22px',
                display: 'flex', alignItems: 'center', gap: 18,
                background: '#EEF3FB',
                borderBottom: '1px solid #F1F3F4',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: '#FFF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid #DADCE0', flexShrink: 0,
                }}>
                  <span style={{ fontSize: 20 }}>🔒</span>
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 36, fontWeight: 700, color: '#202124' }}>
                    <span style={{ color: '#1A73E8' }}>codemaster40.com</span>
                    <span style={{ color: C.red }}>/admin</span>
                  </div>
                </div>
              </div>
              <div style={{
                padding: '20px 22px',
                display: 'flex', alignItems: 'center', gap: 18,
                borderBottom: '1px solid #F1F3F4',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: '#F1F3F4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 22,
                }}>🔍</div>
                <div style={{ fontFamily: MONO, fontSize: 32, color: '#5F6368' }}>
                  codemaster40.com/admin — Google 검색
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{
          marginTop: 48,
          fontFamily: FONT, fontSize: 30, fontWeight: 700,
          color: C.red,
          background: `${C.red}12`, padding: '16px 32px', borderRadius: 40,
          border: `1.5px solid ${C.red}30`,
          opacity: isTyping ? 1 : 0,
        }}>
          인증 없이 /admin 직접 접근 시도 중
        </div>
      </div>
    );
  }

  const alarmOp = ci(Math.round(((absMs - 11599) / 1000) * FPS), 0, 8);
  return (
    <div style={{
      position: 'absolute',
      top: ST + 10, left: SS, right: SS,
      bottom: SB + 10,
      opacity: op,
      background: '#FFF',
      borderRadius: 20, overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(0,0,0,0.16)',
      border: `3px solid ${C.red}`,
      display: 'flex', flexDirection: 'column',
    }}>
      <BrowserBar url={URL} typed={1} />
      {isCode ? <CodeComparison /> : <AdminDashboard showAlarm={true} />}
    </div>
  );
};

// ── Scene: Stats ─────────────────────────────────────────────────────────────
const SceneStats: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF25 = Math.round(((absMs - 19551) / 1000) * FPS);
  const op     = ci(relF25, 0, 12);

  const count = absMs >= 19551
    ? Math.round(ci(relF25, 4, 60) * 2383)
    : 0;

  const barPct = absMs >= 23638
    ? ci(Math.round(((absMs - 23638) / 1000) * FPS), 4, 50) * 26.3
    : 0;

  const causeOp = absMs >= 26355
    ? ci(Math.round(((absMs - 26355) / 1000) * FPS), 0, 14)
    : 0;

  return (
    <div style={{
      position: 'absolute',
      top: ST + 20, bottom: SB + 10,
      left: SS, right: SS,
      display: 'flex', flexDirection: 'column', gap: 18,
      opacity: op,
    }}>
      <div style={{
        flex: 1,
        background: C.cardBg, borderRadius: 24,
        padding: '0 36px',
        border: `2px solid ${C.border}`,
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        <div style={{ fontFamily: FONT, fontSize: 22, color: C.sub, fontWeight: 600, marginBottom: 12 }}>
          국내 정보유출 신고 건수 (2025)
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 96, fontWeight: 900,
          color: C.red, letterSpacing: -4, lineHeight: 1,
        }}>
          {count.toLocaleString()}
          <span style={{ fontSize: 36, color: C.sub, fontWeight: 600 }}>건</span>
        </div>
      </div>

      <div style={{
        flex: 1,
        background: C.cardBg, borderRadius: 24,
        padding: '0 36px',
        border: `2px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 22, color: C.sub, fontWeight: 600 }}>
          전년 대비 증가율
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            flex: 1, height: 52, background: '#EBEBF0',
            borderRadius: 14, overflow: 'hidden',
          }}>
            <div style={{
              width: `${(barPct / 26.3) * 100}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${C.amber}, ${C.red})`,
              borderRadius: 14,
            }} />
          </div>
          <div style={{
            fontFamily: FONT, fontSize: 56, fontWeight: 900,
            color: C.amber, width: 150, textAlign: 'right', letterSpacing: -2,
          }}>
            {barPct.toFixed(1)}%
          </div>
        </div>
      </div>

      <div style={{
        flex: 1,
        background: '#FFF5E6', borderRadius: 24,
        padding: '0 32px',
        border: `2px solid ${C.amber}40`,
        opacity: causeOp,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 22, color: C.amber, fontWeight: 900 }}>
          🔍 실제 유출 원인
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {['GitHub API키 노출', 'JWT 미검증'].map((item, i) => (
            <div key={i} style={{
              flex: 1, background: '#FFF',
              borderRadius: 16, padding: '20px 0',
              border: `1.5px solid ${C.amber}35`,
              fontFamily: FONT, fontSize: 24, fontWeight: 800,
              color: C.text, textAlign: 'center',
            }}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Scene: Checklist ─────────────────────────────────────────────────────────
const CHECKS = [
  {
    startMs: 30767, icon: '⚠️', label: '배포 전 이 4가지 주의하세요',
    code: '① .env 유출 → API키·DB·결제키 털림\n② JWT 미검증 → 로그인 인증 전체 우회\n③ 비밀번호 평문 → DB 털리면 즉시 노출\n④ .gitignore 누락 → 시크릿 깃에 업로드',
    bad: '확인 없이 배포 → 언제 터질지 모름',
    good: '4가지 점검 후 배포',
  },
  {
    startMs: 33100, icon: '🔥', label: '.env 유출되면 이렇게 됩니다',
    code: '⚠️ 깃헙에 올라가는 순간 수분 내 탐지·악용\n\nOPENAI_API_KEY   → 요금 폭탄, 서비스 장악\nDATABASE_URL     → 데이터베이스 통째로 접근\nSTRIPE_SECRET    → 실제 결제 돈 빠져나감\nJWT_SECRET       → 로그인 인증 전체 우회\nSENDGRID_API_KEY → 내 도메인으로 스팸 발송',
    bad: 'git add .  ← .env 같이 커밋됨',
    good: '.gitignore에 .env 등록 필수',
  },
  {
    startMs: 35991, icon: '🚨', label: 'JWT 이렇게 쓰면 뚫립니다',
    code: '⚠️ 3가지 실수 중 하나만 있어도 인증 무력화\n\n① 서버 검증 생략\n   → 해커가 토큰 위조해서 관리자 통과\n\n② 만료 시간(exp) 없음\n   → 탈취된 토큰 평생 사용 가능\n\n③ JWT_SECRET 코드에 하드코딩\n   → 깃헙 노출 시 토큰 전부 위조 가능',
    bad: '클라이언트 토큰 그냥 신뢰',
    good: 'jwt.verify(token, SECRET)',
  },
  {
    startMs: 38441, icon: '💀', label: '비밀번호 이렇게 저장하면 끝납니다',
    code: '⚠️ DB 한 번만 털려도 전체 유저 비번 노출\n\n① 평문 저장\n   "password123" → 그대로 읽힘\n\n② MD5 / SHA1 해시\n   → 레인보우 테이블로 수초 만에 해독\n   → 2000년대 방식, 지금은 사용 금지\n\n③ bcrypt salt 낮게 설정 (rounds < 10)\n   → 브루트포스 공격에 취약',
    bad: 'password: "user123"  // 평문 저장',
    good: 'bcrypt.hash(pw, 12)  // 최소 12',
  },
  {
    startMs: 40809, icon: '🙈', label: '.env 말고 이것도 깃에 올리면 안 됩니다',
    code: '⚠️ .env 막았다고 끝이 아닙니다\n\ncredentials.json     → Google / AWS 계정 장악\nservice-account.json → Firebase / GCP 전체 접근\n*.pem / *.key        → SSL 인증서·개인키 탈취\n*.sqlite / *.db      → 로컬 DB 유저 데이터 노출\n.env.production      → 프로덕션 환경변수 전체',
    bad: '.gitignore에 .env만 있음',
    good: 'credentials·pem·db 전부 차단',
  },
];

const SceneChecklist: React.FC<{ absMs: number }> = ({ absMs }) => {
  const activeIdx = CHECKS.reduce((best, c, i) =>
    absMs >= c.startMs ? i : best, -1);
  if (activeIdx < 0) return null;
  const check = CHECKS[activeIdx];

  const relF   = Math.round(((absMs - check.startMs) / 1000) * FPS);
  const op     = ci(relF, 0, 10);
  const slideY = interpolate(sp(relF, 0, 16, 130), [0, 1], [30, 0]);

  return (
    <div style={{
      position: 'absolute',
      top: ST + 10, bottom: SB + 10,
      left: SS, right: SS,
      display: 'flex', flexDirection: 'column', gap: 18,
      opacity: op, transform: `translateY(${slideY}px)`,
    }}>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexShrink: 0 }}>
        {CHECKS.map((_, i) => (
          <div key={i} style={{
            width: i === activeIdx ? 36 : 12,
            height: 12, borderRadius: 6,
            background: i <= activeIdx ? C.blue : C.border,
          }} />
        ))}
      </div>

      <div style={{
        background: C.cardBg, borderRadius: 22,
        padding: '28px 30px', border: `2px solid ${C.blue}40`,
        display: 'flex', alignItems: 'center', gap: 20,
        flexShrink: 0,
        boxShadow: `0 6px 30px ${C.blue}12`,
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: C.blue,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 34, flexShrink: 0,
          boxShadow: `0 6px 20px ${C.blue}40`,
        }}>
          {check.icon}
        </div>
        <div>
          <div style={{ fontFamily: FONT, fontSize: 16, color: C.blue, fontWeight: 700, marginBottom: 6 }}>
            체크 {activeIdx + 1} / {CHECKS.length}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 34, fontWeight: 900, color: C.text, letterSpacing: -0.5 }}>
            {check.label}
          </div>
        </div>
      </div>

      <div style={{
        background: '#1E1E1E', borderRadius: 20,
        padding: '28px 28px', border: '1px solid #3A3A3C',
        flex: 1, overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.20)',
      }}>
        <pre style={{
          fontFamily: MONO, fontSize: 30, color: '#D4D4D4',
          margin: 0, lineHeight: 1.85, whiteSpace: 'pre-wrap',
          height: '100%',
        }}>
          {check.code}
        </pre>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, flexShrink: 0 }}>
        <div style={{
          background: '#FFF5F5', borderRadius: 18,
          padding: '22px 22px', border: `2px solid ${C.red}35`,
        }}>
          <div style={{ fontFamily: FONT, fontSize: 16, color: C.red, fontWeight: 800, marginBottom: 10 }}>❌ 위험</div>
          <div style={{ fontFamily: MONO, fontSize: 17, color: C.red, lineHeight: 1.6 }}>{check.bad}</div>
        </div>
        <div style={{
          background: '#F0FFF4', borderRadius: 18,
          padding: '22px 22px', border: `2px solid ${C.green}35`,
        }}>
          <div style={{ fontFamily: FONT, fontSize: 16, color: C.green, fontWeight: 800, marginBottom: 10 }}>✅ 안전</div>
          <div style={{ fontFamily: MONO, fontSize: 17, color: C.green, lineHeight: 1.6 }}>{check.good}</div>
        </div>
      </div>
    </div>
  );
};

// ── Scene: Conclusion ────────────────────────────────────────────────────────
const SceneConclusion: React.FC<{ absMs: number }> = ({ absMs }) => {
  const relF56 = Math.round(((absMs - 43375) / 1000) * FPS);
  const op     = ci(relF56, 0, 12);

  const c1op  = ci(relF56, 0, 14);
  const c1y   = interpolate(sp(relF56, 0, 18, 130), [0, 1], [30, 0]);
  const c2op  = absMs >= 45070 ? ci(Math.round(((absMs - 45070) / 1000) * FPS), 0, 14) : 0;
  const c2y   = absMs >= 45070 ? interpolate(sp(Math.round(((absMs - 45070) / 1000) * FPS), 0, 18, 130), [0, 1], [30, 0]) : 30;
  const c3op  = absMs >= 46869 ? ci(Math.round(((absMs - 46869) / 1000) * FPS), 0, 14) : 0;
  const c3y   = absMs >= 46869 ? interpolate(sp(Math.round(((absMs - 46869) / 1000) * FPS), 0, 18, 130), [0, 1], [30, 0]) : 30;

  const cards = [
    {
      text: '앱은 AI가 만들어줍니다',
      sub: '하지만 보안은 AI가 챙겨주지 않습니다\n어느새 API키가 노출됐을 수도 있습니다',
      icon: '🤖', color: C.blue, bg: '#EEF5FF', op: c1op, ty: c1y,
    },
    {
      text: '보안은 만든 사람의 몫입니다',
      sub: '내가 만든 서비스라면\n지금 당장 다시 점검하며 돌아봐야 합니다',
      icon: '🛡️', color: C.red, bg: '#FFF2F1', op: c2op, ty: c2y,
    },
    {
      text: '배포 전 반드시 확인하세요',
      sub: 'CS 지식 없이 출시하면 언제 터질지 모릅니다\n어느정도 사람 손을 타야 안전한 서비스입니다',
      icon: '✅', color: C.green, bg: '#EFFAF4', op: c3op, ty: c3y,
    },
  ];

  return (
    <div style={{
      position: 'absolute',
      top: ST + 20, bottom: SB + 10,
      left: SS, right: SS,
      display: 'flex', flexDirection: 'column', gap: 20,
      opacity: op,
    }}>
      <div style={{
        fontFamily: FONT, fontSize: 28, fontWeight: 800,
        color: C.sub, textAlign: 'center', flexShrink: 0,
        letterSpacing: 2,
      }}>
        ✦ 기억하세요 ✦
      </div>

      {cards.map((card, i) => (
        <div key={i} style={{
          flex: 1,
          background: card.bg, borderRadius: 24,
          border: `2.5px solid ${card.color}35`,
          display: 'flex', alignItems: 'center', gap: 24,
          padding: '0 32px',
          opacity: card.op,
          transform: `translateY(${card.ty}px)`,
          boxShadow: `0 6px 30px ${card.color}18`,
        }}>
          <span style={{ fontSize: 52, flexShrink: 0 }}>{card.icon}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              fontFamily: FONT,
              fontSize: 34,
              fontWeight: 900,
              color: card.color,
              lineHeight: 1.25,
              letterSpacing: -0.5,
            }}>
              {card.text}
            </div>
            <div style={{
              fontFamily: FONT,
              fontSize: 22,
              fontWeight: 600,
              color: C.sub,
              lineHeight: 1.5,
              whiteSpace: 'pre-line',
            }}>
              {card.sub}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Scene: CTA ───────────────────────────────────────────────────────────────
const SceneCTA: React.FC<{ relMs: number }> = ({ relMs }) => {
  const relF   = Math.round((relMs / 1000) * FPS);
  const op     = ci(relF, 0, 16);
  const pulse  = 0.97 + 0.03 * Math.sin(relF * 0.14);
  const pulse2 = 0.97 + 0.03 * Math.sin(relF * 0.14 + 1.6);
  const btnOp  = ci(relF, 8, 22);
  const nextOp = ci(relF, 18, 32);

  return (
    <div style={{
      position: 'absolute',
      top: ST + 16, bottom: SB + 10,
      left: SS, right: SS,
      display: 'flex', flexDirection: 'column', gap: 20,
      opacity: op,
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: C.blue, borderRadius: 40, padding: '13px 26px',
        alignSelf: 'flex-start', flexShrink: 0,
        boxShadow: '0 6px 24px rgba(0,122,255,0.35)',
      }}>
        <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 900, color: '#FFF' }}>⚡ codemasterAI</span>
      </div>

      <div style={{
        flex: 1,
        background: C.cardBg,
        borderRadius: 28,
        border: `3px solid ${C.green}`,
        boxShadow: `0 12px 60px ${C.green}20`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
        padding: '0 40px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 72 }}>🛡️</div>
        <div style={{
          fontFamily: FONT, fontSize: 72, fontWeight: 900,
          color: C.text, lineHeight: 1.2, letterSpacing: -2,
        }}>
          바이브코딩의<br />끝은
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 82, fontWeight: 900,
          color: C.green, letterSpacing: -2.5, lineHeight: 1.0,
        }}>
          안전한 출시
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 40, fontWeight: 700, color: C.sub,
        }}>
          입니다
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 26, fontWeight: 600, color: C.sub,
          background: '#EFEFEF', padding: '14px 28px', borderRadius: 40,
          marginTop: 4,
        }}>
          보안 = 배포의 마지막 단계
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, opacity: btnOp, flexShrink: 0 }}>
        <div style={{
          flex: 1, background: C.red, borderRadius: 22, padding: '32px 0',
          textAlign: 'center',
          fontFamily: FONT, fontSize: 36, fontWeight: 900, color: '#FFF',
          boxShadow: `0 10px 40px ${C.red}55`,
          transform: `scale(${pulse})`,
        }}>🔔 구독</div>
        <div style={{
          flex: 1, background: C.amber, borderRadius: 22, padding: '32px 0',
          textAlign: 'center',
          fontFamily: FONT, fontSize: 36, fontWeight: 900, color: '#FFF',
          boxShadow: `0 10px 40px ${C.amber}55`,
          transform: `scale(${pulse2})`,
        }}>👍 좋아요</div>
      </div>

      <div style={{
        background: C.cardBg, borderRadius: 22, padding: '24px 28px',
        border: `1.5px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 18,
        opacity: nextOp, flexShrink: 0,
      }}>
        <div style={{
          background: C.blue, borderRadius: 14, padding: '12px 18px',
          fontFamily: FONT, fontSize: 15, fontWeight: 900, color: '#FFF', flexShrink: 0,
        }}>NEXT</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT, fontSize: 14, color: C.sub, fontWeight: 600, marginBottom: 4 }}>다음 편</div>
          <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 900, color: C.text }}>
            AI로 2주 만에 앱 출시한 이야기
          </div>
        </div>
        <span style={{ fontSize: 28, color: C.sub }}>▶</span>
      </div>
    </div>
  );
};

// ── Props & 기본값 ────────────────────────────────────────────────────────────
export interface VibeCodingSecurityProps {
  audioDurationSeconds: number;
  audioSrc: string | null;
}

export const defaultVibeCodingSecurityProps: VibeCodingSecurityProps = {
  audioDurationSeconds: 71.5,
  audioSrc: null,
};

// ── BGM 시각화 컴포넌트 ───────────────────────────────────────────────────────
const BgmVisualizer: React.FC<{ audioData: AudioData | null }> = ({ audioData }) => {
  const frame = useCurrentFrame();
  if (!audioData) return null;

  const viz = visualizeAudio({
    fps: FPS,
    frame,
    audioData,
    numberOfSamples: 64,
    smoothing: true,
  });

  return (
    <div style={{
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      height: 72,
      display: 'flex',
      alignItems: 'flex-end',
      gap: 2,
      padding: '0 6px',
      opacity: 0.18,
      pointerEvents: 'none',
    }}>
      {viz.map((v, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${Math.max(2, v * 72)}px`,
          background: i < 32
            ? `linear-gradient(to top, ${C.red}, ${C.amber})`
            : `linear-gradient(to top, ${C.blue}, #5AC8FA)`,
          borderRadius: '2px 2px 0 0',
        }} />
      ))}
    </div>
  );
};

// ── SFX 트랜지션 정의 ─────────────────────────────────────────────────────────
const SFX_EVENTS = [
  { ms:  3924, file: 'sfx/whoosh.mp3',      volume: 0.55 },
  { ms:  6943, file: 'sfx/impact_high.mp3', volume: 0.70 },
  { ms: 11599, file: 'sfx/glitch.mp3',      volume: 0.50 },
  { ms: 19551, file: 'sfx/impact_low.mp3',  volume: 0.60 },
  { ms: 30767, file: 'sfx/riser.mp3',       volume: 0.45 },
  { ms: 43375, file: 'sfx/chime.mp3',       volume: 0.60 },
  { ms: 49191, file: 'sfx/bass_drop.mp3',   volume: 0.65 },
];

// TikTok 자막용 RawCaption 배열 (SEGS에서 직접 생성)
const RAW_CAPTIONS: RawCaption[] = SEGS.map(s => ({
  text:    s.text,
  startMs: s.startMs,
  endMs:   s.endMs,
}));

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export const VibeCodingSecurityShorts: React.FC<VibeCodingSecurityProps> = () => {
  const frame = useCurrentFrame();
  const ms    = (frame / FPS) * 1000;

  const sceneName = getSceneName(ms);
  const bgmData   = useAudioData(staticFile('bgm/dark_tension.mp3'));

  // 현재 씬 accent 색상 → TikTok 자막 강조색
  const seg = getSeg(ms);
  const captionAccent = seg?.accent ?? C.blue;

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {/* TTS 보이스 */}
      <Audio src={staticFile('audio/security_tts.mp3')} />

      {/* BGM */}
      <Audio src={staticFile('bgm/dark_tension.mp3')} volume={0.12} />

      {/* SFX — 씬 전환마다 효과음 */}
      {SFX_EVENTS.map(({ ms: sfxMs, file, volume }) => (
        <Sequence key={file} from={msToF(sfxMs)} durationInFrames={60}>
          <Audio src={staticFile(file)} volume={volume} />
        </Sequence>
      ))}

      {/* @remotion/noise 파티클 배경 */}
      <NoiseBackground frame={frame} />

      {/* 배경 글로우 그라디언트 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(0,122,255,0.03) 0%, transparent 60%)',
        pointerEvents: 'none',
        zIndex: 1,
      }} />

      {/* 씬 콘텐츠 */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
        {sceneName === 'hook'       && <SceneHook       relMs={Math.max(0, ms - 0)}       />}
        {sceneName === 'question'   && <SceneQuestion   relMs={Math.max(0, ms - 3924)}    absMs={ms} />}
        {sceneName === 'hacker'     && <SceneHacker     absMs={ms}                         />}
        {sceneName === 'stats'      && <SceneStats      absMs={ms}                         />}
        {sceneName === 'checklist'  && <SceneChecklist  absMs={ms}                         />}
        {sceneName === 'conclusion' && <SceneConclusion absMs={ms}                         />}
        {sceneName === 'cta'        && <SceneCTA        relMs={Math.max(0, ms - 49191)}    />}
      </div>

      {/* 씬 전환 플래시 (씬 경계 ±몇 프레임 흰 플래시) */}
      <SceneFlash frame={frame} />

      {/* BGM 반응형 시각화 — 하단 오디오 바 */}
      <BgmVisualizer audioData={bgmData} />

      {/* TikTok 스타일 자막 — 단어별 팝인 애니메이션 */}
      <CaptionOverlay
        captions={RAW_CAPTIONS}
        accent={captionAccent}
        fontSize={46}
        position="bottom"
        wordsPerPage={1200}
      />
    </AbsoluteFill>
  );
};
