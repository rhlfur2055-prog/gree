"""
jeonggwichan 표정 생성기 — 픽셀 분석 기반 정밀 좌표
코 절대 안건드림. 눈/눈썹 영역만 지우고 새로 그림.
"""

from pathlib import Path
from PIL import Image, ImageDraw

SRC = Path(r"C:\tool\pp\1.png")
OUT = Path(r"C:\tool\pp\dataset\expressions")
OUT.mkdir(parents=True, exist_ok=True)

# ── 픽셀 분석으로 확정된 실측 좌표 ──────────────────────────────────────────
# 왼눈 중심 (264, 398)  |  오른눈 중심 (501, 398)
# 코 중심 (378, 476)  ← 절대 건드리지 않음
# 입 영역: 코 아래 y≈520

EL = (264, 398)   # 왼눈
ER = (501, 398)   # 오른눈
EW = 38           # 눈 반폭
EH = 14           # 눈 반높이

# 지우기 박스 (눈+눈썹 포함 여유있게)
ERASE_L = [EL[0]-EW-18, EL[1]-EH-40, EL[0]+EW+18, EL[1]+EH+16]
ERASE_R = [ER[0]-EW-18, ER[1]-EH-40, ER[0]+EW+18, ER[1]+EH+16]

MOUTH_Y = 520      # 입 그릴 y
MX      = 383      # 입 중심 x (코 중심 기준)

BLACK = (18, 18, 18)
WHITE = (255, 255, 255)
BLUE  = (110, 160, 225)
PINK  = (245, 155, 165)

# ── 공통: 눈 영역 지우기 ─────────────────────────────────────────────────────

def erase(d: ImageDraw.ImageDraw) -> None:
    d.rectangle(ERASE_L, fill=WHITE)
    d.rectangle(ERASE_R, fill=WHITE)
    # 코 지우기
    nx, ny = 378, 476
    d.ellipse([nx-55, ny-48, nx+55, ny+48], fill=WHITE)

# ── 눈썹 ─────────────────────────────────────────────────────────────────────

def brow_angry(d):
    """화난 눈썹: 안쪽 아래, 바깥 위  ╲  ╱"""
    by = EL[1] - EH - 20
    d.line([EL[0]-EW+2, by-18, EL[0]+EW-2, by+10], fill=BLACK, width=10)
    d.line([ER[0]-EW+2, by+10, ER[0]+EW-2, by-18], fill=BLACK, width=10)

def brow_sad(d):
    """슬픈 눈썹: 바깥 아래, 안쪽 위  ╱  ╲"""
    by = EL[1] - EH - 20
    d.line([EL[0]-EW+2, by+10, EL[0]+EW-2, by-14], fill=BLACK, width=8)
    d.line([ER[0]-EW+2, by-14, ER[0]+EW-2, by+10], fill=BLACK, width=8)

def brow_normal(d):
    """기본 눈썹: 가로"""
    by = EL[1] - EH - 22
    d.line([EL[0]-EW+4, by, EL[0]+EW-4, by], fill=BLACK, width=7)
    d.line([ER[0]-EW+4, by, ER[0]+EW-4, by], fill=BLACK, width=7)

def brow_raised(d):
    """놀란 눈썹: 위로 올라감"""
    by = EL[1] - EH - 34
    d.arc([EL[0]-EW, by-6, EL[0]+EW, by+14], start=200, end=340, fill=BLACK, width=7)
    d.arc([ER[0]-EW, by-6, ER[0]+EW, by+14], start=200, end=340, fill=BLACK, width=7)

# ── 눈 ──────────────────────────────────────────────────────────────────────

def eye_squint(d):
    """찡그린 눈: 납작한 선"""
    for cx, cy in [EL, ER]:
        d.line([cx-EW+4, cy+4, cx+EW-4, cy+4], fill=BLACK, width=8)

def eye_normal(d):
    """기본 반달눈"""
    for cx, cy in [EL, ER]:
        d.arc([cx-EW, cy-EH, cx+EW, cy+EH],
              start=205, end=335, fill=BLACK, width=7)

def eye_droopy(d):
    """처진 슬픈 눈"""
    for cx, cy in [EL, ER]:
        d.arc([cx-EW, cy-EH+4, cx+EW, cy+EH+4],
              start=210, end=330, fill=BLACK, width=7)

