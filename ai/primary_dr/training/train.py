"""STEP 2-4: Train the PRIMARY_DR EfficientNet-B0 5-class classifier.

Features:
- reproducible seed + saved config snapshot
- transfer learning (ImageNet EfficientNet-B0)
- class imbalance handling (weighted loss + weighted sampler)
- best checkpoint by validation macro-F1 (or macro-AUC)
- early stopping + full training history
- final test-set evaluation (accuracy / precision / recall / F1 /
  confusion matrix / per-class / ROC-AUC) saved as JSON report
- model registry registration

Usage:
  python -m ai.primary_dr.training.train [--epochs N] [--subset_fraction 0.02]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import torch
import torch.nn as nn

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ai import config  # noqa: E402
from ai.common.metrics import classification_metrics  # noqa: E402
from ai.common.model_registry import register_model  # noqa: E402
from ai.common.seed import set_global_seed  # noqa: E402
from ai.primary_dr.data.dataset import build_dataloaders, class_weights  # noqa: E402
from ai.primary_dr.models.efficientnet_b0_dr import build_model, load_checkpoint  # noqa: E402


@torch.no_grad()
def predict_loader(model, loader, device):
    model.eval()
    probs, trues = [], []
    for imgs, labels in loader:
        imgs = imgs.to(device)
        logits = model(imgs)
        probs.append(torch.softmax(logits, dim=1).cpu())
        trues.append(labels)
    return torch.cat(probs).numpy(), torch.cat(trues).numpy()


def _selection_value(metrics: dict, key: str) -> float | None:
    """Resolve the checkpoint-selection metric key.

    Accepts the metrics dict keys as produced by ai/common/metrics.py, plus a
    small set of legacy aliases, so a mis-typed config name cannot silently
    prevent any checkpoint from being written.
    """
    aliases = {
        "macro_f1": "f1_macro",
        "f1": "f1_macro",
        "macro_auc": "roc_auc_macro_ovr",
        "auc": "roc_auc_macro_ovr",
        "accuracy": "accuracy",
    }
    for candidate in (key, aliases.get(key, ""), "f1_macro", "accuracy"):
        if candidate and candidate in metrics:
            return metrics[candidate]
    return None


def evaluate_split(model, loader, device, split_name: str) -> dict:
    probs, trues = predict_loader(model, loader, device)
    preds = probs.argmax(axis=1)
    m = classification_metrics(
        trues.tolist(), preds.tolist(), y_prob=probs,
        labels=list(range(config.NUM_DR_CLASSES)),
    )
    m["split"] = split_name
    return m


def run_train(cfg: config.TrainingConfig, dataset_dir: Path | None = None,
              tag: str | None = None) -> dict:
    t0 = time.time()
    set_global_seed(cfg.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    loaders, meta, train_samples = build_dataloaders(cfg, dataset_dir)
    model, _ = build_model(pretrained=cfg.pretrained)
    model.to(device)

    # Class imbalance: weighted cross-entropy (+ optional weighted sampler in loaders)
    weights = class_weights(train_samples).to(device)
    criterion = nn.CrossEntropyLoss(weight=weights) if "weighted_loss" in cfg.balance_strategy \
        else nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg.learning_rate, weight_decay=cfg.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=cfg.epochs)

    stamp = time.strftime("%Y%m%d-%H%M%S")
    run_name = tag or f"dr_effnetb0_{stamp}"
    ckpt_path = config.CHECKPOINT_DIR / f"{run_name}_best.pt"
    history: list = []
    best_metric = -1.0
    best_epoch = -1
    patience = cfg.early_stopping_patience

    for epoch in range(1, cfg.epochs + 1):
        model.train()
        running_loss, seen = 0.0, 0
        for imgs, labels in loaders["train"]:
            imgs, labels = imgs.to(device), labels.to(device)
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(imgs), labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * labels.size(0)
            seen += labels.size(0)
        scheduler.step()

        val_metrics = evaluate_split(model, loaders["val"], device, "val")
        history.append({
            "epoch": epoch,
            "train_loss": running_loss / max(seen, 1),
            "lr": scheduler.get_last_lr()[0],
            "val": val_metrics,
        })
        print(f"[epoch {epoch:02d}] loss={running_loss / max(seen, 1):.4f} "
              f"val_f1={val_metrics.get('f1_macro')} val_acc={val_metrics.get('accuracy')}", flush=True)

        metric_value = _selection_value(val_metrics, cfg.selection_metric)
        if metric_value is not None and metric_value > best_metric:
            best_metric, best_epoch = metric_value, epoch
            _save_checkpoint(ckpt_path, model, epoch, best_metric, cfg, meta)
        elif epoch - best_epoch >= patience:
            print(f"Early stopping at epoch {epoch} (no improvement in {patience} epochs)")
            break

    if best_epoch < 0 or not ckpt_path.exists():
        raise RuntimeError(
            f"No checkpoint was saved: validation metric '{cfg.selection_metric}' was "
            f"unavailable for every epoch. Available keys: {sorted(val_metrics.keys())}. "
            "Set TrainingConfig.selection_metric to one of those keys."
        )

    report = _finish_run(run_name, cfg, meta, history, best_epoch, best_metric,
                         ckpt_path, loaders, device, t0)
    return report


def _save_checkpoint(ckpt_path, model, epoch, metric_value, cfg, meta) -> None:
    torch.save({
        "model_state": model.state_dict(),
        "meta": {
            "model_name": config.MODEL_NAME,
            "model_version": config.MODEL_VERSION,
            "classes": config.DR_CLASSES,
            "epoch": epoch,
            "selection_metric": cfg.selection_metric,
            "selection_value": metric_value,
            "training_config": cfg.to_dict(),
            "dataset_meta": meta,
            "dataset_version": meta["dataset_version"],
            "saved_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        },
    }, ckpt_path)


def _finish_run(run_name, cfg, meta, history, best_epoch, best_metric,
                ckpt_path, loaders, device, t0) -> dict:
    # STEP 4: test evaluation with the best checkpoint
    model, _ckpt_meta = load_checkpoint(ckpt_path, device=device.type)
    test_metrics = evaluate_split(model, loaders["test"], device, "test")
    val_metrics_best = evaluate_split(model, loaders["val"], device, "val")

    report = {
        "run_name": run_name,
        "training_config": cfg.to_dict(),
        "dataset_meta": meta,
        "best_epoch": best_epoch,
        "best_val_metric": best_metric,
        "val_metrics": val_metrics_best,
        "test_metrics": test_metrics,
        "checkpoint": str(ckpt_path),
        "runtime_seconds": round(time.time() - t0, 1),
        "device": device.type,
        "metrics_disclaimer": "model-development/validation metrics only, not clinical accuracy",
    }
    report_path = config.REPORT_DIR / f"{run_name}_report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    (config.HISTORY_DIR / f"{run_name}_history.json").write_text(
        json.dumps(history, indent=2), encoding="utf-8")
    cfg.save(config.CONFIG_DIR / f"{run_name}_config.json")  # reproducible run config

    register_model(
        model_name=config.MODEL_NAME,
        model_version=config.MODEL_VERSION,
        dataset_name="PRIMARY_DR",
        dataset_version=meta["dataset_version"],
        checkpoint_path=ckpt_path,
        metrics=test_metrics,
        config_snapshot=cfg.to_dict(),
    )
    print(f"Training complete. Best epoch {best_epoch}. Report: {report_path}", flush=True)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Train PRIMARY_DR 5-class classifier")
    parser.add_argument("--epochs", type=int, default=None)
    parser.add_argument("--batch_size", type=int, default=None)
    parser.add_argument("--subset_fraction", type=float, default=None)
    parser.add_argument("--data_dir", type=str, default=None)
    parser.add_argument("--tag", type=str, default=None)
    args = parser.parse_args()
    cfg = config.TrainingConfig()
    if args.epochs:
        cfg.epochs = args.epochs
    if args.batch_size:
        cfg.batch_size = args.batch_size
    if args.subset_fraction is not None:
        cfg.subset_fraction = args.subset_fraction
    run_train(cfg, Path(args.data_dir) if args.data_dir else None, args.tag)


if __name__ == "__main__":
    main()
