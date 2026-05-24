# 그리 Shorts 파이프라인

7-stage end-to-end YouTube Shorts 자동 생성. 각 단계는 다음으로 wired-up.

```
대본 → TTS → Whisper 단어 자막 → Remotion 컴포지션 → 렌더 → FFmpeg → 플랫폼 MP4
```

---

## 사전 준비

```bash
# 1. 의존성 점검
bash scripts/check-deps.sh

# 2. 의존성 설치
npm install

# 3. 환경변수 설정
cp .env.example .env
# .env 파일을 열어 OPENAI_API_KEY (필수), ELEVENLABS_API_KEY (선택) 입력

# 4. 표정 자산이 public/gree/emotions/에 12종 있는지 확인
ls public/gree/emotions/
```

---

## 빠른 사용

### A. 12종 표정 데모 (오디오 없음)

```bash
npm run demo
# → ../out/GreeAllEmotions-youtube-shorts.mp4
```

### B. 스크립트 + TTS + Whisper + 렌더 (전 파이프라인)

```bash
npm run make-shorts -- \
  --script "오늘 그리는 행복하다가 갑자기 패닉이 왔다" \
  --comp GreeEmotion \
  --beats beats.json \
  --platform youtube-shorts \
  --voice alloy \
  --out ../out
```

### C. 개별 단계 실행

```bash
# TTS만
npm run tts -- --text "안녕 나는 그리야" --voice alloy

# 기존 mp3에 Whisper만
npm run whisper -- --audio public/audio/abc.mp3 --out public/captions/abc.json

# Remotion studio (시각 편집)
npm run studio
```

---

## beats.json 포맷

표정 타이밍을 정의합니다. 시간은 초 단위.

```json
[
  { "emotion": "neutral",   "start": 0,   "end": 2.5 },
  { "emotion": "surprised", "start": 2.5, "end": 4.0 },
  { "emotion": "happy",     "start": 4.0, "end": 7.5 },
  { "emotion": "panic",     "start": 7.5, "end": 10.0 }
]
```

가능한 emotion: `neutral · happy · sad · angry · surprised · embarrassed · cry · excited · tired · dead_inside · panic · furious`

---

## 단계별 명세

### Stage 0 — Preflight
`scripts/check-deps.sh` — node/npm/ffmpeg/API 키/표정 자산 12종 체크.

### Stage 1 — Script
LLM(Claude/GPT)으로 hook(0~3s) + body(3~50s) + CTA(마지막 5~10s) 구조의 짧은 대본 생성. 또는 사용자가 직접 입력.

### Stage 2 — TTS (`scripts/generate-tts.mjs`)
- **1순위**: ElevenLabs `eleven_multilingual_v2` (한국어 품질 최상)
- **Fallback**: OpenAI `gpt-4o-mini-tts`
- 출력: `public/audio/<hash>.mp3` + `<hash>.json` (provider, duration)
- 캐시: `sha256(voice + text).slice(0,16)` — 같은 입력 = API 호출 없음
- 429/5xx 자동 백오프 재시도 3회

### Stage 3 — Whisper (`scripts/transcribe-whisper.mjs`)
- 모델: `whisper-1` + `timestamp_granularities=["word"]`
- 출력: `[{ word, start, end }, …]` (초 단위)
- 캐시: 오디오 파일 sha256 기준

### Stage 4 — Remotion 컴포지션
`src/GreeEmotionShorts.tsx` 핵심 규칙:
- **모든 애니메이션은 `useCurrentFrame()` 기반** (절대 `setTimeout`/CSS transition 금지)
- 한국어는 `@remotion/google-fonts/NotoSansKR` 로딩
- 오디오는 컴포지션 top-level에 `<Audio src={staticFile(...)} />`
- Caption은 `cues.findIndex` 로 현재 단어 탐색 → 가라오케 하이라이트
- `calculateMetadata`로 오디오 길이에 맞춰 durationInFrames 자동 산정

### Stage 5 — Render (`scripts/render-and-postprocess.sh`)
```
npx remotion render <id> raw.mp4 --codec=h264 --concurrency=<cpu>
```

### Stage 6 — FFmpeg 후처리
- 해상도 보정 (1080×1920 fit + pad)
- `loudnorm I=-14:LRA=11:TP=-1` 라우드니스 정규화
- H.264 CRF 23 `veryfast` 인코딩
- 플랫폼별 최대 길이 (Shorts 60s / TikTok 180s / Reels 90s)
- 썸네일 추출 (1초 지점) + 4분할 그리드

### Stage 7 — Deliver
`out/<comp>-<platform>.mp4` + `out/<comp>-thumb.jpg` 생성. YouTube 업로드는 별도.

---

## 트러블슈팅

| 증상 | 원인 / 해결 |
|------|------------|
| `ffmpeg: command not found` | `scoop install ffmpeg` / `brew install ffmpeg` |
| `OPENAI_API_KEY missing` | `.env`에 키 입력 또는 `--no-audio`로 무성 렌더 |
| 한국어 자막 ☐ 표시 | NotoSansKR 미로딩 — 인터넷 연결 필요 (`loadFont`가 비동기) |
| 캐릭터 PNG 누락 | `cp ../assets/emotions_3d_norm/*.png public/gree/emotions/` |
| Whisper 단어 타이밍 어긋남 | 한국어 띄어쓰기 영향 — 단어 윈도우(±4)로 보정 중 |
| 렌더 메모리 부족 | `--concurrency=1`로 조정 |

---

## 출력 예시

```
out/
├── GreeAllEmotions-raw.mp4                # Remotion 원본
├── GreeAllEmotions-youtube-shorts.mp4     # FFmpeg 후처리 최종
├── GreeAllEmotions-thumb.jpg              # 썸네일
├── GreeAllEmotions-grid.jpg               # 4분할 그리드
└── GreeAllEmotions-props.json             # 사용한 props
```
