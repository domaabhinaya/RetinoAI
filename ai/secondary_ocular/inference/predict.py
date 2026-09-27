"""Secondary ocular (RFMiD) inference - multi-label, original labels preserved.

Returns:
{
  "secondary_findings": [
    {"finding": "<original RFMiD label>", "confidence": 0.87, "eye_side": "RIGHT"}
  ]
}
only from real model output. No label invention; PENDING when untrained.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ai import config  # noqa: E402
from ai.common import model_registry  # noqa: E402
from ai.common.eye_side import EyeSide  # noqa: E402


class OcularPredictor:
    SECONDARY_THRESHOLD = 0.5  # sigmoid threshold for reporting a finding

    def __init__(self) -> None:
        self._model = None
        self._meta: dict = {}
        self._transform = None
        self._labels: list = []
        self._loaded = False

    @property
    def is_available(self) -> bool:
        return model_registry.get_model_info(config.SECONDARY_MODEL_NAME) is not None

    def _ensure_loaded(self) -> bool:
        if self._loaded:
            return True
        info = model_registry.get_model_info(config.SECONDARY_MODEL_NAME)
        ckpt = info.get("checkpoint_path") if info else None
        if not ckpt or not Path(ckpt).exists():
            return False
        import torch

        from ai.primary_dr.data.dataset import build_transforms
        from ai.secondary_ocular.models.efficientnet_b0_multilabel import load_checkpoint

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._model, self._meta = load_checkpoint(Path(ckpt), device=device.type)
        self._device = device
        self._labels = self._meta.get("label_columns") or []
        image_size = config.TrainingConfig().image_size
        tc = (self._meta.get("training_config") or {}) if isinstance(self._meta, dict) else {}
        image_size = int(tc.get("image_size", image_size))
        _, self._transform = build_transforms(image_size)
        self._loaded = True
        return True

    def predict_pil(self, pil_image, eye_side: EyeSide) -> list:
        """Returns list of SecondaryFinding dicts from real model output only."""
        import torch

        eye = EyeSide.normalize(eye_side.value if hasattr(eye_side, "value") else eye_side)
        if not self._ensure_loaded():
            return []
        x = self._transform(pil_image).unsqueeze(0).to(self._device)
        with torch.no_grad():
            logits = self._model(x)
            scores = torch.sigmoid(logits)[0].cpu().numpy()

        threshold = float(self._meta.get("threshold", self.SECONDARY_THRESHOLD))
        findings = []
        for i, label in enumerate(self._labels):
            conf = float(scores[i])
            if conf >= threshold:
                findings.append({
                    "finding": label,  # original RFMiD label, preserved verbatim
                    "confidence": round(conf, 4),
                    "eye_side": eye.value,
                    "source": "rfmid_multilabel_model",
                })
        findings.sort(key=lambda f: -f["confidence"])
        return findings
