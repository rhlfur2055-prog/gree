"""
Generate 15 LoRA training images of 정귀찮 from C:\\tool\\pp\\1.png.
- img2img with denoise 0.35 (mid of 0.3~0.4 — identity-preserving)
- 512x512 center-crop / resize
- INSPYRENET background removal -> white solid background
- 10 expressions + 5 poses
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

INPUT_IMAGE = "jeong_source.png"  # already copied into ComfyUI/input/

BASE_POSITIVE = (
    "white round mascot character, simple cute design, "
    "clean lines, sharp lines, korean webtoon style, "
    "single character, centered, masterpiece, best quality"
)
NEGATIVE = (
    "low quality, blurry, deformed, text, watermark, signature, "
    "realistic, 3d, photo, ugly, bad anatomy, multiple characters, "
    "extra limbs, cropped, off-center"
)

# (filename, expression_prompt, pose_prompt) — 10 expressions + 5 poses
ITEMS = [
    # Expressions (camera stays close, pose mostly unchanged)
    ("01_smile_a",    "wide bright smile, happy joyful expression, eyes curved in joy",            "facing forward"),
    ("02_smile_b",    "soft gentle smile, slight grin, content peaceful expression",                "facing forward"),
    ("03_angry_a",    "angry expression, furrowed brow, frowning mouth, red cheeks",                "facing forward"),
    ("04_angry_b",    "furious shouting expression, open mouth, intense angry eyes",                "facing forward"),
    ("05_sad_a",      "sad expression, teary eyes, downturned mouth, droopy face",                  "facing forward"),
    ("06_sad_b",      "crying expression, big tears streaming, sobbing mouth",                      "facing forward"),
    ("07_surprised_a","surprised expression, wide open eyes, small open mouth",                     "facing forward"),
    ("08_surprised_b","shocked expression, raised eyebrows, gasping wide mouth",                    "facing forward"),
    ("09_neutral_a",  "neutral expression, calm face, soft relaxed eyes",                           "facing forward"),
    ("10_neutral_b",  "blank expression, looking forward, deadpan stoic face",                      "facing forward"),
    # Poses (full body emphasis)
    ("11_pose_standing","neutral expression, calm face",   "full body, standing upright pose, arms relaxed at sides"),
    ("12_pose_handsup", "happy expression, smiling",       "full body, both arms raised high cheering pose"),
    ("13_pose_sitting", "neutral expression, calm face",   "full body, sitting down cross-legged pose"),
    ("14_pose_pointing","confident expression, slight smile","full body, one arm pointing forward pose"),
    ("15_pose_waving",  "friendly smile",                  "full body, one hand raised waving greeting pose"),
]


def build_workflow(seed: int, name: str, expr: str, pose: str, denoise: float) -> dict:
    full_pos = f"{BASE_POSITIVE}, {expr}, {pose}"
    wf = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "dreamshaper_8.safetensors"},
        },
        "2": {
            "class_type": "LoadImage",
            "inputs": {"image": INPUT_IMAGE},
        },
        "3": {
            "class_type": "ImageScale",
            "inputs": {
                "image": ["2", 0],
                "upscale_method": "lanczos",
                "width": 512,
                "height": 512,
                "crop": "center",
            },
        },
        "4": {
            "class_type": "VAEEncode",
            "inputs": {"pixels": ["3", 0], "vae": ["1", 2]},
        },
        "5": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": NEGATIVE, "clip": ["1", 1]},
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": full_pos, "clip": ["1", 1]},
        },
        "7": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": 28,
                "cfg": 6.5,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": denoise,
                "model": ["1", 0],
                "positive": ["6", 0],
                "negative": ["5", 0],
                "latent_image": ["4", 0],
            },
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["7", 0], "vae": ["1", 2]},
        },
        "9": {
            "class_type": "RMBG",
            "inputs": {
                "image": ["8", 0],
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
        "10": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["9", 0],
                "filename_prefix": f"jeong_train_{name}",
            },
        },
    }
    return wf


def queue_prompt(wf: dict) -> str:
    body = json.dumps({"prompt": wf}).encode("utf-8")
    req = urllib.request.Request(
        f"{SERVER}/prompt",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            res = json.loads(r.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        print(f"HTTPError {e.code}: {err}", file=sys.stderr)
        raise
    return res["prompt_id"]


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
    base_seed = 42
    for i, (name, expr, pose) in enumerate(ITEMS):
        seed = base_seed + i * 31
        denoise = 0.35 if i < 10 else 0.40  # poses need slightly more change
        wf = build_workflow(seed, name, expr, pose, denoise)
        t0 = time.time()
        print(f"[{i+1:>2}/15] {name}  seed={seed} denoise={denoise}  expr='{expr[:40]}...'")
        pid = queue_prompt(wf)
        result = wait_done(pid)
        outs = result.get("outputs", {})
        for _, out in outs.items():
            for img in out.get("images", []):
                src = COMFY_OUTPUT / img.get("subfolder", "") / img["filename"]
                # use unified filename: jeong_train_01_smile_a.png
                dst = DATASET_DIR / f"jeong_train_{name}.png"
                shutil.copy2(src, dst)
                print(f"        -> {dst.name}  ({time.time()-t0:.1f}s)")
        # tiny pause to keep server happy
        time.sleep(0.3)
    print(f"\n[done] 15 images saved to {DATASET_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
