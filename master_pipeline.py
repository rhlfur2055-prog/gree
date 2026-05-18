"""master_pipeline.py
14개 동작 전체를 자동 수집·검증·렌더·점수화 → PASS/SKIP 보고.

규칙:
  - 각 동작별로 CMU BVH 후보를 순회하며 motion_harness 점수 측정
  - 점수 ≥ 99 후보가 있으면 그 BVH로 블렌더 렌더 → PASS
  - 점수 < 99 이면 다음 후보로
  - 후보 3개까지 → 그래도 99 미만이면 최고점 후보로 렌더하고 SKIP 표시
  - 렌더는 활성구간만 슬라이싱 (기본 150프레임 ≈ 6초)
"""
import json
import importlib.util
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
import bvhio

PP = Path(r"C:\tool\pp")
BVH_DIR = PP / "bvh"
OUT_DIR = PP / "anim_final"
BLENDER = r"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe"
RENDER_SCRIPT = str(PP / "render_vrm.py")
MIR = ("https://raw.githubusercontent.com/una-dinosauria/"
       "cmu-mocap/master/data/{s}/{f}")

BVH_DIR.mkdir(parents=True, exist_ok=True)


def load_mod(m):
    s = importlib.util.spec_from_file_location(m, PP / f"{m}.py")
    x = importlib.util.module_from_spec(s); s.loader.exec_module(x)
    return x


HARN = load_mod("motion_harness")

# 동작 → BVH 후보 [(subject, filename, default_win), ...]
# 첫 후보 부터 순회, 점수 ≥ 99 면 채택
REGISTRY = {
    "walk":      [("07", "07_01.bvh", 180), ("08", "08_01.bvh", 180),
                  ("35", "35_01.bvh", 180)],
    "run":       [("09", "09_01.bvh", 150), ("02", "02_03.bvh", 150),
                  ("09", "09_02.bvh", 150)],
    "idle":      [("13", "13_17.bvh", 240), ("14", "14_18.bvh", 240),
                  ("13", "13_14.bvh", 240)],
    "sit":       [("13", "13_29.bvh", 300), ("13", "13_20.bvh", 300),
                  ("13", "13_21.bvh", 300)],
    "chair_sit": [("114","114_06.bvh", 240), ("114","114_05.bvh", 240),
                  ("114","114_07.bvh", 240)],
    "stand_up":  [("13", "13_31.bvh", 240), ("13", "13_30.bvh", 240),
                  ("114","114_04.bvh", 240)],
    "pickup":    [("13", "13_30.bvh", 240), ("56", "56_01.bvh", 240),
                  ("13", "13_32.bvh", 240)],
    "wave":      [("13", "13_28.bvh", 200), ("14", "14_28.bvh", 200),
                  ("13", "13_27.bvh", 200)],
    "jump":      [("13", "13_11.bvh", 180), ("13", "13_42.bvh", 180),
                  ("16", "16_01.bvh", 180)],
    "stairs":    [("36", "36_02.bvh", 240), ("36", "36_03.bvh", 240),
                  ("88", "88_01.bvh", 240)],
    "carry":     [("41", "41_01.bvh", 240), ("38", "38_01.bvh", 240),
                  ("41", "41_02.bvh", 240)],
    "stretch":   [("13", "13_10.bvh", 240), ("14", "14_19.bvh", 240),
                  ("114","114_16.bvh", 240)],
    "sit_type":  [("14", "14_01.bvh", 240), ("14", "14_06.bvh", 240),
                  ("14", "14_02.bvh", 240)],
    "turn":      [("13", "13_02.bvh", 180), ("16", "16_15.bvh", 180),
                  ("14", "14_05.bvh", 180)],
    "lie_down":  [("79", "79_01.bvh", 240), ("80", "80_01.bvh", 240),
                  ("137","137_01.bvh", 240)],
}


def fetch_bvh(subj: str, fn: str) -> Path:
    dst = BVH_DIR / fn
    if dst.exists() and dst.stat().st_size > 1000:
        return dst
    url = MIR.format(s=subj.zfill(3), f=fn)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(dst, "wb") as o:
            shutil.copyfileobj(r, o)
        return dst if dst.stat().st_size > 1000 else None
    except Exception as e:
        print(f"  [fetch FAIL] {fn}: {e}")
        if dst.exists():
            dst.unlink()
        return None


