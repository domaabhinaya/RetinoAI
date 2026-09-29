# Express → Flask AI Integration

The Express clinical backend delegates **all** retinal inference to the verified
Flask AI engine. Express performs no model inference of its own and never
fabricates a clinical value.

---

## Architecture

```
React / Vite  (artifacts/retinoai)           :3000
        |  proxy /api
        v
Express / TypeScript  (artifacts/api-server) :5000
        |  HTTP  (FLASK_AI_BASE_URL)
        v
Flask AI engine  (ai/service/api_server.py)  :5001
        |
        +-- PRIMARY_DR  RetinoAI-DR-EffNetB0            v1.0.0
        +-- RFMiD       RetinoAI-Ocular-RFMiD-EffNetB0  v1.0.0  (46-label multi-label)
```

Flask binds `127.0.0.1` only, so it is **not** exposed to the public network.
Only the Express port is published. CORS remains the Express layer's
responsibility; Express calls Flask server-to-server.

---

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | Express listen port |
| `FLASK_AI_BASE_URL` | `http://127.0.0.1:5001` | Flask AI engine base URL |
| `FLASK_AI_TIMEOUT_MS` | `120000` | Per-request timeout (ms) |

See `artifacts/api-server/.env.example`.

**Startup order — the engine must be up first:**

```bash
# 1) AI engine
python -m ai.service.api_server            # 127.0.0.1:5001

# 2) Clinical backend
cd artifacts/api-server && pnpm run dev   # :5000
```

---

## Request flow

`POST /api/screening-cases/:id/ai-analysis`

1. Express loads the screening case and its retinal images.
2. Image bytes are resolved from the stored `dataUrl` (base64) or `uploads/`.
3. Each image is sent to Flask as **multipart/form-data**:
   `file` = image, `eye_side` = `RIGHT` (OD) or `LEFT` (OS).
4. Flask runs the verified pipeline and returns the structured result.
5. Express maps that result into the existing clinical model and persists it.
   No values are invented during mapping.

Both eyes are analysed when both images are present; `OD` drives the primary
clinical record.

---

## Endpoints used

| Method | Endpoint | Use |
|---|---|---|
| `GET` | `${FLASK_AI_BASE_URL}/healthz` | health / model availability |
| `POST` | `${FLASK_AI_BASE_URL}/predict` | single-image analysis (multipart) |
| `POST` | `${FLASK_AI_BASE_URL}/batch-predict` | multi-image analysis (base64 JSON) |

Flask legacy routes (`/ai/health`, `/ai/infer`) remain functional and are not
used by Express.

---

## Response mapping

| Express field | Source (Flask) | Note |
|---|---|---|
| `aiResult.drGrade` | `primary_dr.label` | mapped to ICDR (`Severe DR` → `Severe NPDR`) |
| `aiResult.drLabel` | `primary_dr.label` | verbatim engine label |
| `aiResult.drProbabilities` | `primary_dr.probabilities` | all 5 classes |
| `aiResult.confidence` | `primary_dr.confidence` | 0–1, from the engine |
| `aiResult.uncertainty` | `uncertainty.value` | normalized entropy |
| `aiResult.needsHumanReview` | `needs_human_review` | |
| `aiResult.dmeIndicator` | — | **null**: no DME head in the engine, never asserted |
| `qualityOD.score` / `qualityOS.score` | `image_quality.score` | **null** when `NOT_CONFIGURED` |
| `quality*.qualityStatus` | `image_quality.status` | `NOT_CONFIGURED` preserved |
| `findings[]` | `secondary_findings[]` | original RFMiD label in `rfmIdLabel`; rendered "Possible finding detected" |
| `explainability.heatmapPoints` | `explainability.heatmap_points` | real Grad-CAM points only |
| `...annotationData.gradCamAvailable` | `explainability.status` | `false` → honest UNAVAILABLE |

---

## Errors

| Situation | Express behaviour |
|---|---|
| Flask unreachable | `503` `AI_ENGINE_UNREACHABLE` |
| Flask timeout | `503` `AI_ENGINE_UNREACHABLE` |
| Invalid / corrupt / unsupported image | `400` `AI_ENGINE_REJECTED` (Flask `error_code` passed through) |
| Invalid or missing eye side | `400` `AI_ENGINE_REJECTED` |
| Flask 5xx | `502` `AI_ENGINE_UPSTREAM_ERROR` |
| Malformed Flask JSON | `502` `AI_ENGINE_MALFORMED_RESPONSE` |
| No image attached | `400` `NO_IMAGE` |

**Express never falls back to fabricated AI output.** If the engine is
unavailable the API returns an explicit error.

`GET /api/healthz` returns `200` with `aiEngine.reachable: true` when Flask
answers, and **`503` with `status: "degraded"`** when it does not — the backend
never claims AI readiness while the engine is down.

`POST /api/datasets/import-case` seeds cases from dataset records and attaches no
image bytes. It now reports `aiEngineError` instead of inventing an AI result;
the dataset ground-truth DR grade is unaffected.

---

## Security

- Retinal images are sent to Flask **in memory**; Flask never writes them to disk.
- Image **contents are never logged** — only error codes and case identifiers.
- Filenames are resolved with `path.basename` to prevent path traversal.
- Flask stays bound to `127.0.0.1`; only Express is exposed.
- CORS is handled by the existing Express middleware, unchanged.
- The existing upload size limits are untouched.

---

## Removed behaviour

The following fabricated retinal AI logic was deleted from
`artifacts/api-server/src/lib/ai-service.ts`:

- MD5-derived image-quality score (`86 + (num % 13)`) and its invented
  blur / brightness / centring / artifact values.
- The external **Blackbox** vision call for retinal screening, and its
  hard-coded "Healthy eye / 95% confidence" synthetic fallback.
- Synthesised DR probabilities, confidences, lesion findings, Grad-CAM
  heatmap points, and clinical priority reasons.

Blackbox configuration is intentionally left in place for any unrelated
non-retinal feature; it is simply no longer on the retinal screening path.

---

## Safety behaviour

- Output is an **AI-assisted screening result**, not a diagnosis.
- Low-confidence or high-entropy predictions set `needsHumanReview` and route to
  `review_recommended`.
- **Specialist evaluation recommended. Requires clinical review.**
- Grad-CAM is a model-attention visualisation only — not proof of disease and
  not definitive lesion localization.
- Image quality stays `NOT_CONFIGURED` until a real quality model exists.
- RFMiD findings are *possible* screening findings. Rare labels (a handful of test
  positives) are unreliable; several are currently below chance.
- Model metrics behind these endpoints are development / dataset metrics, not
  clinically validated performance.

| `priority.priority` | `priority_hint` | triage hint, never a diagnosis |
| `aiEngine.*` | whole response | full engine payload for the UI |

**Deliberate minimal type change:** `ImageQuality.score` and
`AIScreeningResult.confidence` are now `number | null`, and `dmeIndicator`
accepts `null`. Required to report the engine's real state honestly.
