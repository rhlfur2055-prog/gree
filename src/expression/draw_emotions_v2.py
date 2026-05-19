"""draw_emotions_v2.py — 95% 퀄리티 표정 생성기

개선사항 vs v1:
  1. 4× 초해상도 렌더 → LANCZOS 다운샘플 (앤티앨리어싱)
  2. 눈 해부학: 흰자 + 홍채(파랑) + 동공 + 하이라이트
  3. 입 = Catmull-Rom 스플라인 부드러운 곡선
  4. 블러시 = 가우시안 블러 소프트 원
  5. 눈물 = 반투명 레이어 그라디언트
  6. 얼굴 지우기 = 주변 피부색 샘플링
  7. BGR/Alpha 채널 분리 처리 (OpenCV 알파 버그 수정)

출력: C:\\tool\\pp\\anim_final\\emotions_v2\\{emotion}.png
"""

from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import cv2

SRC     = Path(r"C:\tool\pp\comfy_input\char_clean.png")
OUT_DIR = Path(r"C:\tool\pp\anim_final\emotions_v2")
OUT_DIR.mkdir(parents=True, exist_ok=True)

SCALE = 4

DEFAULT_FACE_BBOX = (0.30, 0.358, 0.69, 0.472)

# 색상 (BGR)
BLACK      = (18,  18,  18)
WHITE_BGR  = (255, 255, 255)
IRIS_BLUE  = (220, 140,  80)   # BGR
IRIS_DARK  = (160,  80,  40)   # BGR
PUPIL      = (18,  10,  10)    # BGR
BLUSH_COL  = (165, 140, 255)   # BGR (= RGB 255,140,165)
TEAR_COL   = (240, 195, 135)   # BGR (= RGB 135,195,240)
SWEAT_COL  = (235, 180, 100)   # BGR (= RGB 100,180,235)


# ─────────────────────────────────────────────────────────────
# PIL <-> OpenCV (BGR, alpha 분리)
# ─────────────────────────────────────────────────────────────

def pil_to_cv(pil_img: Image.Image):
    """RGBA PIL → BGR ndarray + alpha ndarray 반환."""
    rgba = np.array(pil_img.convert("RGBA"))
    alpha = rgba[:, :, 3].copy()
    bgr = cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGR)
    return bgr, alpha


def cv_to_pil(bgr: np.ndarray, alpha: np.ndarray) -> Image.Image:
    """BGR + alpha → RGBA PIL."""
    rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGBA)
    rgba[:, :, 3] = alpha
    return Image.fromarray(rgba, "RGBA")


# ─────────────────────────────────────────────────────────────
# 얼굴 bbox 측정
# ─────────────────────────────────────────────────────────────

def measure_face_bbox(img: Image.Image) -> tuple:
    arr   = np.array(img.convert("RGBA"))
    h, w  = arr.shape[:2]
    rgb   = arr[:, :, :3]
    alpha = arr[:, :, 3]
    is_dark    = rgb.max(axis=2) < 100
    is_visible = alpha > 50
    is_upper   = np.arange(h)[:, None] < int(h * 0.55)
    is_face_px = is_dark & is_visible & is_upper

    ys, xs = np.where(is_face_px)
    if len(xs) < 20:
        return DEFAULT_FACE_BBOX

    margin_x = int(w * 0.10)
    keep = (xs > margin_x) & (xs < w - margin_x) & (ys > int(h * 0.05))
    xs, ys = xs[keep], ys[keep]
    if len(xs) < 20:
        return DEFAULT_FACE_BBOX

    bbox = (xs.min() / w, ys.min() / h, xs.max() / w, ys.max() / h)
    fx, fy = bbox[2] - bbox[0], bbox[3] - bbox[1]
    if fx < 0.15 or fx > 0.65 or fy < 0.03 or fy > 0.35:
        return DEFAULT_FACE_BBOX
    return bbox


