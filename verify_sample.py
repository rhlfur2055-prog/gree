"""verify_sample.py
BVH 표본 검증: 파일이 실제로 어떤 동작인지 분류.
사용: python verify_sample.py <input.bvh>
출력: 추정 동작 + Hips통계 + 미리보기 PNG 3장(시작/중간/끝)
"""
import sys
from pathlib import Path
import numpy as np
import bvhio
from PIL import Image, ImageDraw

OUT = Path(r"C:\tool\pp\anim_final\_samples")
OUT.mkdir(parents=True, exist_ok=True)
W, H = 368, 480


def main(bvh):
    name = Path(bvh).stem
    root = bvhio.readAsHierarchy(str(bvh))
    tot = root.getKeyframeRange()[1] + 1
    hips_y, foot_y, samples = [], [], []
    idxs = np.linspace(0, tot - 1, min(tot, 120)).astype(int)
    for fi in idxs:
        root.loadPose(int(fi))
        p = {j[0].Name: np.array([j[0].PositionWorld.x,
                                  j[0].PositionWorld.y,
                                  j[0].PositionWorld.z])
             for j in root.layout()}
        hips_y.append(p["Hips"][1])
        foot_y.append(min(p.get("LeftFoot", p["Hips"])[1],
                          p.get("RightFoot", p["Hips"])[1]))
        samples.append(p)

    hy = np.array(hips_y); fy = np.array(foot_y)
    hip_h = hy - fy                       # 발 대비 엉덩이 높이
    drop = (hip_h.max() - hip_h.min()) / (hip_h.max() + 1e-6)
    h_travel = np.linalg.norm(
        np.ptp(np.array([s["Hips"] for s in samples]), axis=0))

    # 표본 분류 규칙
    if drop > 0.35 and h_travel < 30:
        guess = "앉기/일어서기 (Hips 높이 크게 변화, 이동 적음)"
    elif h_travel > 60:
        guess = "걷기/달리기 (수평 이동 큼)"
    elif hip_h.std() / (hip_h.mean() + 1e-6) < 0.05 and h_travel < 20:
        guess = "정지/제스처 (높이·이동 거의 없음)"
    else:
        guess = "혼합/불확실 — 육안 확인 필요"

    print(f"\n=== 표본: {name} ({tot}프레임) ===")
    print(f"  Hips높이 변화율 : {drop*100:.1f}%")
    print(f"  수평 이동량     : {h_travel:.1f}")
    print(f"  추정 동작       : {guess}")

    # 미리보기 3장 (시작 10% / 중간 / 끝 90%)
    BONES = [("Hips","Spine"),("Spine","Neck"),("Neck","Head"),
             ("Hips","LeftUpLeg"),("LeftUpLeg","LeftLeg"),
             ("LeftLeg","LeftFoot"),("Hips","RightUpLeg"),
             ("RightUpLeg","RightLeg"),("RightLeg","RightFoot"),
             ("Spine","LeftArm"),("LeftArm","LeftForeArm"),
             ("Spine","RightArm"),("RightArm","RightForeArm")]
    pts = [s for s in samples]
    allp = np.array([v for s in pts for v in s.values()])
    sc = (H*0.62)/((allp[:,1].max()-allp[:,1].min())+1e-6)
    for tag, ix in (("start", 0), ("mid", len(pts)//2),
                    ("end", len(pts)-1)):
        s = pts[ix]; hip = s["Hips"]
        ffy = min(s.get("LeftFoot",hip)[1], s.get("RightFoot",hip)[1])
        proj = {k: (W/2+(v[0]-hip[0])*sc, H*0.92-(v[1]-ffy)*sc)
                for k,v in s.items()}
        img = Image.new("RGB",(W,H),(255,255,255))
        d = ImageDraw.Draw(img)
        for a,b in BONES:
            if a in proj and b in proj:
                d.line([proj[a],proj[b]], fill=(30,30,30), width=7)
        if "Head" in proj:
            hx,hyy = proj["Head"]
            d.ellipse([hx-24,hyy-24,hx+24,hyy+24],
                      outline=(30,30,30), width=7)
        img.save(OUT / f"{name}_{tag}.png")
    print(f"  미리보기: {OUT}\\{name}_[start|mid|end].png")
    return guess


if __name__ == "__main__":
    main(sys.argv[1])
