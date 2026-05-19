"""cv_effects.py
OpenCV 기반 캐릭터 화면 교체 + 배경 스왑 + YOLO 감지 연동.

기능:
  1. chroma_key()      - 흰 배경 누끼 (GrabCut or HSV threshold)
  2. bg_replace()      - 배경 이미지/영상으로 교체
  3. screen_overlay()  - 캐릭터 손 앞 모니터 화면 교체 (perspective warp)
  4. yolo_composite()  - YOLOv8 객체 감지 → bbox 위에 캐릭터 합성

사용:
  python cv_effects.py --mode bg_replace --char anim_final/walk.mp4 --bg bg.jpg
  python cv_effects.py --mode screen_overlay --char anim_final/walk.mp4 --screen capture.png
  python cv_effects.py --mode yolo_composite --input video.mp4 --char 1.png
"""

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np


# ── 1. 흰배경 누끼 ─────────────────────────────────────────────────────────────

def chroma_key_white(frame: np.ndarray, tolerance: int = 30) -> np.ndarray:
    """흰 배경(HSV 기준) 제거 → BGRA 반환"""
    hsv = cv2.cvtColor(frame[:, :, :3], cv2.COLOR_BGR2HSV)
    # 흰색: 낮은 채도 + 높은 명도
    mask_white = cv2.inRange(hsv, (0, 0, 255 - tolerance), (180, tolerance, 255))
    # 약간 dilate 후 invert → 캐릭터 마스크
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask_white = cv2.dilate(mask_white, kernel, iterations=2)
    alpha = cv2.bitwise_not(mask_white)
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)  # 경계 부드럽게

    bgra = cv2.cvtColor(frame[:, :, :3], cv2.COLOR_BGR2BGRA)
    bgra[:, :, 3] = alpha
    return bgra


def remove_bg_rembg(frame_bgr: np.ndarray) -> np.ndarray:
    """rembg AI 누끼 (정밀) — BGRA 반환"""
    try:
        import rembg
        from PIL import Image
        import io

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        pil_in = Image.fromarray(rgb)
        buf = io.BytesIO()
        pil_in.save(buf, format="PNG")
        result_bytes = rembg.remove(buf.getvalue())
        pil_out = Image.open(io.BytesIO(result_bytes)).convert("RGBA")
        return cv2.cvtColor(np.array(pil_out), cv2.COLOR_RGBA2BGRA)
    except ImportError:
        print("[warn] rembg 없음 → HSV 누끼로 대체", file=sys.stderr)
        return chroma_key_white(frame_bgr)


# ── 2. 배경 교체 ───────────────────────────────────────────────────────────────

def bg_replace(char_bgra: np.ndarray, bg: np.ndarray) -> np.ndarray:
    """캐릭터(BGRA) + 배경(BGR) → 합성 BGR"""
    h, w = char_bgra.shape[:2]
    bg_resized = cv2.resize(bg, (w, h))
    alpha = char_bgra[:, :, 3:4].astype(float) / 255.0
    char_rgb = char_bgra[:, :, :3].astype(float)
    bg_f = bg_resized.astype(float)
    out = char_rgb * alpha + bg_f * (1 - alpha)
    return out.astype(np.uint8)


def process_bg_replace(char_path: str, bg_path: str, out_path: str,
                       use_rembg: bool = False):
    """비디오/이미지 배경 교체 메인"""
    bg_img = cv2.imread(bg_path)
    if bg_img is None:
        raise FileNotFoundError(f"배경 파일 없음: {bg_path}")

    cap = cv2.VideoCapture(char_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 12
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"),
                             fps, (w, h))

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        bgra = remove_bg_rembg(frame) if use_rembg else chroma_key_white(frame)
        composite = bg_replace(bgra, bg_img)
        writer.write(composite)

    cap.release()
    writer.release()
    print(f"[bg_replace] 저장 → {out_path}")


# ── 3. 모니터 화면 교체 (perspective warp) ────────────────────────────────────

def screen_overlay(frame: np.ndarray, screen_img: np.ndarray,
                   corners: list[tuple[int, int]]) -> np.ndarray:
    """
    frame 의 corners (4점, 시계방향) 영역에 screen_img를 원근 변환으로 합성.
    corners: [(x0,y0), (x1,y1), (x2,y2), (x3,y3)]  ← 화면 네 꼭짓점
    """
    sh, sw = screen_img.shape[:2]
    src_pts = np.float32([[0, 0], [sw, 0], [sw, sh], [0, sh]])
    dst_pts = np.float32(corners)
    M = cv2.getPerspectiveTransform(src_pts, dst_pts)

    warped = cv2.warpPerspective(screen_img, M, (frame.shape[1], frame.shape[0]))
    # 마스크: 변환된 화면 영역
    mask = np.zeros((frame.shape[0], frame.shape[1]), dtype=np.uint8)
    cv2.fillConvexPoly(mask, dst_pts.astype(np.int32), 255)
    mask_3 = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)

    result = np.where(mask_3 > 0, warped, frame)
    return result


