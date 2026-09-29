"""RetinoAI AI layer configuration.

Single source of truth for paths, seeds, class labels, and safety thresholds.
All training scripts read from here so runs are reproducible.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from pathlib import Path

# ---------------------------------------------------------------- paths
# AI_DIR is the ai/ package directory; AI_ROOT is the project root that owns
# the shared checkpoints/, reports/, history/, and config/ folders.
AI_DIR = Path(__file__).resolve().parent
AI_ROOT = AI_DIR.parent
REPO_ROOT = AI_ROOT

# Dataset locations (override with environment variables when needed).
# PRIMARY_DR may live extracted as a folder or still be a zip; the dataset
# module auto-detects the internal layout.
PRIMARY_DR_DIR = Path(os.environ.get("RETINOAI_PRIMARY_DR_DIR", r"C:\RetinoAI-Datasets\primarydataset"))
RFMID_DIR = Path(os.environ.get("RETINOAI_RFMID_DIR", Path.home() / "OneDrive" / "Desktop" / "secondarydataset"))

CHECKPOINT_DIR = AI_ROOT / "checkpoints"
REPORT_DIR = AI_ROOT / "reports"
HISTORY_DIR = AI_ROOT / "history"
CONFIG_DIR = AI_ROOT / "config"

for _d in (CHECKPOINT_DIR, REPORT_DIR, HISTORY_DIR, CONFIG_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ------------------------------------------------------- DR class labels
DR_CLASSES = ["No DR", "Mild DR", "Moderate DR", "Severe DR", "Proliferative DR"]
DR_CLASS_TO_ID = {name: i for i, name in enumerate(DR_CLASSES)}
NUM_DR_CLASSES = 5

# Mapping to the ICDR naming used by the existing RetinoAI backend
# (AIScreeningResult.drGrade) so AI output feeds the existing workflow.
DR_TO_ICDR = {
    "No DR": "No DR",
    "Mild DR": "Mild NPDR",
    "Moderate DR": "Moderate NPDR",
    "Severe DR": "Severe NPDR",
    "Proliferative DR": "PDR",
}

# ------------------------------------------------------------ training
@dataclass
class TrainingConfig:
    seed: int = 42
    image_size: int = 224
    batch_size: int = 32
    num_workers: int = 2
    epochs: int = 30
    learning_rate: float = 3e-4
    weight_decay: float = 1e-4
    backbone: str = "efficientnet_b0"
    pretrained: bool = True
    # fraction of training data used; useful for CPU smoke runs
    subset_fraction: float = 1.0
    # validation metric used to select the best checkpoint
    # (must match a key produced by ai/common/metrics.classification_metrics)
    selection_metric: str = "f1_macro"  # or "roc_auc_macro_ovr"
    balance_strategy: str = "weighted_loss_and_sampler"  # "none"|"weighted_loss"|"weighted_loss_and_sampler"
    test_fraction: float = 0.15
    val_fraction: float = 0.15
    early_stopping_patience: int = 6

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")

    @staticmethod
    def load(path: Path) -> "TrainingConfig":
        data = json.loads(path.read_text(encoding="utf-8"))
        return TrainingConfig(**data)

    def to_dict(self) -> dict:
        return asdict(self)


# ------------------------------------------------------------ safety
# Entropy-based uncertainty threshold (normalized 0..1). Predictions whose
# normalized entropy exceeds this are flagged for human review instead of
# being shown as confident findings.
UNCERTAINTY_THRESHOLD = float(os.environ.get("RETINOAI_UNCERTAINTY_THRESHOLD", "0.60"))
# Minimum softmax confidence required to expose a prediction to the workflow.
MIN_CONFIDENCE = float(os.environ.get("RETINOAI_MIN_CONFIDENCE", "0.50"))

# Quality gate: which registered gate implementation to use, or "not_configured".
QUALITY_GATE_NAME = os.environ.get("RETINOAI_QUALITY_GATE", "not_configured")

# Inference service
SERVICE_HOST = os.environ.get("RETINOAI_AI_SERVICE_HOST", "127.0.0.1")
SERVICE_PORT = int(os.environ.get("RETINOAI_AI_SERVICE_PORT", "5001"))

# Reference examples (similarity based, NEVER evidence of the same diagnosis)
REFERENCE_INDEX_PATH = REPORT_DIR / "reference_index.json"
REFERENCE_TOP_K = 3

MODEL_NAME = "RetinoAI-DR-EffNetB0"
MODEL_VERSION = "1.0.0"
SECONDARY_MODEL_NAME = "RetinoAI-Ocular-RFMiD-EffNetB0"


def dataset_version(dataset_dir: Path) -> str:
    """Cheap deterministic version tag derived from dataset path + file count."""
    if not dataset_dir.exists():
        return "unverified"
    import hashlib

    h = hashlib.sha256()
    h.update(str(dataset_dir).encode())
    try:
        count = sum(1 for _ in dataset_dir.rglob("*"))
    except OSError:
        count = 0
    h.update(str(count).encode())
    return h.hexdigest()[:12]
