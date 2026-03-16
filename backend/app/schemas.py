from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


ColorSpaceName = Literal["RGB", "HSV", "Lab"]
DistanceName = Literal["euclidean", "manhattan", "chebyshev", "minkowski"]


class AnalyzeOptions(BaseModel):
    sample_size: int = Field(
        default=6000,
        ge=500,
        le=40000,
        description="Maximum number of points sampled for scatter/projection views.",
    )
    histogram_bins: int = Field(
        default=48,
        ge=8,
        le=128,
        description="Number of bins per channel histogram.",
    )
    gmm_components: int = Field(
        default=4,
        ge=2,
        le=10,
        description="Number of Gaussian components used to approximate distributions.",
    )
    gmm_sample_size: int = Field(
        default=4500,
        ge=500,
        le=30000,
        description="Maximum number of points sampled to fit GMM in each color space.",
    )


class SegmentOptions(BaseModel):
    color_space: ColorSpaceName = Field(default="Lab")
    n_neighbors: int = Field(default=7, ge=1, le=50)
    n_segments: int = Field(default=6, ge=2, le=24)
    distance: DistanceName = Field(default="euclidean")
    normalize: bool = Field(default=True)
    channel_weights: tuple[float, float, float] = Field(
        default=(1.0, 1.0, 1.0),
        description="Per-channel weights applied after optional normalization.",
    )
    sample_step: int = Field(
        default=4,
        ge=1,
        le=25,
        description="Keep one training pixel every N pixels for KNN fitting.",
    )
    hsv_volume_shape: Literal["cylinder", "cone"] = Field(
        default="cylinder",
        description="HSV geometric embedding used for KNN distances.",
    )

    @field_validator("channel_weights")
    @classmethod
    def validate_channel_weights(cls, value: tuple[float, float, float]) -> tuple[float, float, float]:
        if any(weight < 0.0 for weight in value):
            raise ValueError("Les poids de canaux doivent etre positifs ou nuls.")
        if any(weight > 8.0 for weight in value):
            raise ValueError("Les poids de canaux doivent rester <= 8.0.")
        return value