# ─────────────────────────────────────────────────────────────
# 피부색 샘플링 + 얼굴 지우기
# ─────────────────────────────────────────────────────────────

def sample_skin_color(arr: np.ndarray, fx0, fy0, fx1, fy1, pad=0.04) -> tuple:
    h, w = arr.shape[:2]
    x0 = max(0, int((fx0 - pad) * w))
    y0 = max(0, int((fy0 - pad) * h))
    ix0 = max(0, int(fx0 * w))
    iy0 = max(0, int(fy0 * h))
    ix1 = min(w, int(fx1 * w))
    iy1 = min(h, int(fy1 * h))
    x1 = min(w, int((fx1 + pad) * w))
    y1 = min(h, int((fy1 + pad) * h))

    region = arr[y0:y1, x0:x1]
    mask = np.ones(region.shape[:2], dtype=bool)
    ry0_, rx0_ = iy0-y0, ix0-x0
    ry1_, rx1_ = iy1-y0, ix1-x0
    if ry0_ >= 0 and rx0_ >= 0 and ry1_ > ry0_ and rx1_ > rx0_:
        mask[ry0_:ry1_, rx0_:rx1_] = False

    border = region[mask]
    if arr.shape[2] == 4:
        visible = border[border[:, 3] > 50]
    else:
        visible = border.reshape(-1, arr.shape[2])
    if len(visible) < 10:
        return (255, 255, 255, 255)

    bright = visible[visible[:, :3].max(axis=1) > 180]
    if len(bright) < 5:
        bright = visible
    r, g, b = bright[:, 0].mean(), bright[:, 1].mean(), bright[:, 2].mean()
    return (int(r), int(g), int(b), 255)


def erase_face(base: Image.Image, fx0, fy0, fx1, fy1, pad=0.03) -> Image.Image:
    arr = np.array(base.convert("RGBA")).copy()
    skin = sample_skin_color(arr, fx0, fy0, fx1, fy1)
    h, w = arr.shape[:2]
    x0 = max(0, int((fx0 - pad) * w))
    y0 = max(0, int((fy0 - pad) * h))
    x1 = min(w, int((fx1 + pad) * w))
    y1 = min(h, int((fy1 + pad) * h))
    region = arr[y0:y1, x0:x1].copy()
    is_feature = (region[:, :, :3].max(axis=2) < 160) & (region[:, :, 3] > 50)
    region[is_feature, 0] = skin[0]
    region[is_feature, 1] = skin[1]
    region[is_feature, 2] = skin[2]
    arr[y0:y1, x0:x1] = region
    return Image.fromarray(arr, "RGBA")


# ─────────────────────────────────────────────────────────────
# 기하 정보
# ─────────────────────────────────────────────────────────────

def get_geo(bbox, img_size, s=SCALE):
    fx0, fy0, fx1, fy1 = bbox
    w, h = img_size[0] * s, img_size[1] * s
    x0, y0 = fx0 * w, fy0 * h
    x1, y1 = fx1 * w, fy1 * h
    fw, fh = x1 - x0, y1 - y0
    return {
        "L":       (int(x0 + 0.28 * fw), int(y0 + 0.37 * fh)),
        "R":       (int(x0 + 0.72 * fw), int(y0 + 0.37 * fh)),
        "M":       (int(x0 + 0.50 * fw), int(y0 + 0.82 * fh)),
        "eye_rx":  max(6,  int(fw * 0.090)),
        "eye_ry":  max(5,  int(fw * 0.060)),
        "brow_w":  max(6,  int(fw * 0.13)),
        "brow_h":  max(4,  int(fh * 0.20)),
        "mouth_w": max(8,  int(fw * 0.32)),
        "mouth_h": max(6,  int(fh * 0.42)),
        "lw":      max(3,  int(fw * 0.022)),
        "fw": fw, "fh": fh,
        "x0": int(x0), "y0": int(y0),
        "x1": int(x1), "y1": int(y1),
        "s":  s,
    }


