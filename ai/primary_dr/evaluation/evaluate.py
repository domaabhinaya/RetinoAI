"""Standalone evaluation of a saved checkpoint on a chosen split (STEP 4).

Usage:
  python -m ai.primary_dr.evaluation.evaluate --split test
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ai import config  # noqa: E402
from ai.common.metrics import classification_metrics  # noqa: E402
from ai.common.model_registry import get_model_info  # noqa: E402
from ai.primary_dr.data.dataset import build_dataloaders  # noqa: E402
from ai.primary_dr.inference.predict import DRPredictor  # noqa: E402
from ai.primary_dr.training.train import predict_loader  # noqa: E402


def evaluate(split: str = "test", data_dir: Path | None = None) -> dict:
    import torch

    predictor = DRPredictor()
    if not predictor._ensure_loaded():
        return {"status": "PENDING", "reason": "No trained PRIMARY_DR checkpoint found. "
                "Run: python -m ai.primary_dr.training.train"}

    cfg = config.TrainingConfig()
    info = get_model_info(config.MODEL_NAME) or {}
    tc = info.get("config") or {}
    cfg.image_size = int(tc.get("image_size", cfg.image_size))
    loaders, meta, _ = build_dataloaders(cfg, data_dir)
    device = predictor._device
    probs, trues = predict_loader(predictor._model, loaders[split], device)
    preds = probs.argmax(axis=1)
    metrics = classification_metrics(trues.tolist(), preds.tolist(), y_prob=probs,
                                     labels=list(range(config.NUM_DR_CLASSES)))
    out = {
        "model": config.MODEL_NAME,
        "model_version": config.MODEL_VERSION,
        "split": split,
        "dataset_meta": meta,
        "metrics": metrics,
        "disclaimer": "model-development/validation metrics only, not clinical accuracy",
    }
    out_path = config.REPORT_DIR / f"evaluation_{split}.json"
    out_path.write_text(json.dumps(out, indent=2, default=str), encoding="utf-8")
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", choices=["val", "test"], default="test")
    parser.add_argument("--data_dir", type=str, default=None)
    args = parser.parse_args()
    result = evaluate(args.split, Path(args.data_dir) if args.data_dir else None)
    print(json.dumps(result, indent=2))
