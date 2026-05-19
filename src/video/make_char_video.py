"""
animated WebP → 누끼(배경제거) → MP4 변환
scene1_coding_00001__anim.webp 기준으로 캐릭터 영상 생성
"""
import sys
from pathlib import Path
from PIL import Image
import numpy as np
import rembg
import imageio

INPUT = Path(r"C:\Users\jomg2\Downloads\comfy_output\scene1_coding_00001__anim.webp")
OUTPUT_DIR = Path(r"C:\tool\n8nproject\remotion-service\public\korini")
OUTPUT_MP4 = OUTPUT_DIR / "char_anim.mp4"
OUTPUT_WEBM = OUTPUT_DIR / "char_anim.webm"

def extract_webp_frames(path: Path) -> list:
    frames = []
    img = Image.open(path)
    try:
        while True:
            frame = img.copy().convert("RGBA")
            frames.append(frame)
            img.seek(img.tell() + 1)
    except EOFError:
        pass
    return frames

def remove_bg(frame: Image.Image) -> Image.Image:
    arr = np.array(frame.convert("RGBA"))
    result = rembg.remove(arr)
    return Image.fromarray(result, "RGBA")

def main():
    print(f"프레임 추출: {INPUT}")
    frames = extract_webp_frames(INPUT)
    print(f"  → {len(frames)}프레임")

    print("누끼 작업 중...")
    clean_frames = []
    for i, f in enumerate(frames):
        print(f"  [{i+1}/{len(frames)}]", end="\r", flush=True)
        clean = remove_bg(f)
        clean_frames.append(clean)
    print("\n완료")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # MP4로 저장 (흰 배경 합성)
    rgb_frames = []
    for f in clean_frames:
        bg = Image.new("RGB", f.size, (17, 17, 17))  # #111 배경
        bg.paste(f, mask=f.split()[3])
        rgb_frames.append(np.array(bg))

    imageio.mimwrite(str(OUTPUT_MP4), rgb_frames, fps=8, codec="libx264", quality=8)
    print(f"저장: {OUTPUT_MP4}")

    # 투명 WebM (alpha 지원)
    try:
        rgba_frames = [np.array(f) for f in clean_frames]
        imageio.mimwrite(str(OUTPUT_WEBM), rgba_frames, fps=8, codec="libvpx-vp9", pixelformat="yuva420p")
        print(f"저장: {OUTPUT_WEBM}")
    except Exception as e:
        print(f"WebM 실패 (무시): {e}")

if __name__ == "__main__":
    main()