def auto_detect_screen(frame: np.ndarray) -> list[tuple[int, int]] | None:
    """
    흰/밝은 직사각형(모니터 화면) 자동 감지 — 없으면 None.
    단순 컨투어 기반.
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best = None
    best_area = 0
    for cnt in contours:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)
        if len(approx) == 4:
            area = cv2.contourArea(cnt)
            if area > best_area:
                best_area = area
                best = [tuple(p[0]) for p in approx]
    return best


# ── 4. YOLO 객체 감지 + 캐릭터 합성 ──────────────────────────────────────────

def yolo_composite(input_path: str, char_path: str, out_path: str,
                   model_path: str = None, target_class: str = "person",
                   scale: float = 0.4):
    """
    YOLOv8로 영상에서 target_class bbox 감지 →
    bbox 위에 char_path 캐릭터 이미지 합성.

    model_path: 없으면 yolov8n.pt (ultralytics 자동 다운)
    """
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[error] pip install ultralytics 필요", file=sys.stderr)
        sys.exit(1)

    model_path = model_path or "yolov8n.pt"
    print(f"[yolo] 모델 로드: {model_path}")
    model = YOLO(model_path)

    char_bgr = cv2.imread(char_path, cv2.IMREAD_UNCHANGED)
    if char_bgr is None:
        raise FileNotFoundError(f"캐릭터 파일 없음: {char_path}")
    if char_bgr.shape[2] == 3:
        char_bgra = chroma_key_white(char_bgr)
    else:
        char_bgra = cv2.cvtColor(char_bgr, cv2.COLOR_BGRA2BGRA)

    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"),
                             fps, (fw, fh))

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        results = model(frame, verbose=False)
        for box in results[0].boxes:
            cls_name = model.names[int(box.cls[0])]
            if cls_name != target_class:
                continue
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            bw, bh = x2 - x1, y2 - y1
            ch = int(bh * scale)
            cw = int(char_bgra.shape[1] * ch / char_bgra.shape[0])
            char_resized = cv2.resize(char_bgra, (cw, ch))

            # bbox 상단 중앙에 합성
            cx = x1 + bw // 2 - cw // 2
            cy = y1 - ch
            cy = max(0, cy)
            x_end = min(fw, cx + cw)
            y_end = min(fh, cy + ch)
            char_crop = char_resized[:y_end - cy, :x_end - cx]

            alpha = char_crop[:, :, 3:4].astype(float) / 255.0
            roi = frame[cy:y_end, cx:x_end].astype(float)
            char_rgb = char_crop[:, :, :3].astype(float)
            blended = char_rgb * alpha + roi * (1 - alpha)
            frame[cy:y_end, cx:x_end] = blended.astype(np.uint8)

        writer.write(frame)

    cap.release()
    writer.release()
    print(f"[yolo_composite] 저장 → {out_path}")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="cv_effects — 캐릭터 화면교체/합성 도구")
    p.add_argument("--mode", required=True,
                   choices=["bg_replace", "screen_overlay", "yolo_composite"],
                   help="실행 모드")
    p.add_argument("--char",   help="캐릭터 영상/이미지 경로")
    p.add_argument("--bg",     help="배경 이미지 경로 (bg_replace 모드)")
    p.add_argument("--screen", help="교체할 화면 이미지 (screen_overlay 모드)")
    p.add_argument("--input",  help="입력 영상 (yolo_composite 모드)")
    p.add_argument("--model",  help="YOLO 모델 경로 (기본: yolov8n.pt)")
    p.add_argument("--out",    default="output.mp4", help="출력 파일")
    p.add_argument("--rembg",  action="store_true", help="AI 누끼 사용")
    args = p.parse_args()

    if args.mode == "bg_replace":
        process_bg_replace(args.char, args.bg, args.out, use_rembg=args.rembg)

    elif args.mode == "screen_overlay":
        frame = cv2.imread(args.char)
        screen = cv2.imread(args.screen)
        corners = auto_detect_screen(frame)
        if corners is None:
            h, w = frame.shape[:2]
            corners = [(w//4, h//4), (3*w//4, h//4),
                       (3*w//4, 3*h//4), (w//4, 3*h//4)]
            print("[warn] 화면 자동 감지 실패 → 중앙 영역 사용")
        result = screen_overlay(frame, screen, corners)
        cv2.imwrite(args.out, result)
        print(f"[screen_overlay] 저장 → {args.out}")

    elif args.mode == "yolo_composite":
        yolo_composite(args.input, args.char, args.out, model_path=args.model)


if __name__ == "__main__":
    main()
