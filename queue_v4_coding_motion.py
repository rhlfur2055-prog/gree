"""
v4 LoRA + 모션 강화 — 진짜 움직이는 코딩 영상
- LoRA strength: 0.9 → 0.7 (캐릭터 lock 완화)
- motion_scale: 1.0 → 1.5
- 프롬프트에 동작 단어 다수
- context_options 추가 (모션 일관성)
"""
import json, urllib.request, random

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
            "lora_name": "jeonggwichan_v4.safetensors",
            "strength_model": 0.7,
            "strength_clip":  0.7
        }
    },
    "10": {
        "class_type": "ADE_StandardUniformContextOptions",
        "inputs": {
            "context_length": 16,
            "context_stride": 1,
            "context_overlap": 4,
            "fuse_method": "flat",
            "use_on_equal_length": False,
            "start_percent": 0.0,
            "guarantee_steps": 1
        }
    },
    "3": {
        "class_type": "ADE_AnimateDiffLoaderWithContext",
        "inputs": {
            "model":          ["2", 0],
            "model_name":     "mm_sd_v15_v2.ckpt",
            "beta_schedule":  "autoselect",
            "motion_scale":   1.5,
            "context_options": ["10", 0]
        }
    },
    "4": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "clip": ["2", 1],
            "text": (
                "jeonggwichan character, white round 3D mascot, "
                "back view, sitting at desk, typing on keyboard, "
                "hands rapidly typing, fingers moving on keys, "
                "head slightly bobbing, slight body sway, "
                "active coding session, dynamic motion, "
                "two glowing monitors, office room"
            )
        }
    },
    "5": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "clip": ["2", 1],
            "text": (
                "static, frozen, motionless, still image, "
                "blurry, deformed, ugly, multiple characters, "
                "text watermark, 2D flat sketch, extra limbs"
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
            "cfg":          8.0,
            "sampler_name": "dpmpp_2m_sde",
            "scheduler":    "karras",
            "denoise":      1.0
        }
    },
    "8": {
        "class_type": "VAEDecode",
        "inputs": {"samples": ["7", 0], "vae": ["1", 2]}
    },
    "9": {
        "class_type": "ADE_AnimateDiffCombine",
        "inputs": {
            "images":          ["8", 0],
            "frame_rate":      8,
            "loop_count":      0,
            "filename_prefix": "jeong_v4_coding_motion",
            "format":          "image/gif",
            "pingpong":        False,
            "save_image":      True
        }
    }
}

payload = json.dumps({"prompt": WORKFLOW}).encode()
req = urllib.request.Request(f"{API}/prompt", data=payload, headers={"Content-Type": "application/json"})
r = urllib.request.urlopen(req, timeout=10)
result = json.loads(r.read())
print(f"prompt_id = {result['prompt_id']}")
