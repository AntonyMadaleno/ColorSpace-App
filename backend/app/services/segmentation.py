from __future__ import annotations

import colorsys

import numpy as np
from sklearn.cluster import KMeans
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler

from app.schemas import SegmentOptions

from .color_spaces import channel_config, convert_from_rgb


def _label_to_palette(n_labels: int) -> np.ndarray:
    # Golden ratio hue stepping creates a stable, well-distributed palette.
    hues = np.mod(np.arange(n_labels, dtype=np.float32) * 0.61803398875, 1.0)
    palette = []
    for h in hues:
        r, g, b = colorsys.hsv_to_rgb(float(h), 0.65, 0.95)
        palette.append([int(r * 255), int(g * 255), int(b * 255)])
    return np.array(palette, dtype=np.uint8)


def _hsv_to_cyclic_features(
    hsv_features: np.ndarray,
    hsv_volume_shape: str,
) -> np.ndarray:
    hue_unit = np.mod(hsv_features[:, 0] / 360.0, 1.0)
    theta = hue_unit * (2.0 * np.pi)
    sat = hsv_features[:, 1]
    val = hsv_features[:, 2]
    radial = sat * val if hsv_volume_shape == "cone" else sat
    return np.column_stack((np.cos(theta) * radial, np.sin(theta) * radial, val)).astype(np.float32)


def _apply_channel_weights(
    transformed: np.ndarray,
    color_space: str,
    channel_weights: tuple[float, float, float],
) -> np.ndarray:
    weights = np.asarray(channel_weights, dtype=np.float32)
    weighted = transformed.astype(np.float32, copy=True)

    if color_space.upper() == "HSV":
        # Hue and saturation both control the radial term in cyclic HSV projection.
        weighted[:, 0] *= weights[0] * weights[1]
        weighted[:, 1] *= weights[0] * weights[1]
        weighted[:, 2] *= weights[2]
        return weighted

    weighted *= weights.reshape(1, 3)
    return weighted


