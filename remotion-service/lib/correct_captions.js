// lib/correct_captions.js — Whisper-derived captions를 원본 스크립트 텍스트로 보정.
//
// Whisper STT는 영어/코드 토큰을 한국어 발음으로 받아쓰는 경향이 있음
// (예: "dry-run" → "드라이른", "Replit" → "리프리트", "agent에게" → "에젠테크의").
// timing은 Whisper word_timestamps가 정확하므로 유지하고, text만 원본 스크립트로 교체.
//
// 입력:
//   script      : { tts_text, subtitle_segments: [{start, end, text, ...}], ... }
//   transcript  : { words: [{word, start, end}], segments: [{start, end, text}], ... }
//
// 출력 captions[]:
//   [{ index, text, startMs, endMs, isHighlight, words: [{text, startMs, endMs}] }]
//
// 알고리즘:
//   1. Whisper segments를 1차 카운트 단위로 사용 (timing의 anchor)
//   2. 각 Whisper segment에 대해, subtitle_segments 중 midpoint가 segment 구간에
//      들어오는 것들을 모아 텍스트를 join → 보정된 text
//   3. 매칭이 0개인 경우 시간상 가장 가까운 subtitle_segment 1개로 fallback
//   4. words[]는 Whisper word_timestamps에서 해당 segment 구간에 속하는 것만 추출
//      (text 자체는 captions level에서 원본으로 교체됐으므로 word는 Whisper 그대로)
//   5. isHighlight: 첫 caption / 영문·숫자 포함 / 1.5s+ 지속 단어 포함

'use strict';

function toMs(sec) {
  return Math.round((Number(sec) || 0) * 1000);
}

function midpoint(seg) {
  return ((seg.start || 0) + (seg.end || 0)) / 2;
}

// Whisper 텍스트의 leading whitespace + trailing punctuation 정리
function cleanText(s) {
  return String(s || '').trim();
}

// subtitle_segments를 Whisper segments에 1:N으로 분배.
// 각 sub은 overlap이 최대인 Whisper segment에 할당. overlap=0이면 가장 가까운 seg에.
// 결과: subsByWSeg[i] = [sub, sub, ...] (정렬: sub.start asc)
function distributeSubs(subs, wSegs) {
  const buckets = wSegs.map(() => []);
  for (const s of subs) {
    const sStart = s.start || 0;
    const sEnd = s.end || sStart;
    let bestIdx = -1;
    let bestScore = -1;
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let j = 0; j < wSegs.length; j++) {
      const w = wSegs[j];
      const overlap = Math.max(0, Math.min(sEnd, w.end) - Math.max(sStart, w.start));
      if (overlap > bestScore) { bestScore = overlap; bestIdx = j; }
      const subMid = (sStart + sEnd) / 2;
      const wMid = ((w.start || 0) + (w.end || 0)) / 2;
      const dist = Math.abs(subMid - wMid);
      if (dist < nearestDist) { nearestDist = dist; nearestIdx = j; }
    }
    const target = bestScore > 0 ? bestIdx : nearestIdx;
    buckets[target].push(s);
  }
  for (const b of buckets) b.sort((a, b2) => (a.start || 0) - (b2.start || 0));
  return buckets;
}

// fallback: start 기준으로 가장 가까운 subtitle_segment
function nearestSub(subs, refStart) {
  let best = null;
  let bestDist = Infinity;
  for (const s of subs) {
    const dist = Math.abs((s.start || 0) - refStart);
    if (dist < bestDist) { best = s; bestDist = dist; }
  }
  return best;
}

function correctCaptions(script, transcript) {
  const subs = Array.isArray(script.subtitle_segments) ? script.subtitle_segments : [];
  const wSegs = Array.isArray(transcript.segments) ? transcript.segments : [];
  const words = Array.isArray(transcript.words) ? transcript.words : [];

  if (wSegs.length === 0) {
    throw new Error('correct_captions: transcript.segments가 비어 있음');
  }
  if (subs.length === 0) {
    // subtitle_segments 없으면 보정 불가 → Whisper 원문 그대로 (fallback)
    return wSegs.map((seg, i) => ({
      index: i,
      text: cleanText(seg.text),
      startMs: toMs(seg.start),
      endMs: toMs(seg.end),
      isHighlight: i === 0 || /[A-Za-z0-9]/.test(seg.text || ''),
      words: words
        .filter((w) => w.start >= seg.start && w.end <= seg.end + 0.001)
        .map((w) => ({
          text: w.word,
          startMs: toMs(w.start),
          endMs: toMs(w.end),
        })),
    }));
  }

  const subsByWSeg = distributeSubs(subs, wSegs);
  const captions = [];
  for (let i = 0; i < wSegs.length; i++) {
    const wSeg = wSegs[i];
    const matched = subsByWSeg[i];
    let text;
    if (matched.length > 0) {
      text = matched.map((s) => cleanText(s.text)).join(' ');
    } else {
      const fb = nearestSub(subs, wSeg.start);
      text = fb ? cleanText(fb.text) : cleanText(wSeg.text);
    }

    const segWords = words
      .filter((w) => w.start >= wSeg.start - 0.001 && w.end <= wSeg.end + 0.001)
      .map((w) => ({
        text: w.word,
        startMs: toMs(w.start),
        endMs: toMs(w.end),
      }));

    const longWord = segWords.some((w) => (w.endMs - w.startMs) >= 1500);
    const hasNumEng = /[A-Za-z0-9]/.test(text);

    captions.push({
      index: i,
      text,
      startMs: toMs(wSeg.start),
      endMs: toMs(wSeg.end),
      isHighlight: i === 0 || longWord || hasNumEng,
      words: segWords,
    });
  }

  // self-check
  for (let n = 0; n < captions.length; n++) {
    const c = captions[n];
    if (!c.text || !c.text.trim()) {
      throw new Error(`correct_captions: empty caption text @ ${n}`);
    }
    if (n + 1 < captions.length && captions[n + 1].startMs < c.endMs) {
      // overlap — Whisper segment 자체가 겹치면 발생. start를 prev.endMs로 밀어줌.
      captions[n + 1].startMs = c.endMs;
      if (captions[n + 1].endMs < captions[n + 1].startMs) {
        captions[n + 1].endMs = captions[n + 1].startMs + 1;
      }
    }
  }

  return captions;
}

module.exports = { correctCaptions };
