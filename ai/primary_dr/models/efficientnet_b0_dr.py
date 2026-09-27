"""EfficientNet-B0 transfer-learning model for 5-class DR grading."""
from __future__ import annotations

import sys
from pathlib import Path

import torch
import torch.nn as nn

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ai import config  # noqa: E402


def build_model(num_classes: int = config.NUM_DR_CLASSES, pretrained: bool = True,
                dropout: float = 0.3) -> tuple[nn.Module, str]:
    """Returns (model, target_layer_name_for_gradcam)."""
    from torchvision import models

    try:
        weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
        model = models.efficientnet_b0(weights=weights)
    except (ImportError, AttributeError):  # older torchvision
        model = models.efficientnet_b0(pretrained=pretrained)

    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=dropout, inplace=True),
        nn.Linear(in_features, num_classes),
    )
    # last conv block used as Grad-CAM target
    target_layer = model.features[-1]
    return model, target_layer


def load_checkpoint(checkpoint_path: Path, device: str = "cpu") -> tuple[nn.Module, dict]:
    """Load best checkpoint; returns (model, metadata)."""
    model, _ = build_model(pretrained=False)
    payload = torch.load(checkpoint_path, map_location=device)
    state = payload.get("model_state", payload)
    model.load_state_dict(state)
    model.eval()
    return model, payload.get("meta", {})
