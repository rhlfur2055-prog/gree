#!/usr/bin/env bash
# render-and-postprocess.sh — Remotion 렌더 + 플랫폼 후처리
#
# 사용:
#   bash scripts/render-and-postprocess.sh <CompositionId> <platform> <out-dir> [propsFile]
#
# 플랫폼: youtube-shorts | tiktok | reels
# propsFile (선택): JSON 파일, --props로 Remotion에 전달
set -euo pipefail

COMP_ID="${1:?CompositionId required (예: GreeAllEmotions)}"
PLATFORM="${2:-youtube-shorts}"
OUT_DIR="${3:-out}"
PROPS_FILE="${4:-}"

cd "$(dirname "$0")/.."
mkdir -p "$OUT_DIR"

# ── 플랫폼 프리셋 ─────────────────────────────────────────
case "$PLATFORM" in
  youtube-shorts) W=1080; H=1920; FPS=30; MAX=60;  CRF=23; PRESET=veryfast ;;
  tiktok)         W=1080; H=1920; FPS=30; MAX=180; CRF=23; PRESET=veryfast ;;
  reels)          W=1080; H=1920; FPS=30; MAX=90;  CRF=23; PRESET=veryfast ;;
  *) echo "지원 플랫폼: youtube-shorts | tiktok | reels"; exit 1 ;;
esac

RAW="$OUT_DIR/${COMP_ID}-raw.mp4"
FINAL="$OUT_DIR/${COMP_ID}-${PLATFORM}.mp4"
THUMB="$OUT_DIR/${COMP_ID}-thumb.jpg"
GRID="$OUT_DIR/${COMP_ID}-grid.jpg"

# ── Stage A: Remotion 렌더 ────────────────────────────────
echo "[1/3] Remotion 렌더링: $COMP_ID → $RAW"
CMD=(npx remotion render "$COMP_ID" "$RAW"
  --codec=h264
  --concurrency="$(nproc 2>/dev/null || echo 2)"
  --log=warn)
[ -n "$PROPS_FILE" ] && CMD+=(--props="$PROPS_FILE")
"${CMD[@]}"

# ── Stage B: FFmpeg 후처리 ────────────────────────────────
if ! command -v ffmpeg >/dev/null; then
  echo "[!] ffmpeg 미설치 — 원본을 그대로 복사합니다"
  cp "$RAW" "$FINAL"
else
  echo "[2/3] FFmpeg 후처리: loudnorm + CRF=$CRF + max ${MAX}s"
  ffmpeg -y -i "$RAW" \
    -vf "scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black" \
    -t "$MAX" \
    -c:v libx264 -preset "$PRESET" -crf "$CRF" -pix_fmt yuv420p -r "$FPS" \
    -c:a aac -b:a 192k -ar 48000 \
    -af "loudnorm=I=-14:LRA=11:TP=-1" \
    -movflags +faststart \
    "$FINAL" 2>&1 | tail -5

  echo "[3/3] 썸네일 추출"
  ffmpeg -y -ss 00:00:01 -i "$FINAL" -vframes 1 -q:v 2 "$THUMB" -loglevel error
  # 4프레임 그리드
  ffmpeg -y -i "$FINAL" -vf "select='not(mod(n\,$((30*15))))',scale=540:960,tile=2x2" -frames:v 1 "$GRID" -loglevel error 2>/dev/null || true
fi

# ── 출력 검증 ─────────────────────────────────────────────
if [ ! -s "$FINAL" ]; then
  echo "ERROR: 최종 출력 누락 또는 비어있음: $FINAL"
  exit 2
fi

echo ""
echo "✓ 완료"
echo "  비디오 : $FINAL  ($(du -h "$FINAL" | cut -f1))"
[ -f "$THUMB" ] && echo "  썸네일 : $THUMB"
[ -f "$GRID" ] && echo "  그리드 : $GRID"
