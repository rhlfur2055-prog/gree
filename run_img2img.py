import json
import urllib.request
import urllib.error
import time
import random
import shutil
import sys
from pathlib import Path

SERVER = "http://127.0.0.1:8188"
OUTPUT_DIR = Path(r"C:\tool\pp\output")
COMFY_OUTPUT = Path(r"C:\tool\pp\ComfyUI\output")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

INPUT_IMAGE = "정귀찮.png"

BASE_POSITIVE = (
    "korean webtoon style, cel shading, clean lines, "
    "white round character, vibrant colors, "
    "masterpiece, best quality, sharp lines"
)
NEGATIVE = (
    "low quality, blurry, deformed, text, watermark, signature, "
    "realistic, 3d, photo, ugly, bad anatomy"
)

EXPRESSIONS = [
    ("default", "neutral expression, calm face, soft eyes"),
    ("angry", "angry expression, furrowed brow, frowning mouth, red cheeks"),
    ("sad",   "sad expression, teary eyes, downturned mouth, droopy"),
]


def build_workflow(seed: int) -> dict:
    wf: dict = {}
    wf["1"] = {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {"ckpt_name": "dreamshaper_8.safetensors"},
    }
    wf["2"] = {
        "class_type": "LoadImage",
        "inputs": {"image": INPUT_IMAGE},
    }
    wf["3"] = {
        "class_type": "ImageScale",
        "inputs": {
            "image": ["2", 0],
            "upscale_method": "lanczos",
            "width": 512,
            "height": 512,
            "crop": "center",
        },
    }
    wf["4"] = {
        "class_type": "VAEEncode",
        "inputs": {"pixels": ["3", 0], "vae": ["1", 2]},
    }
    wf["5"] = {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": NEGATIVE, "clip": ["1", 1]},
    }

    nid = 10
    for name, expr in EXPRESSIONS:
        full = f"{BASE_POSITIVE}, {expr}"
        pos = str(nid); nid += 1
        ks  = str(nid); nid += 1
        vd  = str(nid); nid += 1
        rm  = str(nid); nid += 1
        sv  = str(nid); nid += 1

        wf[pos] = {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": full, "clip": ["1", 1]},
        }
        wf[ks] = {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": 25,
                "cfg": 7.0,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": 0.65,
                "model": ["1", 0],
                "positive": [pos, 0],
                "negative": ["5", 0],
                "latent_image": ["4", 0],
            },
        }
        wf[vd] = {
            "class_type": "VAEDecode",
            "inputs": {"samples": [ks, 0], "vae": ["1", 2]},
        }
        wf[rm] = {
            "class_type": "RMBG",
            "inputs": {
                "image": [vd, 0],
                "model": "INSPYRENET",
                "sensitivity": 1.0,
                "process_res": 1024,
                "mask_blur": 0,
                "mask_offset": 0,
                "invert_output": False,
                "refine_foreground": True,
                "background": "Alpha",
                "background_color": "#222222",
            },
        }
        wf[sv] = {
            "class_type": "SaveImage",
            "inputs": {
                "images": [rm, 0],
                "filename_prefix": f"webtoon_{name}",
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


def get_history(prompt_id: str) -> dict:
    with urllib.request.urlopen(f"{SERVER}/history/{prompt_id}") as r:
        return json.loads(r.read())


def main() -> int:
    seed = random.randint(1, 2**31 - 1)
    wf = build_workflow(seed)
    print(f"[submit] seed={seed}")
    pid = queue_prompt(wf)
    print(f"[queued] prompt_id={pid}")

    print("[wait] polling /history ...")
    start = time.time()
    while True:
        h = get_history(pid)
        if pid in h and h[pid].get("status", {}).get("completed"):
            break
        if time.time() - start > 900:
            print("[error] timeout (15min)", file=sys.stderr)
            return 1
        time.sleep(2)

    outputs = h[pid]["outputs"]
    saved = []
    for _, out in outputs.items():
        for img in out.get("images", []):
            src = COMFY_OUTPUT / img.get("subfolder", "") / img["filename"]
            dst = OUTPUT_DIR / img["filename"]
            shutil.copy2(src, dst)
            saved.append(dst)
            print(f"[saved] {dst}")

    print(f"\n[done] {len(saved)} files in {OUTPUT_DIR} ({time.time()-start:.1f}s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