# ─────────────────────────────────────────────────────────────
# Catmull-Rom 스플라인
# ─────────────────────────────────────────────────────────────

def catmull_rom(points, n=100):
    pts = np.array(points, dtype=float)
    pts = np.vstack([pts[0], pts, pts[-1]])
    result = []
    seg = max(2, n // max(1, len(points) - 1))
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i-1], pts[i], pts[i+1], pts[i+2]
        for t in np.linspace(0, 1, seg):
            t2, t3 = t*t, t*t*t
            q = 0.5 * (
                (2*p1)
                + (-p0 + p2) * t
                + (2*p0 - 5*p1 + 4*p2 - p3) * t2
                + (-p0 + 3*p1 - 3*p2 + p3) * t3
            )
            result.append(q)
    return np.array(result, dtype=np.int32)


def draw_curve(bgr_img, points, color_bgr, thickness):
    if len(points) < 2:
        return
    pts = catmull_rom(points)
    for i in range(len(pts) - 1):
        cv2.line(bgr_img, tuple(pts[i]), tuple(pts[i+1]),
                 color_bgr, thickness, cv2.LINE_AA)


# ─────────────────────────────────────────────────────────────
# 눈 그리기
# ─────────────────────────────────────────────────────────────

def draw_eye(bgr, alpha, cx, cy, rx, ry, lw, mode="normal"):
    lw2 = max(2, lw // 2)
    lw3 = max(4, int(lw * 1.4))

    if mode == "x":
        r = int(rx * 0.85)
        cv2.line(bgr, (cx-r, cy-r), (cx+r, cy+r), BLACK, lw3*2, cv2.LINE_AA)
        cv2.line(bgr, (cx+r, cy-r), (cx-r, cy+r), BLACK, lw3*2, cv2.LINE_AA)
        return

    if mode == "closed":
        draw_curve(bgr,
                   [(cx-rx, cy+lw), (cx, cy-ry*2), (cx+rx, cy+lw)],
                   BLACK, lw3)
        return

    if mode == "squint":
        cv2.line(bgr, (cx-rx+lw, cy+lw//2), (cx+rx-lw, cy+lw//2),
                 BLACK, lw3*2, cv2.LINE_AA)
        return

    if mode == "halfopen":
        cv2.ellipse(bgr, (cx, cy), (rx, ry), 0, 200, 340,
                    WHITE_BGR, -1, cv2.LINE_AA)
        cv2.ellipse(bgr, (cx, cy), (rx, ry), 0, 200, 340,
                    BLACK, lw2, cv2.LINE_AA)
        # 무거운 눈꺼풀
        draw_curve(bgr,
                   [(cx-rx+lw, cy-ry//3), (cx, cy+ry//2), (cx+rx-lw, cy-ry//3)],
                   BLACK, lw3)
        return

    if mode == "happy":
        draw_curve(bgr,
                   [(cx-rx, cy+lw*2), (cx, cy-ry*2-lw), (cx+rx, cy+lw*2)],
                   BLACK, lw3)
        return

    # normal / sad / shocked: 완전 해부학
    # 흰자
    cv2.ellipse(bgr, (cx, cy), (rx, ry), 0, 0, 360,
                WHITE_BGR, -1, cv2.LINE_AA)
    cv2.ellipse(bgr, (cx, cy), (rx, ry), 0, 0, 360,
                (185, 185, 185), max(1, lw//3), cv2.LINE_AA)

    # 홍채
    iris_r = int(rx * 0.60)
    cv2.circle(bgr, (cx, cy), iris_r, IRIS_BLUE, -1, cv2.LINE_AA)
    cv2.circle(bgr, (cx, cy + iris_r//4), int(iris_r * 0.85),
               IRIS_DARK, -1, cv2.LINE_AA)

    # 동공
    pr = int(iris_r * 0.55)
    cv2.circle(bgr, (cx, cy), pr, PUPIL, -1, cv2.LINE_AA)

    # 하이라이트
    hl = max(2, int(pr * 0.42))
    hx = cx - int(iris_r * 0.28)
    hy = cy - int(iris_r * 0.28)
    cv2.circle(bgr, (hx, hy), hl, WHITE_BGR, -1, cv2.LINE_AA)
    cv2.circle(bgr,
               (cx + int(iris_r*0.22), cy + int(iris_r*0.18)),
               max(1, hl//2), (210, 220, 255), -1, cv2.LINE_AA)

    # 윤곽선
    if mode == "shocked":
        cv2.ellipse(bgr, (cx, cy), (rx, ry), 0, 0, 360,
                    BLACK, lw2*2, cv2.LINE_AA)
    elif mode == "sad":
        cv2.ellipse(bgr, (cx, cy + ry//4), (rx, ry), 0, 190, 350,
                    BLACK, lw2*2, cv2.LINE_AA)
    else:
        cv2.ellipse(bgr, (cx, cy), (rx, ry), 0, 200, 340,
                    BLACK, lw2*2, cv2.LINE_AA)


# ─────────────────────────────────────────────────────────────
# 눈썹
# ─────────────────────────────────────────────────────────────

def draw_brow(bgr, cx, cy, brow_w, brow_h, lw, mode="normal"):
    above = int(brow_h * 1.3)
    lw3   = max(4, int(lw * 1.5))
    drop  = int(brow_h * 0.65)

    if mode == "normal":
        draw_curve(bgr,
                   [(cx-brow_w, cy-above-2),
                    (cx,         cy-above-lw*2),
                    (cx+brow_w,  cy-above-2)],
                   BLACK, lw3)
    elif mode == "angry":
        draw_curve(bgr, [(cx-brow_w, cy-above-drop), (cx+brow_w, cy-above)],
                   BLACK, lw3)
    elif mode == "sad":
        draw_curve(bgr, [(cx-brow_w, cy-above), (cx+brow_w, cy-above-drop)],
                   BLACK, lw3)
    elif mode == "raised":
        draw_curve(bgr,
                   [(cx-brow_w, cy-above-drop//3),
                    (cx,         cy-above-drop),
                    (cx+brow_w,  cy-above-drop//3)],
                   BLACK, lw3)


# ─────────────────────────────────────────────────────────────
# 입
# ─────────────────────────────────────────────────────────────

def draw_mouth(bgr, mx, my, mw, mh, lw, mode="flat"):
    lw3 = max(4, int(lw * 1.3))

    if mode == "flat":
        cv2.line(bgr, (mx-mw//2, my), (mx+mw//2, my), BLACK, lw3, cv2.LINE_AA)

    elif mode == "smile":
        draw_curve(bgr, [
            (mx-mw//2, my - mh//6),
            (mx-mw//3, my + mh//4),
            (mx,       my + mh//2),
            (mx+mw//3, my + mh//4),
            (mx+mw//2, my - mh//6),
        ], BLACK, lw3)

    elif mode == "frown":
        draw_curve(bgr, [
            (mx-mw//2, my + mh//3),
            (mx-mw//3, my),
            (mx,       my - mh//6),
            (mx+mw//3, my),
            (mx+mw//2, my + mh//3),
        ], BLACK, lw3)

    elif mode == "open_small":
        rx, ry = int(mw * 0.32), int(mh * 0.42)
        cv2.ellipse(bgr, (mx, my+ry//2), (rx, ry), 0, 0, 360,
                    (12, 8, 22), -1, cv2.LINE_AA)
        cv2.ellipse(bgr, (mx, my+ry//2), (rx, ry), 0, 0, 360,
                    BLACK, lw3, cv2.LINE_AA)

    elif mode == "open_big":
        rx, ry = int(mw * 0.50), int(mh * 0.72)
        cv2.ellipse(bgr, (mx, my+ry//2), (rx, ry), 0, 0, 360,
                    (12, 8, 18), -1, cv2.LINE_AA)
        cv2.ellipse(bgr, (mx, my+ry//2), (rx, ry), 0, 0, 360,
                    BLACK, lw3, cv2.LINE_AA)


# ─────────────────────────────────────────────────────────────
# 블러시 (PIL 가우시안)
# ─────────────────────────────────────────────────────────────

def add_blush(pil_img: Image.Image, g: dict, intensity=0.55) -> Image.Image:
    layer = Image.new("RGBA", pil_img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # BLUSH_COL는 BGR이므로 RGB로 변환
    bc = (255, 140, 165)
    for sign, ex in ((-1, g["L"][0]), (1, g["R"][0])):
        bx = ex + sign * int(g["fw"] * 0.22)
        by = g["L"][1] + int(g["fh"] * 0.40)
        bw = int(g["fw"] * 0.22)
        bh = int(g["fh"] * 0.22)
        d.ellipse([bx-bw, by-bh, bx+bw, by+bh],
                  fill=(*bc, int(255 * intensity)))
    blur_r = max(4, int(g["fw"] * 0.07))
    layer = layer.filter(ImageFilter.GaussianBlur(blur_r))
    return Image.alpha_composite(pil_img, layer)


# ─────────────────────────────────────────────────────────────
# 눈물 (PIL)
# ─────────────────────────────────────────────────────────────

def add_tears(pil_img: Image.Image, g: dict, mode="small") -> Image.Image:
    layer = Image.new("RGBA", pil_img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    tc = (135, 195, 240)   # RGB
    lw = g["lw"]

    for cx, cy in [g["L"], g["R"]]:
        ty = cy + g["eye_ry"] + lw
        if mode == "small":
            d.polygon([
                (cx-lw*4, ty), (cx+lw*4, ty),
                (cx+lw*2, ty+int(g["fh"]*0.52)),
                (cx-lw*2, ty+int(g["fh"]*0.52)),
            ], fill=(*tc, 185))
            dr = lw*6
            d.ellipse([cx-dr, ty+int(g["fh"]*0.48),
                       cx+dr, ty+int(g["fh"]*0.68)],
                      fill=(*tc, 210))
        else:
            for ox in (-lw*8, 0, lw*8):
                d.polygon([
                    (cx+ox-lw*5, ty), (cx+ox+lw*5, ty),
                    (cx+ox+lw*3, ty+int(g["fh"]*0.80)),
                    (cx+ox-lw*3, ty+int(g["fh"]*0.80)),
                ], fill=(*tc, 180))
                dr = lw*7
                d.ellipse([cx+ox-dr, ty+int(g["fh"]*0.76),
                           cx+ox+dr, ty+int(g["fh"]*0.98)],
                          fill=(*tc, 210))
            pd = lw*20
            d.ellipse([cx-pd, ty+int(g["fh"]*0.93),
                       cx+pd, ty+int(g["fh"]*1.06)],
                      fill=(*tc, 120))

    blur_r = max(2, lw // 2)
    layer = layer.filter(ImageFilter.GaussianBlur(blur_r))
    return Image.alpha_composite(pil_img, layer)


# ─────────────────────────────────────────────────────────────
# 땀방울
# ─────────────────────────────────────────────────────────────

def draw_sweat(bgr, g):
    sc = SWEAT_COL
    sx = g["R"][0] + int(g["fw"] * 0.28)
    sy = g["L"][1] - int(g["fh"] * 0.48)
    lw = g["lw"]
    rw, rh = lw*4, lw*12
    cv2.ellipse(bgr, (sx, sy+rh//2), (rw, rh//2), 0, 0, 360,
                sc, -1, cv2.LINE_AA)
    tri = np.array([(sx, sy-lw*4), (sx-lw*4, sy+lw), (sx+lw*4, sy+lw)], np.int32)
    cv2.fillPoly(bgr, [tri], sc)
    cv2.circle(bgr, (sx-lw, sy+rh//3), max(1, lw*2), (220, 230, 255), -1, cv2.LINE_AA)


# ─────────────────────────────────────────────────────────────
# 표정 정의
# ─────────────────────────────────────────────────────────────

EMOTIONS = {
    "neutral":     {"brow": "normal",  "eye": "normal",   "mouth": "flat"},
    "happy":       {"brow": "normal",  "eye": "happy",    "mouth": "smile",     "blush": True},
    "sad":         {"brow": "sad",     "eye": "sad",      "mouth": "frown"},
    "angry":       {"brow": "angry",   "eye": "squint",   "mouth": "flat"},
    "surprised":   {"brow": "raised",  "eye": "shocked",  "mouth": "open_small"},
    "embarrassed": {"brow": "sad",     "eye": "closed",   "mouth": "frown",     "blush": True, "sweat": True},
    "cry":         {"brow": "sad",     "eye": "sad",      "mouth": "frown",     "tear": "small"},
    "wailing":     {"brow": "sad",     "eye": "closed",   "mouth": "open_big",  "tear": "flood"},
    "tired":       {"brow": "normal",  "eye": "halfopen", "mouth": "flat",      "sweat": True},
    "dead_inside": {"brow": "normal",  "eye": "x",        "mouth": "flat"},
    "panic":       {"brow": "raised",  "eye": "shocked",  "mouth": "open_big",  "sweat": True},
    "furious":     {"brow": "angry",   "eye": "squint",   "mouth": "open_big"},
}


# ─────────────────────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────────────────────

def main():
    src = Image.open(SRC).convert("RGBA")
    w, h = src.size
    print(f"[원본] {w}×{h}")

    bbox = measure_face_bbox(src)
    print(f"[bbox] {tuple(round(v, 3) for v in bbox)}")

    cleared = erase_face(src, *bbox)
    cleared_4x = cleared.resize((w * SCALE, h * SCALE), Image.LANCZOS)

    g = get_geo(bbox, (w, h), s=SCALE)
    print(f"[geo] L={g['L']} R={g['R']} M={g['M']} "
          f"eye_rx={g['eye_rx']} eye_ry={g['eye_ry']} lw={g['lw']}")

    for name, spec in EMOTIONS.items():
        # BGR + alpha 분리
        bgr, alpha = pil_to_cv(cleared_4x)

        lw = g["lw"]

        # 눈썹
        for cx, cy in [g["L"], g["R"]]:
            draw_brow(bgr, cx, cy, g["brow_w"], g["brow_h"], lw,
                      spec.get("brow", "normal"))

        # 눈
        eye_mode = spec.get("eye", "normal")
        for cx, cy in [g["L"], g["R"]]:
            draw_eye(bgr, alpha, cx, cy, g["eye_rx"], g["eye_ry"], lw, eye_mode)

        # 입
        draw_mouth(bgr, g["M"][0], g["M"][1],
                   g["mouth_w"], g["mouth_h"], lw,
                   spec.get("mouth", "flat"))

        # 땀
        if spec.get("sweat"):
            draw_sweat(bgr, g)

        # PIL로 합치기
        pil_4x = cv_to_pil(bgr, alpha)

        # 소프트 이펙트 (PIL 레이어)
        if spec.get("blush"):
            pil_4x = add_blush(pil_4x, g)
        if spec.get("tear"):
            pil_4x = add_tears(pil_4x, g, spec["tear"])

        # 1× 다운샘플
        result = pil_4x.resize((w, h), Image.LANCZOS)
        out = OUT_DIR / f"{name}.png"
        result.save(out, compress_level=3)
        print(f"  -> {out.name}")

    print(f"\n[완료] {OUT_DIR}")


if __name__ == "__main__":
    main()
