#!/usr/bin/env bash
# check-deps.sh — 파이프라인 의존성 사전 점검
set -uo pipefail

echo "── 그리 Shorts 파이프라인 의존성 점검 ──"

# node / npm
N=$(node -v 2>/dev/null || echo "MISSING")
M=$(npm -v 2>/dev/null || echo "MISSING")
echo "node : $N"
echo "npm  : $M"
[ "$N" = "MISSING" ] && echo "  → https://nodejs.org/ 에서 Node 18+ 설치"

# ffmpeg
if command -v ffmpeg >/dev/null; then
  FF=$(ffmpeg -version 2>/dev/null | head -1)
  echo "ffmpeg: $FF"
else
  echo "ffmpeg: MISSING"
  echo "  → Windows: scoop install ffmpeg / brew install ffmpeg / apt install ffmpeg"
fi

# API keys
[ -n "${ELEVENLABS_API_KEY:-}" ] && echo "ELEVENLABS_API_KEY: ✓" || echo "ELEVENLABS_API_KEY: 미설정 (선택, 1순위)"
[ -n "${OPENAI_API_KEY:-}" ]     && echo "OPENAI_API_KEY    : ✓" || echo "OPENAI_API_KEY    : 미설정 (TTS fallback + Whisper 필수)"

# 표정 자산
EMO_COUNT=$(ls public/gree/emotions/*.png 2>/dev/null | wc -l)
echo "표정 자산: ${EMO_COUNT}개 (목표 12종)"
[ "$EMO_COUNT" -lt 12 ] && echo "  → cp ../assets/emotions_3d_norm/*.png public/gree/emotions/"

# node_modules
if [ -d node_modules ]; then
  echo "node_modules: ✓"
else
  echo "node_modules: 미설치 → npm install 필요"
fi

echo ""
echo "최소 동작:"
echo "  npm run demo                      # 오디오 없이 12종 표정 데모"
echo "  npm run make-shorts -- --script '안녕 나는 그리야' --beats beats.json"
