"""STEP 6: Verify the RFMiD label structure.

Reports the original disease label columns EXACTLY as provided by the dataset.
No labels are invented, renamed, or collapsed into a DR 0-4 scale.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ai import config  # noqa: E402

SPLITS = {
    "training": ("Training_Set", "Training", "RFMiD_Training_Labels.csv"),
    "validation": ("Evaluation_Set", "Validation", "RFMiD_Validation_Labels.csv"),
    "testing": ("Test_Set", "Test", "RFMiD_Testing_Labels.csv"),
}

METADATA_LABELS = {"id"}
DISEASE_LABELS_EXCLUDE = {"disease_risk"}  # kept as-is, reported separately


def _split_paths(root: Path):
    for name, (top, img_dir, csv_name) in SPLITS.items():
        csv_path = root / top / top / csv_name
        images_dir = root / top / top / img_dir
        if not csv_path.exists():
            csv_path = root / top / csv_name
            images_dir = root / top / img_dir
        yield name, csv_path, images_dir


def verify(root: Path | None = None) -> dict:
    root = root or config.RFMID_DIR
    report = {"dataset": "RFMiD", "path": str(root), "exists": root.exists(), "splits": {}}
    if not root.exists():
        report["status"] = "MISSING"
        report["hint"] = "Run tools/extract_datasets.py secondary or set RETINOAI_RFMID_DIR."
        return report

    canonical_labels: list | None = None
    for name, csv_path, images_dir in _split_paths(root):
        entry: dict = {"csv": str(csv_path) if csv_path.exists() else None,
                       "images_dir": str(images_dir) if images_dir.exists() else None}
        if csv_path.exists():
            with csv_path.open(newline="", encoding="utf-8-sig") as f:
                reader = csv.reader(f)
                header = [h.strip() for h in next(reader, [])]
                rows = list(reader)
            disease_labels = [h for h in header[1:] if h.lower() not in METADATA_LABELS]
            disease_only = [h for h in disease_labels if h.lower() not in DISEASE_LABELS_EXCLUDE]
            entry["id_column"] = header[0] if header else None
            entry["original_label_columns"] = disease_labels  # preserved verbatim
            entry["num_labels"] = len(disease_labels)
            entry["num_disease_labels_excluding_disease_risk"] = len(disease_only)
            entry["rows"] = len(rows)
            entry["label_type"] = "multi_label_binary"
            entry["model_output"] = "sigmoid per label; NOT a DR 0-4 conversion"
            if canonical_labels is None:
                canonical_labels = disease_labels
            elif canonical_labels != disease_labels:
                entry["label_mismatch_with_training"] = True
        if images_dir.exists():
            entry["image_count"] = sum(1 for p in images_dir.iterdir() if p.suffix.lower() == ".png")
        report["splits"][name] = entry

    report["canonical_disease_labels"] = canonical_labels or []
    report["status"] = "VERIFIED" if canonical_labels else "UNRECOGNIZED"
    report["note"] = ("Labels remain the ORIGINAL RFMiD multi-disease set. "
                      "Metrics are model-development/validation metrics only, not clinical accuracy.")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify RFMiD label structure")
    parser.add_argument("--dir", type=str, default=None)
    parser.add_argument("--out", type=str, default=str(config.REPORT_DIR / "rfmid_verification.json"))
    args = parser.parse_args()
    report = verify(Path(args.dir) if args.dir else None)
    out = Path(args.out)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "canonical_disease_labels"}, indent=2))
    print(f"Original RFMiD disease labels ({len(report['canonical_disease_labels'])}): "
          + ", ".join(report["canonical_disease_labels"]))


if __name__ == "__main__":
    main()
