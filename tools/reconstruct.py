#!/usr/bin/env python3
"""
reconstruct.py — COLMAP + 3D Gaussian Splatting offline pipeline.

Usage:
    python reconstruct.py <photo_dir> <model_name>

Example:
    python reconstruct.py ./photos/keyboard keyboard_rgb

The script will:
  Step 1  COLMAP feature extraction (GPU-accelerated)
  Step 2  COLMAP feature matching (exhaustive, suitable for <100 images)
  Step 3  COLMAP sparse reconstruction (Mapper)
  Step 4  Convert COLMAP model from BIN to TXT format
  Step 5  Train 3D Gaussian Splatting (30 000 iterations, ~20–30 min on RTX 3060+)
  Step 6  Convert PLY point cloud to web-compatible .splat format

Requirements:
  - COLMAP 3.8+ in PATH (or set COLMAP_PATH env var)
  - gaussian-splatting repo cloned alongside this script (or set GS_ROOT env var)
  - Python 3.10+ with packages from requirements.txt

Outputs:
  workspace/<model_name>/          COLMAP intermediate files (can be deleted)
  output/<model_name>/             3DGS training output
  ../assets/models/<model_name>.splat   Web-ready splat file
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

COLMAP_BIN = os.environ.get("COLMAP_PATH", "colmap")
GS_ROOT    = Path(os.environ.get("GS_ROOT", Path(__file__).parent.parent / "gaussian-splatting"))

# Output root dirs (relative to this script)
SCRIPT_DIR  = Path(__file__).parent.resolve()
WORKSPACE   = SCRIPT_DIR / "workspace"
OUTPUT_DIR  = SCRIPT_DIR / "output"
ASSETS_DIR  = SCRIPT_DIR.parent / "assets" / "models"

GS_TRAIN_PY = GS_ROOT / "train.py"

TRAIN_ITERATIONS  = 30_000
TRAIN_RESOLUTION  = 1920   # Reduce to 1280 or 800 if VRAM < 8 GB

# ---------------------------------------------------------------------------

def run(cmd: list[str], cwd: Path | None = None) -> None:
    """Run a subprocess, printing the command, raising on failure."""
    print(f"\n▶ {' '.join(str(c) for c in cmd)}")
    subprocess.run([str(c) for c in cmd], check=True, cwd=str(cwd) if cwd else None)


def colmap_reconstruct(photos: Path, model_ws: Path) -> None:
    """Run COLMAP SfM pipeline: feature extraction → matching → sparse reconstruction."""
    images_dir = model_ws / "images"
    db_path    = model_ws / "database.db"
    sparse_dir = model_ws / "sparse"

    model_ws.mkdir(parents=True, exist_ok=True)
    sparse_dir.mkdir(parents=True, exist_ok=True)

    # Symlink or copy images into workspace/images
    if images_dir.exists():
        shutil.rmtree(images_dir)
    images_dir.mkdir()
    for img in sorted(photos.iterdir()):
        if img.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}:
            dest = images_dir / img.name
            try:
                dest.symlink_to(img.resolve())
            except OSError:
                shutil.copy2(img, dest)

    # Step 1 – feature extraction
    run([
        COLMAP_BIN, "feature_extractor",
        "--database_path", db_path,
        "--image_path", images_dir,
        "--ImageReader.single_camera", "1",
        "--SiftExtraction.use_gpu", "1",
    ])

    # Step 2 – feature matching
    run([
        COLMAP_BIN, "exhaustive_matcher",
        "--database_path", db_path,
        "--SiftMatching.use_gpu", "1",
    ])

    # Step 3 – sparse reconstruction
    run([
        COLMAP_BIN, "mapper",
        "--database_path", db_path,
        "--image_path", images_dir,
        "--output_path", sparse_dir,
        "--Mapper.num_threads", "8",
    ])

    # Step 4 – convert BIN model to TXT (required by 3DGS)
    bin_model = sparse_dir / "0"
    txt_model = sparse_dir / "0_txt"
    txt_model.mkdir(exist_ok=True)
    run([
        COLMAP_BIN, "model_converter",
        "--input_path", bin_model,
        "--output_path", txt_model,
        "--output_type", "TXT",
    ])
    # Replace 0/ with the converted TXT version so 3DGS can read it
    shutil.rmtree(bin_model)
    txt_model.rename(bin_model)


def train_3dgs(model_ws: Path, model_out: Path, model_name: str) -> Path:
    """Run 3D Gaussian Splatting training and return the output PLY path."""
    if not GS_TRAIN_PY.exists():
        sys.exit(
            f"[ERROR] gaussian-splatting train.py not found at {GS_TRAIN_PY}.\n"
            "Clone https://github.com/graphdeco-inria/gaussian-splatting and set GS_ROOT."
        )

    run([
        sys.executable, GS_TRAIN_PY,
        "--source_path", model_ws,
        "--model_path", model_out,
        "--iterations", str(TRAIN_ITERATIONS),
        "--resolution", str(TRAIN_RESOLUTION),
        "--save_iterations", str(TRAIN_ITERATIONS),
        "--test_iterations", str(TRAIN_ITERATIONS),
    ])

    ply_path = model_out / "point_cloud" / f"iteration_{TRAIN_ITERATIONS}" / "point_cloud.ply"
    if not ply_path.exists():
        sys.exit(f"[ERROR] Expected PLY output not found: {ply_path}")
    return ply_path


def convert_splat(ply_path: Path, out_splat: Path) -> None:
    """Convert gaussian-splatting PLY output to web .splat format."""
    convert_script = SCRIPT_DIR / "convert_splat.py"
    if not convert_script.exists():
        sys.exit(f"[ERROR] convert_splat.py not found at {convert_script}")
    run([sys.executable, convert_script, str(ply_path), str(out_splat)])


# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="COLMAP + 3DGS offline reconstruction pipeline")
    parser.add_argument("photo_dir", type=Path, help="Directory containing input photographs")
    parser.add_argument("model_name", type=str, help="Output model name (used as filename stem)")
    parser.add_argument(
        "--iterations", type=int, default=TRAIN_ITERATIONS,
        help=f"3DGS training iterations (default: {TRAIN_ITERATIONS})"
    )
    parser.add_argument(
        "--resolution", type=int, default=TRAIN_RESOLUTION,
        help=f"Image resolution for 3DGS training (default: {TRAIN_RESOLUTION})"
    )
    args = parser.parse_args()

    photos   = args.photo_dir.resolve()
    name     = args.model_name

    if not photos.is_dir():
        sys.exit(f"[ERROR] Photo directory not found: {photos}")

    global TRAIN_ITERATIONS, TRAIN_RESOLUTION
    TRAIN_ITERATIONS = args.iterations
    TRAIN_RESOLUTION = args.resolution

    model_ws  = WORKSPACE / name
    model_out = OUTPUT_DIR / name

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    model_out.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  RGBBox reconstruction pipeline")
    print(f"  Model:  {name}")
    print(f"  Photos: {photos} ({sum(1 for f in photos.iterdir() if f.suffix.lower() in {'.jpg','.jpeg','.png'})} images)")
    print(f"{'='*60}\n")

    # Step 1–4: COLMAP
    print("── [1/3] Running COLMAP SfM ────────────────────────────────")
    colmap_reconstruct(photos, model_ws)

    # Step 5: 3DGS training
    print("── [2/3] Training 3D Gaussian Splatting ────────────────────")
    ply_path = train_3dgs(model_ws, model_out, name)

    # Step 6: Convert to .splat
    print("── [3/3] Converting PLY → .splat ───────────────────────────")
    out_splat = ASSETS_DIR / f"{name}.splat"
    convert_splat(ply_path, out_splat)

    print(f"\n✓ Done!  Output: {out_splat}")
    print(f"  Copy the LED map template from src/shared/led-positions/{name}.led-map.json")
    print(f"  and calibrate LED positions using the in-app LEDMapper tool.\n")


if __name__ == "__main__":
    main()