def run_knn_segmentation(rgb: np.ndarray, options: SegmentOptions) -> dict:
    h, w, _ = rgb.shape
    color_space = options.color_space.upper()
    rgb_features = rgb.reshape(-1, 3).astype(np.float32)
    hsv_features = convert_from_rgb(rgb, "HSV").reshape(-1, 3).astype(np.float32)
    lab_features = convert_from_rgb(rgb, "Lab").reshape(-1, 3).astype(np.float32)
    features_by_space: dict[str, np.ndarray] = {
        "RGB": rgb_features,
        "HSV": hsv_features,
        "Lab": lab_features,
    }

    features = features_by_space[color_space]
    metric_features = (
        _hsv_to_cyclic_features(features, options.hsv_volume_shape)
        if color_space == "HSV"
        else features
    )
    original = rgb_features
    if metric_features.shape[0] < 2:
        raise ValueError("La segmentation requiert au moins 2 pixels.")

    sample_step = max(1, options.sample_step)
    sample_idx = np.arange(0, metric_features.shape[0], sample_step, dtype=np.int64)
    sampled = metric_features[sample_idx]
    if sampled.shape[0] < 2:
        sampled = metric_features

    n_segments = min(options.n_segments, sampled.shape[0])
    if n_segments < 2:
        raise ValueError("Impossible de segmenter: pas assez de points d'apprentissage.")

    transformed = metric_features
    transformed_sampled = sampled
    scaler = None
    if options.normalize:
        scaler = StandardScaler()
        transformed_sampled = scaler.fit_transform(sampled)
        transformed = scaler.transform(metric_features)

    transformed_sampled = _apply_channel_weights(
        transformed_sampled, color_space, options.channel_weights
    )
    transformed = _apply_channel_weights(transformed, color_space, options.channel_weights)

    kmeans = KMeans(n_clusters=n_segments, random_state=42, n_init=10)
    sampled_labels = kmeans.fit_predict(transformed_sampled)

    n_neighbors = min(max(1, options.n_neighbors), transformed_sampled.shape[0])
    knn = KNeighborsClassifier(
        n_neighbors=n_neighbors,
        metric=options.distance,
        weights="distance",
    )
    knn.fit(transformed_sampled, sampled_labels)
    labels = knn.predict(transformed)
    label_map = labels.reshape(h, w)

    # Average original RGB colors inside each label for a clean segmented image.
    segment_colors = []
    for label in range(n_segments):
        mask = labels == label
        if np.any(mask):
            segment_colors.append(np.mean(original[mask], axis=0))
        else:
            segment_colors.append(np.zeros(3, dtype=np.float32))
    segment_colors_arr = np.array(segment_colors, dtype=np.float32)
    segmented = segment_colors_arr[labels].reshape(h, w, 3).astype(np.uint8)

    palette = _label_to_palette(n_segments)
    label_preview = palette[labels].reshape(h, w, 3)
    label_index_preview = np.repeat(label_map[..., None].astype(np.uint8), 3, axis=2)

    counts = np.bincount(labels, minlength=n_segments)
    label_stats = []
    for label in range(n_segments):
        color = segment_colors_arr[label].astype(int).tolist()
        label_stats.append(
            {
                "label": int(label),
                "pixel_count": int(counts[label]),
                "ratio": float(counts[label] / labels.shape[0]),
                "mean_rgb": color,
            }
        )

    used_options = {
        "color_space": options.color_space,
        "n_neighbors": n_neighbors,
        "n_segments": n_segments,
        "distance": options.distance,
        "normalize": options.normalize,
        "channel_weights": [float(v) for v in options.channel_weights],
        "sample_step": sample_step,
        "hsv_volume_shape": options.hsv_volume_shape,
        "training_points": int(sampled.shape[0]),
        "scaler": "standard" if scaler is not None else "none",
        "hue_cyclic": color_space == "HSV",
    }

    max_points = 12000
    sample_vis_idx = np.arange(features.shape[0], dtype=np.int64)
    if sample_vis_idx.size > max_points:
        step = int(np.ceil(sample_vis_idx.size / max_points))
        sample_vis_idx = sample_vis_idx[::step]

    sampled_labels = labels[sample_vis_idx]
    cluster_points_by_space: dict[str, list[list[float | int]]] = {}
    cluster_centroids_by_space: dict[str, list[dict[str, object]]] = {}
    channel_names_by_space: dict[str, list[str]] = {}
    channel_ranges_by_space: dict[str, list[list[float]]] = {}

    for space_name, space_features in features_by_space.items():
        sampled_features = space_features[sample_vis_idx]
        cluster_points_by_space[space_name] = [
            [float(point[0]), float(point[1]), float(point[2]), int(label)]
            for point, label in zip(sampled_features, sampled_labels, strict=True)
        ]

        centroids = []
        for label in range(n_segments):
            mask = labels == label
            if np.any(mask):
                center = space_features[mask].mean(axis=0)
            else:
                center = np.zeros(3, dtype=np.float32)
            centroids.append(
                {
                    "label": int(label),
                    "point": [float(center[0]), float(center[1]), float(center[2])],
                    "pixel_count": int(counts[label]),
                }
            )
        cluster_centroids_by_space[space_name] = centroids

        config = channel_config(space_name)
        channel_names_by_space[space_name] = config["names"]
        channel_ranges_by_space[space_name] = config["ranges"]

    return {
        "segmented_rgb": segmented,
        "label_preview": label_preview,
        "label_index_preview": label_index_preview,
        "label_stats": label_stats,
        "used_options": used_options,
        "cluster_points_by_space": cluster_points_by_space,
        "cluster_centroids_by_space": cluster_centroids_by_space,
        "channel_names_by_space": channel_names_by_space,
        "channel_ranges_by_space": channel_ranges_by_space,
    }
