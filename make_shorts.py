"""
정귀찬 출근 풀스토리 쓼츠 (1080x1920, ~36초, 24fps)
- 23개 클립 다 활용
- 크로스페이드 트랜지션 (컷 점프 해소)
- 5단 구성: 아침 → 지하철 → 사무실 → 일 → 퇴근 → 귀가
"""

import cv2
import numpy as np
import subprocess
import os
from ultralytics import YOLO

FFMPEG = r"ffmpeg"
CLIPS_DIR = r"clips"
OUT = r"commute_shorts.mp4"

W, H = 1080, 1920
FPS = 24
XFADE_FRAMES = 3  # 0.125s 크로스페이드

SEQUENCE = [
    # smart_crop 모두 False — 원본 비율 + 블러 배경 (자연스러운 모션 유지)
    ("A_alarm_sleeping.mp4",     20,  90,  False),
    ("11_leaving_home_door.mp4", 10,  70,  False),
    ("12_street_walking.mp4",    20,  80,  False),
    ("13_subway_stairs.mp4",     15,  75,  False),
    ("S1_subway_crowded.mp4",    25, 100,  False),
    ("S3_subway_exit.mp4",       25,  85,  False),
    ("S4_subway_exit_stairs.mp4",20,  80,  False),
    ("14_subway_gate.mp4",       10,  55,  False),
    ("08_office_door.mp4",       20,  85,  False),
    ("09_sit_pc_on.mp4",         15,  90,  False),
    ("03_typing.mp4",            15,  75,  False),
    ("06_sigh.mp4",              10,  60,  False),
    ("08_head_pulling.mp4",      5,   50,  False),
    ("09_chair_lean.mp4",        10,  70,  False),
    ("10_neutral_to_sad.mp4",    15,  75,  False),
    ("11_mass_leaving.mp4",      15,  90,  False),
    ("12_evening_commute.mp4",   15,  90,  False),
    ("H_bed_lying.mp4",          20, 110,  False),
]

print("YOLO 로드 중...")
model = YOLO('yolov8n.pt')

