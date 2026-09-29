"""RetinoAI AI engine HTTP service (STEP 9/15).

Exposes the verified unified inference pipeline over HTTP.

Primary routes (used by the RetinoAI backend / frontend):
  GET  /healthz        -> API status, model availability + versions, device
  POST /predict        -> {image_base64 | file, eye_side} -> structured AI result
  POST /batch-predict  -> {images: [{image_base64 | file, eye_side}]} -> per-image results

Legacy aliases kept for backward compatibility:
  GET /ai/health (== /healthz)      POST /ai/infer (== /predict)

Pipeline (unchanged, no new logic):
  Image -> Quality Gate -> PRIMARY_DR -> RFMiD -> Uncertainty -> Grad-CAM
        -> Structured Result -> LLM explanation

Uploaded images are processed fully IN MEMORY and are never written to disk.
All outputs are AI-assisted screening results, never a diagnosis.

Run:  python -m ai.service.api_server   (default 127.0.0.1:5001)
"""
from __future__ import annotations

import base64
import binascii
import io
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from flask import Flask, jsonify, request
from flask_cors import CORS

from ai.common.eye_side import EyeSide  # noqa: E402
from ai.config import SERVICE_HOST, SERVICE_PORT  # noqa: E402

app = Flask("retinoai-engine")

# --- CORS ---------------------------------------------------------------
# The React frontend (artifacts/retinoai, Vite) runs on port 3000 and proxies
# /api to the Express backend on 5000. This AI engine is called by that
# backend, so CORS only matters for direct browser access during development.
# Configure with RETINOAI_AI_CORS_ORIGINS (comma separated). No wildcard.
_DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
]
_allowed = [o.strip() for o in os.environ.get("RETINOAI_AI_CORS_ORIGINS", "").split(",") if o.strip()]
CORS(app, origins=_allowed or _DEFAULT_ORIGINS, supports_credentials=False)

app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("RETINOAI_MAX_UPLOAD_BYTES", 25 * 1024 * 1024))

_ALLOWED_FORMATS = {"JPEG", "PNG", "BMP", "TIFF", "WEBP"}
SAFETY_NOTE = (
    "AI-assisted screening output only. Not a diagnosis. "
    "A qualified healthcare professional must review all findings."
)


