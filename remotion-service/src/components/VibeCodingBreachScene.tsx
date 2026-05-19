import React from 'react';
import {
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  random,
  AbsoluteFill,
} from 'remotion';
import { noise2D } from '@remotion/noise';
import { CaptionOverlay, RawCaption } from './CaptionOverlay';

const DEMO_CAPTIONS: RawCaption[] = [
  { text: '바이브코딩', startMs: 500, endMs: 1100 },
  { text: '열풍,', startMs: 1100, endMs: 1600 },
  { text: '저도', startMs: 1600, endMs: 2000 },
  { text: '압니다.', startMs: 2000, endMs: 2700 },
  { text: '코딩', startMs: 3000, endMs: 3400 },
  { text: '몰라도', startMs: 3400, endMs: 3900 },
  { text: '앱', startMs: 3900, endMs: 4100 },
  { text: '만든다.', startMs: 4100, endMs: 4800 },
  { text: '맞습니다.', startMs: 4800, endMs: 5600 },
  { text: '근데', startMs: 6200, endMs: 6600 },
  { text: '질문', startMs: 6600, endMs: 7000 },
  { text: '하나만', startMs: 7000, endMs: 7500 },
  { text: '할게요.', startMs: 7500, endMs: 8200 },
  { text: '그', startMs: 8500, endMs: 8700 },
  { text: '앱', startMs: 8700, endMs: 8900 },
  { text: '—', startMs: 8900, endMs: 9100 },
  { text: '지금', startMs: 9100, endMs: 9500 },
  { text: '인터넷에', startMs: 9500, endMs: 10200 },
  { text: '공개해도', startMs: 10200, endMs: 10900 },
  { text: '안전합니까?', startMs: 10900, endMs: 12000 },
  { text: 'AI가', startMs: 13000, endMs: 13400 },
  { text: '만든', startMs: 13400, endMs: 13800 },
  { text: '코드에', startMs: 13800, endMs: 14400 },
  { text: 'SQL', startMs: 14600, endMs: 15000 },
  { text: '인젝션', startMs: 15000, endMs: 15600 },
  { text: '취약점이', startMs: 15600, endMs: 16300 },
  { text: '있었습니다.', startMs: 16300, endMs: 17200 },
  { text: '해커는', startMs: 17500, endMs: 18000 },
  { text: '이렇게', startMs: 18000, endMs: 18500 },
  { text: '입력합니다.', startMs: 18500, endMs: 19500 },
  { text: '2024년', startMs: 20000, endMs: 20600 },
  { text: '실제', startMs: 20600, endMs: 21000 },
  { text: '통계입니다.', startMs: 21000, endMs: 21800 },
  { text: 'SQL', startMs: 22200, endMs: 22600 },
  { text: '인젝션으로', startMs: 22600, endMs: 23400 },
  { text: '뚫린', startMs: 23400, endMs: 23800 },
  { text: '기업만', startMs: 23800, endMs: 24300 },
  { text: '17곳.', startMs: 24300, endMs: 25200 },
  { text: '바이브코딩으로', startMs: 26000, endMs: 26900 },
  { text: '만든', startMs: 26900, endMs: 27300 },
  { text: '당신의', startMs: 27300, endMs: 27800 },
  { text: '앱도', startMs: 27800, endMs: 28300 },
  { text: '지금', startMs: 28300, endMs: 28700 },
  { text: '뚫리고', startMs: 28700, endMs: 29300 },
  { text: '있을 수', startMs: 29300, endMs: 29900 },
  { text: '있습니다.', startMs: 29900, endMs: 31000 },
];

const PROMPT_TEXT = '로그인 기능 만들어줘';
const CODE_LINES = [
  'function login(email, pw) {',
  '  const user = db.query(',
  "    \"SELECT * FROM users",
  "     WHERE email='\" + email",
  '  );',
  '  return user;',
  '}',
];
const KISA_STATS = [
  { label: '2024년 개인정보 유출 신고', value: '307건', sub: '전년 대비 +23%', color: '#FF9500' },
  { label: '해킹으로 인한 유출', value: '171건', sub: '전체의 56%', color: '#FF6B35' },
  { label: 'SQL 인젝션 해킹 유형 2위', value: '17건', sub: '개인정보보호위원회 2025.03', color: '#FF3B30' },
];

