"""
3D 정귀찮 표준으로 augment + 기존 3D 프레임 재번호 정리

최종 구성:
- 01~10: 3D 앞모습 augment (캐릭터 표준.png)
- 11~15: 3D 뒷모습 augment (ChatGPT 뒷모습)
- 16~23: 3D 코딩 뒷모습 (이전 24~31 리네임)
- 24~28: 3D 퇴근 (이전 32~36 리네임)
총 28장
"""

import os, shutil
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

OUT  = r"dataset/10_jeonggwichan"
FRONT_PNG = r"char_clean.png"
BACK_PNG  = r"char_clean.png"
SIZE = 512

CAPTION_FRONT = "jeonggwichan, white round 3D mascot character, smooth matte white body, front view, standing pose, small arms with fingers, dot eyes, small open mouth, studio backdrop, soft lighting"
CAPTION_BACK  = "jeonggwichan, white round 3D mascot character, smooth matte white body, back view, standing pose, small arms with fingers, no face visible, studio backdrop, soft lighting"
CAPTION_CODING = "jeonggwichan, white round 3D mascot character, smooth matte white body, back view, sitting at desk, coding on computer, two monitors with code displayed, programmer workspace, office room"
CAPTION_LEAVING = "jeonggwichan, white round 3D mascot character, smooth matte white body, back view, sitting in office chair, monitors visible, leaving work scene, office room"

def fit_to_canvas(src_rgb, canvas_size, scale=1.0, dx=0, dy=0, bg=(220, 220, 220)):
    """3D 캐릭터를 회색 캔버스에 중앙 배치 (3D 배경 색감 유지)."""
    canvas = Image.new("RGB", (canvas_size, canvas_size), bg)
    cw, ch = src_rgb.size
    target = int(canvas_size * 0.92 * scale)
    ratio = target / max(cw, ch)
    new_w, new_h = int(cw * ratio), int(ch * ratio)
    resized = src_rgb.resize((new_w, new_h), Image.LANCZOS)
    x = (canvas_size - new_w) // 2 + dx
    y = (canvas_size - new_h) // 2 + dy
    canvas.paste(resized, (x, y))
    return canvas

def make_augments(src_path, idx_start, count, caption, tag):
    """주어진 PNG에서 count개 augment 생성."""
    src = Image.open(src_path).convert("RGB")
    print(f"\n[{tag}] 원본: {src.size}, 시작번호={idx_start}, {count}장 생성")

    augs = [
        ("base",         lambda s: fit_to_canvas(s, SIZE)),
        ("flip",         lambda s: fit_to_canvas(ImageOps.mirror(s), SIZE)),
        ("zoom_in",      lambda s: fit_to_canvas(s, SIZE, scale=1.10)),
        ("zoom_out",     lambda s: fit_to_canvas(s, SIZE, scale=0.85)),
        ("rot_plus",     lambda s: fit_to_canvas(s.rotate(6, resample=Image.BICUBIC, expand=True, fillcolor=(220,220,220)), SIZE)),
        ("rot_minus",    lambda s: fit_to_canvas(s.rotate(-6, resample=Image.BICUBIC, expand=True, fillcolor=(220,220,220)), SIZE)),
        ("bright_up",    lambda s: ImageEnhance.Brightness(fit_to_canvas(s, SIZE)).enhance(1.12)),
        ("bright_dn",    lambda s: ImageEnhance.Brightness(fit_to_canvas(s, SIZE)).enhance(0.90)),
        ("contrast",     lambda s: ImageEnhance.Contrast(fit_to_canvas(s, SIZE)).enhance(1.15)),
        ("sharpen",      lambda s: fit_to_canvas(s, SIZE).filter(ImageFilter.SHARPEN)),
        ("shift_left",   lambda s: fit_to_canvas(s, SIZE, dx=-25, dy=10)),
        ("flip_zoom",    lambda s: fit_to_canvas(ImageOps.mirror(s), SIZE, scale=1.08)),
        ("flip_rot",     lambda s: fit_to_canvas(ImageOps.mirror(s).rotate(4, resample=Image.BICUBIC, expand=True, fillcolor=(220,220,220)), SIZE)),
        ("sat_dn",       lambda s: ImageEnhance.Color(fit_to_canvas(s, SIZE)).enhance(0.7)),
        ("shift_right",  lambda s: fit_to_canvas(s, SIZE, dx=25, dy=-10)),
    ]

    for i in range(count):
        name_suffix, fn = augs[i]
        img = fn(src)
        idx = idx_start + i
        png = os.path.join(OUT, f"jeong_train_{idx:02d}_3d_{tag}_{name_suffix}.png")
        txt = png.replace(".png", ".txt")
        img.save(png)
        with open(txt, "w", encoding="utf-8") as f:
            f.write(caption)
        print(f"  ✓ jeong_train_{idx:02d}_3d_{tag}_{name_suffix}")

# 1) 기존 24~36 → 16~28로 재번호
print("[기존 3D 프레임 재번호: 24~36 → 16~28]")
rename_map = {}
for old_idx in range(24, 32):  # coding_back 8장 → 16~23
    new_idx = 16 + (old_idx - 24)
    rename_map[old_idx] = (new_idx, "coding_back", CAPTION_CODING)
for old_idx in range(32, 37):  # leaving_work 5장 → 24~28
    new_idx = 24 + (old_idx - 32)
    rename_map[old_idx] = (new_idx, "leaving_work", CAPTION_LEAVING)

# 안전한 2단계 리네임 (충돌 방지): tmp → final
all_files = os.listdir(OUT)
for f in all_files:
    parts = f.split("_")
    if len(parts) > 2 and parts[2].isdigit():
        old_idx = int(parts[2])
        if old_idx in rename_map:
            new_idx, tag, _ = rename_map[old_idx]
            ext = ".png" if f.endswith(".png") else ".txt"
            tmp_name = f"_tmp_{new_idx:02d}_3d_{tag}{ext}"
            os.rename(os.path.join(OUT, f), os.path.join(OUT, tmp_name))

# tmp → 최종 이름
for f in os.listdir(OUT):
    if f.startswith("_tmp_"):
        # _tmp_16_3d_coding_back.png → jeong_train_16_3d_coding_back.png
        new_name = "jeong_train" + f[4:]
        os.rename(os.path.join(OUT, f), os.path.join(OUT, new_name))

# 캡션 파일 업데이트 (재번호된 것들)
for old_idx, (new_idx, tag, caption) in rename_map.items():
    matching = [f for f in os.listdir(OUT) if f.startswith(f"jeong_train_{new_idx:02d}_3d_{tag}") and f.endswith(".txt")]
    for tf in matching:
        with open(os.path.join(OUT, tf), "w", encoding="utf-8") as fp:
            fp.write(caption)

print(f"  리네임 완료\n")

# 2) 3D 앞모습 augment 10장 (01~10)
make_augments(FRONT_PNG, idx_start=1, count=10, caption=CAPTION_FRONT, tag="front")

# 3) 3D 뒷모습 augment 5장 (11~15)
make_augments(BACK_PNG, idx_start=11, count=5, caption=CAPTION_BACK, tag="back")

# 4) 최종 확인
print("\n--- 최종 학습 데이터 ---")
files = sorted([f for f in os.listdir(OUT) if f.endswith(".png")])
for f in files:
    print(f"  {f}")
print(f"\n총 PNG: {len(files)}장")
