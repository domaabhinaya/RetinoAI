# RetinoAI AI Layer

Real PyTorch models, explainability, and LLM narration for the existing RetinoAI
screening workflow:

```
Capture → Check → Detect → Explain → Track → Refer
                     ▲        ▲
                     │        └── ai/llm + ai/explainability
                     └── ai/primary_dr + ai/secondary_ocular + ai/quality
```

**"AI assists. Doctors decide."** All outputs are screening decision support,
never a diagnosis.

## Structure

```
ai/
├── primary_dr/          5-class DR classifier (EfficientNet-B0, PRIMARY_DR dataset)
│   ├── data/            verify_dataset.py, dataset.py
│   ├── models/          efficientnet_b0_dr.py
│   ├── training/        train.py
│   ├── evaluation/      evaluate.py
│   └── inference/       predict.py
├── secondary_ocular/    RFMiD multi-label model (labels preserved verbatim)
│   ├── data/            verify_labels.py, dataset.py
│   ├── models/          efficientnet_b0_multilabel.py
│   ├── training/        train.py
│   ├── evaluation/      (uses training report)
│   └── inference/       predict.py
├── quality/             replaceable image-quality gate (NOT_CONFIGURED by default)
├── explainability/      Grad-CAM (UNAVAILABLE instead of fabricated heatmaps)
├── llm/                 prompts/ + inference/ (narrates structured results only)
├── common/              schema, metrics, seed, eye_side, model_registry, reference_examples
├── service/             unified_inference.py + api_server.py (Flask, port 5001)
└── config.py            single source of truth for paths/seeds/labels/thresholds

RetinoAI-main/            (project root, written by training — NOT inside ai/)
├── checkpoints/         best model checkpoints (.pt)
├── reports/             dataset verification, evaluation reports, model_registry.json
├── history/             training history (JSON)
└── config/              saved training configuration snapshots
```

## Quick Start

```bash
# 1. Install deps (CPU torch is fine)
python -m pip install -r ai/requirements.txt --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple

# 2. Extract datasets (tools/extract_datasets.py, if not already extracted)
python tools/extract_datasets.py both

# 3. Verify datasets (STEP 1 and STEP 6)
python -m ai.primary_dr.data.verify_dataset
python -m ai.secondary_ocular.data.verify_labels

# 4. Train the primary DR model (STEPS 2-4)
python -m ai.primary_dr.training.train --epochs 30

# 5. Train the secondary RFMiD model (STEPS 7-8)
python -m ai.secondary_ocular.training.train --epochs 30

# 6. Evaluate a trained model
python -m ai.primary_dr.evaluation.evaluate --split test

# 7. Run the AI engine service (STEP 9/15)
python -m ai.service.api_server          # listens on 127.0.0.1:5001

# 8. Start the existing backend + frontend as usual
pnpm --filter @workspace/api-server dev
pnpm --filter @workspace/retinoai dev
```

Smoke-run training on a small subset (recommended before a full run):

```bash
python -m ai.primary_dr.training.train --subset_fraction 0.02 --epochs 2 --tag smoke
```

A smoke run writes real artifacts (`checkpoints/smoke_best.pt`,
`reports/smoke_report.json`, `history/smoke_history.json`) and registers them in
`reports/model_registry.json`. Its metrics come from a tiny subset and must NOT be
reported as model performance. Delete the `smoke*` artifacts (and its registry
entry) before shipping, so the inference service honestly reports `PENDING`
until the full training run has produced a production checkpoint.

### Training outputs

| Path | Contents |
|---|---|
| `checkpoints/<run>_best.pt` | best checkpoint by validation metric |
| `reports/<run>_report.json` | val + test metrics (accuracy, precision, recall, F1, confusion matrix, per-class, ROC-AUC) |
| `history/<run>_history.json` | per-epoch loss / LR / validation metrics |
| `reports/model_registry.json` | model name/version, dataset version, metrics, config snapshot |
| `config/<run>_config.json` | reproducible training configuration |

All metrics are **model-development / validation metrics only — not clinical accuracy**.

## Safety Model

| Principle | Implementation |
|---|---|
| No fake results | `ai/common/schema.py` returns explicit `PENDING` / `NOT_CONFIGURED` / `UNAVAILABLE` states when models are missing |
| Quality gate | `ai/quality/quality_gate.py` is a replaceable module; returns `NOT_CONFIGURED` (never fabricated scores); quality stored separately from predictions |
| Uncertainty | normalized entropy + confidence thresholds flag `NEEDS_HUMAN_REVIEW`; uncertain predictions are never forced |
| Explainability | real Grad-CAM; failures return `UNAVAILABLE` with a reason, never a fake heatmap |
| Reference examples | deep-feature similarity only, strictly separated from `patient_prediction`; labeled "similar visual characteristics", never proof of disease |
| LLM | narrates ONLY the structured result; deterministic template fallback with the same guarantees; never invents findings/symptoms/confidence; never diagnoses |
| Eye side | RIGHT/LEFT/UNKNOWN carried through preprocessing → inference → explainability → result → report |
| Priority | exposes `priority_hint` for the existing Priority Engine; remains a screening decision, not a diagnosis |
| Versioning | every inference records model name/version, dataset version, timestamp, explainability availability |
| Metrics | all reports labeled: "model-development/validation metrics only, not clinical accuracy" |

## Integration With Existing Backend

- `artifacts/api-server/src/lib/ai-engine-client.ts` — typed client for the engine
- `artifacts/api-server/src/lib/ai-service.ts` — `tryRealEngine()` uses real AI
  output when the engine is running; when the engine is unreachable, returns an
  honest PENDING state with `modelVersion: "Not trained"` (never fabricated)
- `GET /api/ai-engine/status` — engine/model availability
- Existing endpoints (`/api/screening-cases/:id/ai-analysis`, etc.) are
  unchanged; the frontend continues to work unchanged

## Datasets

- **PRIMARY_DR**: `split_dataset/{train,val,test}/{0..4}/` — official pre-split
  folder-per-class (45,316 images). Classes: 0 No DR, 1 Mild, 2 Moderate,
  3 Severe, 4 Proliferative.
- **RFMiD**: `Training_Set/`, `Evaluation_Set/`, `Test_Set/` with the original
  46-column label CSVs (Disease_Risk + 45 disease labels). Labels are preserved
  verbatim; the model is multi-label (sigmoid), NOT a DR 0-4 conversion.
