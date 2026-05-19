# gree — 그리 YouTube Shorts 파이프라인

그리 캐릭터 기반 YouTube Shorts 자동 생성 파이프라인.  
표정 합성 · YOLO 객체 탐지 · Remotion 영상 편집 · ComfyUI AnimateDiff 애니메이션.

---

## 기술 스택

| 역할 | 모델 / 라이브러리 |
|------|------------------|
| 표정 드로잉 | `Pillow` + `OpenCV` — 4× 슈퍼샘플링 AA |
| 객체 탐지 | **YOLOv8** (`yolov8n.pt`) — 얼굴 bbox / smart crop |
| 배경 제거 | `rembg` (AI 누끼) |
| 영상 편집 | **Remotion 4.0** (React 기반) — `remotion-service/` |
| 애니메이션 | ComfyUI + AnimateDiff-Evolved |
| 캐릭터 LoRA | `gree_v1.safetensors` (kohya_ss 학습) |

---

## 스크립트 목록

| 파일 | 설명 |
|------|------|
| `draw_emotions.py` | 표정 직접 드로잉 (6종, 픽셀 좌표 기반) |
| `gen_expression_dataset.py` | 표정 LoRA 학습 데이터셋 생성 |
| `gen_dataset_v2.py` | 기본 데이터셋 생성 v2 |
| `gen_animate.py` | ComfyUI AnimateDiff 루프 애니메이션 생성 |
| `gen_pose_dataset.py` | 포즈 데이터셋 생성 (123종) |
| `cv_effects.py` | OpenCV + YOLO — 배경교체 / 화면교체 / 캐릭터 합성 |
| `make_char_video.py` | WebP → 누끼 MP4/WebM (rembg) |
| `remotion-service/` | Remotion 영상 편집 서비스 |

---

## 빠른 시작

```bash
# 1. 의존성 설치
pip install -r requirements.txt

# 2. 표정 합성 (그리 char_clean.png 필요)
python draw_emotions.py

# 3. 표정 데이터셋 생성 (1.png 필요)
python gen_expression_dataset.py

# 4. YOLO + 배경 합성
python cv_effects.py --mode yolo_composite \
  --input video.mp4 --char char_clean.png --model yolov8n.pt --out out.mp4

# 5. Remotion 영상 편집
cd remotion-service && npm install && npm run dev
```

---

## 폴더 구조

```
gree/
├── draw_emotions.py          # 표정 드로잉
├── gen_expression_dataset.py # 표정 데이터셋
├── gen_dataset_v2.py         # 데이터셋 v2
├── gen_animate.py            # AnimateDiff 생성
├── gen_pose_dataset.py       # 포즈 데이터셋
├── cv_effects.py             # OpenCV + YOLO 합성
├── make_char_video.py        # 캐릭터 영상 변환
├── remotion-service/         # Remotion 편집 서비스
├── yolov8n.pt                # YOLOv8 nano 모델 (로컬 전용, git 제외)
└── requirements.txt
```

---

## 관련 레포

- [rhlfur2055-prog/animation](https://github.com/rhlfur2055-prog/animation) — 그리 캐릭터 원본 + draw_emotions_v2 / gen_expression_dataset_v2
