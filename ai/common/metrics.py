"""Shared evaluation metrics (model-development metrics, NOT clinical accuracy)."""
from __future__ import annotations

from typing import Any


def classification_metrics(y_true, y_pred, y_prob=None, labels=None) -> dict[str, Any]:
    """Accuracy, precision, recall, F1, confusion matrix, per-class report, ROC-AUC."""
    from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score,
                                 precision_score, recall_score, roc_auc_score)

    out: dict[str, Any] = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "note": "model-development/validation metrics only, not clinical accuracy",
    }
    average = "macro"
    present = sorted(set(y_true) | set(y_pred))
    macro_ok = len(present) > 1
    out["precision_macro"] = float(precision_score(y_true, y_pred, average=average, zero_division=0)) if macro_ok else None
    out["recall_macro"] = float(recall_score(y_true, y_pred, average=average, zero_division=0)) if macro_ok else None
    out["f1_macro"] = float(f1_score(y_true, y_pred, average=average, zero_division=0)) if macro_ok else None
    try:
        out["confusion_matrix"] = confusion_matrix(y_true, y_pred, labels=labels).tolist()
    except ValueError:
        out["confusion_matrix"] = None
    out["per_class"] = {}
    unique_labels = labels if labels is not None else present
    for c in unique_labels:
        p = precision_score(y_true, y_pred, labels=[c], average="macro", zero_division=0)
        r = recall_score(y_true, y_pred, labels=[c], average="macro", zero_division=0)
        f = f1_score(y_true, y_pred, labels=[c], average="macro", zero_division=0)
        support = int(sum(1 for t in y_true if t == c))
        out["per_class"][str(c)] = {
            "precision": float(p), "recall": float(r), "f1": float(f), "support": support,
        }
    # ROC-AUC (one-vs-rest macro) where applicable
    auc = None
    if y_prob is not None:
        try:
            n_classes = y_prob.shape[1]
            if n_classes == 2:
                auc = float(roc_auc_score(y_true, y_prob[:, 1]))
            elif len(set(y_true)) > 1:
                auc = float(roc_auc_score(y_true, y_prob, multi_class="ovr", average="macro", labels=labels))
        except (ValueError, IndexError):
            auc = None
    out["roc_auc_macro_ovr"] = auc
    return out


def multilabel_metrics(y_true, y_scores, label_names: list, threshold: float = 0.5) -> dict:
    """Per-label AP / ROC-AUC / F1 for multi-label evaluation."""
    import numpy as np
    from sklearn.metrics import average_precision_score, f1_score, roc_auc_score

    y_true = np.asarray(y_true)
    y_scores = np.asarray(y_scores)
    per_label = {}
    for i, name in enumerate(label_names):
        t = y_true[:, i] if y_true.ndim > 1 else y_true[:, i]
        s = y_scores[:, i]
        entry: dict = {}
        try:
            if len(set(t.tolist())) > 1:
                entry["roc_auc"] = float(roc_auc_score(t, s))
                entry["average_precision"] = float(average_precision_score(t, s))
            else:
                entry["roc_auc"] = None
                entry["average_precision"] = None
        except (ValueError, IndexError):
            entry["roc_auc"] = None
            entry["average_precision"] = None
        preds = (s >= threshold).astype(int)
        entry["f1_at_threshold"] = float(f1_score(t, preds, zero_division=0))
        entry["positives"] = int(t.sum())
        per_label[name] = entry
    valid_aucs = [v["roc_auc"] for v in per_label.values() if v["roc_auc"] is not None]
    return {
        "per_label": per_label,
        "macro_roc_auc": float(sum(valid_aucs) / len(valid_aucs)) if valid_aucs else None,
        "threshold": threshold,
        "note": "model-development/validation metrics only, not clinical accuracy",
    }
