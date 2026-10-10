"""Worker client stub: pull chunk job -> train -> atomic checkpoint -> upload.
Verify by re-evaluating on held-out views. Mirrors plan.md sections 6/8."""
import json
import os
import tempfile
import hashlib
from pathlib import Path

QUEUE = Path(__file__).resolve().parent.parent / "registry" / "places.json"


def pull_job() -> dict | None:
    places = json.loads(QUEUE.read_text())
    for p in places:
        if p["status"] in ("queued", "training") and p["licenseTier"] == "A":
            return {"placeId": p["id"], "lat": p["lat"], "lon": p["lon"],
                    "targetLOD": p["targetLOD"], "iterations": 3000}
    return None


def atomic_checkpoint(out_dir: Path, step: int, payload: dict) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    data = json.dumps(payload, sort_keys=True).encode()
    digest = hashlib.sha256(data).hexdigest()[:16]
    tmp_fd, tmp = tempfile.mkstemp(dir=str(out_dir), prefix=f"ckpt-{step}-")
    try:
        with os.fdopen(tmp_fd, "wb") as f:
            f.write(data)
        final = out_dir / f"ckpt-{step}-{digest}.json"
        os.replace(tmp, final)  # atomic on both POSIX + Windows
        return final
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def train_stub(job: dict, out_dir: Path, log=print) -> dict:
    """Placeholder for gsplat MCMC run. Emits checkpoints every 1000 iters."""
    for step in (1000, 2000, job["iterations"]):
        ckpt = atomic_checkpoint(out_dir, step, {"job": job, "step": step})
        log(f"[worker] checkpoint {step} -> {ckpt.name}")
    # fake held-out metrics; real run replaces with PSNR/LPIPS eval
    return {"psnr": 24.5, "lpips": 0.32, "seamErrorPx": 1.8,
            "registrationErrorM": 0.9, "gaussians": 1_200_000}


if __name__ == "__main__":
    job = pull_job()
    print(json.dumps(job or {"job": None}))
    if job:
        m = train_stub(job, Path("checkpoints") / job["placeId"])
        print(json.dumps(m))
