# 파이프라인 상태 (실측 기준)

> 모든 항목을 실제로 실행해서 결과를 확인한 검증 매트릭스.
> 마지막 검증: 2026-05-25, Windows 10, Node 24.13.0, npm 11.6.2, Python 3.13, RTX 4060 Laptop 8GB.

---

## ✅ 검증 완료 — 즉시 사용 가능

| 항목 | 검증 명령 | 결과 |
|------|-----------|------|
| node_modules 설치 | `npm install` | ✓ 60 packages, 0 critical vuln |
| TypeScript 타입체크 | `npx tsc --noEmit --moduleResolution bundler ...` | ✓ 무오류 |
| **DevMemeShorts 풀 렌더** | `npx remotion render DevMemeShorts ../out/test.mp4` | ✓ 32.55s mp4 (13.7MB) |
| **render-and-postprocess.sh end-to-end** | `bash scripts/render-and-postprocess.sh DevMemeShorts youtube-shorts ../out` | ✓ 5.7MB 최적화 mp4 + 썸네일 + 4분할 그리드 |
| imageio-ffmpeg auto-fallback | 시스템 ffmpeg 없을 때 자동 감지 | ✓ Python 내장 v7.1 사용 |
| AnimateDiff 12종 클립 재생 | OffthreadVideo로 dev_memes/*.mp4 | ✓ 한국어 라벨 + 인덱스 칩 정상 |
| 한국어 폰트 | `@remotion/google-fonts/NotoSansKR` | ✓ "코드 리뷰", "금요일 칼퇴" 등 정상 표시 |
| AnimateDiff 4060 8GB 안정성 | 12클립 연속 생성 9분 13초 | ✓ OOM 0회, 평균 45초/클립 |

**즉시 시도 가능한 명령:**
```bash
cd remotion-service
npm run studio                                  # Remotion Studio 실행 (시각 편집)
bash scripts/render-and-postprocess.sh DevMemeShorts youtube-shorts ../out
# → out/DevMemeShorts-youtube-shorts.mp4 (1080×1920, 32.5s, ~6MB)
```

---

## ⚠️ 작성됐으나 미검증 — 외부 키/도구 필요

| 항목 | 차단 사유 | 대응 |
|------|----------|------|
| `generate-tts.mjs` | `OPENAI_API_KEY` 또는 `ELEVENLABS_API_KEY` 미설정 | `.env`에 키 입력 후 `npm run tts -- --text "..."` |
| `transcribe-whisper.mjs` | `OPENAI_API_KEY` 미설정 | 위와 동일 |
| `make-shorts.mjs` (오디오 포함) | TTS/Whisper 의존 | 키 설정 후 검증 가능 |
| `GreeEmotionShorts` (오디오 포함) | TTS/Whisper 의존 | 오디오 없이 데모 컴포지션은 작동 |
| `.github/workflows/*.yml` | push 안 됨 / Vercel 토큰 없음 | 시크릿 추가 후 검증 |

---

## 🔧 알려진 제약 사항

| 이슈 | 영향 | 우회 |
|------|------|------|
| 시스템 ffmpeg 미설치 | render-and-postprocess.sh에서 자동 우회 | imageio-ffmpeg(v7.1) 자동 사용 — 우회 완료 |
| `*.mp4` gitignore | dev_memes 12개 제외하고 기본 모두 무시 | `!remotion-service/public/gree/dev_memes/*.mp4` 예외 처리 완료 |
| TypeScript ignoreDeprecations 호환성 | tsc 6.x에서 tsconfig 경고 | bundler moduleResolution으로 우회 완료 |
| Whisper word timestamp 한국어 띄어쓰기 | 단어 경계 가끔 비정상 | ±4 단어 윈도우로 평탄화 (CaptionOverlay에 구현) |
| 인트로/아웃트로 spring 진입 | 너무 느리면 1초 신에서 안 보임 | `durationInFrames: 8` + `stiffness: 200`으로 8프레임에 진입 완료 |

---

## 📊 자산 인벤토리

```
remotion-service/public/gree/
├── emotions/             12 PNG (각 512×512, 캐릭터 높이 435px 통일)
└── dev_memes/            12 MP4 (각 512×512 × 16f @ 8fps = 2s) + catalog.json

remotion-service/src/
├── Root.tsx              9 컴포지션 등록
├── GreeEmotionShorts.tsx 표정 + 자막 가라오케 (오디오 의존)
├── DevMemeShorts.tsx     ✅ AnimateDiff 클립 시퀀스 (검증 완료)
└── (기존 7종 + Korini/Vibe/Dev/AI*)

scripts/
├── check-deps.sh         ✓ 작동
├── generate-tts.mjs      ⚠️ API 키 필요
├── transcribe-whisper.mjs ⚠️ API 키 필요
├── render-and-postprocess.sh ✅ 검증 완료
└── make-shorts.mjs       ⚠️ TTS 의존
```

---

## 🚀 다음 단계 우선순위

1. **API 키 설정** — `.env`에 `OPENAI_API_KEY` 입력 → 오디오/자막 풀 파이프라인 검증
2. **개발자 밈 시나리오 확장** — `gen_dev_meme_motion.py` SCENES 리스트에 추가하면 자동 생성
3. **이미 보유한 참고 영상 124개 활용** — `C:\tool\pp\참고영상\OUTPUT TEST\normalized\` 의 18개 클립도 같은 catalog 형식으로 추가 가능
4. **GitHub Actions secrets 설정** — CI/CD 자동 트리거 활성화
