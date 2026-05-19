// realign_segments.js — subtitle_segments[]를 Whisper transcript.words[]에 정렬해
// 각 segment 의 정확한 start/end 시각을 주입한다 (D-9-D).
//
// 알고리즘:
//   1. transcript.words[]를 cursor (0부터) 로 순회.
//   2. 각 segment.text 에서 영문/숫자 토큰 또는 한글 음절을 추출 → "search tokens".
//      첫 search token 으로 cursor 부터 일치하는 word 찾기 → segment.start.
//      마지막 search token 으로 그 뒤를 스캔 → segment.end.
//      cursor 는 마지막 매칭 word 다음으로 진행.
//   3. 매칭 실패 시:
//      - segment.start: 직전 segment.end (또는 0).
//      - segment.end: start + estimated_duration_seconds (없으면 1.0).
//      - warn 출력.

'use strict';

// 한글 음절(NFC) / 영문 단어 / 숫자 — 매칭 토큰 단위
const TOKEN_RE = /[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*|\d+|[가-힣]+/g;

function tokenize(text) {
  if (!text) return [];
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m[0]) out.push(m[0]);
  }
  return out;
}

// 한글 / 영문 / 숫자 비교 (case-insensitive). 부분 일치 — segment 토큰이 word.word 안에 포함되거나
// word.word 가 segment 토큰의 prefix.
function tokensMatch(segTok, wordStr) {
  if (!segTok || !wordStr) return false;
  const a = String(segTok).toLowerCase();
  const b = String(wordStr).toLowerCase();
  if (a === b) return true;
  if (b.startsWith(a) || a.startsWith(b)) return true;
  // 한글: 첫 1~2 음절만 비교
  if (/[가-힣]/.test(a) && /[가-힣]/.test(b)) {
    const aPrefix = a.slice(0, 2);
    const bPrefix = b.slice(0, 2);
    if (aPrefix && aPrefix === bPrefix) return true;
  }
  return false;
}

function findToken(words, fromIdx, segToken) {
  for (let i = fromIdx; i < words.length; i++) {
    if (tokensMatch(segToken, words[i].word)) return i;
  }
  return -1;
}

function realignSegments(segments, words) {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  if (!Array.isArray(words) || words.length === 0) {
    // Whisper words 비어 있으면 estimated_duration_seconds 누적 기반 fallback
    let cur = 0;
    return segments.map((s) => {
      const dur = Number(s.estimated_duration_seconds) || 3;
      const out = { ...s, start: +cur.toFixed(3), end: +(cur + dur).toFixed(3) };
      cur += dur;
      return out;
    });
  }

  const out = [];
  let cursor = 0;
  let prevEnd = 0;
  let matchedCount = 0;
  let fallbackCount = 0;

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const segTokens = tokenize(s.text);
    if (segTokens.length === 0) {
      // 빈 segment — fallback
      const dur = Number(s.estimated_duration_seconds) || 1;
      out.push({ ...s, start: prevEnd, end: prevEnd + dur });
      prevEnd += dur;
      fallbackCount++;
      continue;
    }

    const firstTok = segTokens[0];
    const lastTok = segTokens[segTokens.length - 1];

    const firstIdx = findToken(words, cursor, firstTok);
    let lastIdx = -1;
    if (firstIdx >= 0) {
      // last token 매칭은 firstIdx 이후 N words 안에서만 검색 (segment 가 너무 길게 잡히지 않게)
      const maxReach = Math.min(words.length - 1, firstIdx + segTokens.length + 4);
      for (let j = firstIdx; j <= maxReach; j++) {
        if (tokensMatch(lastTok, words[j].word)) lastIdx = j;
      }
      if (lastIdx < firstIdx) lastIdx = firstIdx; // 같은 word 한 개짜리
    }

    if (firstIdx >= 0 && lastIdx >= firstIdx) {
      const start = words[firstIdx].start;
      const end = words[lastIdx].end;
      out.push({ ...s, start: +start.toFixed(3), end: +end.toFixed(3) });
      prevEnd = end;
      cursor = lastIdx + 1;
      matchedCount++;
    } else {
      // fallback: prevEnd + estimated_duration_seconds
      const dur = Number(s.estimated_duration_seconds) || 1;
      const start = prevEnd;
      const end = prevEnd + dur;
      out.push({ ...s, start: +start.toFixed(3), end: +end.toFixed(3), _realign_fallback: true });
      prevEnd = end;
      fallbackCount++;
    }
  }

  // self-check: end > start, 인접 sort
  for (let i = 0; i < out.length; i++) {
    if (out[i].end <= out[i].start) {
      out[i].end = out[i].start + 0.5;
    }
    if (i + 1 < out.length && out[i + 1].start < out[i].end) {
      out[i + 1].start = out[i].end;
      if (out[i + 1].end < out[i + 1].start) {
        out[i + 1].end = out[i + 1].start + 0.5;
      }
    }
  }

  return { aligned: out, matchedCount, fallbackCount };
}

module.exports = { realignSegments, tokenize };
