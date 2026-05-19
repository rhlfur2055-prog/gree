# SFX Licenses

생성일: 2026-04-30T03:44:19.326Z
소스: synthetic

## 파일 목록

- **whoosh.mp3** — 노이즈 업스윕 (0.45s)
- **impact_low.mp3** — 서브베이스 펀치 (0.55s)
- **impact_high.mp3** — 고주파 스냅 (0.30s)
- **tick.mp3** — 단발 클릭 (0.12s)
- **glitch.mp3** — 디지털 글리치 (0.28s)
- **chime.mp3** — 벨 잔향 (1.00s)
- **bass_drop.mp3** — 서브베이스 드롭 (0.85s)
- **riser.mp3** — 업스윕 빌드업 (1.50s)

## 라이선스 안내

모든 파일은 Node.js PCM 수식 합성으로 자동 생성되었습니다.
저작권 제한 없음. 프로젝트 내부 사용 전용.

> 실제 고품질 SFX가 필요하면 아래 수동 다운로드 가이드 참조

## 수동 고품질 SFX 교체 가이드

### 무료 소스 (CC0 / Royalty-Free)

| 소스 | URL | 라이선스 |
|------|-----|---------|
| Pixabay Sound Effects | https://pixabay.com/sound-effects/ | Pixabay License |
| Freesound (CC0 필터) | https://freesound.org | CC0 |
| Zapsplat (무료 계정) | https://www.zapsplat.com | Standard |
| BBC Sound Effects | https://sound-effects.bbcrewind.co.uk | RC |

### 교체 방법

```bash
# 1. 위 사이트에서 각 SFX 다운로드 (MP3 128kbps 이상)
# 2. public/sfx/ 폴더에 복사
#    파일명 반드시 아래와 동일하게 유지:
#    whoosh.mp3, impact_low.mp3, impact_high.mp3, tick.mp3
#    glitch.mp3, chime.mp3, bass_drop.mp3, riser.mp3
# 3. 검증: node scripts/download_sfx.js --verify-only
```

### Pixabay API 키 설정 (자동 다운로드)

```bash
# 1. https://pixabay.com/api/ 에서 무료 API 키 발급
# 2. n8nproject/.env 에 추가:
#    PIXABAY_API_KEY=your_key_here
# 3. 재실행: node scripts/download_sfx.js
```