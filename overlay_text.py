"""
Overlay progressive chalk text on the 16-frame chalkboard scene.
Each frame shows accumulating text in the chalkboard region.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import imageio.v3 as iio

SRC = Path(r"C:\tool\pp\anim_chalk")
OUT = Path(r"C:\tool\pp\anim_final")
OUT.mkdir(parents=True, exist_ok=True)

FONT = r"C:\Windows\Fonts\malgun.ttf"           # Korean-capable
FONT_EN = r"C:\Windows\Fonts\segoeui.ttf"        # English

LINES = [
    "BACKEND / AI",
    "Developer",
    "임동근  (귀찮이)",
]
FRAMES = 16
FPS = 8

# Chalkboard region inside the 768x432 image (roughly the upper rectangle)
BOARD_X = 60      # left margin
BOARD_Y = 35      # top margin (start of text)
LINE_GAP = 50     # px between lines

CHALK_COLOR = (245, 245, 230)   # cream-white chalk
SHADOW = (210, 210, 200)

font_lines = [
    (LINES[0], ImageFont.truetype(FONT_EN, 38)),
    (LINES[1], ImageFont.truetype(FONT_EN, 32)),
    (LINES[2], ImageFont.truetype(FONT, 30)),
]

# total chars across all lines (used for typewriter progress)
total_chars = sum(len(t) for t, _ in font_lines)


def chars_at_frame(i: int) -> int:
    # frame 0 starts empty, frame 15 shows ~95% (last bit appears in final frame)
    # add a small delay so first 2 frames show no text, last 2 show full
    progress = (i - 1) / (FRAMES - 3) if i > 1 else 0
    progress = max(0.0, min(1.0, progress))
    return round(progress * total_chars)


def render_lines(draw: ImageDraw.ImageDraw, char_budget: int):
    cursor_y = BOARD_Y
    remaining = char_budget
    for text, font in font_lines:
        if remaining <= 0:
            return
        partial = text[: min(len(text), remaining)]
        remaining -= len(partial)
        # subtle shadow for chalk-on-board feel
        draw.text((BOARD_X + 2, cursor_y + 2), partial, font=font, fill=SHADOW)
        draw.text((BOARD_X, cursor_y), partial, font=font, fill=CHALK_COLOR)
        cursor_y += LINE_GAP


def main():
    src_frames = sorted(SRC.glob("chalk_frame_*.png"))
    if len(src_frames) != FRAMES:
        print(f"WARN: expected {FRAMES} frames, got {len(src_frames)}")

    out_imgs = []
    for i, p in enumerate(src_frames):
        img = Image.open(p).convert("RGB")
        draw = ImageDraw.Draw(img)
        n = chars_at_frame(i)
        render_lines(draw, n)
        out_path = OUT / f"final_{i:02d}.png"
        img.save(out_path)
        out_imgs.append(img)

    # Build playback: 4 frames "hold last with full text" at the end for readability
    arrays = [iio.imread(OUT / f"final_{i:02d}.png") for i in range(FRAMES)]
    last = arrays[-1]
    arrays_extended = arrays + [last] * 6    # hold final state ~0.75s

    mp4 = OUT / "jeong_chalk.mp4"
    iio.imwrite(mp4, arrays_extended, fps=FPS, codec="libx264",
                output_params=["-pix_fmt", "yuv420p",
                               "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2"])
    print(f"  saved {mp4.name}  {mp4.stat().st_size//1024} KB")

    gif = OUT / "jeong_chalk.gif"
    iio.imwrite(gif, arrays_extended, fps=FPS, loop=0)
    print(f"  saved {gif.name}  {gif.stat().st_size//1024} KB")


if __name__ == "__main__":
    main()
