"""Model versioning / registry.

Every inference records: model name, model version, dataset version used,
inference timestamp, and explainability availability (requirement 12).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from .. import config
from .schema import utc_now

REGISTRY_PATH = config.REPORT_DIR / "model_registry.json"


def _load_registry() -> list:
    if REGISTRY_PATH.exists():
        try:
            return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []
    return []


def register_model(
    model_name: str,
    model_version: str,
    dataset_name: str,
    dataset_version: str,
    checkpoint_path: Optional[Path] = None,
    metrics: Optional[dict] = None,
    config_snapshot: Optional[dict] = None,
) -> dict:
    entry: dict[str, Any] = {
        "model_name": model_name,
        "model_version": model_version,
        "dataset_name": dataset_name,
        "dataset_version": dataset_version,
        "checkpoint_path": str(checkpoint_path) if checkpoint_path else None,
        "metrics": metrics or {},
        "config": config_snapshot or {},
        "registered_at": utc_now(),
    }
    registry = [e for e in _load_registry() if e["model_name"] != model_name]
    registry.append(entry)
    REGISTRY_PATH.write_text(json.dumps(registry, indent=2), encoding="utf-8")
    return entry


def get_model_info(model_name: str) -> Optional[dict]:
    for entry in _load_registry():
        if entry["model_name"] == model_name:
            return entry
    return None


def versioning_block(model_name: str) -> dict:
    """Versioning payload attached to every inference result."""
    info = get_model_info(model_name)
    if info is None:
        return {
            "model_name": model_name,
            "model_version": None,
            "dataset_version": None,
            "loaded": False,
            "inference_timestamp": utc_now(),
        }
    return {
        "model_name": info["model_name"],
        "model_version": info["model_version"],
        "dataset_name": info.get("dataset_name"),
        "dataset_version": info.get("dataset_version"),
        "loaded": True,
        "inference_timestamp": utc_now(),
    }
