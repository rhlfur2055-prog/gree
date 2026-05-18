"""
정귀찮 누끼 PNG → 15장 augment
- 흰 배경 합성 (LoRA 학습용)
- flip, zoom, rotation, brightness, saturation, contrast, sharpen, shift
- 512x512 출력
"""

import os, random
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

SRC  = r"char_clean.png"
OUT  = r"dataset/10_jeonggwichan"
SIZE = 512

CAPTION = "jeonggwichan, white round mascot character, simple cartoon, black outline, dot eyes, small pink open mouth, short arms and legs, sitting pose, white background"

def fit_to_canvas(rgba_char, canvas_size, scale=1.0, dx=0, dy=0):
    """캐릭터를 흰 배경 캔버스에 중앙 배치."""
    canvas = Image.new("RGB", (canvas_size, canvas_size), (255, 255, 255))
    cw, ch = rgba_char.size
    target = int(canvas_size * 0.85 * scale)
    ratio = target / max(cw, ch)
    new_w, new_h = int(cw * ratio), int(ch * ratio)
    resized = rgba_char.resize((new_w, new_h), Image.LANCZOS)
    x = (canvas_size - new_w) // 2 + dx
    y = (canvas_size - new_h) // 2 + dy
    canvas.paste(resized.convert("RGBA"), (x, y), resized)
    return canvas

# ── 원본 로드 ─────────────────────────────────────────────────────
src = Image.open(SRC).convert("RGBA")
print(f"원본: {src.size}")

# ── augment 15장 정의 ─────────────────────────────────────────────
augs = [
    ("01_base",         lambda: fit_to_canvas(src, SIZE)),
    ("02_flip",         lambda: fit_to_canvas(ImageOps.mirror(src), SIZE)),
    ("03_zoom_in",      lambda: fit_to_canvas(src, SIZE, scale=1.15)),
    ("04_zoom_out",     lambda: fit_to_canvas(src, SIZE, scale=0.80)),
    ("05_rot_plus",     lambda: fit_to_canvas(src.rotate(8, resample=Image.BICUBIC, expand=True), SIZE)),
    ("06_rot_minus",    lambda: fit_to_canvas(src.rotate(-8, resample=Image.BICUBIC, expand=True), SIZE)),
    ("07_bright_up",    lambda: ImageEnhance.Brightness(fit_to_canvas(src, SIZE)).enhance(1.15)),
    ("08_bright_dn",    lambda: ImageEnhance.Brightness(fit_to_canvas(src, SIZE)).enhance(0.88)),
    ("09_contrast",     lambda: ImageEnhance.Contrast(fit_to_canvas(src, SIZE)).enhance(1.20)),
    ("10_sat_up",       lambda: ImageEnhance.Color(fit_to_canvas(src, SIZE)).enhance(1.30)),
    ("11_sat_dn",       lambda: ImageEnhance.Color(fit_to_canvas(src, SIZE)).enhance(0.70)),
    ("12_sharpen",      lambda: fit_to_canvas(src, SIZE).filter(ImageFilter.SHARPEN)),
    ("13_flip_zoom",    lambda: fit_to_canvas(ImageOps.mirror(src), SIZE, scale=1.10)),
    ("14_flip_rot",     lambda: fit_to_canvas(ImageOps.mirror(src).rotate(5, resample=Image.BICUBIC, expand=True), SIZE)),
    ("15_shift_bright", lambda: ImageEnhance.Brightness(fit_to_canvas(src, SIZE, dx=20, dy=-15)).enhance(1.08)),
]

for name, fn in augs:
    img = fn()
    png_path = os.path.join(OUT, f"jeong_train_{name}.png")
    txt_path = os.path.join(OUT, f"jeong_train_{name}.txt")
    img.save(png_path)
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(CAPTION)
    print(f"  ✓ {name}")

print(f"\n완료. {OUT}")
