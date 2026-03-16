from __future__ import annotations

import base64
import hashlib
import io
from dataclasses import dataclass

import numpy as np
from PIL import Image, UnidentifiedImageError

from .errors import ImageProcessingError


SUPPORTED_FORMATS = {"PNG", "JPEG", "JPG", "PPM"}


@dataclass
class LoadedImage:
    rgb: np.ndarray
    metadata: dict
    file_hash: str


def load_image_from_bytes(data: bytes, filename: str | None = None) -> LoadedImage:
    if not data:
        raise ImageProcessingError("Le fichier image est vide.")

    try:
        image = Image.open(io.BytesIO(data))
    except UnidentifiedImageError as exc:
        raise ImageProcessingError("Format d'image invalide ou fichier corrompu.") from exc

    image_format = (image.format or "").upper()
    if image_format not in SUPPORTED_FORMATS:
        raise ImageProcessingError(
            "Format non supporte. Utilise PNG, JPG/JPEG ou PPM."
        )

    if image.width == 0 or image.height == 0:
        raise ImageProcessingError("Image vide ou dimensions invalides.")

    rgb_img = image.convert("RGB")
    rgb = np.asarray(rgb_img, dtype=np.uint8)
    file_hash = hashlib.sha256(data).hexdigest()

    metadata = {
        "filename": filename or "upload",
        "format": image_format,
        "width": int(rgb.shape[1]),
        "height": int(rgb.shape[0]),
        "pixel_count": int(rgb.shape[0] * rgb.shape[1]),
    }
    return LoadedImage(rgb=rgb, metadata=metadata, file_hash=file_hash)


def array_to_data_uri_png(image: np.ndarray) -> str:
    pil = Image.fromarray(image.astype(np.uint8), mode="RGB")
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"

