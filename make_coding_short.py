"""
10초 코딩 쇼츠 생성기
1080x1920 / 30fps / H.264 yuv420p
캐릭터 표준_누끼.png + VS Code 다크 배경 + 코드 타이핑 애니메이션
"""

import subprocess, sys, io, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ── 설정 ──────────────────────────────────────────────────────────
W, H = 1080, 1920
FPS = 30
DURATION = 10
TOTAL_FRAMES = FPS * DURATION  # 300

CHAR_PNG = r"char_clean.png"
OUTPUT = r"coding_short.mp4"

# VS Code 다크 팔레트
BG       = (30, 30, 30)
PANEL_BG = (37, 37, 38)
LINE_NUM = (133, 133, 133)
KW_COLOR = (197, 134, 192)   # purple  – def/class/import
STR_COLOR= (206, 145,  120)  # orange  – strings
CMT_COLOR= (106, 153,  85)   # green   – comments
ID_COLOR = (156, 220, 254)   # blue    – identifiers
NUM_COLOR= (181, 206, 168)   # light green – numbers
OP_COLOR = (220, 220, 170)   # yellow  – operators
FN_COLOR = (220, 220, 170)   # yellow  – function names
WHITE    = (212, 212, 212)   # default text

EDITOR_TOP    = 220   # 에디터 시작 y
EDITOR_LEFT   = 60
LINE_H        = 44
FONT_SIZE     = 30
CURSOR_W      = 3

# 캐릭터 위치 (하단 중앙)
CHAR_TARGET_W = 480
CHAR_Y_BASE   = H - 520

# ── 코드 라인 정의 (토큰 리스트) ──────────────────────────────────
# 각 토큰: (text, color)
CODE_LINES = [
    [(  "#", CMT_COLOR), (" 그리 AI 코딩 중...", CMT_COLOR)],
    [],
    [("import", KW_COLOR), (" fastapi", WHITE), (" as", KW_COLOR), (" fa", WHITE)],
    [("import", KW_COLOR), (" anthropic", WHITE)],
    [],
    [("app", ID_COLOR), (" = ", OP_COLOR), ("fa", WHITE), (".", WHITE), ("FastAPI", FN_COLOR), ("()", WHITE)],
    [("client", ID_COLOR), (" = ", OP_COLOR), ("anthropic", WHITE), (".", WHITE), ("Anthropic", FN_COLOR), ("()", WHITE)],
    [],
    [("@", OP_COLOR), ("app", ID_COLOR), (".", WHITE), ("post", FN_COLOR), ("(", WHITE), ('"/chat"', STR_COLOR), (")", WHITE)],
    [("async", KW_COLOR), (" def", KW_COLOR), (" chat", FN_COLOR), ("(", WHITE), ("msg", ID_COLOR), (": ", WHITE), ("str", KW_COLOR), ("):", WHITE)],
    [("    ", WHITE), ("resp", ID_COLOR), (" = ", OP_COLOR), ("await", KW_COLOR), (" client", ID_COLOR)],
    [("        ", WHITE), (".", WHITE), ("messages", ID_COLOR), (".", WHITE), ("create", FN_COLOR), ("(", WHITE)],
    [("            ", WHITE), ("model", ID_COLOR), ("=", OP_COLOR), ('"claude-sonnet-4-6"', STR_COLOR), (",", WHITE)],
    [("            ", WHITE), ("max_tokens", ID_COLOR), ("=", OP_COLOR), ("1024", NUM_COLOR), (",", WHITE)],
    [("            ", WHITE), ("messages", ID_COLOR), ("=[{", WHITE)],
    [('                "role"', STR_COLOR), (": ", WHITE), ('"user"', STR_COLOR), (",", WHITE)],
    [('                "content"', STR_COLOR), (": ", WHITE), ("msg", ID_COLOR)],
    [("            ", WHITE), ("}])", WHITE)],
    [("    ", WHITE), ("return", KW_COLOR), (" resp", ID_COLOR), (".", WHITE), ("content", ID_COLOR), ("[", WHITE), ("0", NUM_COLOR), ("]", WHITE)],
]

# ── 폰트 로드 ─────────────────────────────────────────────────────
def load_font(size):
    candidates = [
        r"C:\Windows\Fonts\consola.ttf",   # Consolas
        r"C:\Windows\Fonts\cour.ttf",      # Courier New
        r"C:\Windows\Fonts\lucon.ttf",     # Lucida Console
    ]
    for p in candidates:
        try:
            return ImageFont.truetype(p, size)
        except:
            pass
    return ImageFont.load_default()

font      = load_font(FONT_SIZE)
font_sm   = load_font(22)

# ── 캐릭터 로드 ───────────────────────────────────────────────────
char_img = Image.open(CHAR_PNG).convert("RGBA")
ratio = CHAR_TARGET_W / char_img.width
char_img = char_img.resize(
    (CHAR_TARGET_W, int(char_img.height * ratio)),
    Image.LANCZOS
)
CHAR_W, CHAR_H = char_img.size

# ── 유틸 ──────────────────────────────────────────────────────────
def token_width(token_text):
    bbox = font.getbbox(token_text)
    return bbox[2] - bbox[0]

def draw_tokens(draw, tokens, x, y):
    for text, color in tokens:
        draw.text((x, y), text, font=font, fill=color)
        x += token_width(text)
    return x

