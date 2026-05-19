/**
 * fonts.ts — Pretendard 폰트 로딩
 *
 * ⚠️ 중요: Remotion SSR 환경에서
 *   - document.fonts.load() → Remotion이 내부적으로 delayRender 트리거 → 5800ms 타임아웃
 *   - delayRender + setTimeout → 렌더 일시정지 중 setTimeout 발화 안 함
 *
 * → @font-face CSS 주입만 사용 (fonts.load() 호출 금지)
 *   - font-display: swap 으로 폴백 폰트 즉시 사용
 *   - Remotion은 첫 프레임 렌더 전에 @font-face 등록만으로 충분
 */

import { staticFile } from 'remotion';

let registered = false;

export const loadPretendard = (): void => {
  if (registered) return;
  registered = true;

  try {
    if (typeof document === 'undefined') return; // SSR guard

    const blackUrl = staticFile('fonts/Pretendard-Black.woff2');
    const boldUrl  = staticFile('fonts/Pretendard-Bold.woff2');

    // @font-face 등록만 — fonts.load() 호출 없음 (delayRender 트리거 방지)
    const style = document.createElement('style');
    style.id = 'pretendard-fonts';
    style.textContent = `
      @font-face {
        font-family: 'Pretendard';
        src: url('${blackUrl}') format('woff2');
        font-weight: 900;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: 'Pretendard';
        src: url('${boldUrl}') format('woff2');
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }
    `;
    // 중복 방지
    const existing = document.getElementById('pretendard-fonts');
    if (!existing) document.head.appendChild(style);

  } catch (_) {
    // document 없는 환경 (테스트 등) — 무시
  }
};
