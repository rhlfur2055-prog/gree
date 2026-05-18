"""cleanup_all.py
전 BVH 동작을 하네스 검증 → FAIL = 사람 모션 아님 → 산출물 완전 삭제.
PASS/WARN만 디스크에 보존. 최종 생존 목록 출력.
"""
import shutil
import importlib.util
from pathlib import Path

PP = Path(r"C:\tool\pp")
OUT = PP / "anim_final"
BVH = PP / "bvh"


def load(m):
    s = importlib.util.spec_from_file_location(m, PP / f"{m}.py")
    x = importlib.util.module_from_spec(s); s.loader.exec_module(x)
    return x


HARN = load("motion_harness")

# (렌더명, bvh파일, win)
TARGETS = [
    ("walk_real",        "walk.bvh",        180),
    ("run_real",         "run.bvh",         150),
    ("idle_real",        "idle.bvh",        240),
    ("sit_real",         "sit.bvh",         300),
    ("walk_tired_real",  "walk_tired.bvh",  200),
    ("pickup_real",      "pickup.bvh",      240),
    ("wave_real",        "wave.bvh",        200),
    ("jump_real",        "jump.bvh",        180),
    ("think_real",       "think.bvh",       240),
    ("point_real",       "point.bvh",       200),
    ("chair_sit_real",   "chair_sit.bvh",   240),
    ("chair_down_real",  "chair_down.bvh",  240),
]


def delete_outputs(name):
    removed = []
    for p in (OUT / f"{name}.mp4", OUT / f"{name}.gif"):
        if p.exists():
            p.unlink(); removed.append(p.name)
    fd = OUT / f"{name}_frames"
    if fd.exists():
        shutil.rmtree(fd); removed.append(f"{name}_frames/")
    return removed


if __name__ == "__main__":
    survived, purged, skipped = [], [], []
    for name, bvh, win in TARGETS:
        bp = BVH / bvh
        if not bp.exists():
            skipped.append(name)
            print(f"[SKIP] {name}: {bvh} 없음")
            continue
        v, _ = HARN.check(str(bp), win)
        if v == "FAIL":
            gone = delete_outputs(name)
            purged.append(name)
            print(f"[삭제] {name} FAIL → 제거: {gone or '산출물없음'}")
        else:
            survived.append((name, v))
            print(f"[유지] {name} {v}")

    print("\n=== 최종 결과 ===")
    print(f"  생존 ({len(survived)}): "
          f"{', '.join(f'{n}({v})' for n, v in survived) or '없음'}")
    print(f"  삭제 ({len(purged)}): {', '.join(purged) or '없음'}")
    print(f"  스킵 ({len(skipped)}): {', '.join(skipped) or '없음'}")
    if not survived:
        print("\n전 동작 FAIL — 사람 모션으로 인정된 클립 0개.")
        print("→ CMU BVH 번호 전면 교체 필요. verify_sample로 재선별 권장.")
