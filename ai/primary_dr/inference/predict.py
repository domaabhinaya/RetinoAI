"""STEP 5: PRIMARY_DR inference module.

Loads the best registered checkpoint and returns an honest structured result:
- COMPLETED with real probabilities when a model is available
- PENDING / model_not_trained when no checkpoint exists (never fake values)
- uncertain predictions are flagged for human review, never forced
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ai import config  # noqa: E402
from ai.common import model_registry  # noqa: E402
from ai.common.eye_side import EyeSide  # noqa: E402
from ai.common import COMPLETED  # noqa: E402
from ai.common.schema import (PENDING, UNAVAILABLE, AVAILABLE,  # noqa: E402
                              PrimaryDRResult, ExplainabilityResult)


def normalized_entropy(probs: np.ndarray) -> float:
    p = np.asarray(probs, dtype=float)
    if p.ndim > 1:
        p = p[0]
    if p.sum() <= 0:
        return 1.0
    p = p / p.sum()
    p = np.clip(p, 1e-12, 1.0)
    return float(-(p * np.log(p)).sum() / np.log(len(p)))


class DRPredictor:
    def __init__(self) -> None:
        self._model = None
        self._meta: dict = {}
        self._transform = None
        self._loaded = False

    @property
    def is_available(self) -> bool:
        return model_registry.get_model_info(config.MODEL_NAME) is not None

    def _ensure_loaded(self) -> bool:
        if self._loaded:
            return True
        info = model_registry.get_model_info(config.MODEL_NAME)
        ckpt = info.get("checkpoint_path") if info else None
        if not ckpt or not Path(ckpt).exists():
            return False
        import torch

        from ai.primary_dr.data.dataset import build_transforms
        from ai.primary_dr.models.efficientnet_b0_dr import load_checkpoint

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._model, self._meta = load_checkpoint(Path(ckpt), device=device.type)
        self._device = device
        image_size = config.TrainingConfig().image_size
        if isinstance(self._meta, dict):
            tc = self._meta.get("training_config") or {}
            image_size = int(tc.get("image_size", image_size))
        _, self._transform = build_transforms(image_size)
        self._loaded = True
        return True

    def predict_pil(self, pil_image, eye_side: EyeSide) -> PrimaryDRResult:
        """Run inference on a PIL image (already validated decodable)."""
        import torch

        eye = EyeSide.normalize(eye_side.value if hasattr(eye_side, "value") else eye_side)
        if not self._ensure_loaded():
            return PrimaryDRResult(
                status=PENDING, eye_side=eye.value, reason="model_not_trained",
                label=None, confidence=None)

        from ai.config import MIN_CONFIDENCE, UNCERTAINTY_THRESHOLD

        x = self._transform(pil_image).unsqueeze(0).to(self._device)
        with torch.no_grad():
            logits = self._model(x)
            probs = torch.softmax(logits, dim=1)[0].cpu().numpy()

        class_id = int(np.argmax(probs))
        confidence = float(probs[class_id])
        unc = normalized_entropy(probs)
        needs_review = bool(unc > config.UNCERTAINTY_THRESHOLD or confidence < config.MIN_CONFIDENCE)

        return PrimaryDRResult(
            status="NEEDS_HUMAN_REVIEW" if needs_review else COMPLETED,
            class_id=class_id,
            label=config.DR_CLASSES[class_id],
            confidence=round(confidence, 4),
            probabilities=[round(float(p), 4) for p in probs],
            uncertainty_value=round(unc, 4),
            needs_human_review=needs_review,
            eye_side=eye.value,
        )

    def explainability(self, pil_image, eye_side: EyeSide) -> ExplainabilityResult:
        eye = EyeSide.normalize(eye_side.value if hasattr(eye_side, "value") else eye_side)
        if not self._loaded and not self._ensure_loaded():
            return ExplainabilityResult(
                status=UNAVAILABLE, eye_side=eye.value,
                reason="Explainability unavailable: primary DR model not loaded.")
        try:
            from ai.explainability.gradcam import generate_gradcam
            return generate_gradcam(self._model, pil_image, self._device, eye_side=eye)
        except Exception as exc:  # noqa: BLE001
            return ExplainabilityResult(
                status=UNAVAILABLE, eye_side=eye.value,
                reason=f"Explainability generation failed: {exc}")
