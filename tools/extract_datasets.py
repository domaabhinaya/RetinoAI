"""Extract the shipped RetinoAI benchmark datasets into the configured folders.

This is the script referenced by ``ai/README.md`` and by the dataset
verification hints (``ai/primary_dr/data/verify_dataset.py``,
``ai/secondary_ocular/data/verify_labels.py``).

Why a script and not ``Expand-Archive``/``unzip``:
    The RFMiD archives store their label CSV with LZMA compression
    (ZIP method 14). .NET's ``ZipFile``/``Expand-Archive`` refuses those entries
    ("unsupported compression method"), so extraction is done with Python's
    ``zipfile`` module, which supports store / deflate / bzip2 / lzma.

Layouts produced (exactly what the verification + training code expects):

    PRIMARY_DR  <target>/split_dataset/{train,val,test}/{0..4}/*.jpg
    RFMiD       <target>/Training_Set/{Training/*.png,RFMiD_Training_Labels.csv}
                <target>/Evaluation_Set/{Validation/*.png,RFMiD_Validation_Labels.csv}
                <target>/Test_Set/{Test/*.png,RFMiD_Testing_Labels.csv}

Nothing is invented: the script only copies archive members and reports the
counts it actually finds on disk.

Usage:
    python tools/extract_datasets.py both
    python tools/extract_datasets.py primary --primary-zip "D:/data/primarydataset.zip"
    python tools/extract_datasets.py secondary --secondary-zip-dir "D:/data/rfmid"
    python tools/extract_datasets.py both --overwrite
"""
from __future__ import annotations

import argparse
import os
import sys
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from ai import config  # noqa: E402

PRIMARY_ZIP_NAME = "primarydataset.zip"
SECONDARY_ZIP_NAMES = ("Training_Set.zip", "Evaluation_Set.zip", "Test_Set.zip")
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".gif", ".jfif"}


def _search_dirs() -> list:
    """Places the dataset archives are commonly found in, in priority order."""
    home = Path.home()
    return [
        home / "Downloads",
        home / "OneDrive" / "Desktop",
        home / "Desktop",
        REPO_ROOT,
    ]


def find_archive(name: str) -> Path | None:
    for d in _search_dirs():
        cand = d / name
        if cand.is_file():
            return cand
    return None


def _count_images(directory: Path) -> int:
    if not directory.is_dir():
        return 0
    with os.scandir(directory) as it:
        return sum(1 for e in it if e.is_file() and Path(e.name).suffix.lower() in IMAGE_EXTS)


def _extract(archive: Path, target: Path, overwrite: bool) -> str:
    """Extract one archive with the stdlib (handles LZMA/BZIP2 entries too)."""
    target.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(archive) as zf:
            for member in zf.infolist():
                out = target / member.filename
                if member.is_dir():
                    out.mkdir(parents=True, exist_ok=True)
                    continue
                if out.exists() and out.stat().st_size > 0 and not overwrite:
                    continue  # already extracted - keeps re-runs idempotent
                out.parent.mkdir(parents=True, exist_ok=True)
                if overwrite or not out.exists():
                    with zf.open(member) as src, open(out, "wb") as dst:
                        dst.write(src.read())
    except zipfile.BadZipFile as exc:
        return f"FAILED (not a readable zip: {exc})"
    except OSError as exc:
        return f"FAILED ({exc})"
    return "ok"


def primary_looks_extracted(root: Path) -> bool:
    split = root / "split_dataset"
    return all((split / s).is_dir() for s in ("train", "val", "test"))


def secondary_looks_extracted(root: Path) -> bool:
    csvs = (
        root / "Training_Set" / "RFMiD_Training_Labels.csv",
        root / "Evaluation_Set" / "RFMiD_Validation_Labels.csv",
        root / "Test_Set" / "RFMiD_Testing_Labels.csv",
    )
    return all(p.is_file() for p in csvs)


def report_primary(root: Path) -> None:
    print(f"PRIMARY_DR target : {root}")
    total = 0
    for split in ("train", "val", "test"):
        split_dir = root / "split_dataset" / split
        if not split_dir.is_dir():
            print(f"  {split:5s}: MISSING")
            continue
        per_class = {c.name: _count_images(c) for c in sorted(split_dir.iterdir()) if c.is_dir()}
        split_total = sum(per_class.values())
        total += split_total
        print(f"  {split:5s}: {split_total} images {per_class}")
    print(f"  total: {total} images")


def report_secondary(root: Path) -> None:
    print(f"RFMiD target      : {root}")
    pairs = (("Training_Set", "Training"), ("Evaluation_Set", "Validation"), ("Test_Set", "Test"))
    total = 0
    for top, img_dir in pairs:
        n = _count_images(root / top / img_dir)
        csv_name = {
            "Training_Set": "RFMiD_Training_Labels.csv",
            "Evaluation_Set": "RFMiD_Validation_Labels.csv",
            "Test_Set": "RFMiD_Testing_Labels.csv",
        }[top]
        csv_present = (root / top / csv_name).is_file()
        total += n
        print(f"  {top:15s}: {n} images, labels_csv={'present' if csv_present else 'MISSING'}")
    print(f"  total: {total} images")


def extract_primary(primary_zip: Path | None, overwrite: bool) -> Path:
    target = config.PRIMARY_DR_DIR
    if primary_looks_extracted(target):
        print(f"[primary] already extracted at {target} (no archive needed)")
        return target
    archive = primary_zip or find_archive(PRIMARY_ZIP_NAME)
    if archive is None or not archive.is_file():
        print(f"[primary] no {PRIMARY_ZIP_NAME} found. Pass --primary-zip or set "
              "RETINOAI_PRIMARY_DR_DIR to an already-extracted folder.")
        return target
    print(f"[primary] extracting {archive} -> {target}")
    print(f"[primary] {_extract(archive, target, overwrite)}")
    return target


def extract_secondary(secondary_zip_dir: Path | None, overwrite: bool) -> Path:
    target = config.RFMID_DIR
    if secondary_looks_extracted(target):
        print(f"[secondary] already extracted at {target} (no archives needed)")
        return target
    missing = []
    for name in SECONDARY_ZIP_NAMES:
        archive = (secondary_zip_dir / name) if secondary_zip_dir else find_archive(name)
        if archive is None or not archive.is_file():
            missing.append(name)
            continue
        print(f"[secondary] extracting {archive} -> {target}")
        print(f"[secondary] {_extract(archive, target, overwrite)}")
    if missing:
        print("[secondary] missing archives: " + ", ".join(missing)
              + " (expected RFMiD Training_Set.zip / Evaluation_Set.zip / Test_Set.zip)")
    return target


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract the PRIMARY_DR and RFMiD benchmark datasets used by ai/")
    parser.add_argument("what", nargs="?", choices=["primary", "secondary", "both"], default="both")
    parser.add_argument("--primary-zip", type=str, default=None)
    parser.add_argument("--secondary-zip-dir", type=str, default=None)
    parser.add_argument("--overwrite", action="store_true",
                        help="re-extract every member instead of skipping existing files")
    args = parser.parse_args()

    if args.what in ("primary", "both"):
        root = extract_primary(Path(args.primary_zip) if args.primary_zip else None, args.overwrite)
        report_primary(root)
        print()
    if args.what in ("secondary", "both"):
        root = extract_secondary(Path(args.secondary_zip_dir) if args.secondary_zip_dir else None,
                                 args.overwrite)
        report_secondary(root)

    print()
    print("Next: python -m ai.primary_dr.data.verify_dataset")
    print("      python -m ai.secondary_ocular.data.verify_labels")


if __name__ == "__main__":
    main()

