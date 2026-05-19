"""
Full human motion dataset — 123 poses × 3 seeds = 369 images.
Covers every major human action + computer/coding motions for LoRA pose training.
"""

import json, urllib.request, urllib.error, time, shutil, sys
from pathlib import Path

SERVER    = "http://127.0.0.1:8188"
COMFY_OUT = Path(r"C:\tool\pp\ComfyUI\output")
OUT_DIR   = Path(r"C:\tool\pp\dataset\poses")
OUT_DIR.mkdir(parents=True, exist_ok=True)

LORA = "jeonggwichan_v1-000008.safetensors"
CKPT = "dreamshaper_8.safetensors"

NEGATIVE = (
    "low quality, blurry, deformed, text, watermark, realistic, 3d, photo, "
    "bad anatomy, extra limbs, multiple characters, ugly, cropped, "
    "upside down, inverted, rotated, sideways head, flipped, "
    "human, person, anime, manga, detailed face, skin texture, "
    "nsfw, nude, sexy"
)

# Style anchor prepended to every positive prompt — locks character appearance
STYLE = (
    "jeonggwichan, chibi cartoon character, white round egg-shaped body, "
    "simple cute face, small pink nose, holding blue pillow, "
    "flat 2d illustration, white background, upright standing, "
)

# 123 poses × 3 seeds = 369 images
POSES = [
    # ── 이동 기본 ─────────────────────────────────────────────────────────────
    ("walk",         "jeonggwichan, walking casually, one foot forward, arms swinging, full body, white background",                    "jeonggwichan, walking, white background"),
    ("run",          "jeonggwichan, running fast, leaning forward, one leg raised, arms pumping, full body, white background",           "jeonggwichan, running, white background"),
    ("sprint",       "jeonggwichan, sprinting full speed, body horizontal, speed lines, full body, white background",                   "jeonggwichan, sprinting, speed lines, white background"),
    ("tiptoe",       "jeonggwichan, tiptoeing sneaking, bent forward, arms out, quiet expression, full body, white background",         "jeonggwichan, tiptoeing, sneaking, white background"),
    ("skip",         "jeonggwichan, skipping happily, one leg up, arms swinging cheerfully, full body, white background",               "jeonggwichan, skipping, happy, white background"),
    ("hop",          "jeonggwichan, hopping on one foot, arms out for balance, full body, white background",                            "jeonggwichan, hopping, one foot, white background"),
    ("crawl",        "jeonggwichan, crawling on all fours, low to ground, full body, white background",                                 "jeonggwichan, crawling, all fours, white background"),
    ("moonwalk",     "jeonggwichan, moonwalking backwards, smooth glide, cool expression, full body, white background",                 "jeonggwichan, moonwalk, sliding, white background"),
    ("strut",        "jeonggwichan, strutting confidently, chest out, head high, swagger walk, full body, white background",            "jeonggwichan, strutting, confident walk, white background"),
    ("shuffle",      "jeonggwichan, shuffling sideways, feet sliding, arms out, full body, white background",                          "jeonggwichan, shuffling sideways, white background"),

    # ── 점프 / 공중 ──────────────────────────────────────────────────────────
    ("jump_up",      "jeonggwichan, jumping straight up, arms raised, feet off ground, full body, white background",                   "jeonggwichan, jumping, arms up, white background"),
    ("crouch",       "jeonggwichan, crouching down low, knees bent, squatting, full body, white background",                           "jeonggwichan, crouching, squatting, white background"),
    ("land",         "jeonggwichan, landing from jump, knees bent absorbing impact, arms out, full body, white background",            "jeonggwichan, landing, knees bent, white background"),
    ("leap",         "jeonggwichan, leaping far forward, body stretched horizontal midair, full body, white background",               "jeonggwichan, leaping, stretched, midair, white background"),
    ("float",        "jeonggwichan, floating midair peacefully, legs dangling, arms spread, full body, white background",              "jeonggwichan, floating, midair, white background"),
    ("bounce",       "jeonggwichan, bouncing up and down happily, springy motion, full body, white background",                        "jeonggwichan, bouncing, springy, white background"),

    # ── 파쿠르 ────────────────────────────────────────────────────────────────
    ("parkour_vault",  "jeonggwichan, parkour vaulting over obstacle, one hand on surface, legs swinging over, dynamic, full body, white background",  "jeonggwichan, parkour vault, dynamic, white background"),
    ("parkour_wallrun","jeonggwichan, wall running, body sideways, one foot on wall, arms forward, full body, white background",                        "jeonggwichan, wall running, parkour, white background"),
    ("parkour_roll",   "jeonggwichan, parkour roll, curled into ball rolling forward, full body, white background",                                    "jeonggwichan, rolling, parkour, white background"),
    ("parkour_climb",  "jeonggwichan, climbing up wall, arms gripping edge, legs pushing, full body, white background",                                "jeonggwichan, climbing, gripping, white background"),
    ("parkour_flip",   "jeonggwichan, backflip pose, legs kicked up high behind, leaning back dramatically, upright orientation, full body, white background", "jeonggwichan, backflip, legs up, white background"),
    ("parkour_slide",  "jeonggwichan, sliding under obstacle, body low, one leg forward, full body, white background",                                "jeonggwichan, sliding under, parkour, white background"),

    # ── 춤 ───────────────────────────────────────────────────────────────────
    ("dance_wave",   "jeonggwichan, doing wave dance, arms flowing like a wave, stylish, full body, white background",                 "jeonggwichan, wave dance, flowing arms, white background"),
    ("dance_robot",  "jeonggwichan, doing robot dance, stiff mechanical moves, arms angular, full body, white background",             "jeonggwichan, robot dance, mechanical, white background"),
    ("dance_spin",   "jeonggwichan, spinning pirouette, arms out, one leg raised, full body, white background",                        "jeonggwichan, spinning, pirouette, dance, white background"),
    ("dance_groove", "jeonggwichan, grooving to music, hips moving, arms up, happy face, full body, white background",                 "jeonggwichan, grooving, dancing, white background"),
    ("dance_jump",   "jeonggwichan, jump dancing, both feet off ground, arms thrown up, joyful, full body, white background",          "jeonggwichan, jump dance, joyful, white background"),
    ("dance_break",  "jeonggwichan, breakdancing pose, one arm extended low, legs bent outward, dynamic street dance, upright, full body, white background", "jeonggwichan, breakdancing, dynamic, white background"),

    # ── 먹기 / 일상 ──────────────────────────────────────────────────────────
    ("eat",          "jeonggwichan, eating food happily, holding food to mouth, chewing, full body, white background",                 "jeonggwichan, eating, food, happy, white background"),
    ("drink",        "jeonggwichan, drinking from cup, head tilted back, gulping, full body, white background",                        "jeonggwichan, drinking, cup, white background"),
    ("sleep_stand",  "jeonggwichan, sleeping standing up, eyes closed, zzz bubbles, head drooping, full body, white background",      "jeonggwichan, sleeping, standing, zzz, white background"),
    ("wake_up",      "jeonggwichan, just woke up, stretching arms wide, yawning big, sleepy eyes, full body, white background",       "jeonggwichan, waking up, stretching, yawning, white background"),
    ("brush_teeth",  "jeonggwichan, brushing teeth, arm moving back and forth, sleepy morning face, full body, white background",     "jeonggwichan, brushing teeth, morning, white background"),
    ("carry",        "jeonggwichan, carrying heavy box, struggling, arms under box, straining, full body, white background",           "jeonggwichan, carrying heavy, straining, white background"),
    ("push",         "jeonggwichan, pushing something hard, both arms extended, leaning forward, full body, white background",         "jeonggwichan, pushing, leaning, effort, white background"),
    ("pull",         "jeonggwichan, pulling rope hard, leaning back, arms gripping, heels dug in, full body, white background",       "jeonggwichan, pulling, leaning back, white background"),
    ("lift",         "jeonggwichan, lifting heavy weight overhead, arms raised, shaking with effort, full body, white background",     "jeonggwichan, lifting, overhead, effort, white background"),
    ("sit",          "jeonggwichan, sitting cross-legged, hands on knees, calm relaxed, full body, white background",                 "jeonggwichan, sitting, cross-legged, white background"),

    # ── 감정 리액션 ──────────────────────────────────────────────────────────
    ("cheer",        "jeonggwichan, both arms raised straight up in V shape, jumping off ground, open mouth big smile, full body, white background",                   "jeonggwichan, cheering, arms up V, white background"),
    ("scared",       "jeonggwichan, body leaning far back, both arms raised flailing outward, legs spread wide, mouth open circle, full body, white background",      "jeonggwichan, scared, leaning back, arms flailing, white background"),
    ("dizzy",        "jeonggwichan, swaying sideways, one leg raised, arms dangling loose, swirl lines around head, full body, white background",                     "jeonggwichan, dizzy, swaying, swirl, white background"),
    ("tired",        "jeonggwichan, hunched forward, head drooping down, arms hanging limp at sides, sweat drops, heavy eyelids, full body, white background",        "jeonggwichan, exhausted, drooping, arms limp, white background"),
    ("excited",      "jeonggwichan, both arms stretched wide open, body vibrating, legs bouncing, star sparkles around body, full body, white background",            "jeonggwichan, excited, arms wide, vibrating, sparkles, white background"),
    ("angry_stomp",  "jeonggwichan, one leg raised high stomping down, both fists clenched raised, steam lines above head, teeth gritted, full body, white background", "jeonggwichan, stomping, fists raised, steam, angry, white background"),
    ("cry",          "jeonggwichan, both hands pressing face, body bent forward, large tear drops flying outward, shaking, full body, white background",               "jeonggwichan, crying, hands on face, tears, shaking, white background"),
    ("laugh",        "jeonggwichan, body bent forward at waist, one hand on belly, other hand waving, mouth wide open laugh, full body, white background",            "jeonggwichan, laughing, bent forward, belly, white background"),
    ("embarrassed",  "jeonggwichan, both hands covering cheeks, head tilted down, body turned sideways, rosy cheeks, full body, white background",                    "jeonggwichan, embarrassed, hands on cheeks, turned away, white background"),
    ("shocked",      "jeonggwichan, both hands slapped on cheeks, mouth open wide O shape, body stiff upright, eyes wide, full body, white background",               "jeonggwichan, shocked, hands on cheeks, mouth open, white background"),
    ("proud",        "jeonggwichan, both hands on hips, chest pushed forward, chin raised up, eyes closed smug, full body, white background",                         "jeonggwichan, proud, hands on hips, chin up, smug, white background"),
    ("bored",        "jeonggwichan, one hand propping chin up, elbow out, head drooping sideways, half-closed eyes, body slouched, full body, white background",      "jeonggwichan, bored, hand on chin, slouching, half-closed eyes, white background"),
    ("panic",        "jeonggwichan, both arms raised and waving frantically, legs running, sweat drops everywhere, wide open mouth, full body, white background",     "jeonggwichan, panicking, arms waving, running, sweat, white background"),
    ("relieved",     "jeonggwichan, one hand raised wiping forehead, other arm hanging loose, eyes closed, exhale lines from mouth, sweat drop, full body, white background", "jeonggwichan, relieved, wiping forehead, exhaling, white background"),

    # ── 제스처 ───────────────────────────────────────────────────────────────
    ("wave",         "jeonggwichan, waving hello enthusiastically, arm raised high, big smile, full body, white background",          "jeonggwichan, waving, hello, white background"),
    ("point",        "jeonggwichan, pointing forward confidently, one arm extended, full body, white background",                     "jeonggwichan, pointing, confident, white background"),
    ("thumbs_up",    "jeonggwichan, big thumbs up, arm raised, confident happy face, full body, white background",                    "jeonggwichan, thumbs up, positive, white background"),
    ("thumbs_down",  "jeonggwichan, thumbs down, arm raised, disapproving frown, full body, white background",                       "jeonggwichan, thumbs down, negative, white background"),
    ("shrug",        "jeonggwichan, shrugging both shoulders, arms raised, confused face, full body, white background",               "jeonggwichan, shrugging, confused, white background"),
    ("bow",          "jeonggwichan, bowing deeply, upper body bent 90 degrees, respectful, full body, white background",             "jeonggwichan, bowing, respectful, white background"),
    ("clap",         "jeonggwichan, clapping hands together, arms in front, happy expression, full body, white background",           "jeonggwichan, clapping, applause, white background"),
    ("facepalm",     "jeonggwichan, facepalm, one hand covering face, head shaking, frustrated, full body, white background",         "jeonggwichan, facepalm, frustrated, white background"),
    ("arms_crossed", "jeonggwichan, arms crossed, stern serious face, full body, white background",                                   "jeonggwichan, arms crossed, serious, white background"),
    ("think",        "jeonggwichan, thinking deeply, hand on chin, looking up, thought bubble, full body, white background",          "jeonggwichan, thinking, hand on chin, white background"),
    ("no_no",        "jeonggwichan, wagging finger no no, shaking head, disapproving smile, full body, white background",             "jeonggwichan, wagging finger, no, white background"),
    ("come_here",    "jeonggwichan, beckoning come here gesture, arm extended, curling finger, full body, white background",          "jeonggwichan, beckoning, come here, white background"),

    # ── 넘어짐 / 충격 ─────────────────────────────────────────────────────────
    ("fall_back",    "jeonggwichan, falling backwards, off balance, arms spinning, surprised, full body, white background",           "jeonggwichan, falling back, off balance, white background"),
    ("fall_forward", "jeonggwichan, tripping falling forward, arms out to catch, face alarmed, full body, white background",          "jeonggwichan, tripping, falling forward, white background"),
    ("slip",         "jeonggwichan, slipping on banana peel, one leg up, arms flailing, full body, white background",                "jeonggwichan, slipping, banana peel, white background"),
    ("dodge",        "jeonggwichan, dodging quickly, body leaned far sideways, arms out, full body, white background",               "jeonggwichan, dodging, leaning, white background"),
    ("knocked_out",  "jeonggwichan, knocked out, seeing stars, wobbly, arms hanging limp, full body, white background",              "jeonggwichan, knocked out, stars, white background"),

    # ── 스포츠 / 격투 ─────────────────────────────────────────────────────────
    ("kick",         "jeonggwichan, high kick, one leg raised up, arms out for balance, dynamic, full body, white background",        "jeonggwichan, kicking, leg raised, dynamic, white background"),
    ("punch",        "jeonggwichan, punching forward, one fist extended, determined face, full body, white background",               "jeonggwichan, punching, fist forward, white background"),
    ("throw",        "jeonggwichan, throwing something, arm pulled back, weight on back foot, full body, white background",           "jeonggwichan, throwing, arm back, white background"),
    ("catch",        "jeonggwichan, catching something, arms extended forward, eyes focused, full body, white background",            "jeonggwichan, catching, arms extended, white background"),
    ("defend",       "jeonggwichan, defensive guard position, arms up blocking, crouched slightly, full body, white background",      "jeonggwichan, defending, guard position, white background"),
    ("swing",        "jeonggwichan, swinging bat or club, full rotation, arms extended, full body, white background",                 "jeonggwichan, swinging, rotation, white background"),

    # ── 수영 / 자전거 / 기타 ─────────────────────────────────────────────────
    ("swim",         "jeonggwichan, swimming freestyle, arms stroking, body horizontal, full body, white background",                 "jeonggwichan, swimming, stroking, white background"),
    ("bike",         "jeonggwichan, riding bicycle, leaning forward, legs pedaling, full body, white background",                    "jeonggwichan, riding bike, pedaling, white background"),
    ("surf",         "jeonggwichan, surfing wave, arms out for balance, knees bent, riding board, full body, white background",       "jeonggwichan, surfing, balancing, white background"),
    ("ski",          "jeonggwichan, skiing down slope, poles in hands, knees bent, leaning forward, full body, white background",     "jeonggwichan, skiing, poles, white background"),

    # ── 앉기 / 눕기 ──────────────────────────────────────────────────────────
    ("sit_ground",   "jeonggwichan, sitting on ground, legs out front, hands behind, relaxed, full body, white background",          "jeonggwichan, sitting, relaxed, white background"),
    ("kneel",        "jeonggwichan, kneeling on one knee, head bowed, respectful pose, full body, white background",                 "jeonggwichan, kneeling, one knee, white background"),
    ("stretch_up",   "jeonggwichan, stretching arms up high, on tiptoes, yawning, full body, white background",                     "jeonggwichan, stretching up, yawning, white background"),
    ("stretch_side", "jeonggwichan, stretching sideways, one arm over head, leaning, full body, white background",                   "jeonggwichan, side stretch, leaning, white background"),

    # ── 작업 / 활동 ──────────────────────────────────────────────────────────
    ("write",        "jeonggwichan, writing with pen, arm extended, focused expression, full body, white background",                 "jeonggwichan, writing, pen, focused, white background"),
    ("present",      "jeonggwichan, presenting, one arm gesturing wide, confident speaker pose, full body, white background",         "jeonggwichan, presenting, speaker, white background"),
    ("phone",        "jeonggwichan, talking on phone, hand to ear, nodding, full body, white background",                            "jeonggwichan, phone call, talking, white background"),
    ("cook",         "jeonggwichan, cooking, stirring pot, steam rising, happy chef face, full body, white background",              "jeonggwichan, cooking, stirring, chef, white background"),
    ("clean",        "jeonggwichan, cleaning, scrubbing with both hands, energetic, full body, white background",                    "jeonggwichan, cleaning, scrubbing, white background"),

    # ── 특수 / 개그 ──────────────────────────────────────────────────────────
    ("peek",         "jeonggwichan, peeking around corner, body half hidden, one eye looking, curious, full body, white background",  "jeonggwichan, peeking, curious, corner, white background"),
    ("hide",         "jeonggwichan, hiding behind hands, peeking through fingers, giggling, full body, white background",             "jeonggwichan, hiding, peeking through fingers, white background"),
    ("freeze",       "jeonggwichan, frozen in place, stiff as a board, wide eyes, full body, white background",                      "jeonggwichan, frozen, stiff, wide eyes, white background"),
    ("inflate",      "jeonggwichan, puffed up like balloon, round and swollen, arms out, full body, white background",               "jeonggwichan, puffed up, inflated, white background"),
    ("melt",         "jeonggwichan, melting from heat, drooping, sweat everywhere, full body, white background",                     "jeonggwichan, melting, drooping, hot, white background"),
    ("spin_dizzy",   "jeonggwichan, spinning so fast becoming a blur, spiral motion lines, full body, white background",             "jeonggwichan, spinning fast, blur, white background"),
    ("rocket",       "jeonggwichan, blasting off like rocket, shooting straight up, speed lines below, full body, white background", "jeonggwichan, rocket launch, blasting off, white background"),
    ("superhero",    "jeonggwichan, superhero pose, one fist raised up, standing tall, chest puffed, heroic stance, upright, full body, white background", "jeonggwichan, superhero, heroic stance, white background"),
    ("victory",      "jeonggwichan, victory pose, arms raised in V shape, huge smile, full body, white background",                  "jeonggwichan, victory, V pose, white background"),
    ("curtain_bow",  "jeonggwichan, taking curtain bow, bent deeply, one arm sweeping floor, full body, white background",           "jeonggwichan, curtain bow, bowing, white background"),

    # ── 컴퓨터 / 코딩 ────────────────────────────────────────────────────────────
    ("typing",         "jeonggwichan, typing rapidly on keyboard, leaning forward, both hands on keys, focused expression, sitting at desk, full body, white background",    "jeonggwichan, typing, keyboard, focused, white background"),
    ("typing_fast",    "jeonggwichan, typing furiously fast, fingers blurred with speed, intense concentration, hunched over keyboard, full body, white background",         "jeonggwichan, typing fast, intense, white background"),
    ("stare_screen",   "jeonggwichan, staring at monitor blankly, eyes wide, face lit by screen glow, sitting, one hand on chin, full body, white background",              "jeonggwichan, staring at screen, monitor glow, white background"),
    ("code_focus",     "jeonggwichan, coding with deep focus, leaning very close to screen, squinting, both hands poised over keyboard, full body, white background",        "jeonggwichan, coding, deeply focused, squinting, white background"),
    ("code_think",     "jeonggwichan, thinking while coding, leaning back in chair, arms crossed, looking up at ceiling, pondering, full body, white background",            "jeonggwichan, thinking, arms crossed, pondering, white background"),
    ("code_success",   "jeonggwichan, code compiled successfully, leaning back triumphant, fists raised, huge grin, full body, white background",                            "jeonggwichan, success, fists raised, triumphant, white background"),
    ("eureka",         "jeonggwichan, eureka moment, jumping up from chair, finger pointing up, lightbulb above head, bright excited face, full body, white background",    "jeonggwichan, eureka, lightbulb, excited, white background"),
    ("bug_confused",   "jeonggwichan, confused by bug, head tilting sideways, hand scratching head, squinting at screen, question marks, full body, white background",      "jeonggwichan, confused, bug, head tilt, question marks, white background"),
    ("debug_hunt",     "jeonggwichan, hunting for bug, nose almost touching screen, magnifying glass in hand, eyes scanning line by line, full body, white background",     "jeonggwichan, debugging, magnifying glass, scanning, white background"),
    ("error_rage",     "jeonggwichan, enraged at computer error, fists slammed on desk, steam from head, red face, full body, white background",                            "jeonggwichan, rage, error, fists on desk, steam, white background"),
    ("error_cry",      "jeonggwichan, crying dramatically at computer error, tears streaming, hands on keyboard, slumped over desk, full body, white background",            "jeonggwichan, crying, error, slumped, tears, white background"),
    ("error_404",      "jeonggwichan, 404 not found reaction, total confusion, arms spread wide questioning, tilted head, full body, white background",                     "jeonggwichan, 404, confused, arms spread, white background"),
    ("error_crash",    "jeonggwichan, computer crashed, head in both hands, collapsed on desk, devastated expression, full body, white background",                         "jeonggwichan, crashed, head in hands, devastated, white background"),
    ("deploy_panic",   "jeonggwichan, panicking about broken deployment, sweating bullets, eyes wide, frantically typing, full body, white background",                     "jeonggwichan, panic, sweating, frantic typing, white background"),
    ("deadline_rush",  "jeonggwichan, racing against deadline, leaning forward urgently, both hands flying over keyboard, clock hands spinning, full body, white background","jeonggwichan, deadline, urgent, rushing, white background"),
    ("coffee_code",    "jeonggwichan, drinking coffee while coding, mug in one hand, typing with other, bleary eyed, full body, white background",                          "jeonggwichan, coffee, coding, one hand mug, white background"),
    ("coffee_empty",   "jeonggwichan, horrified to find coffee mug empty, tilting cup upside down, tragic face, full body, white background",                               "jeonggwichan, empty coffee, tragic, white background"),
    ("pr_approved",    "jeonggwichan, pull request approved, jumping for joy, both arms up, party popper effect, full body, white background",                              "jeonggwichan, PR approved, jumping, celebration, white background"),
    ("meeting_bored",  "jeonggwichan, bored in online meeting, chin resting on hand, half-closed eyes, glazed expression, full body, white background",                    "jeonggwichan, bored, meeting, glazed eyes, white background"),
    ("rubber_duck",    "jeonggwichan, explaining code to rubber duck, holding duck up, talking seriously, one finger pointing, full body, white background",                "jeonggwichan, rubber duck debugging, explaining, white background"),
    ("stack_overflow", "jeonggwichan, copying from stackoverflow, sneaky sideways glance, ctrl-c pose, guilty grin, full body, white background",                          "jeonggwichan, stackoverflow, sneaky, copying, white background"),
    ("git_conflict",   "jeonggwichan, merge conflict panic, hair standing up, eyes wild, papers flying, full body, white background",                                      "jeonggwichan, merge conflict, panic, papers flying, white background"),
    ("works_on_mine",  "jeonggwichan, shrugging smugly it works on my machine, big shrug, self-satisfied smirk, full body, white background",                              "jeonggwichan, shrugging, smug, works on my machine, white background"),
]

