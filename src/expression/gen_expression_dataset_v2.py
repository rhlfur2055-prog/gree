"""gen_expression_dataset_v2.py — 95% 퀄리티 표정 데이터셋 생성기

개선사항:
  1. 4× 초해상도 렌더 → LANCZOS 다운샘플 (앤티앨리어싱)
  2. 눈: 흰자 + 홍채(파랑) + 동공 + 하이라이트
  3. 입: Catmull-Rom 스플라인 부드러운 곡선
  4. 눈썹: 베지어 곡선 + 두께감
  5. 블러시: 가우시안 블러 소프트
  6. 눈물: 반투명 그라디언트 레이어
  7. BGR/Alpha 채널 분리 처리 (OpenCV 알파 버그 수정)

픽셀 분석으로 확정된 실측 좌표 (원본 기준):
  왼눈 중심 (264, 398) | 오른눈 중심 (501, 398)
  코 중심 (378, 476) ← 건드리지 않음
  입 중심 (383, 520)

출력: C:\\tool\\pp\\dataset\\expressions_v2\\
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import cv2

SRC   = Path(r"C:\tool\pp\1.png")
OUT   = Path(r"C:\tool\pp\dataset\expressions_v2")
OUT.mkdir(parents=True, exist_ok=True)

SCALE = 4

# 원본 좌표 → 4× 스케일
_EL, _ER = (264, 398), (501, 398)
_EW, _EH = 38, 14
_MX, _MY = 383, 520

EL = (_EL[0]*SCALE, _EL[1]*SCALE)
ER = (_ER[0]*SCALE, _ER[1]*SCALE)
EW = _EW * SCALE
EH = _EH * SCALE
MX = _MX * SCALE
MY = _MY * SCALE

# 지우기 영역 (4× 기준) — 눈+눈썹+코+입
ERASE_BOXES = [
    [EL[0]-EW-80,  EL[1]-EH-160, EL[0]+EW+80,  EL[1]+EH+70],   # 왼눈+눈썹
    [ER[0]-EW-80,  ER[1]-EH-160, ER[0]+EW+80,  ER[1]+EH+70],   # 오른눈+눈썹
    [378*SCALE-220, 476*SCALE-196, 378*SCALE+220, 476*SCALE+196], # 코
    [MX-160,       MY-64,         MX+160,        MY+164],          # 입
]

# 색상 (BGR)
BLACK     = (18,  18,  18)
WHITE_BGR = (255, 255, 255)
IRIS_B    = (220, 140,  80)   # BGR
IRIS_D    = (160,  80,  40)   # BGR
PUPIL_C   = (18,  10,  10)
SWEAT_C   = (235, 180, 100)   # BGR

LW  = max(8, int(EW * 0.22))
LW2 = max(4, LW // 2)
LW3 = max(10, int(LW * 1.4))
BW  = int(EW * 0.88)
BROW_ABOVE = int(EH + LW * 5)


# ─────────────────────────────────────────────────────────────
# PIL ↔ CV 변환 (Alpha 분리)
# ─────────────────────────────────────────────────────────────

def pil_to_cv(pil_img: Image.Image):
    rgba  = np.array(pil_img.convert("RGBA"))
    alpha = rgba[:, :, 3].copy()
    bgr   = cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGR)
    return bgr, alpha


def cv_to_pil(bgr: np.ndarray, alpha: np.ndarray) -> Image.Image:
    rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGBA)
    rgba[:, :, 3] = alpha
    return Image.fromarray(rgba, "RGBA")


# ─────────────────────────────────────────────────────────────
# 배경색 샘플링 + 얼굴 특징 지우기
# ─────────────────────────────────────────────────────────────

def sample_bg(arr: np.ndarray) -> tuple:
    """눈 위쪽 밝은 영역 평균색."""
    sy  = max(0, EL[1] - BROW_ABOVE - LW * 12)
    sh  = LW * 8
    sx0 = EL[0] - EW * 2
    sx1 = ER[0] + EW * 2
    region = arr[sy:sy+sh, sx0:sx1]
    if region.size == 0:
        return (255, 255, 255)
    flat = region.reshape(-1, arr.shape[2])
    if arr.shape[2] == 4:
        visible = flat[flat[:, 3] > 50, :3]
    else:
        visible = flat[:, :3]
    bright = visible[visible.max(axis=1) > 180]
    if len(bright) < 5:
        bright = visible
    if len(bright) == 0:
        return (255, 255, 255)
    r, g, b = bright[:, 0].mean(), bright[:, 1].mean(), bright[:, 2].mean()
    return (int(r), int(g), int(b))


def erase_features(arr: np.ndarray, bg: tuple) -> np.ndarray:
    out = arr.copy()
    for box in ERASE_BOXES:
        x0, y0, x1, y1 = [max(0, v) for v in box]
        x1 = min(out.shape[1], x1)
        y1 = min(out.shape[0], y1)
        region = out[y0:y1, x0:x1]
        if arr.shape[2] == 4:
            mask = (region[:, :, :3].max(axis=2) < 160) & (region[:, :, 3] > 50)
        else:
            mask = region[:, :, :3].max(axis=2) < 160
        region[mask, 0] = bg[0]
        region[mask, 1] = bg[1]
        region[mask, 2] = bg[2]
        out[y0:y1, x0:x1] = region
    return out


# ─────────────────────────────────────────────────────────────
# Catmull-Rom 스플라인
# ─────────────────────────────────────────────────────────────

def catmull_rom(points, n=120):
    pts = np.array(points, dtype=float)
    pts = np.vstack([pts[0], pts, pts[-1]])
    result = []
    seg = max(2, n // max(1, len(points) - 1))
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i-1], pts[i], pts[i+1], pts[i+2]
        for t in np.linspace(0, 1, seg):
            t2, t3 = t*t, t*t*t
            q = 0.5 * (
                (2*p1) + (-p0+p2)*t
                + (2*p0-5*p1+4*p2-p3)*t2
                + (-p0+3*p1-3*p2+p3)*t3
            )
            result.append(q)
    return np.array(result, dtype=np.int32)


def draw_curve(bgr, points, color, thickness):
    if len(points) < 2:
        return
    pts = catmull_rom(points)
    for i in range(len(pts) - 1):
        cv2.line(bgr, tuple(pts[i]), tuple(pts[i+1]), color, thickness, cv2.LINE_AA)


# ─────────────────────────────────────────────────────────────
# 눈 그리기
# ─────────────────────────────────────────────────────────────

def draw_eye(bgr, cx, cy, mode="normal"):
    rx, ry = EW, EH

    if mode == "x":
        r = int(rx * 0.80)
        cv2.line(bgr, (cx-r, cy-r), (cx+r, cy+r), BLACK, LW3*2, cv2.LINE_AA)
        cv2.line(bgr, (cx+r, cy-r), (cx-r, cy+r), BLACK, LW3*2, cv2.LINE_AA)
        return

    if mode == "closed":
        draw_curve(bgr,
                   [(cx-rx, cy+LW2), (cx, cy-ry*2), (cx+rx, cy+LW2)],
                   BLACK, LW3)
        return

    if mode == "halfopen":
        cv2.ellipse(bgr, (cx, cy), (rx, ry), 0, 200, 340, WHITE_BGR, -1, cv2.LINE_AA)
        cv2.ellipse(bgr, (cx, cy), (rx, ry), 0, 200, 340, BLACK, LW2, cv2.LINE_AA)
        draw_curve(bgr,
                   [(cx-rx+LW, cy-ry//3), (cx, cy+ry//2), (cx+rx-LW, cy-ry//3)],
                   BLACK, LW3)
        return

    if mode == "squint":
        cv2.line(bgr, (cx-rx+LW, cy+LW2), (cx+rx-LW, cy+LW2),
                 BLACK, LW3*2, cv2.LINE_AA)
        return

    if mode == "happy":
        draw_curve(bgr,
                   [(cx-rx, cy+LW*2), (cx, cy-ry*2-LW), (cx+rx, cy+LW*2)],
                   BLACK, LW3)
        return

    # normal / sad / shocked : 완전 해부학
    cv2.ellipse(bgr, (cx, cy), (rx, ry), 0, 0, 360, WHITE_BGR, -1, cv2.LINE_AA)
    cv2.ellipse(bgr, (cx, cy), (rx, ry), 0, 0, 360, (185,185,185), LW//4, cv2.LINE_AA)

    iris_r = int(rx * 0.60)
    cv2.circle(bgr, (cx, cy), iris_r, IRIS_B, -1, cv2.LINE_AA)
    cv2.circle(bgr, (cx, cy+iris_r//4), int(iris_r*0.85), IRIS_D, -1, cv2.LINE_AA)

    pr = int(iris_r * 0.55)
    cv2.circle(bgr, (cx, cy), pr, PUPIL_C, -1, cv2.LINE_AA)

    hl = max(3, int(pr*0.42))
    hx = cx - int(iris_r*0.28)
    hy = cy - int(iris_r*0.28)
    cv2.circle(bgr, (hx, hy), hl, WHITE_BGR, -1, cv2.LINE_AA)
    cv2.circle(bgr, (cx+int(iris_r*0.22), cy+int(iris_r*0.18)),
               max(2, hl//2), (210, 220, 255), -1, cv2.LINE_AA)

    if mode == "shocked":
        cv2.ellipse(bgr, (cx, cy), (rx, ry), 0, 0, 360, BLACK, LW2*2, cv2.LINE_AA)
    elif mode == "sad":
        cv2.ellipse(bgr, (cx, cy+ry//4), (rx, ry), 0, 190, 350, BLACK, LW2*2, cv2.LINE_AA)
    else:
        cv2.ellipse(bgr, (cx, cy), (rx, ry), 0, 200, 340, BLACK, LW2*2, cv2.LINE_AA)


# ─────────────────────────────────────────────────────────────
# 눈썹
# ─────────────────────────────────────────────────────────────

def draw_brow(bgr, cx, cy, mode="normal"):
    above = BROW_ABOVE
    drop  = int(EH * 4.5)

    if mode == "normal":
        draw_curve(bgr,
                   [(cx-BW, cy-above-LW), (cx, cy-above-LW*2), (cx+BW, cy-above-LW)],
                   BLACK, LW3)
    elif mode == "angry":
        draw_curve(bgr, [(cx-BW, cy-above-drop), (cx+BW, cy-above)], BLACK, LW3)
    elif mode == "sad":
        draw_curve(bgr, [(cx-BW, cy-above), (cx+BW, cy-above-drop)], BLACK, LW3)
    elif mode == "raised":
        draw_curve(bgr,
                   [(cx-BW, cy-above-drop//3),
                    (cx,    cy-above-drop),
                    (cx+BW, cy-above-drop//3)],
                   BLACK, LW3)


# ─────────────────────────────────────────────────────────────
# 입
# ─────────────────────────────────────────────────────────────

def draw_mouth(bgr, mode="flat"):
    hw = int(EW * 0.88)
    mh = int(EH * 3.0)

    if mode == "flat":
        cv2.line(bgr, (MX-hw, MY), (MX+hw, MY), BLACK, LW3, cv2.LINE_AA)

    elif mode == "smile":
        draw_curve(bgr, [
            (MX-hw,    MY - mh//5),
            (MX-hw//2, MY + mh//3),
            (MX,       MY + mh//2),
            (MX+hw//2, MY + mh//3),
            (MX+hw,    MY - mh//5),
        ], BLACK, LW3)

    elif mode == "frown":
        draw_curve(bgr, [
            (MX-hw,    MY + mh//2),
            (MX-hw//2, MY + mh//8),
            (MX,       MY - mh//8),
            (MX+hw//2, MY + mh//8),
            (MX+hw,    MY + mh//2),
        ], BLACK, LW3)

    elif mode == "open_small":
        rx, ry = int(hw*0.55), int(mh*0.55)
        cv2.ellipse(bgr, (MX, MY+ry//2), (rx, ry), 0, 0, 360, (18,8,8),  -1, cv2.LINE_AA)
        cv2.ellipse(bgr, (MX, MY+ry//2), (rx, ry), 0, 0, 360, BLACK, LW3, cv2.LINE_AA)

    elif mode == "open_big":
        rx, ry = int(hw*0.90), int(mh*1.0)
        cv2.ellipse(bgr, (MX, MY+ry//2), (rx, ry), 0, 0, 360, (18,8,8),  -1, cv2.LINE_AA)
        cv2.ellipse(bgr, (MX, MY+ry//2), (rx, ry), 0, 0, 360, BLACK, LW3, cv2.LINE_AA)


# ─────────────────────────────────────────────────────────────
# 블러시
# ─────────────────────────────────────────────────────────────

def add_blush(pil_4x: Image.Image, intensity=0.50) -> Image.Image:
    layer = Image.new("RGBA", pil_4x.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    bc = (255, 140, 165)
    bw, bh = EW * 2, int(EH * 4)
    lbx = EL[0] - EW * 3
    rbx = ER[0] + EW * 3
    by  = EL[1] + int(EH * 5)
    for bx in (lbx, rbx):
        d.ellipse([bx-bw, by-bh, bx+bw, by+bh],
                  fill=(*bc, int(255 * intensity)))
    blur_r = max(10, EW // 2)
    layer = layer.filter(ImageFilter.GaussianBlur(blur_r))
    return Image.alpha_composite(pil_4x, layer)


# ─────────────────────────────────────────────────────────────
# 눈물
# ─────────────────────────────────────────────────────────────

def add_tears(pil_4x: Image.Image, mode="small") -> Image.Image:
    layer = Image.new("RGBA", pil_4x.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    tc = (135, 195, 240)
    tw = LW * 3

    for cx, cy in [EL, ER]:
        ty = cy + EH + LW * 2
        if mode == "small":
            d.polygon([
                (cx-tw, ty), (cx+tw, ty),
                (cx+tw//2, ty+int(EH*18)),
                (cx-tw//2, ty+int(EH*18)),
            ], fill=(*tc, 185))
            dr = tw + LW
            d.ellipse([cx-dr, ty+int(EH*16), cx+dr, ty+int(EH*24)],
                      fill=(*tc, 210))
        else:
            for ox in (-tw*3, 0, tw*3):
                d.polygon([
                    (cx+ox-tw, ty), (cx+ox+tw, ty),
                    (cx+ox+tw//2, ty+int(EH*28)),
                    (cx+ox-tw//2, ty+int(EH*28)),
                ], fill=(*tc, 180))
                dr = tw + LW
                d.ellipse([cx+ox-dr, ty+int(EH*25),
                           cx+ox+dr, ty+int(EH*36)],
                          fill=(*tc, 210))
            pd = tw * 7
            d.ellipse([cx-pd, ty+int(EH*33), cx+pd, ty+int(EH*40)],
                      fill=(*tc, 120))

    blur_r = max(4, LW // 3)
    layer = layer.filter(ImageFilter.GaussianBlur(blur_r))
    return Image.alpha_composite(pil_4x, layer)


# ─────────────────────────────────────────────────────────────
# 땀방울
# ─────────────────────────────────────────────────────────────

def draw_sweat(bgr):
    sx = ER[0] + EW * 4
    sy = EL[1] - EH * 7
    rw, rh = LW * 3, LW * 9
    cv2.ellipse(bgr, (sx, sy+rh//2), (rw, rh//2), 0, 0, 360,
                SWEAT_C, -1, cv2.LINE_AA)
    tri = np.array([(sx, sy-LW*3), (sx-LW*3, sy+LW), (sx+LW*3, sy+LW)], np.int32)
    cv2.fillPoly(bgr, [tri], SWEAT_C)
    cv2.circle(bgr, (sx-LW, sy+rh//3), max(1, LW), (210, 230, 255), -1, cv2.LINE_AA)


# ─────────────────────────────────────────────────────────────
# 표정 13종
# ─────────────────────────────────────────────────────────────

EXPRS = [
    ("neutral",
     {"brow": "normal",  "eye": "normal",   "mouth": "flat"},
     "gri character, neutral calm expression, white background"),

    ("angry",
     {"brow": "angry",   "eye": "squint",   "mouth": "flat"},
     "gri character, angry expression, frowning eyebrows, squinting eyes, white background"),

    ("furious",
     {"brow": "angry",   "eye": "squint",   "mouth": "open_big"},
     "gri character, furious screaming, sharp eyebrows, white background"),

    ("sad",
     {"brow": "sad",     "eye": "sad",      "mouth": "frown"},
     "gri character, sad expression, drooping eyebrows, white background"),

    ("cry",
     {"brow": "sad",     "eye": "sad",      "mouth": "frown",    "tear": "small"},
     "gri character, crying, tears falling, white background"),

    ("sob_wail",
     {"brow": "sad",     "eye": "closed",   "mouth": "open_big", "tear": "flood"},
     "gri character, wailing crying, flood of tears, open mouth, white background"),

    ("happy",
     {"brow": "normal",  "eye": "happy",    "mouth": "smile",    "blush": True},
     "gri character, happy crescent eyes, smiling, blush cheeks, white background"),

    ("shocked",
     {"brow": "raised",  "eye": "shocked",  "mouth": "open_small"},
     "gri character, shocked wide eyes, open mouth, white background"),

    ("tired",
     {"brow": "normal",  "eye": "halfopen", "mouth": "flat",     "sweat": True},
     "gri character, tired half-closed eyes, sweat drop, white background"),

    ("embarrassed",
     {"brow": "sad",     "eye": "closed",   "mouth": "frown",    "blush": True, "sweat": True},
     "gri character, embarrassed blushing, closed eyes, white background"),

    ("depressed",
     {"brow": "sad",     "eye": "sad",      "mouth": "frown"},
     "gri character, depressed gloomy, drooping expression, white background"),

    ("dead_inside",
     {"brow": "normal",  "eye": "x",        "mouth": "flat"},
     "gri character, dead inside, X eyes, blank expression, white background"),

    ("panic",
     {"brow": "raised",  "eye": "shocked",  "mouth": "open_big", "sweat": True},
     "gri character, panicking, wide eyes, screaming, sweat, white background"),
]


# ─────────────────────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────────────────────

def main():
    src = Image.open(SRC).convert("RGBA")
    ow, oh = src.size
    print(f"[원본] {ow}×{oh}")

    src_4x = src.resize((ow*SCALE, oh*SCALE), Image.LANCZOS)
    arr_4x = np.array(src_4x)

    bg = sample_bg(arr_4x)
    print(f"[배경색] R={bg[0]} G={bg[1]} B={bg[2]}")

    cleared_4x = erase_features(arr_4x, bg)

    # alpha 채널 분리
    alpha_4x = cleared_4x[:, :, 3].copy()
    bgr_base  = cv2.cvtColor(cleared_4x, cv2.COLOR_RGBA2BGR)

    print(f"\n[렌더] {len(EXPRS)}종 표정 생성 중 ...")

    for name, spec, caption in EXPRS:
        bgr = bgr_base.copy()

        # 눈썹
        for cx, cy in [EL, ER]:
            draw_brow(bgr, cx, cy, spec.get("brow", "normal"))

        # 눈
        eye_mode = spec.get("eye", "normal")
        for cx, cy in [EL, ER]:
            draw_eye(bgr, cx, cy, eye_mode)

        # 입
        draw_mouth(bgr, spec.get("mouth", "flat"))

        # 땀
        if spec.get("sweat"):
            draw_sweat(bgr)

        # PIL 변환 (alpha 복원)
        pil_4x = cv_to_pil(bgr, alpha_4x)

        # 소프트 이펙트
        if spec.get("blush"):
            pil_4x = add_blush(pil_4x)
        if spec.get("tear"):
            pil_4x = add_tears(pil_4x, spec["tear"])

        # 1× 다운샘플
        final = pil_4x.resize((ow, oh), Image.LANCZOS)

        out_png = OUT / f"{name}.png"
        out_txt = OUT / f"{name}.txt"
        final.save(out_png, compress_level=3)
        out_txt.write_text(caption, encoding="utf-8")
        print(f"  ✓ {name}")

    print(f"\n[완료] {OUT}")


if __name__ == "__main__":
    for f in OUT.glob("*.png"): f.unlink()
    for f in OUT.glob("*.txt"): f.unlink()
    main()