def find_active_window(bvh_path: Path, win: int):
    """Hips 이동량으로 가장 활발한 win 길이 구간 시작 프레임 반환."""
    root = bvhio.readAsHierarchy(str(bvh_path))
    n = root.getKeyframeRange()[1] + 1
    if n <= win:
        return 0, n
    hips = np.zeros((n, 3))
    for i in range(n):
        root.loadPose(i)
        for j in root.layout():
            if j[0].Name == "Hips":
                p = j[0].PositionWorld
                hips[i] = (p.x, p.y, p.z)
                break
    motion = np.zeros(n)
    motion[1:] = np.linalg.norm(np.diff(hips, axis=0), axis=1)
    cs = np.cumsum(motion)
    best_s, best_v = 0, -1.0
    for s in range(0, n - win, max(1, win // 8)):
        v = cs[s + win] - cs[s]
        if v > best_v:
            best_v, best_s = v, s
    return best_s, win


def render_blender(bvh_path: Path, name: str, yaw: int, start: int, count: int):
    cmd = [BLENDER, "--background", "--python", RENDER_SCRIPT, "--",
           str(bvh_path), name, str(yaw), str(start), str(count)]
    mp4 = OUT_DIR / f"{name}.mp4"
    if mp4.exists():
        mp4.unlink()
    t0 = time.time()
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=600)
        out_bytes = (r.stdout or b"") + (r.stderr or b"")
        out = out_bytes.decode("utf-8", errors="replace")
    except Exception as e:
        out = f"subprocess error: {e}"
    elapsed = time.time() - t0
    # 실렌더 성공 판정: mp4 파일이 존재 + 50KB 이상 (헤더만 있는 빈 파일 배제)
    done = mp4.exists() and mp4.stat().st_size > 50 * 1024
    err = "" if done else out[-800:]
    return done, elapsed, err


def process_motion(motion: str, candidates: list) -> dict:
    print(f"\n=== {motion} ===")
    best_score, best_bvh, best_win = -1, None, None
    attempts = 0
    for subj, fn, win in candidates[:3]:
        attempts += 1
        print(f"  [{attempts}/3] {fn}  ", end="")
        bp = fetch_bvh(subj, fn)
        if not bp:
            print("→ fetch 실패")
            continue
        try:
            _, score = HARN.check(str(bp), win)
        except Exception as e:
            print(f"→ harness 예외: {e}")
            continue
        print(f"→ 점수 {score}")
        if score > best_score:
            best_score, best_bvh, best_win = score, bp, win
        if score >= 99:
            break

    if best_bvh is None:
        return {"motion": motion, "status": "SKIP",
                "reason": "후보 전부 fetch/harness 실패",
                "score": 0, "mp4": None}

    # 활성구간은 render_vrm.py 내부에서 Blender 도메인으로 자동 계산
    out_name = f"{motion}_vrm"
    print(f"  rendering: {best_bvh.name}  yaw=25  (auto window, max 150 frames)")
    ok, elapsed, err = render_blender(best_bvh, out_name, 25, -1, 150)
    mp4 = OUT_DIR / f"{out_name}.mp4"
    if not ok or not mp4.exists():
        print(f"  렌더 실패 ({elapsed:.1f}s): {err}")
        return {"motion": motion, "status": "SKIP",
                "reason": f"render fail: {err[:200]}",
                "score": best_score, "mp4": None}

    size_kb = mp4.stat().st_size // 1024
    print(f"  → {mp4.name} ({size_kb}KB, {elapsed:.1f}s)")
    status = "PASS" if best_score >= 99 else "SKIP"
    return {"motion": motion, "status": status,
            "score": best_score, "bvh": best_bvh.name,
            "mp4": str(mp4), "size_kb": size_kb,
            "elapsed_s": round(elapsed, 1)}


def main():
    results = []
    t0 = time.time()
    for motion, cands in REGISTRY.items():
        try:
            results.append(process_motion(motion, cands))
        except Exception as e:
            print(f"  [{motion}] 예외: {e}")
            results.append({"motion": motion, "status": "SKIP",
                            "reason": str(e), "score": 0, "mp4": None})
    elapsed = time.time() - t0

    print("\n\n=" * 30)
    print(f"최종 결과 (총 {elapsed:.0f}s, {len(results)}동작)")
    print("=" * 60)
    passes = [r for r in results if r["status"] == "PASS"]
    skips = [r for r in results if r["status"] == "SKIP"]
    for r in results:
        s = f"{r['status']:5} {r['motion']:12} 점수={r.get('score','?'):3}"
        if r.get("mp4"):
            s += f"  → {Path(r['mp4']).name} ({r.get('size_kb','?')}KB)"
        if r["status"] == "SKIP" and "reason" in r:
            s += f"  ({r['reason'][:60]})"
        print(s)
    print(f"\nPASS {len(passes)} / SKIP {len(skips)}")

    json_path = OUT_DIR / "master_pipeline_results.json"
    json_path.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"상세 JSON: {json_path}")


if __name__ == "__main__":
    main()
