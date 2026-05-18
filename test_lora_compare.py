"""
Test each LoRA epoch with same seed + prompt for fair comparison.
"""
import json
import urllib.request
import time
import shutil
from pathlib import Path

SERVER = "http://127.0.0.1:8188"
COMFY_OUT = Path(r"C:\tool\pp\ComfyUI\output")
OUT_DIR = Path(r"C:\tool\pp\lora_test")
OUT_DIR.mkdir(parents=True, exist_ok=True)

LORAS = [
    ("epoch02", "jeonggwichan_v1-000002.safetensors"),
    ("epoch04", "jeonggwichan_v1-000004.safetensors"),
    ("epoch06", "jeonggwichan_v1-000006.safetensors"),
    ("epoch08", "jeonggwichan_v1-000008.safetensors"),
    ("epoch10", "jeonggwichan_v1.safetensors"),
]

POSITIVE = "jeonggwichan, white round mascot character, smiling happy, standing, white background"
NEGATIVE = "text, blurry, deformed, realistic, 3d, multiple characters"
SEED = 20260517


def build_wf(lora_name: str, label: str) -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": "dreamshaper_8.safetensors"}},
        "2": {"class_type": "LoraLoader",
              "inputs": {"model": ["1", 0], "clip": ["1", 1],
                         "lora_name": lora_name,
                         "strength_model": 0.8, "strength_clip": 0.8}},
        "3": {"class_type": "CLIPTextEncode",
              "inputs": {"text": POSITIVE, "clip": ["2", 1]}},
        "4": {"class_type": "CLIPTextEncode",
              "inputs": {"text": NEGATIVE, "clip": ["2", 1]}},
        "5": {"class_type": "EmptyLatentImage",
              "inputs": {"width": 512, "height": 512, "batch_size": 1}},
        "6": {"class_type": "KSampler",
              "inputs": {"seed": SEED, "steps": 25, "cfg": 7.0,
                         "sampler_name": "euler", "scheduler": "normal",
                         "denoise": 1.0,
                         "model": ["2", 0], "positive": ["3", 0],
                         "negative": ["4", 0], "latent_image": ["5", 0]}},
        "7": {"class_type": "VAEDecode",
              "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveImage",
              "inputs": {"images": ["7", 0],
                         "filename_prefix": f"lora_test_{label}"}},
    }


def queue(wf):
    body = json.dumps({"prompt": wf}).encode("utf-8")
    req = urllib.request.Request(f"{SERVER}/prompt", data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["prompt_id"]


def wait(pid, timeout=300):
    start = time.time()
    while True:
        with urllib.request.urlopen(f"{SERVER}/history/{pid}") as r:
            h = json.loads(r.read())
        if pid in h and h[pid].get("status", {}).get("completed"):
            return h[pid]
        if time.time() - start > timeout:
            raise TimeoutError(pid)
        time.sleep(1.0)


for label, lora_name in LORAS:
    wf = build_wf(lora_name, label)
    t0 = time.time()
    print(f"[{label}] {lora_name}")
    pid = queue(wf)
    result = wait(pid)
    for _, out in result.get("outputs", {}).items():
        for img in out.get("images", []):
            src = COMFY_OUT / img.get("subfolder", "") / img["filename"]
            dst = OUT_DIR / f"lora_test_{label}.png"
            shutil.copy2(src, dst)
            print(f"  -> {dst.name}  ({time.time()-t0:.1f}s)")

print("\nDone.")
