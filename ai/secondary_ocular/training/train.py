"""STEP 7-8: Train + evaluate the RFMiD multi-label secondary ocular model.

- multi-label classification, original RFMiD labels preserved verbatim
- BCEWithLogitsLoss with per-label pos_weight (class imbalance)
- best checkpoint by validation mean ROC-AUC over labels
- per-label evaluation (ROC-AUC / average precision / F1 at threshold)

Usage:
  python -m ai.secondary_ocular.training.train [--epochs N] [--subset_fraction 0.5]
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
from ai.common.metrics import multilabel_metrics  # noqa: E402
from ai.common.model_registry import register_model  # noqa: E402
from ai.common.seed import set_global_seed  # noqa: E402
from ai.secondary_ocular.data.dataset import build_dataloaders, label_pos_weights  # noqa: E402
from ai.secondary_ocular.models.efficientnet_b0_multilabel import build_model, load_checkpoint  # noqa: E402

THRESHOLD = 0.5


@torch.no_grad()
def predict_loader(model, loader, device):
    model.eval()
    scores, trues = [], []
    for imgs, targets in loader:
        logits = model(imgs.to(device))
        scores.append(torch.sigmoid(logits).cpu())
        trues.append(targets)
    return torch.cat(scores).numpy(), torch.cat(trues).numpy()


def _selection_value(metrics: dict) -> float | None:
    """Resolve the checkpoint-selection metric for the multi-label model.

    Prefers mean ROC-AUC; falls back to the mean per-label F1 at threshold when
    no label had both classes present (common on very small smoke subsets), so a
    checkpoint is still written instead of failing later.
    """
    auc = metrics.get("macro_roc_auc")
    if auc is not None:
        return auc
    per_label = metrics.get("per_label") or {}
    f1s = [v.get("f1_at_threshold") for v in per_label.values()
           if v.get("f1_at_threshold") is not None]
    if f1s:
        return float(sum(f1s) / len(f1s))
    return None


def _save_best(ckpt_path, model, num_labels, labels, best_metric, epoch, cfg, meta) -> None:
    torch.save({
        "model_state": model.state_dict(),
        "meta": {
            "model_name": config.SECONDARY_MODEL_NAME,
            "model_version": config.MODEL_VERSION,
            "num_labels": num_labels,
            "label_columns": labels,
            "threshold": THRESHOLD,
            "epoch": epoch,
            "selection_metric": "macro_roc_auc",
            "selection_value": best_metric,
            "training_config": cfg.to_dict(),
            "dataset_meta": meta,
            "dataset_version": meta["dataset_version"],
            "saved_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        },
    }, ckpt_path)


def run_train(cfg: config.TrainingConfig, root: Path | None = None, tag: str | None = None) -> dict:
    t0 = time.time()
    set_global_seed(cfg.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    loaders, meta, train_samples = build_dataloaders(cfg, root)
    labels = meta["label_columns"]
    num_labels = meta["num_labels"]

    model, _ = build_model(num_labels=num_labels, pretrained=cfg.pretrained)
    model.to(device)

    # class imbalance: per-label pos_weight
    pos_w = label_pos_weights(train_samples).to(device)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_w)
    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg.learning_rate, weight_decay=cfg.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=cfg.epochs)

    stamp = time.strftime("%Y%m%d-%H%M%S")
    run_name = tag or f"rfmid_multilabel_{stamp}"
    ckpt_path = config.CHECKPOINT_DIR / f"{run_name}_best.pt"
    history: list = []
    best_metric = -1.0
    best_epoch = -1
    patience = cfg.early_stopping_patience

    for epoch in range(1, cfg.epochs + 1):
        model.train()
        running_loss, seen = 0.0, 0
        for imgs, targets in loaders["train"]:
            imgs, targets = imgs.to(device), targets.to(device)
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(imgs), targets)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * targets.size(0)
            seen += targets.size(0)
        scheduler.step()

        scores, trues = predict_loader(model, loaders["val"], device)
        val_metrics = multilabel_metrics(trues, scores, labels, THRESHOLD)
        history.append({
            "epoch": epoch,
            "train_loss": running_loss / max(seen, 1),
            "lr": scheduler.get_last_lr()[0],
            "val": val_metrics,
        })
        print(f"[epoch {epoch:02d}] loss={running_loss / max(seen, 1):.4f} "
              f"val_macro_auc={val_metrics.get('macro_roc_auc')}", flush=True)

        metric_value = _selection_value(val_metrics)
        if metric_value is not None and metric_value > best_metric:
            best_metric, best_epoch = metric_value, epoch
            _save_best(ckpt_path, model, num_labels, labels, best_metric, epoch, cfg, meta)
        elif epoch - best_epoch >= patience:
            print(f"Early stopping at epoch {epoch} (no improvement in {patience} epochs)")
            break

    if best_epoch < 0 or not ckpt_path.exists():
        raise RuntimeError(
            "No checkpoint was saved: the validation selection metric was unavailable "
            "for every epoch (no label had both classes present). Increase "
            "--subset_fraction or --epochs and re-run."
        )

    report = _finish_run(run_name, cfg, meta, history, best_epoch, best_metric,
                         ckpt_path, loaders, device, t0)
    return report


def _finish_run(run_name, cfg, meta, history, best_epoch, best_metric,
                ckpt_path, loaders, device, t0) -> dict:
    labels = meta["label_columns"]
    # final evaluation with best checkpoint
    model, _ = load_checkpoint(ckpt_path, device=device.type)
    scores, trues = predict_loader(model, loaders["test"], device)
    test_metrics = multilabel_metrics(trues, scores, labels, THRESHOLD)
    val_scores, val_trues = predict_loader(model, loaders["val"], device)
    val_metrics_best = multilabel_metrics(val_trues, val_scores, labels, THRESHOLD)

    report = {
        "run_name": run_name,
        "training_config": cfg.to_dict(),
        "dataset_meta": meta,
        "best_epoch": best_epoch,
        "best_val_macro_auc": best_metric,
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
        model_name=config.SECONDARY_MODEL_NAME,
        model_version=config.MODEL_VERSION,
        dataset_name="RFMiD",
        dataset_version=meta["dataset_version"],
        checkpoint_path=ckpt_path,
        metrics=test_metrics,
        config_snapshot=cfg.to_dict(),
    )
    print(f"Training complete. Best epoch {best_epoch}. Report: {report_path}", flush=True)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Train RFMiD multi-label model")
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
