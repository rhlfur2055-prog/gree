"""
Augment 1.png into 15 LoRA training images.
- 512x512, white background, centered character
- Subtle augmentations only (LoRA learns the character, not the augmentation)
"""
from PIL import Image, ImageOps, ImageEnhance
from pathlib import Path

SRC = Path(r"C:\tool\pp\1.png")
OUT = Path(r"C:\tool\pp\dataset")
OUT.mkdir(parents=True, exist_ok=True)

def composite_white(img: Image.Image) -> Image.Image:
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, "white")
        bg.paste(img, mask=img.split()[3])
        return bg
    return img.convert("RGB")

def fit_square(img: Image.Image, size: int = 512) -> Image.Image:
    w, h = img.size
    s = min(size / w, size / h)
    nw, nh = int(w * s), int(h * s)
    resized = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), "white")
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2))
    return canvas

def zoom_in(img: Image.Image, factor: float) -> Image.Image:
    w, h = img.size
    cw, ch = int(w / factor), int(h / factor)
    left = (w - cw) // 2
    top = (h - ch) // 2
    cropped = img.crop((left, top, left + cw, top + ch))
    return cropped.resize((w, h), Image.LANCZOS)

def zoom_out(img: Image.Image, factor: float) -> Image.Image:
    w, h = img.size
    nw, nh = int(w * factor), int(h * factor)
    small = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), "white")
    canvas.paste(small, ((w - nw) // 2, (h - nh) // 2))
    return canvas

def rotate_white(img: Image.Image, deg: float) -> Image.Image:
    return img.rotate(deg, resample=Image.BICUBIC, fillcolor="white")

def shift(img: Image.Image, dx: int, dy: int) -> Image.Image:
    w, h = img.size
    canvas = Image.new("RGB", (w, h), "white")
    canvas.paste(img, (dx, dy))
    return canvas

src = composite_white(Image.open(SRC))
base = fit_square(src, 512)

variants = [
    ("01_base",          base),
    ("02_flip",          ImageOps.mirror(base)),
    ("03_zoom_in",       zoom_in(base, 1.10)),
    ("04_zoom_out",      zoom_out(base, 0.85)),
    ("05_rot_plus",      rotate_white(base, 5)),
    ("06_rot_minus",     rotate_white(base, -5)),
    ("07_bright_up",     ImageEnhance.Brightness(base).enhance(1.08)),
    ("08_bright_dn",     ImageEnhance.Brightness(base).enhance(0.94)),
    ("09_contrast",      ImageEnhance.Contrast(base).enhance(1.12)),
    ("10_sat_up",        ImageEnhance.Color(base).enhance(1.18)),
    ("11_sat_dn",        ImageEnhance.Color(base).enhance(0.85)),
    ("12_sharpen",       ImageEnhance.Sharpness(base).enhance(1.6)),
    ("13_flip_zoom",     zoom_in(ImageOps.mirror(base), 1.08)),
    ("14_flip_rot",      rotate_white(ImageOps.mirror(base), -4)),
    ("15_shift_bright",  ImageEnhance.Brightness(shift(base, 12, -6)).enhance(1.05)),
]

for name, img in variants:
    fp = OUT / f"jeong_train_{name}.png"
    img.save(fp, "PNG", optimize=True)
    print(f"  saved {fp.name}  size={img.size}  mode={img.mode}")

print(f"\n[done] 15 images in {OUT}")
