"""EfficientNet-B0 multi-label model for RFMiD (46 preserved disease labels).

Output: raw logits (one per label); inference applies sigmoid.
Loss: BCEWithLogitsLoss with per-label pos_weight for class imbalance.
"""
from __future__ import annotations

import sys
from pathlib import Path

import torch.nn as nn

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ai import config  # noqa: E402


def build_model(num_labels: int, pretrained: bool = True, dropout: float = 0.3) -> tuple[nn.Module, str]:
    from torchvision import models

    try:
        weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
        model = models.efficientnet_b0(weights=weights)
    except (ImportError, AttributeError):  # older torchvision
        model = models.efficientnet_b0(pretrained=pretrained)

    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=dropout, inplace=True),
        nn.Linear(in_features, num_labels),  # sigmoid applied at inference
    )
    target_layer = model.features[-1]
    return model, target_layer


def load_checkpoint(checkpoint_path: Path, device: str = "cpu") -> tuple[nn.Module, dict]:
    payload = torch.load(checkpoint_path, map_location=device)
    meta = payload.get("meta", {})
    num_labels = int(meta.get("num_labels", 46))
    model, _ = build_model(num_labels=num_labels, pretrained=False)
    state = payload.get("model_state", payload)
    model.load_state_dict(state)
    model.eval()
    return model, meta


import torch  # noqa: E402
