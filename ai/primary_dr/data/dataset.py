"""PRIMARY_DR PyTorch dataset.

Auto-detects the dataset layout (csv+images or folder-per-class), builds
reproducible train/val/test splits, and exposes class imbalance handling
(class weights + weighted sampler).
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

import torch
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ai import config  # noqa: E402
from ai.primary_dr.data.verify_dataset import _is_image  # noqa: E402

from torchvision import transforms  # noqa: E402

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

# Canonical folder names -> class ids (used when dataset uses folder_per_class)
FOLDER_CLASS_MAP = {
    "0": 0, "1": 1, "2": 2, "3": 3, "4": 4,
    "no_dr": 0, "mild_dr": 1, "mild": 1, "moderate_dr": 2, "moderate": 2,
    "severe_dr": 3, "severe": 3, "proliferative_dr": 4, "pdr": 4,
}

LABEL_WORDS = {"diagnosis", "label", "dr_level", "level", "class", "target", "retinopathy", "grade", "dr_grade"}
IMAGE_WORDS = {"id_code", "image", "filename", "file_name", "name", "id", "image_id", "img", "path"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".jfif"}


def build_transforms(image_size: int):
    train_tf = transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(),
        transforms.RandomRotation(15),
        transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.10),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    return train_tf, eval_tf


class FundusDataset(Dataset):
    """(image_path, class_id) pairs with torchvision transforms."""

    def __init__(self, samples: list, transform) -> None:
        self.samples = samples  # list[(path: Path, class_id: int)]
        self.transform = transform

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        from PIL import Image

        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, label


def _class_from_value(value: str) -> int | None:
    v = value.strip().lower()
    if v in FOLDER_CLASS_MAP:
        return FOLDER_CLASS_MAP[v]
    if v.startswith("proliferative"):
        return 4
    try:
        iv = int(float(v))
        return iv if 0 <= iv <= 4 else None
    except ValueError:
        return None


def _resolve_image(dataset_dir: Path, stem: str) -> Path | None:
    """Resolve an image id/filename from the CSV against the dataset tree."""
    p = Path(stem)
    if p.is_absolute() and p.exists():
        return p
    if p.suffix.lower() in IMAGE_EXTS:
        direct = [dataset_dir / p.name]
    else:
        direct = [dataset_dir / f"{p.name}{ext}" for ext in IMAGE_EXTS]
    for cand in direct:
        if cand.exists():
            return cand
    for base in dataset_dir.rglob("*"):
        if base.is_dir():
            for cand in direct:
                probe = base / cand.name
                if probe.exists():
                    return probe
    return None


def load_csv_samples(dataset_dir: Path, csv_info: dict) -> list:
    """Samples from a CSV with an image column and a 0-4 label column."""
    csv_path = Path(csv_info["csv"])
    header = csv_info["columns"]
    header_l = [h.strip().lower() for h in header]
    img_idx = header_l.index(csv_info["image_column"])
    label_idx = header_l.index(csv_info["label_column"])
    samples: list = []
    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if len(row) <= max(img_idx, label_idx):
                continue
            label = _class_from_value(row[label_idx])
            if label is None:
                continue
            stem = row[img_idx].strip()
            resolved = _resolve_image(dataset_dir, stem)
            if resolved:
                samples.append((resolved, label))
    return samples


def load_folder_samples(dataset_dir: Path, info: dict) -> list:
    """Samples from folder-per-class layout."""
    image_dir = Path(info["image_dir"])
    samples: list = []
    for class_name in info["classes"]:
        cid = FOLDER_CLASS_MAP.get(class_name.strip().lower())
        if cid is None:
            continue
        sd = image_dir / class_name
        for f in sd.iterdir():
            if f.is_file() and _is_image(f):
                samples.append((f, cid))
    return samples


def detect_presplit(dataset_dir: Path) -> list:
    """Detect split_dataset/{train,val,test}/{0..4}/ layout. Returns split samples.

    The shipped PRIMARY_DR zip already contains deterministic official splits:
      split_dataset/train/<class>/img, split_dataset/val/<class>/img,
      split_dataset/test/<class>/img
    Using them avoids reshuffling a single pool and preserves the official
    evaluation set. Returns [] when the layout is not present.
    """
    found = []
    for split in ("train", "val", "test"):
        split_dir = dataset_dir / "split_dataset" / split
        if not split_dir.exists():
            split_dir = dataset_dir / split
        if not split_dir.exists():
            found.append(None)
            continue
        samples: list = []
        for class_dir in sorted(split_dir.iterdir()):
            if not class_dir.is_dir():
                continue
            cid = FOLDER_CLASS_MAP.get(class_dir.name.strip().lower())
            if cid is None:
                continue
            for f in class_dir.iterdir():
                if f.is_file() and _is_image(f):
                    samples.append((f, cid))
        found.append(samples)
    if all(s is not None for s in found) and found[0] and found[1] and found[2]:
        return found
    return []


def stratified_split(samples: list, seed: int, val_fraction: float, test_fraction: float):
    """Deterministic stratified split into train/val/test (fallback layout only)."""
    import random

    rng = random.Random(seed)
    by_class: dict = {}
    for s in samples:
        by_class.setdefault(s[1], []).append(s)
    train, val, test = [], [], []
    for cid, items in sorted(by_class.items()):
        items = items[:]
        rng.shuffle(items)
        n = len(items)
        n_test = max(1, int(n * test_fraction)) if n >= 5 else 0
        n_val = max(1, int(n * val_fraction)) if n >= 5 else 0
        test.extend(items[:n_test])
        val.extend(items[n_test:n_test + n_val])
        train.extend(items[n_test + n_val:])
    return train, val, test


def class_weights(samples: list, num_classes: int = config.NUM_DR_CLASSES) -> torch.Tensor:
    """Inverse-frequency weights for imbalance handling."""
    counts = [0] * num_classes
    for _p, label in samples:
        counts[label] += 1
    total = sum(counts) or 1
    weights = [total / (num_classes * c) if c else 1.0 for c in counts]
    return torch.tensor(weights, dtype=torch.float32)


def make_weighted_sampler(samples: list) -> WeightedRandomSampler:
    counts: dict = {}
    for _p, label in samples:
        counts[label] = counts.get(label, 0) + 1
    sample_weights = [1.0 / counts[label] for _p, label in samples]
    return WeightedRandomSampler(sample_weights, num_samples=len(samples), replacement=True)


def build_dataloaders(cfg: config.TrainingConfig, dataset_dir: Path | None = None):
    """Returns (loaders dict, metadata, train_samples). Honors subset_fraction for smoke runs."""
    from ai.primary_dr.data.verify_dataset import verify as verify_dataset

    dataset_dir = dataset_dir or config.PRIMARY_DR_DIR
    report = verify_dataset(dataset_dir)
    if report.get("status") != "VERIFIED":
        raise RuntimeError(f"PRIMARY_DR dataset not verified: {report.get('status')} at {dataset_dir}")

    # Prefer the dataset's official pre-split layout when present
    pre = detect_presplit(dataset_dir)
    if pre:
        train_s, val_s, test_s = pre
        samples = train_s + val_s + test_s
    elif report["layout"] == "csv_labels":
        samples = load_csv_samples(dataset_dir, report["primary_label_source"])
        if cfg.subset_fraction < 1.0:
            import random

            rng = random.Random(cfg.seed)
            rng.shuffle(samples)
            samples = samples[: max(1, int(len(samples) * cfg.subset_fraction))]
        train_s, val_s, test_s = stratified_split(samples, cfg.seed, cfg.val_fraction, cfg.test_fraction)
    else:
        samples = load_folder_samples(dataset_dir, report["primary_label_source"])
        if cfg.subset_fraction < 1.0:
            import random

            rng = random.Random(cfg.seed)
            rng.shuffle(samples)
            samples = samples[: max(1, int(len(samples) * cfg.subset_fraction))]
        train_s, val_s, test_s = stratified_split(samples, cfg.seed, cfg.val_fraction, cfg.test_fraction)

    # subset_fraction applies before datasets are built (smoke runs).
    # Pre-split val/test are also subsampled so smoke runs stay fast.
    if pre and cfg.subset_fraction < 1.0:
        import random

        rng = random.Random(cfg.seed)
        rng.shuffle(train_s)
        train_s = train_s[: max(1, int(len(train_s) * cfg.subset_fraction))]
        rng.shuffle(val_s)
        val_s = val_s[: max(1, int(len(val_s) * cfg.subset_fraction))]
        rng.shuffle(test_s)
        test_s = test_s[: max(1, int(len(test_s) * cfg.subset_fraction))]

    train_tf, eval_tf = build_transforms(cfg.image_size)

    train_ds = FundusDataset(train_s, train_tf)
    val_ds = FundusDataset(val_s, eval_tf)
    test_ds = FundusDataset(test_s, eval_tf)

    sampler = None
    shuffle = True
    if "sampler" in cfg.balance_strategy:
        sampler = make_weighted_sampler(train_s)
        shuffle = False

    common = dict(num_workers=cfg.num_workers, pin_memory=False)
    train_loader = DataLoader(train_ds, batch_size=cfg.batch_size, shuffle=shuffle, sampler=sampler, **common)
    val_loader = DataLoader(val_ds, batch_size=cfg.batch_size, shuffle=False, **common)
    test_loader = DataLoader(test_ds, batch_size=cfg.batch_size, shuffle=False, **common)

    meta = {
        "dataset_dir": str(dataset_dir),
        "layout": report["layout"],
        "dataset_version": config.dataset_version(dataset_dir),
        "total_samples": len(samples),
        "train": len(train_s), "val": len(val_s), "test": len(test_s),
        "class_distribution_total": {
            config.DR_CLASSES[c]: sum(1 for _p, l in samples if l == c)
            for c in range(config.NUM_DR_CLASSES)
        },
    }
    return {"train": train_loader, "val": val_loader, "test": test_loader}, meta, train_s
