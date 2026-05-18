"""
알람 클립에 YOLO로 얼굴 추적 + 졸린 표정 오버레이
- 반쯤 감긴 눈 (졸린 ~ ~)
- 작은 입 (조용히 자는 입)
"""
import cv2
import numpy as np
import subprocess
import os
from ultralytics import YOLO

INPUT = r"clips\A_alarm_sleeping.mp4"
OUTPUT = r"A_alarm_sleepy_face.mp4"
FFMPEG = r"ffmpeg"

print("YOLO 로드 중...")
model = YOLO('yolov8n.pt')

cap = cv2.VideoCapture(INPUT)
fps = cap.get(cv2.CAP_PROP_FPS)
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print(f"입력: {W}x{H} @ {fps:.0f}fps, {total} frames")

def detect_face_circle(frame):
    """정귀찮 머리(흰 둥근 큰 영역) 검출 → 얼굴 중심 + 반경"""
    h, w = frame.shape[:2]
    # YOLO person detection
    results = model(frame, classes=[0], verbose=False)
    if len(results[0].boxes) == 0:
        return None
    # 가장 중앙+큰 박스
    best = None
    best_score = -999
    for box in results[0].boxes:
        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
        cx = (x1+x2)//2
        area = (x2-x1)*(y2-y1)
        dist = abs(cx - w//2) / w
        score = -dist * 2 + area / (w*h)
        if score > best_score:
            best_score = score
            best = (x1, y1, x2, y2)

    x1, y1, x2, y2 = best
    # 머리 = 박스 상단 1/3 영역의 중심
    head_cx = (x1 + x2) // 2
    head_cy = y1 + (y2 - y1) // 3
    # 머리 반경 = 박스 너비의 절반 정도
    head_r = int((x2 - x1) * 0.42)
    return (head_cx, head_cy, head_r)

def draw_sleepy_face(frame, face_info):
    """얼굴 영역에 졸린 표정 오버레이."""
    if face_info is None:
        return frame
    cx, cy, r = face_info

    # 1) 기존 눈 영역 흰색으로 덮기 (얼굴 색과 동일하게)
    # 머리 색상 샘플링 (이마 위쪽에서)
    sample_y = max(0, cy - int(r * 0.5))
    sample = frame[sample_y, cx]
    face_color = tuple(int(c) for c in sample)

    # 눈 영역 마스크 (현재 눈 위치)
    eye_y = cy - int(r * 0.1)  # 얼굴 약간 위쪽
    eye_dx = int(r * 0.35)  # 좌우 눈 간격
    eye_w = int(r * 0.25)  # 눈 영역 너비
    eye_h = int(r * 0.18)  # 눈 영역 높이

    # 좌/우 눈 영역 흰색으로 덮음
    for dx in [-eye_dx, +eye_dx]:
        ex = cx + dx
        cv2.ellipse(frame, (ex, eye_y), (eye_w, eye_h), 0, 0, 360, face_color, -1)

    # 2) 졸린 반쯤 감긴 눈 그리기 (~~)
    eye_thickness = max(3, int(r * 0.04))
    eye_color = (15, 15, 15)  # 검정

    for dx in [-eye_dx, +eye_dx]:
        ex = cx + dx
        # 곡선: 위로 살짝 휜 반달 (졸린 눈)
        # arc from -160° to -20° (위쪽 아치)
        arc_w = int(r * 0.20)
        arc_h = int(r * 0.10)
        cv2.ellipse(frame, (ex, eye_y), (arc_w, arc_h), 0, 200, 340, eye_color, eye_thickness)
        # 속눈썹 (작은 선)
        for off in [-arc_w//2, arc_w//2]:
            cv2.line(frame, (ex + off, eye_y - arc_h//2), (ex + off, eye_y - arc_h - 4), eye_color, 2)

    # 3) 입 영역 (조용한 자는 입)
    mouth_y = cy + int(r * 0.35)
    mouth_w = int(r * 0.18)
    mouth_h = int(r * 0.05)
    # 현재 입 영역도 덮기
    cv2.ellipse(frame, (cx, mouth_y), (int(r * 0.25), int(r * 0.15)), 0, 0, 360, face_color, -1)
    # 작은 호흡 입 (반달)
    cv2.ellipse(frame, (cx, mouth_y), (mouth_w, mouth_h), 0, 0, 180, eye_color, max(2, int(r * 0.03)))

    # 4) Z 표시 (자는 효과) - 우측 상단
    zzz_x = cx + int(r * 0.7)
    zzz_y = cy - int(r * 0.8)
    font = cv2.FONT_HERSHEY_SIMPLEX
    z_size = r / 60
    cv2.putText(frame, "z", (zzz_x, zzz_y), font, z_size, (100, 100, 200), 2)
    cv2.putText(frame, "Z", (zzz_x + int(r*0.25), zzz_y - int(r*0.3)), font, z_size * 1.4, (100, 100, 200), 2)

    return frame

# ffmpeg 파이프 시작
cmd = [FFMPEG, '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
       '-s', f'{W}x{H}', '-pix_fmt', 'rgb24', '-r', str(int(fps)), '-i', 'pipe:0',
       '-vcodec', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'fast', OUTPUT]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

# 프레임별 처리
last_face = None
for i in range(total):
    ret, frame = cap.read()
    if not ret:
        break

    face = detect_face_circle(frame)
    # 트래킹 부드러움
    if face is not None and last_face is not None:
        a = 0.6
        cx = int(a * face[0] + (1-a) * last_face[0])
        cy = int(a * face[1] + (1-a) * last_face[1])
        r = int(a * face[2] + (1-a) * last_face[2])
        face = (cx, cy, r)
    if face is not None:
        last_face = face

    frame = draw_sleepy_face(frame, face if face else last_face)

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    proc.stdin.write(rgb.tobytes())

    if i % 30 == 0:
        print(f"  {i}/{total} ({i*100//total}%)")

cap.release()
proc.stdin.close()
proc.wait()
print(f"\n완료: {OUTPUT}")
