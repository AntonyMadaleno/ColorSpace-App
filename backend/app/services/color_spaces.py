from __future__ import annotations

import numpy as np


def rgb_to_hsv(rgb: np.ndarray) -> np.ndarray:
    rgb_float = rgb.astype(np.float32) / 255.0
    r = rgb_float[..., 0]
    g = rgb_float[..., 1]
    b = rgb_float[..., 2]

    cmax = np.max(rgb_float, axis=-1)
    cmin = np.min(rgb_float, axis=-1)
    delta = cmax - cmin

    hue = np.zeros_like(cmax, dtype=np.float32)
    non_zero = delta > 1e-8

    mask_r = (cmax == r) & non_zero
    mask_g = (cmax == g) & non_zero
    mask_b = (cmax == b) & non_zero

    hue[mask_r] = ((g[mask_r] - b[mask_r]) / delta[mask_r]) % 6.0
    hue[mask_g] = ((b[mask_g] - r[mask_g]) / delta[mask_g]) + 2.0
    hue[mask_b] = ((r[mask_b] - g[mask_b]) / delta[mask_b]) + 4.0
    hue = hue * 60.0
    hue[hue < 0.0] += 360.0

    saturation = np.zeros_like(cmax, dtype=np.float32)
    cmax_non_zero = cmax > 1e-8
    saturation[cmax_non_zero] = delta[cmax_non_zero] / cmax[cmax_non_zero]

    value = cmax.astype(np.float32)
    return np.stack([hue, saturation, value], axis=-1).astype(np.float32)


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    rgb_float = rgb.astype(np.float32) / 255.0

    linear = np.where(
        rgb_float <= 0.04045,
        rgb_float / 12.92,
        ((rgb_float + 0.055) / 1.055) ** 2.4,
    )

    # sRGB D65 -> XYZ
    matrix = np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ],
        dtype=np.float32,
    )
    xyz = linear @ matrix.T

    ref_white = np.array([0.95047, 1.0, 1.08883], dtype=np.float32)
    xyz_scaled = xyz / ref_white

    epsilon = 216.0 / 24389.0
    kappa = 24389.0 / 27.0

    f_xyz = np.where(
        xyz_scaled > epsilon,
        np.cbrt(xyz_scaled),
        (kappa * xyz_scaled + 16.0) / 116.0,
    )

    l = 116.0 * f_xyz[..., 1] - 16.0
    a = 500.0 * (f_xyz[..., 0] - f_xyz[..., 1])
    b = 200.0 * (f_xyz[..., 1] - f_xyz[..., 2])
    return np.stack([l, a, b], axis=-1).astype(np.float32)


def convert_from_rgb(rgb: np.ndarray, color_space: str) -> np.ndarray:
    color_space_upper = color_space.upper()
    if color_space_upper == "RGB":
        return rgb.astype(np.float32)
    if color_space_upper == "HSV":
        return rgb_to_hsv(rgb)
    if color_space_upper == "LAB":
        return rgb_to_lab(rgb)
    raise ValueError(f"Espace couleur non supporte: {color_space}")


def channel_config(color_space: str) -> dict:
    color_space_upper = color_space.upper()
    if color_space_upper == "RGB":
        return {
            "names": ["R", "G", "B"],
            "ranges": [[0.0, 255.0], [0.0, 255.0], [0.0, 255.0]],
        }
    if color_space_upper == "HSV":
        return {
            "names": ["H", "S", "V"],
            "ranges": [[0.0, 360.0], [0.0, 1.0], [0.0, 1.0]],
        }
    if color_space_upper == "LAB":
        return {
            "names": ["L", "a", "b"],
            "ranges": [[0.0, 100.0], [-128.0, 127.0], [-128.0, 127.0]],
        }
    raise ValueError(f"Espace couleur non supporte: {color_space}")