def eye_shut_sad(d):
    """꽉 감긴 눈 (울 때)"""
    for cx, cy in [EL, ER]:
        d.arc([cx-EW, cy-EH-2, cx+EW, cy+EH+2],
              start=208, end=332, fill=BLACK, width=9)

def eye_circle(d):
    """동그란 놀란 눈"""
    for cx, cy in [EL, ER]:
        r = 20
        d.ellipse([cx-r, cy-r, cx+r, cy+r], outline=BLACK, width=6)
        d.ellipse([cx-7, cy-7, cx+7, cy+7], fill=BLACK)

def eye_happy(d):
    """행복한 눈: ^^ """
    for cx, cy in [EL, ER]:
        d.arc([cx-EW, cy-EH-8, cx+EW, cy+8],
              start=15, end=165, fill=BLACK, width=8)

def eye_halfopen(d):
    """피곤에 찌든 눈: 눈꺼풀이 반쯤 내려옴, 힘없이 처진 눈매"""
    for cx, cy in [EL, ER]:
        # 아래 눈 라인 (반달)
        d.arc([cx-EW, cy-EH+4, cx+EW, cy+EH+4],
              start=205, end=335, fill=BLACK, width=6)
        # 눈꺼풀이 위에서 무겁게 내려옴 (직선 + 약간 처짐)
        d.line([cx-EW+4, cy-2, cx+EW-4, cy+6], fill=BLACK, width=8)
        # 다크서클 (눈 아래 희미하게)
        d.arc([cx-EW+8, cy+EH+2, cx+EW-8, cy+EH+18],
              start=15, end=165, fill=(160, 140, 155), width=3)

def eye_x(d):
    """X눈 (멘탈붕괴)"""
    for cx, cy in [EL, ER]:
        r = 18
        d.line([cx-r, cy-r, cx+r, cy+r], fill=BLACK, width=9)
        d.line([cx+r, cy-r, cx-r, cy+r], fill=BLACK, width=9)

def eye_closed_line(d):
    """눈 감은 선 (부끄러움)"""
    for cx, cy in [EL, ER]:
        d.line([cx-EW+6, cy+2, cx+EW-6, cy+2], fill=BLACK, width=8)

# ── 입 ──────────────────────────────────────────────────────────────────────

def mouth_flat(d):
    d.line([MX-28, MOUTH_Y, MX+28, MOUTH_Y], fill=BLACK, width=7)

def mouth_frown(d):
    """슬픈 입: 양 끝이 아래로 처짐 (∩ 형태) — 명시적 좌표"""
    mx, my = MX, MOUTH_Y
    pts = [(mx-32, my+14), (mx-16, my+5), (mx, my), (mx+16, my+5), (mx+32, my+14)]
    for i in range(len(pts)-1):
        d.line([pts[i], pts[i+1]], fill=BLACK, width=7)

def mouth_smile(d):
    """웃는 입: 양 끝이 올라감 (U 형태) — 명시적 좌표"""
    mx, my = MX, MOUTH_Y
    pts = [(mx-32, my), (mx-16, my+9), (mx, my+14), (mx+16, my+9), (mx+32, my)]
    for i in range(len(pts)-1):
        d.line([pts[i], pts[i+1]], fill=BLACK, width=7)

def mouth_open_small(d):
    d.ellipse([MX-18, MOUTH_Y-8, MX+18, MOUTH_Y+20],
              outline=BLACK, width=6, fill=(28, 18, 18))

def mouth_open_big(d):
    """오열/비명 입: 크게 벌림"""
    d.ellipse([MX-32, MOUTH_Y-8, MX+32, MOUTH_Y+42],
              outline=BLACK, width=7, fill=(28, 18, 18))

# ── 눈물 ─────────────────────────────────────────────────────────────────────

def tears_small(d):
    """자연스러운 눈물 한 줄기씩"""
    for cx, cy in [EL, ER]:
        # 눈물 방울 시작
        ty_start = cy + EH + 10
        # 흘러내리는 줄기 (폭이 좁아지는 사다리꼴)
        d.polygon([
            (cx-9, ty_start),
            (cx+9, ty_start),
            (cx+5, ty_start+60),
            (cx-5, ty_start+60),
        ], fill=(*BLUE, 200))
        # 끝 물방울
        d.ellipse([cx-12, ty_start+52, cx+12, ty_start+80],
                  fill=(*BLUE, 220))

