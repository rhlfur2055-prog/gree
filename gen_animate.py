"""
AnimateDiff workflow: jeonggwichan LoRA + dreamshaper_8 + mm_sd_v15_v2
16 frames, 8 fps, 512x512 loop animation.
"""
import json
import urllib.request
import time
import shutil
import sys
from pathlib import Path

SERVER = "http://127.0.0.1:8188"
COMFY_OUT = Path(r"C:\tool\pp\ComfyUI\output")
OUT_DIR = Path(r"C:\tool\pp\anim_test")
OUT_DIR.mkdir(parents=True, exist_ok=True)

LORA = "jeonggwichan_v1-000008.safetensors"   # best from comparison
MOTION_MODULE = "mm_sd_v15_v2.ckpt"

POSITIVE = ("jeonggwichan, white round mascot character, "
            "waving hand, bouncing, white background, clean lineart")
NEGATIVE = "text, blurry, deformed, realistic, 3d, watermark"
SEED = 42
FRAMES = 16
FPS = 8


def build_wf() -> dict:
    return {
        # 1) checkpoint
        "1": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": "dreamshaper_8.safetensors"}},
        # 2) LoRA
        "2": {"class_type": "LoraLoader",
              "inputs": {"model": ["1", 0], "clip": ["1", 1],
                         "lora_name": LORA,
                         "strength_model": 0.8, "strength_clip": 0.8}},
        # 3) AnimateDiff motion module loader (AD-Evolved node)
        "3": {"class_type": "ADE_AnimateDiffLoaderWithContext",
              "inputs": {
                  "model": ["2", 0],
                  "model_name": MOTION_MODULE,
                  "beta_schedule": "autoselect",
                  "context_options": ["4", 0],
              }},
        # 4) Context options for 16-frame batch
        "4": {"class_type": "ADE_StandardStaticContextOptions",
              "inputs": {
                  "context_length": 16,
                  "context_overlap": 4,
                  "fuse_method": "pyramid",
                  "use_on_equal_length": False,
                  "start_percent": 0.0, "guarantee_steps": 1,
              }},
        # 5) positive prompt
        "5": {"class_type": "CLIPTextEncode",
              "inputs": {"text": POSITIVE, "clip": ["2", 1]}},
        # 6) negative prompt
        "6": {"class_type": "CLIPTextEncode",
              "inputs": {"text": NEGATIVE, "clip": ["2", 1]}},
        # 7) empty latent (batch=FRAMES)
        "7": {"class_type": "EmptyLatentImage",
              "inputs": {"width": 512, "height": 512, "batch_size": FRAMES}},
        # 8) KSampler
        "8": {"class_type": "KSampler",
              "inputs": {"seed": SEED, "steps": 20, "cfg": 7.0,
                         "sampler_name": "euler", "scheduler": "normal",
                         "denoise": 1.0,
                         "model": ["3", 0], "positive": ["5", 0],
                         "negative": ["6", 0], "latent_image": ["7", 0]}},
        # 9) decode
        "9": {"class_type": "VAEDecode",
              "inputs": {"samples": ["8", 0], "vae": ["1", 2]}},
        # 10) save animated webp (built-in to ComfyUI)
        "10": {"class_type": "SaveAnimatedWEBP",
               "inputs": {"images": ["9", 0],
                          "filename_prefix": "jeong_anim",
                          "fps": FPS, "lossless": False,
                          "quality": 85, "method": "default"}},
        # 11) also save as PNG sequence for fallback
        "11": {"class_type": "SaveImage",
               "inputs": {"images": ["9", 0],
                          "filename_prefix": "jeong_anim_frame"}},
    }


def queue(wf):
    body = json.dumps({"prompt": wf}).encode("utf-8")
    req = urllib.request.Request(f"{SERVER}/prompt", data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())["prompt_id"]
    except urllib.error.HTTPError as e:
        print("HTTPError:", e.code, e.read().decode("utf-8", errors="replace"),
              file=sys.stderr)
        raise


def wait(pid, timeout=600):
    start = time.time()
    while True:
        with urllib.request.urlopen(f"{SERVER}/history/{pid}") as r:
            h = json.loads(r.read())
        if pid in h and h[pid].get("status", {}).get("completed"):
            return h[pid]
        if time.time() - start > timeout:
            raise TimeoutError(pid)
        time.sleep(2)


if __name__ == "__main__":
    wf = build_wf()
    print(f"[submit] LoRA={LORA}, motion={MOTION_MODULE}, frames={FRAMES} fps={FPS}")
    t0 = time.time()
    pid = queue(wf)
    print(f"[queued] {pid}")
    result = wait(pid, timeout=900)
    print(f"[done] {time.time()-t0:.1f}s")

    # copy outputs
    for nid, out in result.get("outputs", {}).items():
        for img in out.get("images", []):
            src = COMFY_OUT / img.get("subfolder", "") / img["filename"]
            dst = OUT_DIR / img["filename"]
            shutil.copy2(src, dst)
            print(f"   {nid}: {dst.name}")
