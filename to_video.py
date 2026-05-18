"""Convert the 16 PNG frames into MP4 + GIF."""
from pathlib import Path
import imageio.v3 as iio
import imageio_ffmpeg  # ensures bundled ffmpeg

SRC = Path(r"C:\tool\pp\anim_test")
frames = sorted(SRC.glob("jeong_anim_frame_*.png"))
print(f"frames: {len(frames)}")

imgs = [iio.imread(p) for p in frames]

# MP4 (h264, 8 fps, loops in any video player)
mp4_path = SRC / "jeong_anim.mp4"
iio.imwrite(mp4_path, imgs, fps=8, codec="libx264",
            output_params=["-pix_fmt", "yuv420p", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2"])
print(f"saved {mp4_path.name}  size={mp4_path.stat().st_size//1024} KB")

# GIF (Discord/Slack-friendly, infinite loop)
gif_path = SRC / "jeong_anim.gif"
iio.imwrite(gif_path, imgs, fps=8, loop=0)
print(f"saved {gif_path.name}  size={gif_path.stat().st_size//1024} KB")
