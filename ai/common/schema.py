"""Structured AI result schema.

One canonical JSON structure consumed by the existing RetinoAI backend,
the Patient Evidence Report, and the LLM explanation module.

Design rules enforced here:
- image_quality is stored SEPARATELY from any prediction.
- uncertain predictions are flagged, never forced.
- reference examples are returned separately from the patient prediction.
- missing models produce explicit PENDING / NOT_CONFIGURED states, never fake values.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Optional

from .eye_side import EyeSide

PENDING = "PENDING"
NOT_CONFIGURED = "NOT_CONFIGURED"
GOOD = "GOOD"
POOR = "POOR"
NEEDS_RECAPTURE = "NEEDS_RECAPTURE"
AVAILABLE = "AVAILABLE"
UNAVAILABLE = "UNAVAILABLE"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10].upper()}"


@dataclass
class ImageQualityResult:
    status: str = NOT_CONFIGURED  # GOOD | POOR | NEEDS_RECAPTURE | PENDING | NOT_CONFIGURED
    confidence: Optional[float] = None  # only when a real quality model runs
    score: Optional[float] = None
    module: str = "not_configured"
    reason: str = "No image quality model is configured. Replace ai/quality/quality_gate.py with a real implementation."
    eye_side: str = EyeSide.UNKNOWN.value

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class PrimaryDRResult:
    status: str = PENDING  # COMPLETED | PENDING | NEEDS_HUMAN_REVIEW | FAILED
    class_id: Optional[int] = None
    label: Optional[str] = None
    confidence: Optional[float] = None
    probabilities: Optional[list] = None
    uncertainty_value: Optional[float] = None
    needs_human_review: bool = False
    eye_side: str = EyeSide.UNKNOWN.value
    reason: Optional[str] = None  # e.g. "model_not_trained", "image_quality_gate_failed"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class SecondaryFinding:
    finding: str
    confidence: float
    eye_side: str = EyeSide.UNKNOWN.value
    source: str = "rfmid_multilabel_model"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ExplainabilityResult:
    status: str = UNAVAILABLE  # AVAILABLE | UNAVAILABLE
    method: str = "grad_cam"
    heatmap_base64: Optional[str] = None
    overlay_base64: Optional[str] = None
    heatmap_points: list = field(default_factory=list)  # [{x,y,intensity}] percent coords
    attention_description: str = "Model attention / supporting image region. Not proof of a disease or definitive lesion localization."
    reason: Optional[str] = None
    eye_side: str = EyeSide.UNKNOWN.value

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ReferenceExample:
    image_ref: str
    label: str
    similarity: float
    note: str = "Reference examples with similar visual characteristics. Similarity is NOT evidence of the same diagnosis."

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class LLMExplanation:
    status: str = PENDING
    screening_summary: str = ""
    patient_friendly_explanation: str = ""
    specialist_review_reason: str = ""
    uncertainty_statement: str = ""
    safety_statement: str = (
        "These results are AI-assisted screening outputs, not a diagnosis. "
        "A qualified healthcare professional must review all findings."
    )
    provider: str = "template"
    eye_side: str = EyeSide.UNKNOWN.value

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class UnifiedAIResult:
    """The single structured object exposed to the existing backend."""

    eye_side: str = EyeSide.UNKNOWN.value
    image_quality: ImageQualityResult = field(default_factory=ImageQualityResult)
    primary_dr: PrimaryDRResult = field(default_factory=PrimaryDRResult)
    secondary_findings: list = field(default_factory=list)  # [SecondaryFinding.to_dict()]
    uncertainty: dict = field(default_factory=lambda: {"status": UNAVAILABLE, "value": None})
    explainability: ExplainabilityResult = field(default_factory=ExplainabilityResult)
    reference_examples: list = field(default_factory=list)  # [ReferenceExample.to_dict()]
    llm_explanation: LLMExplanation = field(default_factory=LLMExplanation)
    model_versioning: dict = field(default_factory=dict)
    priority_hint: Optional[str] = None  # screening workflow hint, NOT a diagnosis
    needs_human_review: bool = False
    status: str = PENDING  # COMPLETED | PENDING | NEEDS_HUMAN_REVIEW | REJECTED_QUALITY
    patient_prediction: dict = field(default_factory=dict)  # populated when primary model ran

    def to_dict(self) -> dict:
        return asdict(self)