SEEDS = [100, 200, 300]


def build_wf(positive: str, seed: int) -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "LoraLoader",
              "inputs": {"model": ["1", 0], "clip": ["1", 1],
                         "lora_name": LORA,
                         "strength_model": 1.0, "strength_clip": 1.0}},
        "3": {"class_type": "CLIPTextEncode",
              "inputs": {"text": STYLE + positive, "clip": ["2", 1]}},
        "4": {"class_type": "CLIPTextEncode",
              "inputs": {"text": NEGATIVE, "clip": ["2", 1]}},
        "5": {"class_type": "EmptyLatentImage",
              "inputs": {"width": 512, "height": 512, "batch_size": 1}},
        "6": {"class_type": "KSampler",
              "inputs": {"seed": seed, "steps": 30, "cfg": 8.0,
                         "sampler_name": "dpmpp_2m", "scheduler": "karras",
                         "denoise": 1.0,
                         "model": ["2", 0], "positive": ["3", 0],
                         "negative": ["4", 0], "latent_image": ["5", 0]}},
        "7": {"class_type": "VAEDecode",
              "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveImage",
              "inputs": {"images": ["7", 0], "filename_prefix": "pose_gen"}},
    }


def queue(wf):
    body = json.dumps({"prompt": wf}).encode()
    req  = urllib.request.Request(f"{SERVER}/prompt", data=body,
                                  headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())["prompt_id"]
    except urllib.error.HTTPError as e:
        print("HTTPError:", e.code, e.read().decode(errors="replace"), file=sys.stderr)
        raise


