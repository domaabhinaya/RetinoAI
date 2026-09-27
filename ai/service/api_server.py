"""RetinoAI AI engine HTTP service (STEP 9/15).

Exposes the unified inference pipeline to the existing Express backend:
  GET  /ai/health   -> module availability (models registered/trained?)
  POST /ai/infer    -> {image_base64, eye_side} -> structured AI result JSON

Run:  python -m ai.service.api_server   (default 127.0.0.1:5001)
"""
from __future__ import annotations

import base64
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from flask import Flask, jsonify, request
from flask_cors import CORS

from ai.common.eye_side import EyeSide  # noqa: E402
from ai.config import SERVICE_HOST, SERVICE_PORT  # noqa: E402

app = Flask("retinoai-engine")
CORS(app)


def _decode_image(image_b64: str):
    from PIL import Image

    raw = base64.b64decode(image_b64)
    return Image.open(io.BytesIO(raw)).convert("RGB")


@app.get("/ai/health")
def health():
    from ai.service.unified_inference import health

    return jsonify(health())


@app.post("/ai/infer")
def infer():
    from ai.service.unified_inference import analyze_image

    payload = request.get_json(silent=True) or {}
    image_b64 = payload.get("image_base64")
    eye_side = EyeSide.normalize(payload.get("eye_side"))
    if not image_b64:
        return jsonify({"error": "image_base64 is required"}), 400
    try:
        pil_image = _decode_image(image_b64)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"undecodable image: {exc}"}), 400

    try:
        result = analyze_image(pil_image, eye_side)
        return jsonify(result)
    except Exception as exc:  # noqa: BLE001
        return jsonify({
            "status": "FAILED",
            "error": str(exc),
            "eye_side": eye_side.value,
        }), 500


if __name__ == "__main__":
    app.run(host=SERVICE_HOST, port=SERVICE_PORT, threaded=True)
