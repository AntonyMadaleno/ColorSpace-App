from __future__ import annotations

import json
from typing import Type, TypeVar

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError

from .schemas import AnalyzeOptions, SegmentOptions
from .services.cache import LRUCache
from .services.color_spaces import convert_from_rgb
from .services.distributions import build_distributions
from .services.errors import ImageProcessingError
from .services.image_io import array_to_data_uri_png, load_image_from_bytes
from .services.segmentation import run_knn_segmentation

TModel = TypeVar("TModel", bound=BaseModel)

app = FastAPI(
    title="ColorSpace API",
    version="0.1.0",
    description="Backend API for color-space analysis and KNN segmentation.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

conversion_cache = LRUCache(max_size=8)


def _parse_form_options(raw: str | None, model: Type[TModel]) -> TModel:
    if raw is None or not raw.strip():
        return model()
    try:
        payload = json.loads(raw)
        return model.model_validate(payload)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail="Le champ options doit etre un JSON valide.",
        ) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc


def _get_conversions(file_hash: str, rgb):
    cached = conversion_cache.get(file_hash)
    if cached is not None:
        return cached

    conversions = {
        "RGB": rgb.astype("float32"),
        "HSV": convert_from_rgb(rgb, "HSV"),
        "Lab": convert_from_rgb(rgb, "Lab"),
    }
    conversion_cache.set(file_hash, conversions)
    return conversions


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/analyze")
async def analyze_image(
    file: UploadFile = File(...),
    options: str | None = Form(default=None),
):
    params = _parse_form_options(options, AnalyzeOptions)
    file_bytes = await file.read()

    try:
        loaded = load_image_from_bytes(file_bytes, filename=file.filename)
    except ImageProcessingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    conversions = _get_conversions(loaded.file_hash, loaded.rgb)
    distributions = build_distributions(
        rgb=conversions["RGB"],
        hsv=conversions["HSV"],
        lab=conversions["Lab"],
        histogram_bins=params.histogram_bins,
        sample_size=params.sample_size,
        gmm_components=params.gmm_components,
        gmm_sample_size=params.gmm_sample_size,
    )

    return {
        "metadata": loaded.metadata,
        "preview_image": array_to_data_uri_png(loaded.rgb),
        "distributions": distributions,
        "options_used": params.model_dump(),
    }


@app.post("/api/segment")
async def segment_image(
    file: UploadFile = File(...),
    options: str | None = Form(default=None),
):
    params = _parse_form_options(options, SegmentOptions)
    file_bytes = await file.read()

    try:
        loaded = load_image_from_bytes(file_bytes, filename=file.filename)
    except ImageProcessingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        result = run_knn_segmentation(loaded.rgb, params)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive API guard
        raise HTTPException(status_code=500, detail="Erreur interne de segmentation.") from exc

    return {
        "metadata": loaded.metadata,
        "segmented_image": array_to_data_uri_png(result["segmented_rgb"]),
        "label_map_image": array_to_data_uri_png(result["label_preview"]),
        "label_index_image": array_to_data_uri_png(result["label_index_preview"]),
        "label_stats": result["label_stats"],
        "used_options": result["used_options"],
        "cluster_points_by_space": result["cluster_points_by_space"],
        "cluster_centroids_by_space": result["cluster_centroids_by_space"],
        "channel_names_by_space": result["channel_names_by_space"],
        "channel_ranges_by_space": result["channel_ranges_by_space"],
    }