def detect_jeong(frame):
    H_, W_ = frame.shape[:2]
    results = model(frame, classes=[0], verbose=False)
    if len(results[0].boxes) == 0:
        return None
    best = None
    best_score = -999
    for box in results[0].boxes:
        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
        cx, cy = (x1+x2)//2, (y1+y2)//2
        area = (x2-x1)*(y2-y1)
        dist = abs(cx - W_//2) / W_
        score = -dist * 2 + area / (W_*H_)
        if score > best_score:
            best_score = score
            best = (cx, cy, y2-y1)
    return best

def fit_blur(frame, tw=W, th=H):
    h, w = frame.shape[:2]
    src_ar = w / h
    dst_ar = tw / th
    if src_ar > dst_ar:
        bg_h = th; bg_w = int(bg_h * src_ar)
    else:
        bg_w = tw; bg_h = int(bg_w / src_ar)
    bg = cv2.resize(frame, (bg_w, bg_h), interpolation=cv2.INTER_LINEAR)
    bx = (bg_w - tw) // 2; by = (bg_h - th) // 2
    bg = bg[by:by+th, bx:bx+tw]
    bg = cv2.GaussianBlur(bg, (51, 51), 30)
    bg = (bg.astype(np.float32) * 0.55).clip(0, 255).astype(np.uint8)
    r = min(tw / w, th / h)
    fw, fh = int(w * r), int(h * r)
    fg = cv2.resize(frame, (fw, fh), interpolation=cv2.INTER_LANCZOS4)
    xo = (tw - fw) // 2; yo = (th - fh) // 2
    bg[yo:yo+fh, xo:xo+fw] = fg
    return bg

def smart_crop(frame, jeong, tw=W, th=H):
    h, w = frame.shape[:2]
    if jeong is None:
        return fit_blur(frame, tw, th)
    cx, cy, bh_box = jeong
    crop_h = int(bh_box / 0.55)
    crop_w = int(crop_h * 9 / 16)
    left = cx - crop_w // 2; right = left + crop_w
    top = cy - crop_h // 2 - int(crop_h * 0.05); bottom = top + crop_h
    if left < 0 or right > w or top < 0 or bottom > h:
        scale = min(w / crop_w if crop_w > w else 1,
                    h / crop_h if crop_h > h else 1, 1.0)
        if scale < 1:
            crop_w = int(crop_w * scale); crop_h = int(crop_h * scale)
            left = cx - crop_w // 2; right = left + crop_w
            top = cy - crop_h // 2; bottom = top + crop_h
        if left < 0: right -= left; left = 0
        if right > w: left -= (right - w); right = w
        if top < 0: bottom -= top; top = 0
        if bottom > h: top -= (bottom - h); bottom = h
    left = max(0, left); top = max(0, top)
    right = min(w, right); bottom = min(h, bottom)
    cropped = frame[top:bottom, left:right]
    ch, cw = cropped.shape[:2]
    if cw == 0 or ch == 0:
        return fit_blur(frame, tw, th)
    crop_ar = cw / ch; target_ar = tw / th
    if abs(crop_ar - target_ar) > 0.02:
        return fit_blur(cropped, tw, th)
    return cv2.resize(cropped, (tw, th), interpolation=cv2.INTER_LANCZOS4)

def process_clip(filename, start_f, end_f, need_smart):
    cap = cv2.VideoCapture(os.path.join(CLIPS_DIR, filename))
    src_fps = cap.get(cv2.CAP_PROP_FPS)
    src_frames = end_f - start_f
    duration = src_frames / src_fps
    out_frames = int(duration * FPS)
    frames = []
    last_jeong = None
    for i in range(out_frames):
        src_idx = start_f + int(i * src_fps / FPS)
        cap.set(cv2.CAP_PROP_POS_FRAMES, src_idx)
        ret, frame = cap.read()
        if not ret: break
        if need_smart:
            jeong = detect_jeong(frame)
            if jeong is not None and last_jeong is not None:
                a = 0.7
                jeong = (int(a*jeong[0] + (1-a)*last_jeong[0]),
                         int(a*jeong[1] + (1-a)*last_jeong[1]),
                         int(a*jeong[2] + (1-a)*last_jeong[2]))
            if jeong: last_jeong = jeong
            out = smart_crop(frame, jeong if jeong else last_jeong)
        else:
            out = fit_blur(frame)
        frames.append(out)
    cap.release()
    return frames

print(f"\n총 {len(SEQUENCE)}개 클립 처리\n")
all_clips_frames = []
for i, (fn, sf, ef, sm) in enumerate(SEQUENCE):
    print(f"  [{i+1:2}/{len(SEQUENCE)}] {fn}")
    frames = process_clip(fn, sf, ef, sm)
    all_clips_frames.append(frames)

print(f"\n크로스페이드 합성 (XFADE={XFADE_FRAMES}f)...")
cmd = [FFMPEG, '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
       '-s', f'{W}x{H}', '-pix_fmt', 'rgb24', '-r', str(FPS), '-i', 'pipe:0',
       '-vcodec', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'fast', OUT]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

total = 0
for clip_idx, frames in enumerate(all_clips_frames):
    if clip_idx == 0:
        for j, frame in enumerate(frames):
            if j < XFADE_FRAMES:
                alpha = (j + 1) / (XFADE_FRAMES + 1)
                frame = (frame.astype(np.float32) * alpha).clip(0, 255).astype(np.uint8)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            proc.stdin.write(rgb.tobytes())
            total += 1
    else:
        prev = all_clips_frames[clip_idx - 1]
        for k in range(XFADE_FRAMES):
            alpha = (k + 1) / (XFADE_FRAMES + 1)
            prev_idx = len(prev) - XFADE_FRAMES + k
            if 0 <= prev_idx < len(prev) and k < len(frames):
                blended = (
                    prev[prev_idx].astype(np.float32) * (1 - alpha) +
                    frames[k].astype(np.float32) * alpha
                ).clip(0, 255).astype(np.uint8)
                rgb = cv2.cvtColor(blended, cv2.COLOR_BGR2RGB)
                proc.stdin.write(rgb.tobytes())
                total += 1
        for j in range(XFADE_FRAMES, len(frames)):
            rgb = cv2.cvtColor(frames[j], cv2.COLOR_BGR2RGB)
            proc.stdin.write(rgb.tobytes())
            total += 1

last_frames = all_clips_frames[-1]
for j in range(XFADE_FRAMES):
    alpha = 1 - (j + 1) / (XFADE_FRAMES + 1)
    frame = (last_frames[-1].astype(np.float32) * alpha).clip(0, 255).astype(np.uint8)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    proc.stdin.write(rgb.tobytes())
    total += 1

proc.stdin.close()
proc.wait()
print(f"\n완료: {OUT}")
print(f"총 프레임: {total}, 길이: {total/FPS:.2f}초")