def full_line_len(tokens):
    return sum(token_width(t) for t, _ in tokens)

# 각 라인의 전체 문자 수 (타이핑 속도용)
def line_chars(tokens):
    return sum(len(t) for t, _ in tokens)

# ── 타이핑 진행도 계산 ────────────────────────────────────────────
# 0~6초: 타이핑, 6~10초: 완성 상태 유지 + 커서 깜빡임
TYPING_END_SEC = 6.5
total_chars = sum(line_chars(ln) for ln in CODE_LINES if ln)
chars_per_sec = total_chars / TYPING_END_SEC  # 초당 문자 수

def get_typed_chars(t_sec):
    return int(min(t_sec * chars_per_sec, total_chars))

# ── 배경 그리기 ───────────────────────────────────────────────────
def make_base_bg():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # 상단 타이틀바
    draw.rectangle([0, 0, W, 60], fill=(50, 50, 50))
    draw.text((20, 15), "● ● ●", font=font_sm, fill=(200, 80, 80))
    draw.text((W//2 - 120, 15), "main.py — 그리 AI", font=font_sm, fill=(200, 200, 200))

    # 탭 바
    draw.rectangle([0, 60, W, 100], fill=PANEL_BG)
    draw.rectangle([0, 60, 200, 100], fill=BG)
    draw.text((20, 70), "main.py", font=font_sm, fill=(200, 200, 200))
    draw.line([0, 99, W, 99], fill=(80, 80, 80), width=1)

    # 상태바 (하단)
    draw.rectangle([0, H - 60, W, H], fill=(0, 122, 204))
    draw.text((20, H - 45), "Python 3.11  │  UTF-8  │  LF  │  jeonggwichan_v2 LoRA ✓", font=font_sm, fill=(255, 255, 255))

    return img

base_bg = make_base_bg()

# ── 프레임 생성 ───────────────────────────────────────────────────
def make_frame(frame_idx):
    t = frame_idx / FPS
    img = base_bg.copy()
    draw = ImageDraw.Draw(img)

    # 줄번호 영역 배경
    draw.rectangle([0, EDITOR_TOP, 55, H - 60], fill=PANEL_BG)

    typed_so_far = get_typed_chars(t)
    char_count = 0
    cursor_x, cursor_y = EDITOR_LEFT, EDITOR_TOP

    for li, tokens in enumerate(CODE_LINES):
        y = EDITOR_TOP + li * LINE_H

        # 줄번호
        draw.text((8, y + 6), f"{li+1:2d}", font=font_sm, fill=LINE_NUM)

        x = EDITOR_LEFT
        if not tokens:
            # 빈 줄
            char_count += 0
            cursor_x, cursor_y = x, y
            continue

        line_total = line_chars(tokens)

        if char_count >= typed_so_far:
            # 아직 타이핑 안 됨
            pass
        elif char_count + line_total <= typed_so_far:
            # 이 줄 전체 출력
            draw_tokens(draw, tokens, x, y + 4)
            char_count += line_total
            cursor_x = x + full_line_len(tokens)
            cursor_y = y
        else:
            # 부분 출력
            remaining = typed_so_far - char_count
            partial_tokens = []
            for text, color in tokens:
                if remaining <= 0:
                    break
                if remaining >= len(text):
                    partial_tokens.append((text, color))
                    remaining -= len(text)
                else:
                    partial_tokens.append((text[:remaining], color))
                    remaining = 0
            px = draw_tokens(draw, partial_tokens, x, y + 4)
            cursor_x = px
            cursor_y = y
            char_count += line_chars(tokens)

    # 커서 깜빡임 (0.5초 주기)
    if int(t * 2) % 2 == 0 or t >= TYPING_END_SEC:
        draw.rectangle(
            [cursor_x, cursor_y + 4, cursor_x + CURSOR_W, cursor_y + 4 + FONT_SIZE],
            fill=(200, 200, 200)
        )

    # 캐릭터 오버레이 (상하 bob + 약간 회전 느낌)
    bob = int(math.sin(t * 2.5) * 10)
    cx = (W - CHAR_W) // 2 + int(math.sin(t * 1.3) * 6)
    cy = CHAR_Y_BASE + bob

    # 캐릭터 합성
    img_rgba = img.convert("RGBA")
    img_rgba.paste(char_img, (cx, cy), char_img)
    img = img_rgba.convert("RGB")

    return np.array(img, dtype=np.uint8)

# ── ffmpeg 파이프 ─────────────────────────────────────────────────
FFMPEG = r"ffmpeg"

cmd = [
    FFMPEG, "-y",
    "-f", "rawvideo",
    "-vcodec", "rawvideo",
    "-s", f"{W}x{H}",
    "-pix_fmt", "rgb24",
    "-r", str(FPS),
    "-i", "pipe:0",
    "-vcodec", "libx264",
    "-pix_fmt", "yuv420p",
    "-crf", "18",
    "-preset", "fast",
    OUTPUT,
]

print(f"렌더링 시작: {TOTAL_FRAMES}프레임 ({DURATION}초)")
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

for i in range(TOTAL_FRAMES):
    frame = make_frame(i)
    proc.stdin.write(frame.tobytes())
    if i % 30 == 0:
        print(f"  {i}/{TOTAL_FRAMES} ({i*100//TOTAL_FRAMES}%)")

proc.stdin.close()
proc.wait()
print(f"\n완료: {OUTPUT}")
