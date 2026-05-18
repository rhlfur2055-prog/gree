"""purge_zip.py
stick_walk.zip 내용 정리: 구버전 손코딩 + 중간 프레임폴더 삭제,
BVH 실모션 mp4/gif만 보존. 실행 전 무엇이 지워지는지 먼저 출력(드라이런).
사용: python purge_zip.py           (드라이런: 목록만)
      python purge_zip.py --apply   (실제 삭제)
"""
import sys
import shutil
from pathlib import Path

ROOT = Path(r"C:\tool\pp\anim_final")   # 압축 푼 위치 기준
APPLY = "--apply" in sys.argv

# 보존: BVH 실모션 (_real 접미사)
# 삭제1: 구버전 손코딩 mp4/gif (목록 명시)
OLD = ["stick_walk", "walk", "run", "idle", "wave", "think",
       "jump", "dev_works", "dev_debug", "dev_magic",
       "dev_prod_down", "sit", "dance", "panic", "point",
       "facepalm", "shrug", "going_work", "going_home",
       "error_404", "despair"]

to_del = []

# 1) 구버전 mp4/gif (단, _real 은 제외)
for stem in OLD:
    for ext in ("mp4", "gif"):
        p = ROOT / f"{stem}.{ext}"
        if p.exists():
            to_del.append(p)

# 2) 모든 *_frames/ 폴더 (대응 mp4 존재 시 중간산출물로 간주)
for d in ROOT.glob("*_frames"):
    if d.is_dir():
        mp4 = ROOT / f"{d.name.replace('_frames','')}.mp4"
        to_del.append(d)   # 프레임은 mp4로 대체되므로 삭제

# 3) _cap (자막버전 구산출물)
for p in ROOT.glob("*_cap.*"):
    to_del.append(p)

size = 0
print(f"{'[삭제예정]' if not APPLY else '[삭제실행]'} "
      f"총 {len(to_del)}개\n")
for p in to_del:
    if p.is_dir():
        s = sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
        n = len(list(p.rglob("*")))
        print(f"  DIR  {p.name}/  ({n}개 파일, {s//1024}KB)")
    else:
        s = p.stat().st_size
        print(f"  FILE {p.name}  ({s//1024}KB)")
    size += s

print(f"\n총 회수 용량: {size//1024//1024}MB")

# 보존 목록 출력
keep = sorted(p.name for p in ROOT.glob("*_real.mp4"))
print(f"\n[보존] BVH 실모션 mp4 {len(keep)}개: {', '.join(keep)}")

if APPLY:
    for p in to_del:
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)
        elif p.exists():
            p.unlink()
    print("\n삭제 완료.")
else:
    print("\n드라이런입니다. 실제 삭제하려면 --apply 추가 실행.")
