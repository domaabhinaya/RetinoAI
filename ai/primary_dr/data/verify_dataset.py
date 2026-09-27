"""STEP 1: Verify the PRIMARY_DR dataset.

Scans the dataset directory, auto-detects its layout, and writes a JSON
verification report. Supports the common fundus dataset layouts:

  A) CSV label file (image column + 0-4 diagnosis column) + image folder(s)
  B) folder-per-class (ImageFolder) layout: No_DR/ Mild_DR/ ... or 0/ 1/ ...

Report includes per-class counts so class imbalance is documented upfront.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ai import config  # noqa: E402

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".jfif"}
LABEL_WORDS = {"diagnosis", "label", "dr_level", "level", "class", "target", "retinopathy", "grade", "dr_grade"}
IMAGE_WORDS = {"id_code", "image", "filename", "file_name", "name", "id", "image_id", "img", "path"}


def _is_image(p: Path) -> bool:
    return p.suffix.lower() in IMAGE_EXTS


def find_image_dirs(root: Path, min_images: int = 20) -> list:
    """Directories that directly contain many image files."""
    found = []
    if not root.exists():
        return found
    for p in root.rglob("*"):
        if p.is_dir():
            n = sum(1 for c in p.iterdir() if c.is_file() and _is_image(c))
            if n >= min_images:
                found.append((p, n))
    return sorted(found, key=lambda t: -t[1])


def find_label_csvs(root: Path) -> list:
    if not root.exists():
        return []
    return [p for p in root.rglob("*.csv")]


def inspect_csv(csv_path: Path) -> dict | None:
    try:
        with csv_path.open(newline="", encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            header = next(reader, None)
            if not header:
                return None
            rows = list(reader)
    except (OSError, UnicodeDecodeError):
        return None
    header_l = [h.strip().lower() for h in header]
    label_col = next((h for h in header_l if h in LABEL_WORDS), None)
    img_col = next((h for h in header_l if h in IMAGE_WORDS), None)
    label_idx = header_l.index(label_col) if label_col else None
    img_idx = header_l.index(img_col) if img_col else None
    labels: Counter = Counter()
    if label_idx is not None:
        for r in rows:
            if len(r) > label_idx:
                labels[r[label_idx].strip()] += 1
    return {
        "csv": str(csv_path),
        "columns": header,
        "rows": len(rows),
        "image_column": img_col,
        "label_column": label_col,
        "label_distribution": dict(labels.most_common()),
    }


def folder_layout(d: Path) -> dict | None:
    """folder-per-class detection."""
    subdirs = [c for c in d.iterdir() if c.is_dir()]
    if not subdirs:
        return None
    classes: dict = {}
    total = 0
    for sd in subdirs:
        imgs = [c for c in sd.iterdir() if c.is_file() and _is_image(c)]
        if imgs:
            classes[sd.name] = len(imgs)
            total += len(imgs)
    if not classes:
        return None
    return {"image_dir": str(d), "layout": "folder_per_class", "classes": classes, "total_images": total}


def verify(dataset_dir: Path | None = None) -> dict:
    dataset_dir = dataset_dir or config.PRIMARY_DR_DIR
    report: dict = {"dataset": "PRIMARY_DR", "path": str(dataset_dir), "exists": dataset_dir.exists()}
    if not dataset_dir.exists():
        report["status"] = "MISSING"
        report["hint"] = "Extract primarydataset.zip (see tools/extract_datasets.py) or set RETINOAI_PRIMARY_DR_DIR."
        return report

    # Shipped PRIMARY_DR layout: split_dataset/{train,val,test}/{0..4}/.
    # Detect it first so official train/val/test splits are honored verbatim.
    try:
        from ai.primary_dr.data.dataset import detect_presplit

        pre = detect_presplit(dataset_dir)
        if pre:
            names = ("train", "val", "test")
            split_counts = {}
            split_totals = {}
            for split_name, samples in zip(names, pre):
                counts: dict = {}
                for _path, label in samples:
                    counts[str(label)] = counts.get(str(label), 0) + 1
                split_counts[split_name] = counts
                split_totals[split_name] = len(samples)
            report["layout"] = "presplit_folder_per_class"
            report["primary_label_source"] = {
                "layout": "presplit_folder_per_class",
                "classes": {
                    str(i): {
                        s: split_counts[s].get(str(i), 0)
                        for s in ("train", "val", "test")
                    }
                    for i in range(5)
                },
            }
            report["label_distribution"] = {
                str(i): sum(split_counts[s].get(str(i), 0) for s in names) for i in range(5)
            }
            report["split_counts"] = split_counts
            report["total_image_files"] = sum(split_totals.values())
            report["csvs"] = []
            report["image_dirs"] = []
            report["status"] = "VERIFIED"
            report["note"] = (
                "Metrics produced from this dataset are model-development/validation metrics only, "
                "not clinical accuracy."
            )
            return report
    except ImportError:
        pass

    images_total = sum(1 for p in dataset_dir.rglob("*") if p.is_file() and _is_image(p))
    report["total_image_files"] = images_total
    report["csvs"] = [c for c in (inspect_csv(p) for p in find_label_csvs(dataset_dir)) if c and c["rows"]]
    dirs = find_image_dirs(dataset_dir)
    report["image_dirs"] = [{"dir": str(d), "direct_images": n} for d, n in dirs[:10]]

    # Detect layout
    layout = None
    for d, _n in dirs:
        fl = folder_layout(d)
        if fl and len(fl["classes"]) >= 2:
            layout = fl
            break
    csv_layout = None
    for c in report["csvs"]:
        if c["image_column"] and c["label_column"]:
            csv_layout = c
            break

    if csv_layout:
        report["layout"] = "csv_labels"
        report["primary_label_source"] = csv_layout
        report["label_distribution"] = csv_layout["label_distribution"]
    elif layout:
        report["layout"] = "folder_per_class"
        report["primary_label_source"] = layout
        report["label_distribution"] = layout["classes"]
    else:
        report["layout"] = "unknown"

    report["status"] = "VERIFIED" if (csv_layout or layout) else "UNRECOGNIZED"
    report["note"] = (
        "Metrics produced from this dataset are model-development/validation metrics only, "
        "not clinical accuracy."
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify PRIMARY_DR dataset structure")
    parser.add_argument("--dir", type=str, default=None, help="Dataset directory override")
    parser.add_argument("--out", type=str, default=str(config.REPORT_DIR / "primary_dr_verification.json"))
    args = parser.parse_args()
    report = verify(Path(args.dir) if args.dir else None)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
