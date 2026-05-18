# 그리 Animation Pipeline

그리 캐릭터 — AnimateDiff + LoRA 기반 자동 애니메이션 생성 파이프라인.

<div align="center">

![그리 3D 애니메이션](https://raw.githubusercontent.com/rhlfur2055-prog/animation/main/jeong_3d.gif)

</div>

---

## 사용 모델 / 기술 스택

| 역할 | 모델 / 라이브러리 |
|------|------------------|
| 베이스 SD | `dreamshaper_8.safetensors` (SD 1.5) |
| 캐릭터 LoRA | `jeonggwichan_v1-000008.safetensors` (strength 0.8) |
| 애니메이션 | `mm_sd_v15_v2.ckpt` — AnimateDiff-Evolved |
| 3D 렌더 | Replicate API |
| 객체 감지 | **YOLOv8** (`yolov8n.pt` / `best.pt`) — 화면합성용 bbox 감지 |
| 화면 교체 | **OpenCV 4.9** — perspective warp, chroma key, 합성 |
| 배경 제거 | `rembg` (AI 누끼) + HSV threshold 폴백 |
| 프레임 → 영상 | `imageio-ffmpeg` (H.264 MP4 + GIF) |
| 표정 생성 | `Pillow` — 픽셀 좌표 기반 눈/입 직접 드로잉 |
| 모션 캡처 | BVH + `bvhio` → Blender 4.2 렌더 |
| 플랫폼 | ComfyUI 0.21.1 + AnimateDiff-Evolved 1.5.7 |

---

## 스크립트 목록

### AnimateDiff 생성 (ComfyUI API)

| 파일 | 설명 |
|------|------|
| `gen_animate.py` | 기본 루프 애니메이션 (512×512, 16프레임, 8fps) |
| `gen_chalk_anim.py` | 칠판 옆 그리 (768×432, 16:9) |
| `gen_korini_anim.py` | 장면별 5씬 자동 생성 (coding/error/panic/solved) |
| `gen_pose_dataset.py` | 123 포즈 × 3 시드 = 369장 LoRA 학습 데이터 |
| `gen_dataset.py` / `gen_dataset_v2.py` | 기본 데이터셋 생성 |

### 후처리 / 효과

| 파일 | 설명 |
|------|------|
| `cv_effects.py` | **OpenCV + YOLO** — 배경교체 / 모니터 화면교체 / 캐릭터 합성 |
| `overlay_text.py` | PIL 칠판 타자 효과 (chalk typewriter) |
| `draw_emotions.py` | 6종 표정 자동 생성 (픽셀 좌표 기반) |
| `gen_expression_dataset.py` | 표정 데이터셋 생성 |
| `walk_anim.py` | 뒤뚱뒤뚱 워크 사이클 (24프레임, 수학 기반, AI 미사용) |
| `make_char_video.py` | WebP → 누끼 MP4/WebM |
| `to_video.py` | PNG 프레임 시퀀스 → MP4 + GIF |

### 합성 / 파이프라인

| 파일 | 설명 |
|------|------|
| `compose_daily.py` | 6클립 일상 스토리 합성 (크로스페이드 + 자막) |
| `compose_dev_story.py` | 개발 스토리 합성 |
| `master_pipeline.py` | BVH 모션캡처 → Blender 렌더 전체 자동화 |
| `motion_harness.py` | BVH 동작 품질 검증 (PASS/WARN/FAIL) |
| `motion_polish.py` | 모션 후처리 |

### 학습 데이터

| 파일 | 설명 |
|------|------|
| `gen_augment.py` | 원본 1장 → PIL augmentation으로 15장 생성 |
| `run_train_lora.bat` | kohya_ss LoRA 학습 실행 스크립트 |

---

## OpenCV 화면 교체 사용법 (`cv_effects.py`)

```bash
# 1. 배경 이미지로 교체
python cv_effects.py --mode bg_replace \
  --char anim_final/walk.mp4 --bg bg_office.jpg --out out_bg.mp4

# 2. AI 누끼 사용 (정밀)
python cv_effects.py --mode bg_replace \
  --char anim_final/walk.mp4 --bg bg.jpg --rembg --out out_rembg.mp4

# 3. 모니터 화면 교체 (perspective warp)
python cv_effects.py --mode screen_overlay \
  --char scene_coding.png --screen new_screen.png --out out_screen.png

# 4. YOLOv8 감지 → bbox 위 캐릭터 합성
python cv_effects.py --mode yolo_composite \
  --input video.mp4 --char 1.png --model yolov8n.pt --out out_yolo.mp4

# best.pt (커스텀 모델) 사용
python cv_effects.py --mode yolo_composite \
  --input video.mp4 --char 1.png --model best.pt --out out_custom.mp4
```

---

## 빠른 시작

```bash
# 1. 의존성 설치
pip install -r requirements.txt

# 2. ComfyUI 서버 실행 (별도 터미널)
#    필요 모델: dreamshaper_8.safetensors, mm_sd_v15_v2.ckpt
#    LoRA: jeonggwichan_v1-000008.safetensors

# 3. 기본 애니메이션 생성
python gen_animate.py

# 4. 칠판 씬 생성 + 텍스트 오버레이
python gen_chalk_anim.py
python overlay_text.py

# 5. 프레임 → 영상 변환
python to_video.py

# 6. 워크 애니메이션 (AI 불필요)
python walk_anim.py
```

---

## 제작 파이프라인

```
원본 1장 (1.png)
    │
    ├─ gen_augment.py ──────→ dataset/ (15장 학습 데이터)
    │                              │
    │                        run_train_lora.bat
    │                              │
    │                    jeonggwichan_v1-000008.safetensors
    │
    ├─ gen_animate.py ─────→ anim_test/*.png → to_video.py → jeong_anim.mp4/.gif
    ├─ gen_chalk_anim.py ──→ anim_chalk/*.png → overlay_text.py → jeong_chalk.mp4
    ├─ gen_korini_anim.py ─→ scene1~5 WebP → make_char_video.py → char_anim.mp4
    ├─ walk_anim.py ───────→ walk_frames/*.png → walk.mp4/.gif
    ├─ draw_emotions.py ───→ emotions/*.png (6종 표정)
    └─ cv_effects.py ──────→ 배경교체 / 화면교체 / YOLO 합성
```

---

## 모델 다운로드

| 모델 | 위치 | 비고 |
|------|------|------|
| `dreamshaper_8.safetensors` | [CivitAI](https://civitai.com/models/4384) | ComfyUI/models/checkpoints/ |
| `mm_sd_v15_v2.ckpt` | [HuggingFace](https://huggingface.co/guoyww/animatediff) | ComfyUI/custom_nodes/AnimateDiff-Evolved/models/ |
| `yolov8n.pt` | `pip install ultralytics` 후 자동 다운 | 또는 best.pt (커스텀) |