def wait(pid, timeout=300):
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
    total = len(POSES) * len(SEEDS)
    done  = 0
    t0    = time.time()

    print(f"[start] {len(POSES)} poses × {len(SEEDS)} seeds = {total} images")

    for pose_name, positive, caption in POSES:
        for si, seed in enumerate(SEEDS):
            done += 1
            print(f"[{done:>3}/{total}] {pose_name} seed={seed}")
            wf  = build_wf(positive, seed)
            pid = queue(wf)
            res = wait(pid)

            for _, out in res.get("outputs", {}).items():
                for img in out.get("images", []):
                    src = COMFY_OUT / img.get("subfolder", "") / img["filename"]
                    dst = OUT_DIR / f"{pose_name}_s{si}.png"
                    shutil.copy2(src, dst)
                    (OUT_DIR / f"{pose_name}_s{si}.txt").write_text(caption)
                    elapsed = time.time() - t0
                    remaining = elapsed / done * (total - done)
                    print(f"        -> {dst.name}  (남은시간 약 {remaining/60:.0f}분)")

    print(f"\n[done] {total}장 완료  →  {OUT_DIR}")
    print(f"총 소요: {(time.time()-t0)/60:.1f}분")
    print()
    print("다음 단계:")
    print("1. dataset\\poses\\ 에서 잘 나온 것 고르기")
    print("2. D:\\lora_train\\jeonggwichan\\img\\10_jeonggwichan\\ 에 복사")
    print("3. run_train_lora.bat 실행")