const Particles: React.FC<{ frame: number; accent: string; count?: number }> = ({ frame, accent, count = 20 }) => (
  <>
    {Array.from({ length: count }).map((_, i) => {
      const x = random(`px-${i}`) * 1080;
      const speed = 0.2 + random(`speed-${i}`) * 0.5;
      const y = ((random(`py-${i}`) * 1920 + frame * speed * 0.4) % 1920);
      const size = 1.5 + random(`size-${i}`) * 2.5;
      const opacity = 0.06 + random(`op-${i}`) * 0.1;
      return (
        <div key={i} style={{
          position: 'absolute', left: x, top: y,
          width: size, height: size, borderRadius: '50%',
          background: accent, opacity, pointerEvents: 'none',
        }} />
      );
    })}
  </>
);

export const VibeCodingBreachScene: React.FC<{
  accent?: string;
  bg?: string;
}> = ({ accent = '#30D158', bg = '#F4F6F8' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 페이즈 타이밍
  const P1 = fps * 2;      // 프롬프트 타이핑 시작
  const P2 = fps * 3.8;    // 코드 등장
  const P3 = fps * 5;      // 배포 버튼
  const P3_5 = fps * 6.5;  // 해커 침투
  const P4 = fps * 8.5;    // KISA 통계

  // 타이핑
  const promptChars = Math.floor(
    interpolate(frame, [8, P1], [0, PROMPT_TEXT.length], { extrapolateRight: 'clamp' })
  );
  const visibleLines = Math.floor(
    interpolate(frame, [P1, P2], [0, CODE_LINES.length], { extrapolateRight: 'clamp' })
  );

  // HACK 입력 타이핑
  const HACK_INPUT = "' OR '1'='1' --";
  const hackChars = Math.floor(
    interpolate(frame, [P3_5, P3_5 + fps * 0.9], [0, HACK_INPUT.length], { extrapolateRight: 'clamp' })
  );

  // 배포 버튼 spring
  const deploySpring = spring({ frame: frame - P2, fps, config: { stiffness: 300, damping: 18 } });

  // 경고 pulse — P3_5 구간에서만
  const warnWeight = interpolate(frame, [P3_5, P3_5 + fps * 0.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const warnPulse = 1 - warnWeight * (0.3 - Math.sin(frame * 0.25) * 0.3);

  // 카메라 쉐이크 — P3_5 침투 순간에만
  const shakeWeight =
    interpolate(frame, [P3_5, P3_5 + fps * 0.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) *
    interpolate(frame, [P3_5 + fps * 0.5, P4], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const shakeX = noise2D('sx', frame * 0.35, 0) * 7 * shakeWeight;
  const shakeY = noise2D('sy', 0, frame * 0.35) * 4 * shakeWeight;

  const isHackPhase = frame >= P3_5;

  return (
    <AbsoluteFill style={{
      background: bg,
      fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
      transform: `translate(${shakeX}px, ${shakeY}px)`,
      overflow: 'hidden',
    }}>
      {/* 배경 파티클 */}
      <Particles frame={frame} accent={isHackPhase ? '#FF3B30' : accent} count={20} />

      {/* 배경 그라디언트 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: isHackPhase
          ? 'radial-gradient(ellipse at 50% 30%, #FFE5E5 0%, #F4F6F8 60%)'
          : 'radial-gradient(ellipse at 50% 30%, #E2F5EA 0%, #F4F6F8 60%)',
        pointerEvents: 'none',
        transition: 'background 0.5s',
      }} />

      {/* ── 상단 채널 라벨 (숏츠 안전영역 시작: top 200px) ── */}
      <div style={{
        position: 'absolute', top: 200, left: 50, right: 50,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        opacity: interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' }),
        zIndex: 10,
      }}>
        <div style={{
          fontSize: 22, fontWeight: 900, letterSpacing: 3,
          color: isHackPhase ? '#FF3B30' : '#30D158',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: isHackPhase ? '#FF3B30' : '#30D158',
            display: 'inline-block',
            boxShadow: `0 0 10px ${isHackPhase ? '#FF3B30' : '#30D158'}`,
          }} />
          VIBE CODING
        </div>
        <div style={{ fontSize: 16, color: '#00000033', fontFamily: "'Courier New', monospace" }}>
          {String(Math.floor(frame / fps)).padStart(2, '0')}s
        </div>
      </div>

      {/* ══════════════════════════════
          Phase 1~3: 프롬프트 + 코드 + 배포
          ══════════════════════════════ */}
      {frame < P3_5 + 8 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          justifyContent: 'flex-start',
          padding: '280px 50px 460px',
          gap: 24,
          opacity: interpolate(frame, [P3_5, P3_5 + 8], [1, 0], { extrapolateRight: 'clamp' }),
        }}>

          {/* 훅 헤드라인 */}
          <div style={{
            opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' }),
            transform: `translateY(${interpolate(frame, [0, 12], [24, 0], { extrapolateRight: 'clamp' })}px)`,
            marginBottom: 16,
          }}>
            <div style={{
              fontSize: 62, fontWeight: 900, lineHeight: 1.2,
              color: '#111111', letterSpacing: -2,
            }}>
              AI가 만든 코드,
            </div>
            <div style={{
              fontSize: 62, fontWeight: 900, lineHeight: 1.2,
              color: accent, letterSpacing: -2,
              textShadow: `0 0 40px ${accent}40`,
            }}>
              지금 안전합니까?
            </div>
            {/* 서브 문구 — 초반부터 화면 채움 */}
            <div style={{
              fontSize: 24, fontWeight: 600, color: '#555555',
              marginTop: 16, lineHeight: 1.6,
              opacity: interpolate(frame, [8, 20], [0, 1], { extrapolateRight: 'clamp' }),
            }}>
              바이브코딩으로 만든 앱,{'\n'}실제로 안전한지 아시나요?
            </div>
          </div>

          {/* 프롬프트 박스 */}
          <div style={{
            opacity: interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' }),
            background: '#FFFFFF',
            borderRadius: 20,
            padding: '22px 28px',
            border: `2px solid ${accent}30`,
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          }}>
            <div style={{ fontSize: 12, color: accent, letterSpacing: 3, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>
              AI 프롬프트
            </div>
            <div style={{ fontSize: 30, color: '#111111', fontWeight: 700, lineHeight: 1.4 }}>
              "{PROMPT_TEXT.slice(0, promptChars)}
              <span style={{ opacity: frame % 18 < 9 ? 1 : 0, color: accent }}>▊</span>"
            </div>
          </div>

          {/* 코드 블록 */}
          {frame >= P1 && (
            <div style={{
              opacity: interpolate(frame, [P1, P1 + 10], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `translateY(${interpolate(frame, [P1, P1 + 12], [20, 0], { extrapolateRight: 'clamp' })}px)`,
              background: '#1A1F2E',
              borderRadius: 20,
              padding: '20px 24px',
              border: `1px solid ${accent}30`,
            }}>
              <div style={{
                fontSize: 12, color: accent, letterSpacing: 2, marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, display: 'inline-block', boxShadow: `0 0 8px ${accent}` }} />
                AI 생성 완료
              </div>
              {CODE_LINES.slice(0, visibleLines).map((line, i) => {
                const lineFrame = P1 + i * ((P2 - P1) / CODE_LINES.length);
                const lineOpacity = interpolate(frame, [lineFrame, lineFrame + 5], [0, 1], { extrapolateRight: 'clamp' });
                const isDanger = line.includes('email') || line.includes('SELECT');
                return (
                  <div key={i} style={{
                    fontSize: 18, lineHeight: 1.85,
                    whiteSpace: 'pre', fontFamily: "'Courier New', monospace",
                    opacity: lineOpacity,
                    color: isDanger ? '#FF9500' : '#C9D1D9',
                  }}>
                    {line}
                  </div>
                );
              })}
            </div>
          )}

          {/* 배포 버튼 */}
          {frame >= P2 && (
            <div style={{
              opacity: interpolate(frame, [P2, P2 + 8], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `scale(${deploySpring})`,
              background: `linear-gradient(135deg, ${accent} 0%, #25A244 100%)`,
              borderRadius: 60,
              padding: '22px 0',
              textAlign: 'center',
              fontSize: 26, fontWeight: 900, color: '#000000',
              letterSpacing: -0.5,
              boxShadow: `0 0 28px ${accent}50, 0 8px 32px rgba(0,0,0,0.2)`,
            }}>
              🚀 앱 배포하기
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════
          Phase 3.5: 해커 침투
          ══════════════════════════════ */}
      {frame >= P3_5 && frame < P4 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          justifyContent: 'flex-start',
          padding: '280px 50px 460px',
          gap: 24,
          opacity: interpolate(frame, [P3_5, P3_5 + 10], [0, 1], { extrapolateRight: 'clamp' }),
        }}>

          {/* 경고 배너 */}
          <div style={{
            background: '#FF3B3018',
            border: '2px solid #FF3B3050',
            borderRadius: 20,
            padding: '22px 28px',
            display: 'flex', alignItems: 'center', gap: 16,
            opacity: warnPulse,
          }}>
            <span style={{ fontSize: 40, lineHeight: 1 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 12, color: '#FF3B30', fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
                취약점 감지
              </div>
              <div style={{ fontSize: 28, color: '#CC0000', fontWeight: 900, lineHeight: 1.2, letterSpacing: -0.5 }}>
                SQL 인젝션<br/>공격 진행 중
              </div>
            </div>
          </div>

          {/* 취약한 코드 */}
          <div style={{
            background: '#1A1F2E',
            borderRadius: 16,
            padding: '20px 24px',
            border: '1px solid #FF3B3050',
          }}>
            <div style={{ fontSize: 12, color: '#FF9500', letterSpacing: 2, fontWeight: 700, marginBottom: 10 }}>
              ↑ AI가 생성한 취약 코드
            </div>
            {['    "SELECT * FROM users', "     WHERE email='\" + email"].map((line, i) => (
              <div key={i} style={{
                fontSize: 19, lineHeight: 1.9, fontFamily: "'Courier New', monospace",
                color: '#FF6B6B', background: '#FF3B3015', padding: '2px 8px', borderRadius: 4,
              }}>
                {line}
              </div>
            ))}
            <div style={{ fontSize: 13, color: '#FF6B6B88', marginTop: 8 }}>
              입력값을 그대로 SQL에 붙임 → 해커가 조작 가능
            </div>
          </div>

          {/* 해커 입력 터미널 */}
          <div style={{
            background: '#0D1117',
            borderRadius: 16,
            padding: '20px 24px',
            border: '1px solid #FF3B3030',
            opacity: interpolate(frame, [P3_5 + 8, P3_5 + 18], [0, 1], { extrapolateRight: 'clamp' }),
          }}>
            <div style={{ fontSize: 12, color: '#FF3B3088', letterSpacing: 2, fontWeight: 700, marginBottom: 10 }}>
              해커 입력값
            </div>
            <div style={{ fontSize: 24, fontFamily: "'Courier New', monospace", color: '#FF3B30' }}>
              {HACK_INPUT.slice(0, hackChars)}
              <span style={{ opacity: frame % 12 < 6 ? 1 : 0 }}>█</span>
            </div>
            <div style={{
              fontSize: 14, color: '#AAAAAA', marginTop: 10,
              opacity: interpolate(frame, [P3_5 + fps * 0.8, P3_5 + fps], [0, 1], { extrapolateRight: 'clamp' }),
            }}>
              → 조건이 항상 참 → 전체 DB 노출
            </div>
          </div>

          {/* 결과 강조 */}
          <div style={{
            background: '#CC000012',
            border: '2px solid #CC000030',
            borderRadius: 20,
            padding: '24px 28px',
            textAlign: 'center',
            opacity: interpolate(frame, [P3_5 + fps * 1.2, P3_5 + fps * 1.5], [0, 1], { extrapolateRight: 'clamp' }),
            transform: `scale(${interpolate(frame, [P3_5 + fps * 1.2, P3_5 + fps * 1.5], [0.92, 1], { extrapolateRight: 'clamp' })})`,
          }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: '#CC0000', letterSpacing: -1, lineHeight: 1.1 }}>
              DB 전체 유출
            </div>
            <div style={{ fontSize: 40, marginTop: 4 }}>🔓</div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════
          Phase 4: KISA 통계
          ══════════════════════════════ */}
      {frame >= P4 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          justifyContent: 'flex-start',
          padding: '280px 50px 460px',
          gap: 0,
          opacity: interpolate(frame, [P4, P4 + 12], [0, 1], { extrapolateRight: 'clamp' }),
          filter: `blur(${interpolate(frame, [P4, P4 + 8], [6, 0], { extrapolateRight: 'clamp' })}px)`,
        }}>

          {/* 섹션 헤더 */}
          <div style={{
            marginBottom: 32,
            opacity: interpolate(frame, [P4 + 4, P4 + 16], [0, 1], { extrapolateRight: 'clamp' }),
          }}>
            <div style={{ fontSize: 14, color: '#888888', letterSpacing: 3, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase' }}>
              개인정보보호위원회 · 2025.03
            </div>
            <div style={{ fontSize: 58, fontWeight: 900, color: '#111111', lineHeight: 1.15, letterSpacing: -2 }}>
              2024년
            </div>
            <div style={{ fontSize: 58, fontWeight: 900, color: '#FF3B30', lineHeight: 1.15, letterSpacing: -2 }}>
              실제 피해 규모
            </div>
          </div>

          {/* 통계 3개 카드 */}
          {KISA_STATS.map((stat, i) => {
            const statStart = P4 + 16 + i * 22;
            const cardOpacity = interpolate(frame, [statStart, statStart + 12], [0, 1], { extrapolateRight: 'clamp' });
            const cardY = interpolate(frame, [statStart, statStart + 14], [30, 0], { extrapolateRight: 'clamp' });
            const sweepProgress = interpolate(frame, [statStart + 8, statStart + 28], [0, 100], { extrapolateRight: 'clamp' });

            return (
              <div key={i} style={{
                opacity: cardOpacity,
                transform: `translateY(${cardY}px)`,
                background: '#FFFFFF',
                borderRadius: 24,
                padding: '28px 32px',
                marginBottom: 18,
                border: `2px solid ${stat.color}30`,
                boxShadow: `0 4px 24px rgba(0,0,0,0.08)`,
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: `linear-gradient(to right, ${stat.color}10 ${sweepProgress}%, transparent ${sweepProgress}%)`,
                  borderRadius: 22, pointerEvents: 'none',
                }} />
                <div style={{ fontSize: 15, color: '#888888', marginBottom: 8, position: 'relative', fontWeight: 600 }}>
                  {stat.label}
                </div>
                <div style={{
                  fontSize: 64, fontWeight: 900, color: '#111111',
                  letterSpacing: -3, lineHeight: 1, position: 'relative',
                }}>
                  {stat.value}
                </div>
                <div style={{
                  fontSize: 16, color: stat.color, fontWeight: 700,
                  marginTop: 8, position: 'relative',
                }}>
                  {stat.sub}
                </div>
                <div style={{
                  position: 'absolute', left: 0, top: 20, bottom: 20,
                  width: 5, borderRadius: '0 5px 5px 0',
                  background: stat.color,
                  opacity: sweepProgress > 50 ? 1 : 0,
                }} />
              </div>
            );
          })}

          {/* 임팩트 문장 */}
          <div style={{
            marginTop: 12,
            opacity: interpolate(frame, [P4 + 80, P4 + 96], [0, 1], { extrapolateRight: 'clamp' }),
            transform: `translateY(${interpolate(frame, [P4 + 80, P4 + 96], [16, 0], { extrapolateRight: 'clamp' })}px)`,
          }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: '#222222', lineHeight: 1.5 }}>
              바이브코딩으로 만든 로그인,
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, color: '#FF3B30', lineHeight: 1.5 }}>
              지금 이 순간에도 뚫리고 있습니다
            </div>
          </div>
        </div>
      )}

      {/* 자막 */}
      <CaptionOverlay
        captions={DEMO_CAPTIONS}
        accent={isHackPhase ? '#FF3B30' : '#30D158'}
        fontSize={50}
        position="bottom"
        wordsPerPage={300}
      />

      {/* 하단 라인 */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 4,
        background: isHackPhase ? '#FF3B30' : '#30D158',
        boxShadow: `0 0 14px ${isHackPhase ? '#FF3B30' : '#30D158'}`,
      }} />
    </AbsoluteFill>
  );
};
