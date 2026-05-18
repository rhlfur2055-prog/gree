"""
정귀찬 출근 쓼츠 편집 v2
- 비율 깨짐 버그 수정 (cv2.resize로 강제 스트레치 X)
- 블러 배경으로 빈 공간 채움 (검은 띠 X)
- YOLO로 정귀찬 추적해서 9:16 smart crop
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

SEQUENCE = [
    ("04_waving.mp4",            5,  40,  False),
    ("11_leaving_home_door.mp4", 10, 70,  False),
    ("12_street_walking.mp4",    20, 80,  True),
    ("13_subway_stairs.mp4",     15, 75,  True),
    ("14_subway_gate.mp4",       10, 60,  True),
    ("02_walking_side.mp4",      10, 60,  False),
    ("03_typing.mp4",            15, 75,  False),
    ("06_sigh.mp4",              10, 60,  False),
    ("08_head_pulling.mp4",      5,  50,  False),
    ("09_chair_lean.mp4",        10, 70,  False),
    ("10_neutral_to_sad.mp4",    15, 75,  False),
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

def fit_into_canvas_with_blur(frame, target_w=W, target_h=H):
    """
    프레임을 9:16 캔버스에 비율 유지 배치.
    빈 공간은 같은 프레임 확대/블러로 채움 (검은 띠 X).
    """
    h, w = frame.shape[:2]
    src_ar = w / h
    dst_ar = target_w / target_h  # 9/16 = 0.5625

    # 1. 블러 배경 (원본을 9:16에 꽉 채우게 zoom + 블러)
    if src_ar > dst_ar:  # 원본이 가로로 더 김
        # 세로 기준 채움
        bg_h = target_h
        bg_w = int(bg_h * src_ar)
    else:
        # 가로 기준 채움
        bg_w = target_w
        bg_h = int(bg_w / src_ar)
    bg = cv2.resize(frame, (bg_w, bg_h), interpolation=cv2.INTER_LINEAR)
    # 중앙 크롭
    bx = (bg_w - target_w) // 2
    by = (bg_h - target_h) // 2
    bg = bg[by:by+target_h, bx:bx+target_w]
    # 강한 블러
    bg = cv2.GaussianBlur(bg, (51, 51), 30)
    # 어둡게 (전경 부각용)
    bg = (bg.astype(np.float32) * 0.55).clip(0, 255).astype(np.uint8)

    # 2. 전경 (원본 비율 유지하면서 9:16 안에 들어가게 축소)
    fg_ratio = min(target_w / w, target_h / h)
    fg_w = int(w * fg_ratio)
    fg_h = int(h * fg_ratio)
    fg = cv2.resize(frame, (fg_w, fg_h), interpolation=cv2.INTER_LANCZOS4)

    # 3. 합성: 블러 배경 위에 전경 중앙 배치
    canvas = bg.copy()
    x_off = (target_w - fg_w) // 2
    y_off = (target_h - fg_h) // 2
    canvas[y_off:y_off+fg_h, x_off:x_off+fg_w] = fg

    return canvas

def smart_crop_no_stretch(frame, jeong_info, target_w=W, target_h=H):
    """
    정귀찬 중심 9:16 크롭. 화면 밖으로 나가도 비율 유지 (스트레치 X).
    경계 넘으면 자동으로 letterbox 변환.
    """
    h, w = frame.shape[:2]
    if jeong_info is None:
        return fit_into_canvas_with_blur(frame, target_w, target_h)

    cx, cy, box_h = jeong_info

    # 캐릭터를 60% 차지하도록 9:16 크롭
    crop_h = int(box_h / 0.55)
    crop_w = int(crop_h * 9 / 16)

    left = cx - crop_w // 2
    right = left + crop_w
    top = cy - crop_h // 2 - int(crop_h * 0.05)
    bottom = top + crop_h

    # 경계 체크: 만약 9:16 그대로 못 자르면 → 블러 배경 모드로 fallback
    out_of_bounds = (left < 0 or right > w or top < 0 or bottom > h)

    if out_of_bounds:
        # 화면 안에 들어가도록 축소 시도
        # 좌우 여유 < 위아래 여유면 → 좌우 기준 축소
        scale = min(
            w / crop_w if crop_w > w else 1,
            h / crop_h if crop_h > h else 1,
            1.0
        )
        if scale < 1:
            crop_w = int(crop_w * scale)
            crop_h = int(crop_h * scale)
            left = cx - crop_w // 2
            right = left + crop_w
            top = cy - crop_h // 2
            bottom = top + crop_h

        # 다시 경계 체크 후 평행 이동
        if left < 0: right -= left; left = 0
        if right > w: left -= (right - w); right = w
        if top < 0: bottom -= top; top = 0
        if bottom > h: top -= (bottom - h); bottom = h

    left = max(0, left); top = max(0, top)
    right = min(w, right); bottom = min(h, bottom)

    cropped = frame[top:bottom, left:right]
    # 자른 결과가 9:16이 아니면 블러 처리, 9:16이면 그냥 리사이즈
    ch, cw = cropped.shape[:2]
    if cw == 0 or ch == 0:
        return fit_into_canvas_with_blur(frame, target_w, target_h)

    crop_ar = cw / ch
    target_ar = target_w / target_h
    if abs(crop_ar - target_ar) > 0.02:
        # 비율 다름 → 블러 배경으로 채워넣기
        return fit_into_canvas_with_blur(cropped, target_w, target_h)
    else:
        # 9:16 정확함 → 그냥 리사이즈
        return cv2.resize(cropped, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)

# ffmpeg 파이프
cmd = [FFMPEG, '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
       '-s', f'{W}x{H}', '-pix_fmt', 'rgb24', '-r', str(FPS), '-i', 'pipe:0',
       '-vcodec', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'fast', OUT]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

total_frames = 0
last_jeong = None

for clip_idx, (filename, start_f, end_f, need_smart) in enumerate(SEQUENCE):
    clip_path = os.path.join(CLIPS_DIR, filename)
    cap = cv2.VideoCapture(clip_path)
    src_fps = cap.get(cv2.CAP_PROP_FPS)
    src_frames = end_f - start_f
    duration = src_frames / src_fps
    out_frames = int(duration * FPS)

    print(f"[{clip_idx+1}/{len(SEQUENCE)}] {filename} ({duration:.2f}s, {out_frames}f, smart={need_smart})")

    for i in range(out_frames):
        src_idx = start_f + int(i * src_fps / FPS)
        cap.set(cv2.CAP_PROP_POS_FRAMES, src_idx)
        ret, frame = cap.read()
        if not ret:
            break

        if need_smart:
            jeong = detect_jeong(frame)
            if jeong is not None and last_jeong is not None:
                a = 0.7
                cx = int(a * jeong[0] + (1-a) * last_jeong[0])
                cy = int(a * jeong[1] + (1-a) * last_jeong[1])
                bh = int(a * jeong[2] + (1-a) * last_jeong[2])
                jeong = (cx, cy, bh)
            if jeong:
                last_jeong = jeong
            output = smart_crop_no_stretch(frame, jeong if jeong else last_jeong)
        else:
            output = fit_into_canvas_with_blur(frame)

        rgb = cv2.cvtColor(output, cv2.COLOR_BGR2RGB)
        proc.stdin.write(rgb.tobytes())
        total_frames += 1

    cap.release()
    last_jeong = None

proc.stdin.close()
proc.wait()
print(f"\n완료: {OUT}")
print(f"총 프레임: {total_frames}, 길이: {total_frames/FPS:.2f}초")
