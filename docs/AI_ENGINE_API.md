# RetinoAI AI Engine — Backend API

The Flask AI engine (`ai/service/api_server.py`) exposes the verified
PRIMARY_DR + RFMiD screening pipeline over HTTP.

- **Base URL (default):** `http://127.0.0.1:5001`
- **Start:** `python -m ai.service.api_server`
- **Host/Port env:** `RETINOAI_AI_SERVICE_HOST`, `RETINOAI_AI_SERVICE_PORT`

| Model | Name | Version | Task |
|---|---|---|---|
| PRIMARY_DR | `RetinoAI-DR-EffNetB0` | 1.0.0 | 5-class DR grading (single label) |
| Secondary ocular (RFMiD) | `RetinoAI-Ocular-RFMiD-EffNetB0` | 1.0.0 | 46-label **multi-label** (sigmoid per label) |

Both are resolved at runtime from `reports/model_registry.json`; the service
never hardcodes a checkpoint.

---

## Pipeline

```
Retinal image
  -> Image Quality Gate        (NOT_CONFIGURED until a real quality model exists)
  -> PRIMARY_DR                (5-class)
  -> RFMiD secondary screening (46-label multi-label, threshold 0.5)
  -> Uncertainty               (normalized entropy)
  -> Grad-CAM                  (model attention, not lesion localization)
  -> Structured AI result
  -> LLM explanation           (template fallback when no API key)
```

Uploaded images are processed **entirely in memory** and are never written to disk.

---

## 1. `GET /healthz`

Model availability, versions and device.

```json
{
  "status": "ok",
  "service": "retinoai-engine",
  "api_version": "1.0.0",
  "device": "cuda",
  "gpu": "NVIDIA GeForce RTX 3050 6GB Laptop GPU",
  "primary_dr": {
    "model_name": "RetinoAI-DR-EffNetB0", "registered": true, "status": "AVAILABLE",
    "model_version": "1.0.0", "dataset_name": "PRIMARY_DR",
    "dataset_version": "16338bf06958",
    "checkpoint_path": ".../checkpoints/dr_effnetb0_full_v1b_best.pt"
  },
  "secondary_ocular": {
    "model_name": "RetinoAI-Ocular-RFMiD-EffNetB0", "registered": true, "status": "AVAILABLE",
    "model_version": "1.0.0", "dataset_name": "RFMiD", "dataset_version": "eedb75d21054",
    "checkpoint_path": ".../checkpoints/rfmid_multilabel_v1_best.pt"
  },
  "quality_gate": { "status": "not_configured" },
  "models_loaded": true,
  "safety_statement": "AI-assisted screening output only. Not a diagnosis. ..."
}
```

`status` is `PENDING` for an unregistered model — the service never fabricates
availability. **Alias:** `GET /ai/health` (identical).

---

## 2. `POST /predict`

### Request — JSON (base64)
```json
{ "image_base64": "<base64 PNG/JPEG>", "eye_side": "RIGHT" }
```
`eye_side` accepts `RIGHT` / `LEFT` (also `OD` / `OS`). A missing or
unrecognised value is a `400`, not silently `UNKNOWN`.

### Request — multipart upload
`file` = image part, `eye_side` = form field (`image` / `image_file` also accepted).

```bash
curl -X POST http://127.0.0.1:5001/predict \
  -H 'Content-Type: application/json' \
  -d '{"image_base64":"<base64>","eye_side":"RIGHT"}'
```

### Response structure (real values)
```json
{
  "eye_side": "RIGHT",
  "status": "COMPLETED",
  "image_quality": { "status": "NOT_CONFIGURED", "score": null, "confidence": null },
  "primary_dr": {
    "status": "COMPLETED", "class_id": 3, "label": "Severe DR",
    "confidence": 0.9978,
    "probabilities": [0.0, 0.0, 0.0005, 0.9978, 0.0016],
    "uncertainty_value": 0.0104, "needs_human_review": false
  },
  "secondary_findings": [
    { "finding": "Disease_Risk", "confidence": 0.9996, "eye_side": "LEFT",
      "source": "rfmid_multilabel_model" }
  ],
  "uncertainty": { "status": "AVAILABLE", "value": 0.0104 },
  "explainability": { "status": "AVAILABLE", "method": "grad_cam",
                      "heatmap_base64": "...", "overlay_base64": "...",
                      "attention_description": "Model attention ... not proof of a disease ..." },
  "model_versioning": {
    "primary_dr": { "loaded": true, "model_version": "1.0.0" },
    "secondary_ocular": { "loaded": true, "model_version": "1.0.0",
                          "dataset_version": "eedb75d21054" },
    "quality_gate": "not_configured", "pipeline_version": "unified-1.0.0"
  },
  "priority_hint": "high_priority",
  "needs_human_review": false,
  "llm_explanation": {
    "status": "COMPLETED", "provider": "template",
    "screening_summary": "AI-assisted screening of the RIGHT eye identified ...",
    "uncertainty_statement": "Prediction uncertainty (normalized entropy) is ...",
    "safety_statement": "These results are AI-assisted screening outputs, not a diagnosis. ..."
  }
}
```

