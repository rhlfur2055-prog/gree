"""motion_harness.py
BVH 렌더 동작의 '사람다움' 정량 검증 하네스.
사용: python motion_harness.py <input.bvh> [win]
판정: PASS / WARN / FAIL 항목별 출력.
"""
import sys
from pathlib import Path

import numpy as np
import bvhio


def load(bvh):
    root = bvhio.readAsHierarchy(str(bvh))
    total = root.getKeyframeRange()[1] + 1
    fr = []
    for fi in range(total):
        root.loadPose(fi)
        fr.append({j[0].Name: np.array([j[0].PositionWorld.x,
                                        j[0].PositionWorld.y,
                                        j[0].PositionWorld.z])
                   for j in root.layout()})
    return fr


def active_window(fr, win):
    n = len(fr)
    if n <= win:
        return 0, n
    keys = list(fr[0].keys())
    mot = np.zeros(n)
    for i in range(1, n):
        mot[i] = sum(np.linalg.norm(fr[i][k] - fr[i - 1][k])
                     for k in keys)
    cs = np.cumsum(mot)
    bs, bv = 0, -1.0
    for s in range(0, n - win, max(1, win // 8)):
        v = cs[s + win] - cs[s]
        if v > bv:
            bv, bs = v, s
    return bs, bs + win


def ang(a, b, c):
    """b를 꼭짓점으로 하는 a-b-c 각도(도)."""
    v1, v2 = a - b, c - b
    cs = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9)
    return np.degrees(np.arccos(np.clip(cs, -1, 1)))


def check(bvh, win=240):
    fr = load(bvh)
    s, e = active_window(fr, win)
    seg = fr[s:e]
    n = len(seg)
    name = Path(bvh).stem
    print(f"\n=== {name}  (활성구간 {s}~{e}/{len(fr)}, {n}프레임) ===")
    res = []

    # 1) 발 미끄러짐: 접지(최저 5%)인 프레임에서 발 수평 이동량
    slides = []
    for foot in ("LeftFoot", "RightFoot"):
        if foot not in seg[0]:
            continue
        ys = np.array([f[foot][1] for f in seg])
        thr = np.percentile(ys, 5) + (ys.max() - ys.min()) * 0.08
        sl = 0.0
        for i in range(1, n):
            if ys[i] < thr and ys[i - 1] < thr:
                d = seg[i][foot] - seg[i - 1][foot]
                sl += np.hypot(d[0], d[2])
        scale = np.mean([np.linalg.norm(f["Hips"] - f.get(foot, f["Hips"]))
                         for f in seg]) + 1e-6
        slides.append(sl / scale)
    fs = max(slides) if slides else 0
    tag = "PASS" if fs < 1.5 else "WARN" if fs < 4 else "FAIL"
    res.append(("발 미끄러짐", f"{fs:.2f} (정규화)", tag))

    # 2) 무릎 각도 범위 (인체 ~30~180°)
    bad = 0
    for f in seg:
        for u, k, a in (("LeftUpLeg", "LeftLeg", "LeftFoot"),
                        ("RightUpLeg", "RightLeg", "RightFoot")):
            if u in f and k in f and a in f:
                kn = ang(f[u], f[k], f[a])
                if kn < 25 or kn > 185:
                    bad += 1
    r = bad / (n * 2 + 1e-9)
    tag = "PASS" if r < 0.02 else "WARN" if r < 0.1 else "FAIL"
    res.append(("무릎 가동범위 위반", f"{r*100:.1f}% 프레임", tag))

    # 3) 저크(가속도 급변) = 끊김/순간이동
    hips = np.array([f["Hips"] for f in seg])
    vel = np.diff(hips, axis=0)
    acc = np.diff(vel, axis=0)
    jerk = np.linalg.norm(np.diff(acc, axis=0), axis=1)
    jm = jerk.mean() + 1e-9
    spike = np.sum(jerk > jm * 6) / (len(jerk) + 1e-9)
    tag = "PASS" if spike < 0.03 else "WARN" if spike < 0.08 else "FAIL"
    res.append(("이동 끊김(저크 스파이크)", f"{spike*100:.1f}%", tag))

    # 4) 동작 활성도
    span = hips.max(0) - hips.min(0)
    rng = np.linalg.norm(span)
    tag = "PASS" if rng > 5 else "WARN" if rng > 1 else "FAIL"
    res.append(("동작 활성도(Hips 이동폭)", f"{rng:.1f}", tag))

    w = max(len(a) for a, _, _ in res)
    for a, v, t in res:
        print(f"  [{t:4}] {a:<{w}}  {v}")
    fails = [a for a, _, t in res if t == "FAIL"]
    warns = [a for a, _, t in res if t == "WARN"]
    verdict = ("FAIL" if fails else "WARN" if warns else "PASS")
    print(f"  -> 종합: {verdict}"
          + (f"  (FAIL: {', '.join(fails)})" if fails else "")
          + (f"  (WARN: {', '.join(warns)})" if warns and not fails else ""))
    score = 100
    for a, _, t in res:
        if t == "WARN":
            score -= 12
        elif t == "FAIL":
            score -= 30
    score = max(0, score)
    print(f"  -> 점수: {score}/100")
    return verdict, score


if __name__ == "__main__":
    win = int(sys.argv[2]) if len(sys.argv) > 2 else 240
    check(sys.argv[1], win)[0]
