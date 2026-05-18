"""
지하철 신난 캐릭터 → 우울한 표정으로 합성
- YOLO로 주인공 검출 (가장 큰/중앙)
- 미소 → 처진 입
- 평범한 점눈 → 처진 슬픈 눈썹 추가
"""
import cv2
import numpy as np
import subprocess
import os
from ultralytics import YOLO

INPUT = r"input.mp4"
OUTPUT = r"subway_sad_face.mp4"
FFMPEG = r"ffmpeg"

model = YOLO('yolov8n.pt')

cap = cv2.VideoCapture(INPUT)
fps = cap.get(cv2.CAP_PROP_FPS)
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print(f"입력: {W}x{H} @ {fps:.0f}fps, {total} frames")

def find_protagonist(frame):
    """가장 중앙 + 큰 박스 = 주인공."""
    h, w = frame.shape[:2]
    results = model(frame, classes=[0], verbose=False)
    if len(results[0].boxes) == 0:
        return None
    best = None
    best_score = -999
    for box in results[0].boxes:
        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
        cx = (x1+x2)//2
        area = (x2-x1)*(y2-y1)
        dist = abs(cx - w//2) / w
        score = -dist * 3 + area / (w*h) * 2  # 중앙 가중 ↑
        if score > best_score:
            best_score = score
            best = (x1, y1, x2, y2)
    return best

def sample_face_color(frame, cx, cy, r):
    """이마 영역에서 면 색 샘플링 (흰색이어야 함)."""
    h, w = frame.shape[:2]
    # 이마 = 얼굴 중심 위쪽
    sy = max(0, cy - int(r * 0.6))
    sx = cx
    # 5x5 평균
    sample = frame[max(0,sy-3):min(h,sy+3), max(0,sx-3):min(w,sx+3)]
    if sample.size == 0:
        return (240, 240, 240)
    return tuple(int(c) for c in sample.mean(axis=(0,1)))

def draw_sad_expression(frame, box):
    """주인공 박스에 슬픈 표정 그리기."""
    x1, y1, x2, y2 = box
    box_w = x2 - x1
    box_h = y2 - y1
    # 얼굴 중심 = 박스 상단 1/3 위치 (정귀찬 머리)
    face_cx = (x1 + x2) // 2
    face_cy = y1 + int(box_h * 0.30)
    face_r = int(box_w * 0.42)  # 머리 반경

    # 면 색 (흰색)
    face_color = sample_face_color(frame, face_cx, face_cy, face_r)

    # === 1. 기존 미소 입 지우기 ===
    mouth_cy = face_cy + int(face_r * 0.35)
    mouth_w = int(face_r * 0.45)
    mouth_h = int(face_r * 0.30)
    cv2.ellipse(frame, (face_cx, mouth_cy), (mouth_w, mouth_h), 0, 0, 360, face_color, -1)

    # === 2. 처진 입 그리기 (︵ 거꾸로 반달) ===
    sad_mouth_w = int(face_r * 0.30)
    sad_mouth_h = int(face_r * 0.18)
    sad_thickness = max(3, int(face_r * 0.05))
    cv2.ellipse(
        frame,
        (face_cx, mouth_cy + int(face_r * 0.08)),  # 약간 아래
        (sad_mouth_w, sad_mouth_h),
        0,
        180, 360,  # 위로 휜 호 = 처진 입
        (20, 20, 20),
        sad_thickness
    )

    # === 3. 슬픈 눈썹 (∧ 모양, 안쪽 위 / 바깥쪽 아래) ===
    eye_y = face_cy - int(face_r * 0.15)
    eye_dx = int(face_r * 0.32)

    brow_y_top = eye_y - int(face_r * 0.30)
    brow_thickness = max(3, int(face_r * 0.05))

    for side in [-1, 1]:
        ex = face_cx + side * eye_dx
        # 안쪽 끝 (위) → 바깥쪽 끝 (아래)
        inner = (face_cx + side * int(eye_dx * 0.25), brow_y_top)
        outer = (ex + side * int(face_r * 0.20), brow_y_top + int(face_r * 0.20))
        cv2.line(frame, inner, outer, (20, 20, 20), brow_thickness)

    # === 4. 파란 눈물 한 방울 ===
    tear_color = (232, 184, 107)  # BGR (파란색)
    for side in [-1, 1]:
        ex = face_cx + side * eye_dx
        tear_x = ex
        tear_y = eye_y + int(face_r * 0.15)
        # 눈물 방울 (작은 타원)
        cv2.ellipse(frame, (tear_x, tear_y), (int(face_r * 0.05), int(face_r * 0.08)), 0, 0, 360, tear_color, -1)
        # 눈물 흐름선
        cv2.line(frame, (tear_x, tear_y), (tear_x, tear_y + int(face_r * 0.15)), tear_color, max(2, int(face_r * 0.025)))

    return frame

cmd = [FFMPEG, '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
       '-s', f'{W}x{H}', '-pix_fmt', 'rgb24', '-r', str(int(fps)), '-i', 'pipe:0',
       '-vcodec', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'fast', OUTPUT]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

last_box = None
for i in range(total):
    ret, frame = cap.read()
    if not ret: break

    box = find_protagonist(frame)
    # 부드러움
    if box is not None and last_box is not None:
        a = 0.7
        box = tuple(int(a * b + (1-a) * l) for b, l in zip(box, last_box))
    if box is not None:
        last_box = box

    if box or last_box:
        frame = draw_sad_expression(frame, box or last_box)

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    proc.stdin.write(rgb.tobytes())

    if i % 30 == 0:
        print(f"  {i}/{total} ({i*100//total}%)")

cap.release()
proc.stdin.close()
proc.wait()
print(f"\n완료: {OUTPUT}")
