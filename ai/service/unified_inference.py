"""Unified inference service (STEP 9).

Pipeline:
  Retinal Image
    -> Image Quality Check      (replaceable gate; NOT_CONFIGURED until a real
                                 quality model is plugged in - never fabricated)
    -> Primary DR model         (EfficientNet-B0, 5-class; PENDING if untrained)
    -> Secondary RFMiD model    (multi-label; original labels preserved)
    -> Uncertainty              (normalized entropy; flags human review)
    -> Grad-CAM explainability  (UNAVAILABLE instead of fabricated heatmap)
    -> Reference examples       (similarity only, strictly separated)
    -> LLM explanation          (narrates the structured result; never diagnoses)

Produces the single structured AI result JSON consumed by the backend.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ai import config  # noqa: E402
from ai.common import model_registry  # noqa: E402
from ai.common.eye_side import EyeSide  # noqa: E402
from ai.common.reference_examples import find_similar  # noqa: E402
from ai.common.schema import (  # noqa: E402
    NEEDS_RECAPTURE, NOT_CONFIGURED, PENDING, UNAVAILABLE, UnifiedAIResult,
    utc_now,
)
from ai.llm.inference.explain import explain_result  # noqa: E402
from ai.primary_dr.inference.predict import DRPredictor  # noqa: E402
from ai.quality.quality_gate import run_quality_gate  # noqa: E402
from ai.secondary_ocular.inference.predict import OcularPredictor  # noqa: E402

_dr_predictor = DRPredictor()
_ocular_predictor = OcularPredictor()


def health() -> dict:
    return {
        "service": "retinoai-engine",
        "time": utc_now(),
        "primary_dr": {
            "registered": _dr_predictor.is_available,
            "status": "AVAILABLE" if _dr_predictor.is_available else PENDING,
            "model_name": config.MODEL_NAME,
        },
        "secondary_ocular": {
            "registered": _ocular_predictor.is_available,
            "status": "AVAILABLE" if _ocular_predictor.is_available else PENDING,
            "model_name": config.SECONDARY_MODEL_NAME,
        },
        "quality_gate": {"status": config.QUALITY_GATE_NAME},
    }


def analyze_image(pil_image, eye_side: EyeSide) -> dict:
    """Run the full pipeline for ONE image. Never mixes eye sides."""
    eye = EyeSide.normalize(eye_side)
    result = UnifiedAIResult(eye_side=eye.value)

    # 1. Image quality gate (separate from prediction)
    q = run_quality_gate(pil_image, eye)
    result.image_quality = q.__dict__.copy()

    # 2. Primary DR model
    dr = _dr_predictor.predict_pil(pil_image, eye)
    result.primary_dr = dr

    # 3. Secondary RFMiD multi-label findings
    result.secondary_findings = _ocular_predictor.predict_pil(pil_image, eye)

    # 4. Uncertainty
    if dr.uncertainty_value is not None:
        result.uncertainty = {"status": "AVAILABLE", "value": dr.uncertainty_value}
    else:
        result.uncertainty = {"status": UNAVAILABLE, "value": None}

    # 5. Explainability (Grad-CAM or explicit unavailable state)
    if dr.status == PENDING:
        result.explainability = {
            "status": UNAVAILABLE, "method": "grad_cam", "eye_side": eye.value,
            "reason": "Explainability unavailable: primary DR model is not trained.",
        }
    else:
        expl = _dr_predictor.explainability(pil_image, eye)
        result.explainability = expl.to_dict()

    # 6. Reference examples (similarity only, separated from prediction)
    result.reference_examples = find_similar(
        pil_image, dr.label if dr.label else None)

    # 7. Versioning block (model registry + timestamps)
    result.model_versioning = {
        "primary_dr": model_registry.versioning_block(config.MODEL_NAME),
        "secondary_ocular": model_registry.versioning_block(config.SECONDARY_MODEL_NAME),
        "quality_gate": config.QUALITY_GATE_NAME,
        "pipeline_version": "unified-1.0.0",
        "inference_timestamp": utc_now(),
        "explainability_available": result.explainability.get("status") == "AVAILABLE",
    }

    # 8. Overall status + human-review flag
    result.needs_human_review = bool(
        dr.needs_human_review
        or q.status in (NEEDS_RECAPTURE, "POOR")
    )
    if dr.status == PENDING:
        result.status = PENDING
    elif q.status in (NEEDS_RECAPTURE, "POOR"):
        result.status = "REJECTED_QUALITY"
    elif result.needs_human_review:
        result.status = "NEEDS_HUMAN_REVIEW"
    else:
        result.status = "COMPLETED"

    # patient_prediction + reference separation (requirement 9)
    result.patient_prediction = {
        "dr": dr.to_dict() if hasattr(dr, "to_dict") else dr,
        "secondary_findings": result.secondary_findings,
    }

    # 9. LLM narration of the structured result (never diagnoses)
    llm = explain_result(result.to_dict(), eye.value)
    result.llm_explanation = llm.to_dict()

    # priority hint for the existing screening Priority Engine (NOT a diagnosis).
    # Built from the plain-dict snapshot, not the dataclass instance.
    result.priority_hint = _priority_hint(result.to_dict())

    return result.to_dict()


def _priority_hint(result: dict) -> str:
    """Screening-workflow triage hint based on available evidence only."""
    dr = result.get("primary_dr") or {}
    if dr.get("status") == "COMPLETED" and not result.get("needs_human_review"):
        cid = dr.get("class_id")
        if cid is not None and cid >= 3:
            return "high_priority"
        if cid == 2:
            return "review_recommended"
        if cid is not None:
            return "routine"
    if result.get("needs_human_review") or dr.get("status") != "COMPLETED":
        return "review_recommended"
    return "routine"
