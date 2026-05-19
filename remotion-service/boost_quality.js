#!/usr/bin/env node
// ffmpeg 후처리로 CBR 15Mbps 강제 (YouTube 최적화)
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FFMPEG = path.join(__dirname, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe');
const INPUT  = path.join(__dirname, '..', 'out', 'bibe_compare_shorts_v1.mp4');
const OUTPUT = path.join(__dirname, '..', 'out', 'bibe_compare_shorts_v1_hq.mp4');

console.log('▶ ffmpeg 후처리: CBR 15Mbps + YouTube 최적화');
console.log('  input :', INPUT);
console.log('  output:', OUTPUT);

const args = [
  '-y',
  '-i', INPUT,
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-profile:v', 'high',
  '-level', '4.2',
  '-pix_fmt', 'yuv420p',
  '-b:v', '15M',
  '-minrate', '15M',
  '-maxrate', '15M',
  '-bufsize', '30M',
  '-x264opts', 'keyint=60:min-keyint=60:scenecut=0',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-ar', '48000',
  '-movflags', '+faststart',
  OUTPUT,
];

const T0 = Date.now();
execFileSync(FFMPEG, args, { stdio: 'inherit' });

const sizeMB = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(2);
console.log(`\n✅ ${OUTPUT} (${sizeMB}MB) — ${((Date.now()-T0)/1000).toFixed(0)}s`);
console.log('   기존 영상 덮어쓰기:');
fs.copyFileSync(OUTPUT, INPUT);
fs.unlinkSync(OUTPUT);
console.log(`   ${INPUT} 갱신 완료`);
