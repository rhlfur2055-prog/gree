"""
Generate animation: 정귀찮 standing next to a chalkboard, holding chalk.
16 frames, 8 fps, 512x288 (16:9-ish, wide enough for chalkboard).
"""
import json, urllib.request, time, shutil, sys
from pathlib import Path

SERVER = "http://127.0.0.1:8188"
COMFY_OUT = Path(r"C:\tool\pp\ComfyUI\output")
OUT_DIR = Path(r"C:\tool\pp\anim_chalk")
OUT_DIR.mkdir(parents=True, exist_ok=True)

LORA = "jeonggwichan_v1-000008.safetensors"
MOTION = "mm_sd_v15_v2.ckpt"

POSITIVE = (
    "jeonggwichan, white round mascot character, "
    "standing next to a large green chalkboard, "
    "holding a piece of white chalk, classroom scene, "
    "simple cute style, clean lineart, white background"
)
NEGATIVE = (
    "text, letters, writing on board, words on chalkboard, "
    "blurry, deformed, realistic, 3d, watermark, signature, "
    "multiple characters, ugly"
)
SEED = 7777
FRAMES = 16
FPS = 8
W, H = 768, 432  # 16:9, big enough for chalkboard

WF = {
    "1": {"class_type": "CheckpointLoaderSimple",
          "inputs": {"ckpt_name": "dreamshaper_8.safetensors"}},
    "2": {"class_type": "LoraLoader",
          "inputs": {"model": ["1", 0], "clip": ["1", 1],
                     "lora_name": LORA,
                     "strength_model": 0.8, "strength_clip": 0.8}},
    "3": {"class_type": "ADE_AnimateDiffLoaderWithContext",
          "inputs": {"model": ["2", 0], "model_name": MOTION,
                     "beta_schedule": "autoselect",
                     "context_options": ["4", 0]}},
    "4": {"class_type": "ADE_StandardStaticContextOptions",
          "inputs": {"context_length": 16, "context_overlap": 4,
                     "fuse_method": "pyramid",
                     "use_on_equal_length": False,
                     "start_percent": 0.0, "guarantee_steps": 1}},
    "5": {"class_type": "CLIPTextEncode",
          "inputs": {"text": POSITIVE, "clip": ["2", 1]}},
    "6": {"class_type": "CLIPTextEncode",
          "inputs": {"text": NEGATIVE, "clip": ["2", 1]}},
    "7": {"class_type": "EmptyLatentImage",
          "inputs": {"width": W, "height": H, "batch_size": FRAMES}},
    "8": {"class_type": "KSampler",
          "inputs": {"seed": SEED, "steps": 22, "cfg": 7.0,
                     "sampler_name": "euler", "scheduler": "normal",
                     "denoise": 1.0,
                     "model": ["3", 0], "positive": ["5", 0],
                     "negative": ["6", 0], "latent_image": ["7", 0]}},
    "9": {"class_type": "VAEDecode",
          "inputs": {"samples": ["8", 0], "vae": ["1", 2]}},
    "11": {"class_type": "SaveImage",
           "inputs": {"images": ["9", 0],
                      "filename_prefix": "chalk_frame"}},
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


def wait(pid, timeout=900):
    start = time.time()
    while True:
        with urllib.request.urlopen(f"{SERVER}/history/{pid}") as r:
            h = json.loads(r.read())
        if pid in h and h[pid].get("status", {}).get("completed"):
            return h[pid]
        if time.time() - start > timeout:
            raise TimeoutError(pid)
        time.sleep(2)


print(f"[submit] {LORA}  motion={MOTION}  frames={FRAMES}  size={W}x{H}")
t0 = time.time()
pid = queue(WF)
print(f"[queued] {pid}")
res = wait(WF and pid)
print(f"[done] {time.time()-t0:.1f}s")
for nid, out in res.get("outputs", {}).items():
    for img in out.get("images", []):
        src = COMFY_OUT / img.get("subfolder", "") / img["filename"]
        dst = OUT_DIR / img["filename"]
        shutil.copy2(src, dst)
print(f"[saved] -> {OUT_DIR}  ({len(list(OUT_DIR.glob('chalk_frame_*.png')))} frames)")