def tears_flood(d):
    """폭풍오열 - 굵은 줄기 여러 개"""
    for cx, cy in [EL, ER]:
        ty_start = cy + EH + 8
        # 줄기 3개
        for ox, w_top, w_bot in [(-18, 10, 6), (0, 14, 8), (18, 10, 6)]:
            x = cx + ox
            d.polygon([
                (x-w_top, ty_start),
                (x+w_top, ty_start),
                (x+w_bot, ty_start+90),
                (x-w_bot, ty_start+90),
            ], fill=(*BLUE, 210))
            # 끝 물방울
            d.ellipse([x-w_bot-4, ty_start+82,
                       x+w_bot+4, ty_start+110],
                      fill=(*BLUE, 230))
        # 바닥 웅덩이
        d.ellipse([cx-48, ty_start+108, cx+48, ty_start+126],
                  fill=(*BLUE, 130))

def blush(d):
    for cx in [EL[0]-20, ER[0]+20]:
        cy = 488
        d.ellipse([cx-30, cy-14, cx+30, cy+14], fill=(*PINK[:3], 130))

def sweat(d):
    sx, sy = ER[0]+72, EL[1]-50
    d.ellipse([sx-9, sy-18, sx+9, sy+8],  fill=BLUE)
    d.polygon([(sx, sy-28), (sx-8, sy-14), (sx+8, sy-14)], fill=BLUE)

# ── 표정 정의 ────────────────────────────────────────────────────────────────

def make(name, draw_fn, caption):
    img = Image.open(SRC).convert("RGBA")
    d   = ImageDraw.Draw(img, "RGBA")
    erase(d)
    draw_fn(d)
    img.save(OUT / f"{name}.png")
    (OUT / f"{name}.txt").write_text(caption, encoding="utf-8")
    print(f"  ✓ {name}")


EXPRS = [
    ("neutral", lambda d: (brow_normal(d), eye_normal(d)),
     "jeonggwichan, neutral calm expression, white background"),

    ("angry", lambda d: (brow_angry(d), eye_squint(d), mouth_flat(d)),
     "jeonggwichan, angry expression, angry frowning eyebrows, squinting eyes, white background"),

    ("furious", lambda d: (brow_angry(d), eye_squint(d), mouth_open_big(d)),
     "jeonggwichan, furious expression, screaming angry, sharp eyebrows, white background"),

    ("sad", lambda d: (brow_sad(d), eye_droopy(d), mouth_frown(d)),
     "jeonggwichan, sad expression, drooping eyebrows, sad mouth, white background"),

    ("cry", lambda d: (brow_sad(d), eye_shut_sad(d), mouth_frown(d), tears_small(d)),
     "jeonggwichan, crying expression, tears falling, white background"),

    ("sob_wail", lambda d: (brow_sad(d), eye_shut_sad(d), mouth_open_big(d), tears_flood(d)),
     "jeonggwichan, wailing crying, flood of tears, open mouth sobbing, white background"),

    ("happy", lambda d: (brow_normal(d), eye_happy(d), mouth_smile(d)),
     "jeonggwichan, happy expression, crescent eyes, smiling, white background"),

    ("shocked", lambda d: (brow_raised(d), eye_circle(d), mouth_open_small(d)),
     "jeonggwichan, shocked expression, wide eyes, open mouth, white background"),

    ("tired", lambda d: (brow_normal(d), eye_halfopen(d), sweat(d)),
     "jeonggwichan, tired exhausted expression, half-closed eyes, sweat drop, white background"),

    ("embarrassed", lambda d: (brow_sad(d), eye_closed_line(d), mouth_frown(d), blush(d)),
     "jeonggwichan, embarrassed expression, closed eyes, blushing cheeks, white background"),

    ("depressed", lambda d: (brow_sad(d), eye_droopy(d), mouth_frown(d)),
     "jeonggwichan, depressed gloomy expression, sad drooping, white background"),

    ("dead_inside", lambda d: (brow_normal(d), eye_x(d)),
     "jeonggwichan, dead inside expression, X eyes, empty blank, white background"),

    ("panic", lambda d: (brow_raised(d), eye_circle(d), mouth_open_big(d), sweat(d)),
     "jeonggwichan, panicking expression, wide eyes, open mouth screaming, sweat, white background"),
]

if __name__ == "__main__":
    for f in OUT.glob("*.png"): f.unlink()
    for f in OUT.glob("*.txt"): f.unlink()
    print(f"[생성] {len(EXPRS)}개 → {OUT}\n")
    for name, fn, cap in EXPRS:
        make(name, fn, cap)
    print("\n[완료]")
