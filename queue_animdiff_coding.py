"""
AnimateDiff 코딩 씬 생성 → ComfyUI API 큐잉
dreamshaper_8 + jeonggwichan_v1 LoRA + mm_sd_v15_v2 motion module
24프레임 @ 8fps = 3초 → 이후 루프로 10초 MP4 변환
"""

import json, urllib.request, urllib.error, random, sys, time

API = "http://127.0.0.1:8188"

WORKFLOW = {
    "1": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {"ckpt_name": "dreamshaper_8.safetensors"}
    },
    "2": {
        "class_type": "LoraLoader",
        "inputs": {
            "model": ["1", 0],
            "clip":  ["1", 1],
            "lora_name": "jeonggwichan_v1.safetensors",
            "strength_model": 0.85,
            "strength_clip":  0.85
        }
    },
    "3": {
        "class_type": "ADE_AnimateDiffLoaderWithContext",
        "inputs": {
            "model":      ["2", 0],
            "model_name": "mm_sd_v15_v2.ckpt",
            "beta_schedule": "autoselect"
        }
    },
    "4": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "clip": ["2", 1],
            "text": (
                "jeonggwichan, white round cartoon mascot character, "
                "back view, sitting at desk, coding on computer, "
                "two monitors glowing, keyboard typing, programmer, "
                "office room, dark theme editor on screen, "
                "cozy lighting, simple clean background, "
                "high quality, smooth animation"
            )
        }
    },
    "5": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "clip": ["2", 1],
            "text": (
                "blurry, bad quality, deformed, ugly, "
                "multiple characters, text, watermark, "
                "realistic, photograph, extra limbs"
            )
        }
    },
    "6": {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": 512, "height": 512, "batch_size": 24}
    },
    "7": {
        "class_type": "KSampler",
        "inputs": {
            "model":        ["3", 0],
            "positive":     ["4", 0],
            "negative":     ["5", 0],
            "latent_image": ["6", 0],
            "seed":         random.randint(0, 2**32),
            "steps":        20,
            "cfg":          7.5,
            "sampler_name": "euler_ancestral",
            "scheduler":    "karras",
            "denoise":      1.0
        }
    },
    "8": {
        "class_type": "VAEDecode",
        "inputs": {
            "samples": ["7", 0],
            "vae":     ["1", 2]
        }
    },
    "9": {
        "class_type": "ADE_AnimateDiffCombine",
        "inputs": {
            "images":          ["8", 0],
            "frame_rate":      8,
            "loop_count":      0,
            "filename_prefix": "jeong_coding",
            "format":          "image/gif",
            "pingpong":        False,
            "save_image":      True
        }
    }
}

payload = json.dumps({"prompt": WORKFLOW}).encode()
req = urllib.request.Request(
    f"{API}/prompt",
    data=payload,
    headers={"Content-Type": "application/json"}
)

try:
    r = urllib.request.urlopen(req, timeout=10)
    result = json.loads(r.read())
    print(f"큐잉 성공! prompt_id = {result['prompt_id']}")
    print(f"ComfyUI에서 진행 확인: {API}")
    print(f"\n완료 후 출력 파일: C:\\tool\\pp\\ComfyUI\\output\\jeong_coding_*.gif")
except Exception as e:
    print(f"오류: {e}")
    sys.exit(1)
