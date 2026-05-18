"""
v2: ControlNet (lineart) + denoise 0.75 + dreamshaper_8
- lineart preprocessor freezes the silhouette of 1.png
- denoise 0.75 lets expression / pose actually change
- 15 images: 10 expressions + 5 poses, 512x512, white background
"""
import json
import urllib.request
import urllib.error
import time
import shutil
import sys
from pathlib import Path

SERVER = "http://127.0.0.1:8188"
COMFY_OUTPUT = Path(r"C:\tool\pp\ComfyUI\output")
DATASET_DIR = Path(r"C:\tool\pp\dataset")
DATASET_DIR.mkdir(parents=True, exist_ok=True)

INPUT_IMAGE = "jeong_source.png"  # in ComfyUI/input/

BASE_POSITIVE = (
    "white round mascot character, simple cute design, "
    "clean black outlines, flat colors, korean webtoon style, "
    "single character, full body, centered, white background, "
    "masterpiece, best quality"
)
NEGATIVE = (
    "low quality, blurry, deformed, text, watermark, signature, "
    "realistic, 3d, photo, ugly, bad anatomy, multiple characters, "
    "extra limbs, cropped, off-center, dark background, complex background"
)

# (filename, expression_prompt, pose_prompt, controlnet_strength)
# pose images relax ControlNet to allow body change
ITEMS = [
    ("01_smile_a",     "wide bright smile, happy joyful face, eyes curved upward in joy",   "holding pillow",      0.95),
    ("02_smile_b",     "soft gentle smile, slight grin, content peaceful face",             "holding pillow",      0.95),
    ("03_angry_a",     "angry face, furrowed brow, frowning mouth, red cheeks",             "holding pillow",      0.95),
    ("04_angry_b",     "furious shouting face, open mouth shouting, intense angry eyes",    "holding pillow",      0.95),
    ("05_sad_a",       "sad face, teary eyes, downturned mouth, droopy expression",         "holding pillow",      0.95),
    ("06_sad_b",       "crying face, big tears streaming down, sobbing open mouth",         "holding pillow",      0.95),
    ("07_surprised_a", "surprised face, very wide open eyes, small round mouth",            "holding pillow",      0.95),
    ("08_surprised_b", "shocked face, raised eyebrows, gasping wide open mouth",            "holding pillow",      0.95),
    ("09_neutral_a",   "neutral face, calm expression, soft relaxed eyes",                  "holding pillow",      0.95),
    ("10_neutral_b",   "blank deadpan face, eyes half closed, stoic look",                  "holding pillow",      0.95),
    # Poses: ControlNet strength raised to 0.75 to keep identity while allowing body change
    ("11_pose_standing","neutral calm face",      "full body standing upright, arms hanging at sides, no pillow",  0.75),
    ("12_pose_handsup", "happy smiling face",     "full body, both arms raised high in cheering pose, no pillow",  0.75),
    ("13_pose_sitting", "neutral calm face",      "full body sitting down cross-legged, hands on knees, no pillow",0.75),
    ("14_pose_pointing","confident smiling face", "full body, one arm extended pointing forward, no pillow",       0.75),
    ("15_pose_waving",  "friendly smile",         "full body, one hand raised waving hello, no pillow",            0.75),
]


def build_workflow(seed: int, name: str, expr: str, pose: str, cn_strength: float) -> dict:
    full_pos = f"{BASE_POSITIVE}, {expr}, {pose}"
    return {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "dreamshaper_8.safetensors"},
        },
        "2": {
            "class_type": "LoadImage",
            "inputs": {"image": INPUT_IMAGE},
        },
        "3": {  # 512x512 reference
            "class_type": "ImageScale",
            "inputs": {
                "image": ["2", 0],
                "upscale_method": "lanczos",
                "width": 512, "height": 512, "crop": "center",
            },
        },
        "4": {  # lineart preprocessor
            "class_type": "LineArtPreprocessor",
            "inputs": {"image": ["3", 0], "resolution": 512, "coarse": "disable"},
        },
        "5": {
            "class_type": "ControlNetLoader",
            "inputs": {"control_net_name": "control_v11p_sd15_lineart.pth"},
        },
        "6": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 512, "height": 512, "batch_size": 1},
        },
        "7": {  # positive
            "class_type": "CLIPTextEncode",
            "inputs": {"text": full_pos, "clip": ["1", 1]},
        },
        "8": {  # negative
            "class_type": "CLIPTextEncode",
            "inputs": {"text": NEGATIVE, "clip": ["1", 1]},
        },
        "9": {  # apply controlnet to positive conditioning
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {
                "positive": ["7", 0],
                "negative": ["8", 0],
                "control_net": ["5", 0],
                "image": ["4", 0],
                "strength": cn_strength,
                "start_percent": 0.0,
                "end_percent": 0.9,
            },
        },
        "10": {  # main sampler - txt2img with controlnet (denoise 1.0 on empty latent)
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": 28,
                "cfg": 7.0,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": 1.0,  # full denoise on empty latent; ControlNet preserves structure
                "model": ["1", 0],
                "positive": ["9", 0],
                "negative": ["9", 1],
                "latent_image": ["6", 0],
            },
        },
        "11": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["10", 0], "vae": ["1", 2]},
        },
        "12": {  # background removal + white background
            "class_type": "RMBG",
            "inputs": {
                "image": ["11", 0],
                "model": "INSPYRENET",
                "sensitivity": 1.0,
                "process_res": 1024,
                "mask_blur": 0,
                "mask_offset": 0,
                "invert_output": False,
                "refine_foreground": True,
                "background": "Color",
                "background_color": "#FFFFFF",
            },
        },
        "13": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["12", 0],
                "filename_prefix": f"jeong_train_{name}",
            },
        },
    }


def queue_prompt(wf: dict) -> str:
    body = json.dumps({"prompt": wf}).encode("utf-8")
    req = urllib.request.Request(
        f"{SERVER}/prompt", data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())["prompt_id"]
    except urllib.error.HTTPError as e:
        print(f"HTTPError {e.code}: {e.read().decode('utf-8', errors='replace')}", file=sys.stderr)
        raise


def wait_done(pid: str, timeout: float = 600) -> dict:
    start = time.time()
    while True:
        with urllib.request.urlopen(f"{SERVER}/history/{pid}") as r:
            h = json.loads(r.read())
        if pid in h and h[pid].get("status", {}).get("completed"):
            return h[pid]
        if time.time() - start > timeout:
            raise TimeoutError(f"timed out waiting for {pid}")
        time.sleep(1.5)


def main() -> int:
    base_seed = 1337
    for i, (name, expr, pose, cn) in enumerate(ITEMS):
        seed = base_seed + i * 41
        wf = build_workflow(seed, name, expr, pose, cn)
        t0 = time.time()
        print(f"[{i+1:>2}/15] {name}  seed={seed} cn_strength={cn}  '{expr[:35]}...'")
        try:
            pid = queue_prompt(wf)
            result = wait_done(pid)
        except Exception as e:
            print(f"   FAIL: {e}", file=sys.stderr)
            return 1
        outs = result.get("outputs", {})
        for _, out in outs.items():
            for img in out.get("images", []):
                src = COMFY_OUTPUT / img.get("subfolder", "") / img["filename"]
                dst = DATASET_DIR / f"jeong_train_{name}.png"
                shutil.copy2(src, dst)
                print(f"        -> {dst.name}  ({time.time()-t0:.1f}s)")
        time.sleep(0.3)
    print(f"\n[done] 15 images saved to {DATASET_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
