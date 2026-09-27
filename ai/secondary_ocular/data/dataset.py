"""RFMiD multi-label dataset (labels preserved verbatim)."""
from __future__ import annotations

import csv
import sys
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ai import config  # noqa: E402
from ai.primary_dr.data.dataset import IMAGENET_MEAN, IMAGENET_STD, build_transforms  # noqa: E402
from ai.secondary_ocular.data.verify_labels import _split_paths  # noqa: E402


class RFMiDDataset(Dataset):
    def __init__(self, samples: list, num_labels: int, transform) -> None:
        self.samples = samples  # list[(path, targets list[int])]
        self.num_labels = num_labels
        self.transform = transform

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        from PIL import Image

        path, targets = self.samples[idx]
        img = Image.open(path).convert("RGB")
        if self.transform:
            img = self.transform(img)
        t = torch.tensor(targets, dtype=torch.float32)
        return img, t


def load_split(root: Path, split: str, label_columns: list) -> list:
    """samples = [(image_path, [0/1 per preserved label column])]"""
    for name, csv_path, images_dir in _split_paths(root):
        if name != split or not csv_path.exists():
            continue
        with csv_path.open(newline="", encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            header = [h.strip() for h in next(reader, [])]
            col_idx = {}
            for col in label_columns:
                if col in header:
                    col_idx[col] = header.index(col)
            samples: list = []
            for row in reader:
                if not row:
                    continue
                image_id = row[0].strip()
                targets = []
                ok = True
                for col in label_columns:
                    i = col_idx[col]
                    if i >= len(row):
                        ok = False
                        break
                    targets.append(1 if row[i].strip() in ("1", "1.0", "True", "true") else 0)
                if not ok:
                    continue
                img_path = images_dir / f"{image_id}.png"
                if not img_path.exists():
                    for ext in (".png", ".jpg", ".jpeg"):
                        p = images_dir / f"{image_id}{ext}"
                        if p.exists():
                            img_path = p
                            break
                    else:
                        continue
                samples.append((img_path, targets))
        return samples
    return []


def label_pos_weights(samples: list) -> torch.Tensor:
    """Inverse-positive-frequency weights for multi-label imbalance (BCE pos_weight)."""
    num_labels = len(samples[0][1]) if samples else 0
    pos = np.zeros(num_labels)
    total = max(len(samples), 1)
    for _p, t in samples:
        for i, v in enumerate(t):
            pos[i] += v
    neg = total - pos
    w = np.ones(num_labels, dtype=np.float32)
    mask = pos > 0
    w[mask] = neg[mask] / pos[mask]
    w[~mask] = 1.0
    w = np.clip(w, 1.0, 50.0)  # keep extreme rarities from destabilizing training
    return torch.tensor(w, dtype=torch.float32)


def build_dataloaders(cfg: config.TrainingConfig, root: Path | None = None):
    from ai.secondary_ocular.data.verify_labels import verify as verify_labels

    root = root or config.RFMID_DIR
    report = verify_labels(root)
    labels = report.get("canonical_disease_labels") or []
    if not labels:
        raise RuntimeError(f"RFMiD labels not verified: {report.get('status')} at {root}")

    train_s = load_split(root, "training", labels)
    val_s = load_split(root, "validation", labels)
    test_s = load_split(root, "testing", labels)

    if cfg.subset_fraction < 1.0:
        import random

        rng = random.Random(cfg.seed)
        rng.shuffle(train_s)
        train_s = train_s[: max(1, int(len(train_s) * cfg.subset_fraction))]

    train_tf, eval_tf = build_transforms(cfg.image_size)
    common = dict(num_workers=cfg.num_workers, pin_memory=False)
    loaders = {
        "train": DataLoader(RFMiDDataset(train_s, len(labels), train_tf), batch_size=cfg.batch_size, shuffle=True, **common),
        "val": DataLoader(RFMiDDataset(val_s, len(labels), eval_tf), batch_size=cfg.batch_size, shuffle=False, **common),
        "test": DataLoader(RFMiDDataset(test_s, len(labels), eval_tf), batch_size=cfg.batch_size, shuffle=False, **common),
    }
    meta = {
        "dataset_dir": str(root),
        "dataset_version": config.dataset_version(root),
        "label_columns": labels,
        "num_labels": len(labels),
        "train": len(train_s), "val": len(val_s), "test": len(test_s),
    }
    return loaders, meta, train_s
