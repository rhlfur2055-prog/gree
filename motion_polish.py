"""motion_polish.py
사람다움 후처리: 발고정 + 스무딩 + 카메라추적.
auto_mocap.project() 결과(pj 리스트)를 받아 보정된 pj 리스트 반환.
사용: from motion_polish import polish; pj = polish(pj)
"""
import numpy as np
from scipy.signal import savgol_filter


def smooth(pj, win=7, poly=3):
    """Savitzky-Golay: 동작 형태 보존하며 떨림만 제거 (mocap 표준)."""
    n = len(pj)
    if n < win:
        return pj
    if win % 2 == 0:
        win += 1
    keys = pj[0].keys()
    arr = {k: np.array([p[k] for p in pj]) for k in keys}
    sm = {}
    for k in keys:
        a = arr[k]
        w = min(win, n if n % 2 else n - 1)
        if w < poly + 2:
            sm[k] = a
        else:
            sm[k] = np.stack([
                savgol_filter(a[:, c], w, poly) for c in range(a.shape[1])
            ], axis=1)
    return [{k: (float(sm[k][i, 0]), float(sm[k][i, 1])) for k in keys}
            for i in range(n)]


def foot_lock(pj):
    """접지 발(화면상 최저 8%)을 그 구간 평균 X에 고정 → 미끄럼 제거."""
    for foot in ("LeftFoot", "RightFoot"):
        if foot not in pj[0]:
            continue
        ys = np.array([p[foot][1] for p in pj])
        thr = ys.max() - (ys.max() - ys.min()) * 0.92  # 화면 y는 클수록 아래
        i = 0
        while i < len(pj):
            if ys[i] >= thr:                            # 접지 시작
                j = i
                while j < len(pj) and ys[j] >= thr:
                    j += 1
                fx = np.mean([pj[k][foot][0] for k in range(i, j)])
                for k in range(i, j):                   # 구간 X 고정
                    pj[k][foot] = np.array([fx, pj[k][foot][1]])
                i = j
            else:
                i += 1
    return pj


def camera_track(pj, W=368, H=480, margin=0.12):
    """프레임별 캐릭터 bbox가 항상 화면 안에 들어오게 팬+줌."""
    out = []
    for p in pj:
        xs = [v[0] for v in p.values()]
        ys = [v[1] for v in p.values()]
        bw = max(xs) - min(xs) + 1e-6
        bh = max(ys) - min(ys) + 1e-6
        s = min(W * (1 - margin) / bw, H * (1 - margin) / bh, 1.0)
        cx = (max(xs) + min(xs)) / 2
        cy = (max(ys) + min(ys)) / 2
        out.append({k: np.array([(v[0] - cx) * s + W / 2,
                                 (v[1] - cy) * s + H * 0.55])
                    for k, v in p.items()})
    return out


def polish(pj, do_smooth=True, do_lock=True, do_cam=True):
    if do_lock:
        pj = foot_lock(pj)
    if do_smooth:
        pj = smooth(pj, win=9)
    if do_cam:
        pj = camera_track(pj)
    return pj
