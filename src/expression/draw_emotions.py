"""draw_emotions.py

char_clean.png 위에 6종 표정의 눈·입을 Pillow로 직접 그려 합성.
얼굴 위치는 numpy 로 dark-pixel bbox 자동 측정, 실패시 기본 fraction 사용.
AI 미사용. 몸/외곽선 보존, 투명 PNG 유지.

출력: C:\\tool\\pp\\anim_final\\emotions\\{emotion}.png
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

SRC     = Path(r"C:\tool\pp\comfy_input\char_clean.png")
OUT_DIR = Path(r"C:\tool\pp\anim_final\emotions")
OUT_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_FACE_BBOX = (0.30, 0.358, 0.69, 0.472)

BLACK       = (0, 0, 0, 255)
BLUSH       = (255, 165, 190, 255)
DEEP_BLUSH  = (255, 130, 165, 255)
SWEAT       = (135, 195, 240, 255)


def measure_face_bbox(img: Image.Image) -> tuple:
    arr = np.array(img.convert("RGBA"))
    h, w = arr.shape[:2]
    rgb   = arr[:, :, :3]
    alpha = arr[:, :, 3]
    y_idx = np.arange(h)[:, None]
    is_dark   = rgb.max(axis=2) < 100
    is_visible = alpha > 50
    is_upper   = y_idx < int(h * 0.55)
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


def erase_face(base: Image.Image, fx0, fy0, fx1, fy1, pad=0.02) -> Image.Image:
    arr = np.array(base.convert("RGBA")).copy()
    h, w = arr.shape[:2]
    x0 = max(0, int((fx0 - pad) * w))
    y0 = max(0, int((fy0 - pad) * h))
    x1 = min(w, int((fx1 + pad) * w))
    y1 = min(h, int((fy1 + pad) * h))
    region = arr[y0:y1, x0:x1]
    rgb   = region[:, :, :3]
    alpha = region[:, :, 3]
    is_feature = (rgb.max(axis=2) < 150) & (alpha > 50)
    region[is_feature, 0] = 255
    region[is_feature, 1] = 255
    region[is_feature, 2] = 255
    arr[y0:y1, x0:x1] = region
    return Image.fromarray(arr, "RGBA")


def get_geo(bbox, img_size):
    fx0, fy0, fx1, fy1 = bbox
    w, h = img_size
    x0, y0 = fx0 * w, fy0 * h
    x1, y1 = fx1 * w, fy1 * h
    fw, fh = x1 - x0, y1 - y0
    return {
        "L":     (int(x0 + 0.28 * fw), int(y0 + 0.42 * fh)),
        "R":     (int(x0 + 0.72 * fw), int(y0 + 0.42 * fh)),
        "M":     (int(x0 + 0.50 * fw), int(y0 + 0.85 * fh)),
        "eye_r": max(2, int(fw * 0.04)),
        "fw": fw, "fh": fh,
        "x0": int(x0), "y0": int(y0),
        "x1": int(x1), "y1": int(y1),
    }


# ── 표정 6종 ──────────────────────────────────────────────────────────────────

def neutral(d, g):
    r = g["eye_r"]
    for c in (g["L"], g["R"]):
        d.ellipse([c[0]-r, c[1]-r, c[0]+r, c[1]+r], fill=BLACK)
    mw, mh = int(g["fw"] * 0.10), max(3, int(g["fh"] * 0.15))
    mx, my = g["M"]
    d.ellipse([mx - mw//2, my - mh//2, mx + mw//2, my + mh//2], fill=BLACK)


def happy(d, g):
    r = max(4, int(g["fw"] * 0.06))
    for c in (g["L"], g["R"]):
        d.arc([c[0]-r, c[1]-r, c[0]+r, c[1]+r], 180, 360, fill=BLACK, width=3)
    mw = int(g["fw"] * 0.30); mh = max(8, int(g["fh"] * 0.55))
    mx, my = g["M"]
    d.arc([mx - mw//2, my - mh//2, mx + mw//2, my + mh//2], 0, 180, fill=BLACK, width=3)
    bw, bh = int(g["fw"] * 0.10), max(4, int(g["fh"] * 0.20))
    cy = my - mh//2
    for sign in (-1, 1):
        cx = mx + sign * int(g["fw"] * 0.38)
        d.ellipse([cx - bw, cy - bh, cx + bw, cy + bh], fill=BLUSH)


def sad(d, g):
    cover_r = max(6, int(g["fw"] * 0.07))
    for c in (g["L"], g["R"]):
        d.ellipse([c[0]-cover_r, c[1]-cover_r, c[0]+cover_r, c[1]+cover_r],
                  fill=(255, 255, 255, 255))
    brow_len = int(g["fw"] * 0.24)
    drop     = int(g["fh"] * 0.30)
    above    = int(g["fh"] * 0.22)
    for c, sign in ((g["L"], +1), (g["R"], -1)):
        cx, cy = c
        outer = (cx - sign * brow_len // 2, cy - above + drop)
        inner = (cx + sign * brow_len // 2, cy - above)
        d.line([outer, inner], fill=BLACK, width=5)
    eye_r = max(5, int(g["fw"] * 0.055))
    for c in (g["L"], g["R"]):
        d.arc([c[0]-eye_r, c[1]-eye_r, c[0]+eye_r, c[1]+eye_r], 180, 360, fill=BLACK, width=3)
    mw = int(g["fw"] * 0.25); mh = max(6, int(g["fh"] * 0.45))
    mx, my = g["M"]
    d.arc([mx - mw//2, my, mx + mw//2, my + mh], 180, 360, fill=BLACK, width=3)


def angry(d, g):
    brow_len = int(g["fw"] * 0.16)
    drop = int(g["fh"] * 0.20)
    above = int(g["fh"] * 0.10)
    for c, sign in ((g["L"], +1), (g["R"], -1)):
        cx, cy = c
        outer = (cx - sign * brow_len // 2, cy - above - drop)
        inner = (cx + sign * brow_len // 2, cy - above)
        d.line([outer, inner], fill=BLACK, width=3)
    r = max(2, int(g["fw"] * 0.035))
    for c in (g["L"], g["R"]):
        d.ellipse([c[0]-r, c[1]-r, c[0]+r, c[1]+r], fill=BLACK)
    mw = int(g["fw"] * 0.15); mh = max(4, int(g["fh"] * 0.20))
    mx, my = g["M"]
    d.arc([mx - mw//2, my, mx + mw//2, my + mh], 180, 360, fill=BLACK, width=3)


def surprised(d, g):
    r = max(5, int(g["fw"] * 0.075))
    for c in (g["L"], g["R"]):
        d.ellipse([c[0]-r, c[1]-r, c[0]+r, c[1]+r], outline=BLACK, width=3)
    brow_y_off = r + int(g["fh"] * 0.12)
    brow_len = int(g["fw"] * 0.14)
    for c in (g["L"], g["R"]):
        cx, cy = c
        d.line([(cx - brow_len//2, cy - brow_y_off), (cx + brow_len//2, cy - brow_y_off)],
               fill=BLACK, width=3)
    mr = max(4, int(g["fw"] * 0.05))
    mx, my = g["M"]
    d.ellipse([mx - mr, my - mr, mx + mr, my + mr], outline=BLACK, width=3)


def embarrassed(d, g):
    cover_r = max(6, int(g["fw"] * 0.07))
    for c in (g["L"], g["R"]):
        d.ellipse([c[0]-cover_r, c[1]-cover_r, c[0]+cover_r, c[1]+cover_r],
                  fill=(255, 255, 255, 255))
    r = max(6, int(g["fw"] * 0.09))
    for c in (g["L"], g["R"]):
        d.arc([c[0]-r, c[1]-r, c[0]+r, c[1]+r], 0, 180, fill=BLACK, width=5)
    mw = int(g["fw"] * 0.18); mh = max(5, int(g["fh"] * 0.30))
    mx, my = g["M"]
    d.arc([mx - mw//2, my - mh//2, mx + mw//2, my + mh//2], 0, 180, fill=BLACK, width=2)
    bw, bh = int(g["fw"] * 0.13), max(6, int(g["fh"] * 0.30))
    cy = my - mh//2
    for sign in (-1, 1):
        cx = mx + sign * int(g["fw"] * 0.40)
        d.ellipse([cx - bw, cy - bh, cx + bw, cy + bh], fill=DEEP_BLUSH)
    sx = g["x1"] + int(g["fw"] * 0.06)
    sy = g["y0"] - int(g["fh"] * 0.20)
    sw, sh = max(4, int(g["fw"] * 0.05)), max(8, int(g["fh"] * 0.45))
    d.ellipse([sx - sw//2, sy, sx + sw//2, sy + sh], fill=SWEAT)


EMOTIONS = {
    "neutral":     neutral,
    "happy":       happy,
    "sad":         sad,
    "angry":       angry,
    "surprised":   surprised,
    "embarrassed": embarrassed,
}


def main():
    src = Image.open(SRC).convert("RGBA")
    bbox = measure_face_bbox(src)
    print(f"[bbox] {bbox} (img {src.size})")
    cleared = erase_face(src, *bbox)
    g = get_geo(bbox, src.size)
    print(f"[geo] L={g['L']} R={g['R']} M={g['M']} eye_r={g['eye_r']} fw={int(g['fw'])} fh={int(g['fh'])}")

    for name, fn in EMOTIONS.items():
        img = cleared.copy()
        d = ImageDraw.Draw(img)
        fn(d, g)
        out = OUT_DIR / f"{name}.png"
        img.save(out)
        print(f"  -> {out.name}")
    print(f"[done] {OUT_DIR}")


if __name__ == "__main__":
    main()