`primary_dr.probabilities` is always 5 values ordered
`[No DR, Mild DR, Moderate DR, Severe DR, Proliferative DR]`.
`secondary_findings` is a **list** — multiple simultaneous ocular findings — and

---

## 3. `POST /batch-predict`

```json
{ "images": [
    { "image_base64": "<base64>", "eye_side": "RIGHT" },
    { "image_base64": "<base64>", "eye_side": "LEFT" }
]}
```

Maximum 32 images per request.

```json
{
  "status": "COMPLETED",
  "count": 4, "succeeded": 2, "failed": 2,
  "results": [
    { "index": 0, "eye_side": "RIGHT", "status": "COMPLETED", "result": { } },
    { "index": 1, "eye_side": "LEFT",  "status": "COMPLETED", "result": { } },
    { "index": 2, "status": "ERROR", "error": "...", "error_code": "INVALID_IMAGE" },
    { "index": 3, "status": "ERROR", "error": "...", "error_code": "INVALID_EYE_SIDE" }
  ]
}
```

Each item is evaluated independently: **one bad image never aborts the batch.**
Every item carries either a full `result` or an `error` + `error_code`.

---

## 4. Error responses

All errors are JSON with the same envelope.

```json
{ "status": "ERROR", "error": "<message>", "error_code": "<CODE>",
  "safety_statement": "AI-assisted screening output only. Not a diagnosis. ..." }
```

| HTTP | `error_code` | Cause |
|---|---|---|
| 400 | `MISSING_IMAGE` | no `image_base64` and no file part |
| 400 | `INVALID_IMAGE` | invalid base64, unsupported format, or corrupt/truncated image |
| 400 | `INVALID_EYE_SIDE` | missing or unrecognised `eye_side` |
| 400 | `INVALID_REQUEST` | `images` not a list / batch entry not an object |
| 400 | `BATCH_TOO_LARGE` | more than 32 images |
| 404 | `NOT_FOUND` | unknown endpoint |
| 405 | `METHOD_NOT_ALLOWED` | wrong HTTP method |
| 413 | `PAYLOAD_TOO_LARGE` | upload above `RETINOAI_MAX_UPLOAD_BYTES` (default 25 MB) |
| 500 | `INFERENCE_FAILED` | unexpected failure during inference |
| 503 | `MODEL_UNAVAILABLE` | a required model is not registered |

---

## 5. CORS

No wildcard. Allowed origins default to the existing frontend/backend dev
origins — React/Vite on **3000** and the Express API on **5000**:

```
http://localhost:3000, http://127.0.0.1:3000,
http://localhost:5000, http://127.0.0.1:5000
```

Override in production with `RETINOAI_AI_CORS_ORIGINS=https://app.example.com`.

---

## 6. Safety notes

- All output is an **AI-assisted screening result**, never a diagnosis.
- A low-confidence or high-entropy prediction is flagged
  (`needs_human_review: true`, `status: "NEEDS_HUMAN_REVIEW"`) and routed to
  `priority_hint: "review_recommended"`.
- **Specialist evaluation recommended. Requires clinical review.**
- Grad-CAM is a **model-attention visualisation only** — not proof of disease
  and not definitive lesion localization.
- Image quality is `NOT_CONFIGURED` while no real quality model exists; no
  quality score is ever invented.
- Secondary RFMiD findings are possible screening findings. Rare labels (only a
  handful of test positives) are not reliable and several are currently below
  chance; do not present them as confirmed.
- The API never returns treatment, prescription, or confirmed-diagnosis language.
- Model metrics behind these endpoints are **development / dataset metrics**,
  not clinically validated performance.

---

## 7. Known integration note

`unified_inference.analyze_image()` calls `EyeSide.normalize()` directly and
does not unwrap an `EyeSide` enum, so passing the enum object stringifies to
`"EyeSide.RIGHT"` and yields `UNKNOWN`. `api_server` therefore passes
`eye.value`. The same latent issue exists in any other caller of
`analyze_image()`; the shared pipeline was left unmodified.

is `[]` when nothing exceeds the model's own threshold.

**Alias:** `POST /ai/infer` (identical).
