"""Image quality gate - replaceable module boundary.

Returns an honest NOT_CONFIGURED state until a real quality model is plugged
in. No fabricated quality scores. The gate is intentionally isolated so a real
implementation (e.g. EyePACS-quality CNN, BRISQUE, or a heuristic ClAHE
variance check) can replace run_quality_gate() without touching callers.
"""
from __future__ import annotations

from dataclasses import dataclass

from ai.common.eye_side import EyeSide


@dataclass
class QualityOutcome:
    status: str  # GOOD | POOR | NEEDS_RECAPTURE | PENDING | NOT_CONFIGURED
    confidence: float | None  # real model confidence, None when unavailable
    score: float | None
    module: str
    reason: str
    eye_side: str


def run_quality_gate(pil_image, eye_side: EyeSide) -> QualityOutcome:
    """Configured quality model entry point.

    Currently returns NOT_CONFIGURED (never invents a score). To integrate a
    real model: load it here, compute status/confidence, and return them.
    """
    eye = EyeSide.normalize(eye_side.value if hasattr(eye_side, "value") else eye_side)
    return QualityOutcome(
        status="NOT_CONFIGURED",
        confidence=None,
        score=None,
        module="not_configured",
        reason=("No image quality model is configured. Image passed to AI screening unfiltered; "
                "quality must be assessed by the operator or a future quality module."),
        eye_side=eye.value,
    )
