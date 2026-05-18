"""
Copy 15 dataset images to D:\\lora_train\\... and write matching .txt captions.

Caption format spec:
  jeonggwichan, white round mascot character, [expression], [pose], white background

All 15 images are augmentations of the same single reference, so expression/pose
are uniform: sleepy half-closed eyes / holding small blue pillow.
"""
import shutil
from pathlib import Path

SRC_DIR = Path(r"C:\tool\pp\dataset")
DST_DIR = Path(r"D:\lora_train\jeonggwichan\img\10_jeonggwichan")
DST_DIR.mkdir(parents=True, exist_ok=True)

CAPTION = (
    "jeonggwichan, white round mascot character, "
    "sleepy half-closed eyes neutral expression, "
    "standing holding small blue pillow with both hands, "
    "white background"
)

count = 0
for png in sorted(SRC_DIR.glob("jeong_train_*.png")):
    dst_png = DST_DIR / png.name
    shutil.copy2(png, dst_png)
    dst_txt = DST_DIR / (png.stem + ".txt")
    dst_txt.write_text(CAPTION, encoding="utf-8")
    print(f"  {png.name}  +  {dst_txt.name}")
    count += 1

print(f"\n[done] {count} png + {count} txt -> {DST_DIR}")
