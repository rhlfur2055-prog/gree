"""compose_dev_story.py
코딩하는 졸라맨 개발자 수난기. 실모션 클립 + 자막 + 노트북 소품.
입력: C:\\tool\\pp\\anim_final\\<act>_frames\\f###.png  (auto_mocap.py 산출물)
출력: C:\\tool\\pp\\anim_final\\dev_story.mp4 / .gif
"""
import json
from pathlib import Path

import numpy as np
import imageio
from PIL import Image, ImageDraw, ImageFont

W, H = 368, 480
OUT = Path(r"C:\tool\pp\anim_final")
FPS = 24
FADE = 8

# (프레임폴더, 자막, 노트북표시, 화면색) — 수난기 순서
SCENES = [
    ("sit_real",        "오늘도 코딩 시작",        True,  (120, 200, 255)),
    ("idle_real",       "어 이게 왜 되지",          True,  (120, 200, 255)),
    ("think_real",      "에러 원인 추적 중",        True,  (255, 180, 90)),
    ("pickup_real",     "스택오버플로 뒤지는 중",   True,  (255, 180, 90)),
    ("walk_tired_real", "잠깐 머리 식히기",         False, None),
    ("point_real",      "범인은 세미콜론이었다",    True,  (255, 90, 90)),
    ("wave_real",       "재배포 가즈아",            True,  (120, 200, 255)),
    ("jump_real",       "드디어 됐다!!!",           False, None),
]


def load_clip(folder):
    fd = OUT / f"{folder}_frames"
    if not fd.exists():
        fd = OUT / folder
    files = sorted(fd.glob("f*.png"))
    return [Image.open(p).convert("RGBA") for p in files]


def add_laptop(img, screen):
    """앉은 졸라맨 앞에 노트북 소품 (좌표 기반)."""
    im = img.copy()
    d = ImageDraw.Draw(im)
    bx, by = W // 2, int(H * 0.78)
    d.rectangle([bx - 58, by, bx + 58, by + 11],
                fill=(60, 60, 60, 255))
    d.polygon([(bx - 52, by), (bx + 52, by),
               (bx + 44, by - 50), (bx - 44, by - 50)],
              fill=(40, 40, 40, 255), outline=(20, 20, 20, 255))
    d.rectangle([bx - 37, by - 45, bx + 37, by - 6],
                fill=(*screen, 255))
    return im


def add_desk(img, jpath, idx):
    """프레임 idx의 양손 위치 아래에 책상+노트북 (좌표 종속)."""
    im = img.copy()
    d = ImageDraw.Draw(im)
    try:
        with open(jpath) as f:
            J = json.load(f)
        j = J[min(idx, len(J) - 1)]
        lh = j.get("LeftHand"); rh = j.get("RightHand")
        if not lh or not rh:
            return im
        hx = (lh[0] + rh[0]) / 2
        hy = max(lh[1], rh[1]) + 8
    except Exception:
        hx, hy = W / 2, H * 0.74
    bx, by = int(hx), int(hy)
    d.rectangle([0, by + 14, W, by + 22], fill=(95, 70, 50, 255))
    d.rectangle([bx - 52, by, bx + 52, by + 14],
                fill=(60, 60, 60, 255))
    d.polygon([(bx - 47, by), (bx + 47, by),
               (bx + 40, by - 44), (bx - 40, by - 44)],
              fill=(40, 40, 40, 255), outline=(20, 20, 20, 255))
    d.rectangle([bx - 33, by - 40, bx + 33, by - 5],
                fill=(120, 200, 255, 255))
    return im


def caption(img, text):
    im = img.copy()
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("malgun.ttf", 27)
    except OSError:
        font = ImageFont.load_default()
    bb = d.textbbox((0, 0), text, font=font)
    x = (W - (bb[2] - bb[0])) // 2
    y = 38
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
    for folder, text, lap, screen in SCENES:
        frames = load_clip(folder)
        jpath = OUT / f"{folder}_frames" / "joints.json"
        proc = []
        for i, f in enumerate(frames):
            g = add_desk(f, jpath, i) if lap else f
            proc.append(caption(g, text))
        clips.append(proc)

    out = []
    for ci, frames in enumerate(clips):
        rgb = [np.array(flatten(f)) for f in frames]
        if ci == 0:
            out.extend(rgb)
        else:
            prev = out[-FADE:]
            del out[-FADE:]
            for k in range(FADE):
                a = k / FADE
                out.append((prev[k] * (1 - a) +
                            rgb[k] * a).astype(np.uint8))
            out.extend(rgb[FADE:])

    imageio.mimsave(OUT / "dev_story.mp4", out, fps=FPS,
                    codec="libx264", quality=8)
    gw = 300
    gif = [Image.fromarray(f).resize(
        (gw, int(H * gw / W)), Image.NEAREST) for f in out[::2]]
    gif[0].save(OUT / "dev_story.gif", save_all=True,
                append_images=gif[1:],
                duration=int(1000 / (FPS / 2)), loop=0, disposal=2)
    m = OUT / "dev_story.mp4"
    print(f"dev_story: {len(out)}프레임 / {len(out)/FPS:.1f}초 "
          f"-> {m.name} ({m.stat().st_size // 1024}KB)")


if __name__ == "__main__":
    main()