class ApiError(Exception):
    """Client-facing error with an HTTP status code."""

    def __init__(self, message: str, status: int = 400, code: str = "BAD_REQUEST"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


# --- helpers ------------------------------------------------------------
def _error(message: str, status: int, code: str, **extra):
    payload = {
        "status": "ERROR",
        "error": message,
        "error_code": code,
        "safety_statement": SAFETY_NOTE,
    }
    payload.update(extra)
    return jsonify(payload), status


def _parse_eye_side(raw) -> EyeSide:
    """Strict eye-side parsing: an unusable value is a client error, not UNKNOWN."""
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        raise ApiError(
            "eye_side is required; expected RIGHT, LEFT, OD or OS", 400, "INVALID_EYE_SIDE"
        )
    eye = EyeSide.normalize(raw if isinstance(raw, str) else str(raw))
    if eye is EyeSide.UNKNOWN:
        raise ApiError(
            f"Invalid eye_side {raw!r}; expected RIGHT/LEFT (or OD/OS)", 400, "INVALID_EYE_SIDE"
        )
    return eye


def _decode_base64_image(image_b64: str):
    from PIL import Image, UnidentifiedImageError

    if not isinstance(image_b64, str) or not image_b64.strip():
        raise ApiError("image_base64 must be a non-empty base64 string", 400, "INVALID_IMAGE")
    payload = image_b64.split(",", 1)[-1] if image_b64.startswith("data:") else image_b64
    try:
        raw = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise ApiError(f"image_base64 is not valid base64: {exc}", 400, "INVALID_IMAGE") from exc
    if not raw:
        raise ApiError("Decoded image payload is empty", 400, "INVALID_IMAGE")
    try:
        img = Image.open(io.BytesIO(raw))
        fmt = (img.format or "").upper()
        img.load()  # force full decode -> catches corrupt/truncated files
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ApiError(f"Unreadable or unsupported image: {exc}", 400, "INVALID_IMAGE") from exc
    if fmt and fmt not in _ALLOWED_FORMATS:
        raise ApiError(f"Unsupported image format '{fmt}'", 400, "INVALID_IMAGE")
    return img.convert("RGB")


def _open_upload(stream):
    from PIL import Image, UnidentifiedImageError

    try:
        stream.seek(0)
        img = Image.open(stream)
        img.load()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ApiError(f"Unreadable or unsupported image: {exc}", 400, "INVALID_IMAGE") from exc
    return img.convert("RGB")


def _image_from_request(payload: dict, files=None):
    """Resolve an image from either a multipart file upload or base64 JSON."""
    if files:
        for key in ("file", "image", "image_file"):
            fh = files.get(key)
            if fh is not None and getattr(fh, "filename", ""):
                return _open_upload(fh.stream)
    b64 = payload.get("image_base64") or payload.get("imageBase64")
    if b64:
        return _decode_base64_image(b64)
    raise ApiError("An image is required (image_base64 or multipart 'file')", 400, "MISSING_IMAGE")


def _device_info() -> dict:
    try:
        import torch

        return {
            "device": "cuda" if torch.cuda.is_available() else "cpu",
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        }
    except Exception:  # noqa: BLE001
        return {"device": "unknown", "gpu": None}


def _model_block(model_name: str) -> dict:
    from ai.common import model_registry
    from ai.common.schema import PENDING

    info = model_registry.get_model_info(model_name)
    if not info:
        return {
            "model_name": model_name,
            "registered": False,
            "status": PENDING,
            "model_version": None,
            "checkpoint_path": None,
        }
    return {
        "model_name": model_name,
        "registered": True,
        "status": "AVAILABLE",
        "model_version": info.get("model_version"),
        "dataset_name": info.get("dataset_name"),
        "dataset_version": info.get("dataset_version"),
        "checkpoint_path": info.get("checkpoint_path"),
    }


# --- error handlers -----------------------------------------------------
@app.errorhandler(ApiError)
def _handle_api_error(exc: ApiError):
    return _error(exc.message, exc.status, exc.code)


@app.errorhandler(413)
def _handle_too_large(_exc):
    return _error("Uploaded image exceeds the maximum allowed size", 413, "PAYLOAD_TOO_LARGE")


@app.errorhandler(404)
def _handle_not_found(_exc):
    return _error("Endpoint not found", 404, "NOT_FOUND")


@app.errorhandler(405)
def _handle_method(_exc):
    return _error("Method not allowed for this endpoint", 405, "METHOD_NOT_ALLOWED")


@app.errorhandler(Exception)
def _handle_unexpected(exc: Exception):
    from werkzeug.exceptions import HTTPException

    if isinstance(exc, HTTPException):
        return _error(exc.description, exc.code or 500, "HTTP_ERROR")
    return _error(f"Inference failed: {exc}", 500, "INFERENCE_FAILED")


# --- routes -------------------------------------------------------------
def _health_payload() -> dict:
    from ai import config
    from ai.common.schema import utc_now

    dev = _device_info()
    primary = _model_block(config.MODEL_NAME)
    secondary = _model_block(config.SECONDARY_MODEL_NAME)
    return {
        "status": "ok",
        "service": "retinoai-engine",
        "api_version": "1.0.0",
        "time": utc_now(),
        "device": dev["device"],
        "gpu": dev["gpu"],
        "primary_dr": primary,
        "secondary_ocular": secondary,
        "quality_gate": {"status": "not_configured"},
        "models_loaded": primary["status"] == "AVAILABLE" and secondary["status"] == "AVAILABLE",
        "problem_type": "PRIMARY_DR 5-class; RFMiD 46-label multi-label",
        "safety_statement": SAFETY_NOTE,
        "screening_disclaimer": (
            "Development/dataset metrics. Outputs are AI-assisted screening results, "
            "not a diagnosis. Specialist evaluation recommended; requires clinical review."
        ),
    }


@app.get("/healthz")
def healthz():
    return jsonify(_health_payload())


@app.get("/ai/health")  # legacy alias
def ai_health():
    return jsonify(_health_payload())


def _require_models() -> None:
    from ai import config
    from ai.common import model_registry

    for name in (config.MODEL_NAME, config.SECONDARY_MODEL_NAME):
        if model_registry.get_model_info(name) is None:
            raise ApiError(
                f"Model '{name}' is not registered; AI screening is unavailable",
                503,
                "MODEL_UNAVAILABLE",
            )


def _run_one(pil_image, eye: EyeSide) -> dict:
    from ai.service.unified_inference import analyze_image

    # NOTE: analyze_image() calls EyeSide.normalize() directly, which does not
    # unwrap an EyeSide enum (str() yields "EyeSide.RIGHT"). Pass the plain
    # string value so the eye side survives the round trip.
    return analyze_image(pil_image, eye.value)


@app.post("/predict")
def predict():
    payload = request.get_json(silent=True) or {}
    if "eye_side" in request.form:
        payload = dict(payload)
        payload["eye_side"] = request.form.get("eye_side")
    eye = _parse_eye_side(payload.get("eye_side"))
    pil = _image_from_request(payload, request.files)
    _require_models()
    try:
        return jsonify(_run_one(pil, eye))
    except ApiError:
        raise
    except Exception as exc:  # noqa: BLE001
        return _error(f"Inference failed: {exc}", 500, "INFERENCE_FAILED", eye_side=eye.value)


@app.post("/ai/infer")  # legacy alias
def ai_infer():
    return predict()


@app.post("/batch-predict")
def batch_predict():
    payload = request.get_json(silent=True) or {}
    items = payload.get("images") if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        raise ApiError(
            "'images' must be a list of {image_base64, eye_side} objects", 400, "INVALID_REQUEST"
        )
    if not items:
        raise ApiError("'images' must contain at least one entry", 400, "INVALID_REQUEST")
    if len(items) > 32:
        raise ApiError("A batch may contain at most 32 images", 400, "BATCH_TOO_LARGE")

    results = []
    succeeded = 0
    for idx, item in enumerate(items):
        entry: dict = {"index": idx}
        try:
            if not isinstance(item, dict):
                raise ApiError("each batch entry must be an object", 400, "INVALID_REQUEST")
            eye = _parse_eye_side(item.get("eye_side"))
            entry["eye_side"] = eye.value
            pil = _image_from_request(item, None)
            result = _run_one(pil, eye)
            entry["status"] = result.get("status")
            entry["result"] = result
            succeeded += 1
        except ApiError as exc:
            entry.update({"status": "ERROR", "error": exc.message, "error_code": exc.code})
        except Exception as exc:  # noqa: BLE001
            entry.update({"status": "ERROR", "error": str(exc), "error_code": "INFERENCE_FAILED"})
        results.append(entry)

    return jsonify({
        "status": "COMPLETED",
        "count": len(results),
        "succeeded": succeeded,
        "failed": len(results) - succeeded,
        "results": results,
        "safety_statement": SAFETY_NOTE,
    })


if __name__ == "__main__":
    app.run(host=SERVICE_HOST, port=SERVICE_PORT, threaded=True)


