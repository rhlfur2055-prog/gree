# 시스템 아키텍처

gree 파이프라인의 전체 시스템 구성 및 데이터 흐름 명세.

---

## 레이어 구조

```mermaid
flowchart TB
    subgraph L1["1. 입력 레이어"]
        I1[char_clean.png<br/>원본 캐릭터]
        I2[gree_base.png<br/>3D 베이스 정면]
        I3[scripts.yaml<br/>대본]
    end

    subgraph L2["2. 생성 레이어"]
        G1[Pillow 2D<br/>draw_emotions]
        G2[ComfyUI 3D<br/>gen_3d_img2img]
        G3[ControlNet<br/>gen_dataset_v2]
        G4[Pose Augment<br/>gen_pose_dataset]
    end

    subgraph L3["3. 학습 레이어"]
        T1[kohya_ss<br/>LoRA v1~v6]
        T2[AnimateDiff<br/>MotionLoRA]
    end

    subgraph L4["4. 합성 레이어"]
        C1[rembg + bbox<br/>normalize]
        C2[PIL overlay<br/>tear/sweat]
        C3[YOLO + OpenCV<br/>cv_effects]
        C4[AnimateDiff<br/>16fr loop]
    end

    subgraph L5["5. 편집 레이어"]
        E1[Remotion 4.0<br/>React]
        E2[TTS<br/>자막]
        E3[BGM<br/>오디오 믹스]
    end

    subgraph L6["6. 배포 레이어"]
        D1[GitHub Actions<br/>CI/CD]
        D2[Vercel<br/>정적 배포]
        D3[YouTube<br/>Shorts 업로드]
    end

    I1 --> G1 & G3 & G4
    I2 --> G2
    I3 --> E2
    G1 & G2 --> C1
    G3 & G4 --> T1
    T1 --> G2 & C4
    T2 --> C4
    C1 --> C2 --> E1
    C3 --> E1
    C4 --> E1
    E1 & E2 & E3 --> D2 & D3
    D1 -.lint+test.-> L2 & L4 & L5
```

---

## 데이터 흐름

### 학습 데이터 생성
```
원본 1장 → augment 154장 → caption .txt 154개 → kohya_ss → LoRA v6
```

### 3D 표정 12종 생성
```
gree_base.png → ComfyUI /upload → img2img(denoise 0.75~0.88)
  → PreviewImage → /view?type=temp → 다운로드 → normalize → PIL overlay
  → emotions_3d_norm/{emotion}.png × 12
```

### 영상 합성
```
char.webp → rembg → char.mp4 (투명 webm)
       ↓
video.mp4 + char.mp4 → YOLO bbox + OpenCV composite → composite.mp4
       ↓
composite.mp4 + scripts.yaml → Remotion → final.mp4 → YouTube
```

---

## 컴포넌트 간 인터페이스

| 컴포넌트 A | 컴포넌트 B | 인터페이스 |
|-----------|-----------|-----------|
| `gen_3d_img2img.py` | ComfyUI | HTTP /prompt + /history + /view |
| `normalize_3d_v2.py` | rembg | Python API (remove function) |
| `cry_tear_overlay.py` | PIL | ImageDraw + alpha_composite |
| `cv_effects.py` | YOLOv8 | ultralytics.YOLO Python API |
| `remotion-service/` | Node 18 | React component → CLI render |
| GitHub Actions | Python/Node | runner + secrets |

---

## 디렉토리 책임 분리

| 경로 | 책임 | git 관리 |
|------|------|---------|
| `C:\tool\pp\` | 표정/데이터셋 생성 스크립트 | ✓ |
| `C:\tool\pp\ComfyUI\` | 추론 엔진 (외부) | ✗ |
| `C:\tool\kohya_ss\` | LoRA 학습 도구 (외부) | ✗ |
| `D:\lora_train\` | 학습 데이터 + 모델 (대용량) | ✗ |
| `C:\youtube\` | 메인 레포 (코드/문서) | ✓ |
| `C:\youtube\remotion-service\` | 영상 편집 서비스 | ✓ |
