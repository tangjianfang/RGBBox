#!/usr/bin/env python3
"""
convert_splat.py — Convert 3D Gaussian Splatting PLY to web-compatible .splat format.

Usage:
    python convert_splat.py <input.ply> <output.splat>

The .splat binary format stores each gaussian point as 32 bytes:
    Bytes  0–11   XYZ position      (3 × float32)
    Bytes 12–15   RGBA color        (4 × uint8)
    Bytes 16–27   XYZ scale         (3 × float32)
    Bytes 28–31   WXYZ quaternion   (4 × uint8, normalised to [-1,1] via (v-128)/128)

This matches the format expected by @mkkellogg/gaussian-splats-3d.

Dependencies:
    pip install numpy plyfile
"""

import argparse
import struct
import sys
from pathlib import Path

import numpy as np

try:
    from plyfile import PlyData
except ImportError:
    sys.exit("[ERROR] plyfile not installed.  Run: pip install plyfile")


# ---------------------------------------------------------------------------
# Spherical harmonics DC coefficient → linear RGB
# ---------------------------------------------------------------------------
SH_C0 = 0.28209479177387814


def sh_dc_to_rgb(sh: np.ndarray) -> np.ndarray:
    """Convert the zeroth-order SH coefficient to a 0..255 uint8 colour."""
    rgb = np.clip((sh * SH_C0 + 0.5) * 255, 0, 255).astype(np.uint8)
    return rgb


# ---------------------------------------------------------------------------

def convert(ply_path: Path, splat_path: Path) -> None:
    print(f"Reading {ply_path} …")
    plydata = PlyData.read(str(ply_path))
    verts   = plydata["vertex"]
    n       = len(verts)
    print(f"  {n:,} gaussians found.")

    # ── Position ──────────────────────────────────────────────────────────
    x = np.array(verts["x"], dtype=np.float32)
    y = np.array(verts["y"], dtype=np.float32)
    z = np.array(verts["z"], dtype=np.float32)

    # ── Colour from SH DC coefficients ────────────────────────────────────
    sh_r  = np.array(verts["f_dc_0"], dtype=np.float32)
    sh_g  = np.array(verts["f_dc_1"], dtype=np.float32)
    sh_b  = np.array(verts["f_dc_2"], dtype=np.float32)
    r_u8  = np.clip((sh_r * SH_C0 + 0.5) * 255, 0, 255).astype(np.uint8)
    g_u8  = np.clip((sh_g * SH_C0 + 0.5) * 255, 0, 255).astype(np.uint8)
    b_u8  = np.clip((sh_b * SH_C0 + 0.5) * 255, 0, 255).astype(np.uint8)

    # Opacity: sigmoid(opacity_logit) → uint8
    opacity_logit = np.array(verts["opacity"], dtype=np.float32)
    alpha_f32     = 1.0 / (1.0 + np.exp(-opacity_logit))
    a_u8          = np.clip(alpha_f32 * 255, 0, 255).astype(np.uint8)

    # ── Scale (stored as log-scale in the PLY) ────────────────────────────
    sx = np.exp(np.array(verts["scale_0"], dtype=np.float32)).astype(np.float32)
    sy = np.exp(np.array(verts["scale_1"], dtype=np.float32)).astype(np.float32)
    sz = np.exp(np.array(verts["scale_2"], dtype=np.float32)).astype(np.float32)

    # ── Rotation quaternion (w x y z stored as float in PLY) ──────────────
    rot_w = np.array(verts["rot_0"], dtype=np.float32)
    rot_x = np.array(verts["rot_1"], dtype=np.float32)
    rot_y = np.array(verts["rot_2"], dtype=np.float32)
    rot_z = np.array(verts["rot_3"], dtype=np.float32)

    # Normalise and encode to uint8 in the range [-1, 1] → [0, 255]
    norms = np.sqrt(rot_w**2 + rot_x**2 + rot_y**2 + rot_z**2)
    norms = np.where(norms == 0, 1, norms)  # guard divide-by-zero
    rot_w /= norms
    rot_x /= norms
    rot_y /= norms
    rot_z /= norms

    # ── Sort by opacity (descending) for better progressive rendering ──────
    order  = np.argsort(-alpha_f32)
    x, y, z         = x[order], y[order], z[order]
    r_u8, g_u8, b_u8, a_u8 = r_u8[order], g_u8[order], b_u8[order], a_u8[order]
    sx, sy, sz       = sx[order], sy[order], sz[order]
    rot_w, rot_x, rot_y, rot_z = rot_w[order], rot_x[order], rot_y[order], rot_z[order]

    def f32_to_u8_quat(v: np.ndarray) -> np.ndarray:
        """Map float quaternion component [-1,1] → uint8 [0,255]."""
        return np.clip((v * 128 + 128), 0, 255).astype(np.uint8)

    qw_u8 = f32_to_u8_quat(rot_w)
    qx_u8 = f32_to_u8_quat(rot_x)
    qy_u8 = f32_to_u8_quat(rot_y)
    qz_u8 = f32_to_u8_quat(rot_z)

    # ── Pack into 32-byte records ──────────────────────────────────────────
    print(f"Writing {splat_path} …")
    splat_path.parent.mkdir(parents=True, exist_ok=True)

    with open(splat_path, "wb") as f:
        for i in range(n):
            record = struct.pack(
                "<fffBBBBfffBBBB",
                x[i], y[i], z[i],
                r_u8[i], g_u8[i], b_u8[i], a_u8[i],
                sx[i], sy[i], sz[i],
                qw_u8[i], qx_u8[i], qy_u8[i], qz_u8[i],
            )
            f.write(record)

    file_mb = splat_path.stat().st_size / 1_048_576
    print(f"  ✓  {n:,} gaussians → {file_mb:.1f} MB  ({splat_path})")


# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert 3DGS PLY point cloud to web-compatible .splat format"
    )
    parser.add_argument("input_ply",   type=Path, help="Input PLY file from 3DGS training")
    parser.add_argument("output_splat", type=Path, help="Output .splat file path")
    args = parser.parse_args()

    if not args.input_ply.exists():
        sys.exit(f"[ERROR] Input PLY not found: {args.input_ply}")

    convert(args.input_ply, args.output_splat)


if __name__ == "__main__":
    main()
