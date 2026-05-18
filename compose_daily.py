"""compose_daily.py
실모션 6클립 → 일상 스토리 1편. 자막 + 페이드 전환.
입력: C:\\tool\\pp\\anim_final\\<act>_frames\\f###.png
출력: C:\\tool\\pp\\anim_final\\daily_life.mp4 / .gif
"""
from pathlib import Path

import numpy as np
import imageio
from PIL import Image, ImageDraw, ImageFont

W, H = 368, 480
OUT = Path(r"C:\tool\pp\anim_final")
FPS = 24
FADE = 8                       # 클립간 크로스페이드 프레임수

# (프레임폴더, 자막) — 스토리 순서
SCENES = [
    ("idle_real",       "아침, 또 하루"),
    ("walk_tired_real", "출근길"),
    ("sit_real",        "자리에 앉는다"),
    ("pickup_real",     "일이 쏟아진다"),
    ("wave_real",       "드디어 퇴근"),
    ("jump_real",       "자유다!"),
]


def load_clip(folder):
    fd = OUT / f"{folder}_frames"
    files = sorted(fd.glob("f*.png"))
    return [Image.open(p).convert("RGBA") for p in files]


def caption(img, text):
    im = img.copy()
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("malgun.ttf", 28)
    except OSError:
        font = ImageFont.load_default()
    bb = d.textbbox((0, 0), text, font=font)
    x = (W - (bb[2] - bb[0])) // 2
    y = 40
    for ox in (-2, 2):
        for oy in (-2, 2):
            d.text((x + ox, y + oy), text, font=font,
                   fill=(255, 255, 255, 255))
    d.text((x, y), text, font=font, fill=(30, 30, 30, 255))
    return im


def flatten(img):
    bg = Image.new("RGB", (W, H), (255, 255, 255))
    bg.paste(img, mask=img.split()[3])
    return bg


def main():
    clips = []
    for folder, text in SCENES:
        frames = [caption(f, text) for f in load_clip(folder)]
        clips.append(frames)

    out = []
    for ci, frames in enumerate(clips):
        rgb = [np.array(flatten(f)) for f in frames]
        if ci == 0:
            out.extend(rgb)
        else:
            prev = out[-FADE:]
            del out[-FADE:]
            for k in range(FADE):                     # 크로스페이드
                a = k / FADE
                blend = (prev[k] * (1 - a) +
                         rgb[k] * a).astype(np.uint8)
                out.append(blend)
            out.extend(rgb[FADE:])

    imageio.mimsave(OUT / "daily_life.mp4", out, fps=FPS,
                    codec="libx264", quality=8)
    gw = 300
    gif = [Image.fromarray(f).resize(
        (gw, int(H * gw / W)), Image.NEAREST) for f in out[::2]]
    gif[0].save(OUT / "daily_life.gif", save_all=True,
                append_images=gif[1:], duration=int(1000 / (FPS / 2)),
                loop=0, disposal=2)
    sec = len(out) / FPS
    m = OUT / "daily_life.mp4"
    print(f"daily_life: {len(out)}프레임 / {sec:.1f}초 "
          f"-> {m.name} ({m.stat().st_size // 1024}KB)")


if __name__ == "__main__":
    main()
