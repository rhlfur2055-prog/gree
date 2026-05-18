"""walk_anim.py
"뒤뚱뒤뚱 통캐릭터 swing" 워크 애니메이션. AI 미사용.

표본: C:\\tool\\pp\\comfy_input\\char_clean.png  (다리 분리 안 함)

24프레임 루프:
  - tilt = 6*sin(t)°       (발 중심 피벗으로 회전)
  - sway = round(5*sin(t)) (좌우 이동)
  - bob  = round(4*|sin(t)|) (수직 위로 튐)
  - 다리 하단(bbox 하위 25%) 가로 ±4% 스쿼시

출력:
  C:\\tool\\pp\\anim_final\\walk_frames\\f000~f023.png  (투명 RGBA)
  C:\\tool\\pp\\anim_final\\walk.mp4                    (12fps libx264 yuv420p, 흰배경)
  C:\\tool\\pp\\anim_final\\walk.gif                    (scale=300:-1)
"""
import math
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image
import imageio.v2 as imageio
import imageio_ffmpeg

SRC      = Path(r"C:\tool\pp\comfy_input\char_clean.png")
FRAMES   = Path(r"C:\tool\pp\anim_final\walk_frames")
OUT_MP4  = Path(r"C:\tool\pp\anim_final\walk.mp4")
OUT_GIF  = Path(r"C:\tool\pp\anim_final\walk.gif")
FRAMES.mkdir(parents=True, exist_ok=True)
OUT_MP4.parent.mkdir(parents=True, exist_ok=True)

NUM_FRAMES = 24
FPS        = 12
PAD        = 50

TILT_DEG     = 6.0
SWAY_PX      = 5.0
BOB_PX       = 4.0
SQUASH_FRAC  = 0.04   # ±4%
SQUASH_ZONE  = 0.75   # bottom 25% starts here (fraction of bbox height)


def char_bbox(src: Image.Image):
    a = np.array(src)
    mask = a[:, :, 3] > 30
    ys, xs = np.where(mask)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def make_squashed(src: Image.Image, bbox, t):
    x0, y0, x1, y1 = bbox
    bh = y1 - y0
    sw, sh = src.size
    y_split = y0 + int(bh * SQUASH_ZONE)

    top = src.crop((0, 0, sw, y_split))
    bot = src.crop((0, y_split, sw, sh))
    scale = 1.0 + SQUASH_FRAC * math.sin(t)
    new_w = max(1, int(round(bot.width * scale)))
    bot_scaled = bot.resize((new_w, bot.height), Image.LANCZOS)

    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    out.alpha_composite(top, (0, 0))
    cx = (x0 + x1) // 2
    out.alpha_composite(bot_scaled, (cx - new_w // 2, y_split))
    return out, scale


def flatten_on_white(img: Image.Image) -> Image.Image:
    bg = Image.new("RGB", img.size, (255, 255, 255))
    bg.paste(img, mask=img.split()[3])
    return bg


def main():
    src = Image.open(SRC).convert("RGBA")
    bbox = char_bbox(src)
    bw = bbox[2] - bbox[0]
    bh = bbox[3] - bbox[1]
    print(f"[src] size={src.size}  bbox={bbox}  bw={bw} bh={bh}")

    Cw = bw + 2 * PAD
    Ch = bh + 2 * PAD
    if Cw % 2: Cw += 1
    if Ch % 2: Ch += 1
    off_x = PAD - bbox[0]
    off_y = PAD - bbox[1]
    foot_cx = PAD + bw // 2
    foot_cy = PAD + bh
    print(f"[canvas] ({Cw}, {Ch})  offset=({off_x}, {off_y})  foot=({foot_cx}, {foot_cy})")

    rgb_frames = []
    for i in range(NUM_FRAMES):
        t     = 2 * math.pi * i / NUM_FRAMES
        s     = math.sin(t)
        tilt  = TILT_DEG * s
        sway  = int(round(SWAY_PX * s))
        bob   = int(round(BOB_PX * abs(s)))

        squashed, scale = make_squashed(src, bbox, t)

        layer = Image.new("RGBA", (Cw, Ch), (0, 0, 0, 0))
        layer.alpha_composite(squashed, (off_x, off_y))
        layer = layer.rotate(tilt, resample=Image.BICUBIC, center=(foot_cx, foot_cy))

        frame = Image.new("RGBA", (Cw, Ch), (0, 0, 0, 0))
        frame.alpha_composite(layer, (sway, -bob))

        frame.save(FRAMES / f"f{i:03d}.png")
        rgb_frames.append(np.array(flatten_on_white(frame)))

        if i in (6, 12):
            print(f"[dbg f{i:03d}]  tilt={tilt:+.3f}deg  sway={sway:+d}px  bob={bob:+d}px"
                  f"  squash_scale={scale:.4f}  foot_pivot=({foot_cx}, {foot_cy})")

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    print(f"[ffmpeg] {ffmpeg_exe}")

    writer = imageio.get_writer(
        str(OUT_MP4),
        fps=FPS,
        codec="libx264",
        quality=8,
        ffmpeg_params=["-pix_fmt", "yuv420p"],
    )
    for f in rgb_frames:
        writer.append_data(f)
    writer.close()
    print(f"[mp4] {OUT_MP4}")

    subprocess.run(
        [ffmpeg_exe, "-y", "-i", str(OUT_MP4), "-vf", "fps=12,scale=300:-1", str(OUT_GIF)],
        check=True, capture_output=True,
    )
    print(f"[gif] {OUT_GIF}")


if __name__ == "__main__":
    main()
