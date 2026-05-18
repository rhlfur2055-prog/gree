"""
코린이의 하루 - AnimateDiff 씬별 자동 생성
dreamshaper_8 + jeonggwichan LoRA + mm_sd_v15_v2
"""
import json
import urllib.request
import urllib.error
import time
import sys

COMFY_URL = "http://127.0.0.1:8188"

SCENES = [
    {
        "name": "scene1_coding",
        "prompt": "jeonggwichan, 1boy, chibi, sitting at desk, typing on keyboard, dual monitor, dark room, screen glow, focused expression, simple line art, white background, best quality",
    },
    {
        "name": "scene2_error",
        "prompt": "jeonggwichan, 1boy, chibi, sitting at desk, surprised expression, staring at monitor, dual monitor, dark room, screen glow, shocked face, best quality",
    },
    {
        "name": "scene3_panic",
        "prompt": "jeonggwichan, 1boy, chibi, sitting at desk, frustrated, hands on head, holding head, dual monitor, dark room, screen glow, distressed, sweat drop, best quality",
    },
    {
        "name": "scene4_claude",
        "prompt": "jeonggwichan, 1boy, chibi, sitting at desk, typing frantically, leaning forward, dual monitor, dark room, screen glow, desperate expression, best quality",
    },
    {
        "name": "scene5_solved",
        "prompt": "jeonggwichan, 1boy, chibi, sitting at desk, relieved smile, relaxed, dual monitor, bright screen, warm glow, happy expression, best quality",
    },
]

NEGATIVE = "lowres, bad anatomy, worst quality, blurry, ugly, deformed, multiple people, female, girl, watermark, nsfw"

def build_workflow(prompt: str, filename: str) -> dict:
    return {
        "3": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "dreamshaper_8.safetensors"}
        },
        "4": {
            "class_type": "LoraLoader",
            "inputs": {
                "model": ["3", 0],
                "clip": ["3", 1],
                "lora_name": "jeonggwichan_v1.safetensors",
                "strength_model": 0.85,
                "strength_clip": 0.85
            }
        },
        "10": {
            "class_type": "ADE_AnimateDiffLoaderWithContext",
            "inputs": {
                "model": ["4", 0],
                "model_name": "mm_sd_v15_v2.ckpt",
                "beta_schedule": "sqrt_linear (AnimateDiff)",
                "motion_scale": 1.0,
                "apply_v2_models_properly": True
            }
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["4", 1],
                "text": prompt
            }
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["4", 1],
                "text": NEGATIVE
            }
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 512, "height": 512, "batch_size": 16}
        },
        "8": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["10", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0],
                "seed": 42,
                "steps": 20,
                "cfg": 7.0,
                "sampler_name": "euler_ancestral",
                "scheduler": "normal",
                "denoise": 1.0
            }
        },
        "9": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["8", 0],
                "vae": ["3", 2]
            }
        },
        "11": {
            "class_type": "SaveAnimatedWEBP",
            "inputs": {
                "images": ["9", 0],
                "filename_prefix": filename,
                "fps": 8.0,
                "lossless": False,
                "quality": 85,
                "method": "default"
            }
        }
    }

def queue_prompt(workflow: dict) -> str:
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(f"{COMFY_URL}/prompt", data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        result = json.loads(r.read())
    return result["prompt_id"]

def wait_done(prompt_id: str):
    print(f"  대기 중 (id={prompt_id[:8]}...)", end="", flush=True)
    while True:
        with urllib.request.urlopen(f"{COMFY_URL}/history/{prompt_id}") as r:
            hist = json.loads(r.read())
        if prompt_id in hist:
            print(" 완료!")
            return
        print(".", end="", flush=True)
        time.sleep(3)

def main():
    print("=== 코린이의 하루 AnimateDiff 생성 시작 ===\n")
    for i, scene in enumerate(SCENES, 1):
        print(f"[{i}/5] {scene['name']}")
        wf = build_workflow(scene["prompt"], scene["name"])
        try:
            pid = queue_prompt(wf)
            wait_done(pid)
        except urllib.error.URLError:
            print("❌ ComfyUI 연결 실패. 서버가 켜져있는지 확인하세요.")
            sys.exit(1)
        time.sleep(2)
    print("\n✅ 전체 완료! C:\\Users\\jomg2\\Downloads\\comfy_output\\ 확인하세요.")

if __name__ == "__main__":
    main()
