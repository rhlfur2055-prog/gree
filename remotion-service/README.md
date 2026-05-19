# remotion-service/ — Remotion 기반 숏츠 렌더러 + 통합 백엔드

> Render.com 배포 버전: GitHub `rhlfur2055-prog/remotion-render` (이 디렉토리 기준 분리 저장소)
> 로컬 개발 진입점: `server-local.js`

## 디렉토리

| 항목 | 설명 |
|---|---|
| `server-local.js` | **로컬 개발 진입점**. Express + Remotion bundle + pipeline + reorder + `/batch` 대시보드 + cron jobs (cleanup 30분 / disk 6시간) |
| `server.js` | **Render.com 호환 엔드포인트**. async render → Supabase `render_jobs` persist → polling. 로컬 주 흐름은 `server-local.js` |
| `render.js` | server.js 가 사용하는 단일 렌더 함수 |
| `src/index.ts` | Remotion entry — composition 등록 (`TechShorts`, `AIBattle`, `TechShortsThumbnail`) |
| `src/Root.tsx` | composition tree 정의 |
| `src/TechShorts.tsx` | 메인 숏츠 컴포지션 (60초, 1080×1920) |
| `src/components/` | UnifiedCaption, HookHero, FlowStepList, CodeBlockCard 등 |
| `src/fonts.ts` | Pretendard Bold/Black 폰트 동적 로드 (`staticFile()`) |
| `public/fonts/` | Pretendard-Bold.woff2, Pretendard-Black.woff2 |
| `public/logos/` | claude.svg, gemini.svg, openai.svg |
| `Dockerfile` | Render.com 배포용 (Chrome 포함) |
| `render.yaml` | Render.com 서비스 정의 |
| `output/` | 로컬 렌더 결과 (.mp4) |
| `tmp/` | 일시 파일 |

## 로컬 개발 진입점

```bash
# 1. 의존성
npm install                              # 루트 + remotion-service 모두 설치돼있어야 함

# 2. 개발 서버 (port 3001)
node remotion-service/server-local.js

# 3. 핵심 라우트
# 대시보드:
http://localhost:3001/batch              # 배치 큐/통계 (B-5)
http://localhost:3001/scripts            # 측정/재배치 승인
http://localhost:3001/editor             # 자막 편집기

# API:
POST /pipeline                           { topic } → jobId
GET  /pipeline/:id/events                SSE 진행률
POST /api/batch/seed                     { count }
POST /api/batch/start                    { drain, once }
GET  /api/batch/queue                    현재 큐 상태
GET  /api/batch/events                   SSE — 워커 push
GET  /api/scripts/ranked                 정렬 리스트
GET  /api/scripts/:id/reorder-proposal   재배치 제안
POST /api/scripts/:id/reorder-apply      재렌더 잡 등록
```

## 환경변수 (이 서비스 한정)

| 변수 | 기본값 | 효과 |
|---|---|---|
| `PORT` | 3001 (local), 3000 (prod) | HTTP 포트 |
| `REMOTION_CONCURRENCY` | 1 | renderMedia 내부 병렬도 |
| `REMOTION_CRF` | 26 | 비디오 품질 (낮을수록 고화질) |
| `REMOTION_X264_PRESET` | ultrafast | 인코딩 속도 |
| `REMOTION_TIMEOUT_MS` | 120000 | 단일 렌더 타임아웃 |
| `PG_CONN` | (.env에서 상속) | Supabase Postgres |

## node-cron 잡 (server-local.js 내장)

| 스케줄 | 작업 |
|---|---|
| `*/30 * * * *` | `rag_scripts.render_status='rendering'` 6시간 초과 → `'failed'` 마킹 |
| `0 */6 * * *` | `cache/tts/`, `cache/whisper/`, `output/`, `shorts_log/` 에서 mtime>30일 항목 삭제 |

## 검증 명령

```bash
# 헬스체크
curl http://localhost:3001/health

# 번들 빌드 확인
node -e "require('./remotion-service/server-local.js')" &  sleep 5; curl -s localhost:3001/health; kill %1
```
