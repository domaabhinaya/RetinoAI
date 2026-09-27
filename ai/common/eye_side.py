"""Eye-side handling.

The clinical workflow uses OD (oculus dexter / right) and OS (oculus sinister /
left). The AI layer standardises on RIGHT / LEFT / UNKNOWN and never mixes
results between eyes: every intermediate artifact (preprocessing, inference,
explainability, result, report) carries the eye side it belongs to.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class EyeSide(str, Enum):
    RIGHT = "RIGHT"
    LEFT = "LEFT"
    UNKNOWN = "UNKNOWN"

    @staticmethod
    def normalize(value: str | None) -> "EyeSide":
        if value is None:
            return EyeSide.UNKNOWN
        v = str(value).strip().upper()
        if v in ("OD", "RIGHT", "R", "RE", "OCULUS_DEXTER"):
            return EyeSide.RIGHT
        if v in ("OS", "LEFT", "L", "LE", "OCULUS_SINISTER"):
            return EyeSide.LEFT
        return EyeSide.UNKNOWN

    def to_clinical(self) -> str:
        """OD/OS label used by the existing RetinoAI store."""
        return {"RIGHT": "OD", "LEFT": "OS", "UNKNOWN": "UNKNOWN"}[self.value]


@dataclass(frozen=True)
class EyeTagged:
    """Mixin-style helper: anything tied to one eye carries its side."""

    eye_side: EyeSide
