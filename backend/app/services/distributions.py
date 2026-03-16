from __future__ import annotations

import numpy as np
from sklearn.mixture import GaussianMixture

from .color_spaces import channel_config


def _sample_points(space_data: np.ndarray, sample_size: int) -> np.ndarray:
    flat = space_data.reshape(-1, 3)
    total = flat.shape[0]
    if total <= sample_size:
        return flat

    rng = np.random.default_rng(42)
    idx = rng.choice(total, size=sample_size, replace=False)
    return flat[idx]


def _build_gmm(
    flat_points: np.ndarray,
    n_components: int,
    gmm_sample_size: int,
) -> dict | None:
    if flat_points.shape[0] < 3:
        return None

    sampled = flat_points
    if flat_points.shape[0] > gmm_sample_size:
        rng = np.random.default_rng(123)
        idx = rng.choice(flat_points.shape[0], size=gmm_sample_size, replace=False)
        sampled = flat_points[idx]

    components = int(min(n_components, sampled.shape[0]))
    if components < 2:
        return None

    try:
        gmm = GaussianMixture(
            n_components=components,
            covariance_type="full",
            random_state=42,
            reg_covar=1e-5,
            max_iter=200,
        )
        gmm.fit(sampled)
    except ValueError:
        return None

    return {
        "n_components": int(components),
        "sample_count": int(sampled.shape[0]),
        "weights": gmm.weights_.astype(float).tolist(),
        "means": gmm.means_.astype(float).tolist(),
        "covariances": gmm.covariances_.astype(float).tolist(),
        "converged": bool(gmm.converged_),
        "lower_bound": float(gmm.lower_bound_),
    }


def _build_space_distribution(
    space_data: np.ndarray,
    color_space: str,
    histogram_bins: int,
    sample_size: int,
    gmm_components: int,
    gmm_sample_size: int,
) -> dict:
    cfg = channel_config(color_space)
    names = cfg["names"]
    ranges = cfg["ranges"]
    flat = space_data.reshape(-1, 3)

    channels = []
    for i, name in enumerate(names):
        counts, edges = np.histogram(
            flat[:, i],
            bins=histogram_bins,
            range=(ranges[i][0], ranges[i][1]),
        )
        channels.append(
            {
                "name": name,
                "counts": counts.astype(int).tolist(),
                "bin_edges": edges.astype(float).tolist(),
            }
        )

    points = _sample_points(space_data, sample_size).astype(float).tolist()
    means = np.mean(flat, axis=0).astype(float).tolist()
    stds = np.std(flat, axis=0).astype(float).tolist()
    gmm = _build_gmm(flat, n_components=gmm_components, gmm_sample_size=gmm_sample_size)

    return {
        "channels": channels,
        "points": points,
        "channel_ranges": ranges,
        "mean": means,
        "std": stds,
        "gmm": gmm,
    }


def build_distributions(
    rgb: np.ndarray,
    hsv: np.ndarray,
    lab: np.ndarray,
    histogram_bins: int,
    sample_size: int,
    gmm_components: int,
    gmm_sample_size: int,
) -> dict:
    return {
        "RGB": _build_space_distribution(
            rgb, "RGB", histogram_bins, sample_size, gmm_components, gmm_sample_size
        ),
        "HSV": _build_space_distribution(
            hsv, "HSV", histogram_bins, sample_size, gmm_components, gmm_sample_size
        ),
        "Lab": _build_space_distribution(
            lab, "Lab", histogram_bins, sample_size, gmm_components, gmm_sample_size
        ),
    }
