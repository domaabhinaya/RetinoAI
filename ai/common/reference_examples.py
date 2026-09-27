"""Reference dataset examples - similarity, NEVER diagnosis.

Returns dataset images with similar visual characteristics, strictly separated
from the patient prediction:

  {"patient_prediction": {...}, "reference_examples": [...]}

Similarity is computed on deep features and is explicitly NOT evidence of the
same disease. If the index is unavailable, an empty list is returned.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ai import config  # noqa: E402
from ai.common.schema import ReferenceExample  # noqa: E402

REFERENCE_NOTE = ("Reference examples with similar visual characteristics. "
                  "Similarity is NOT evidence of the same diagnosis and not proof of disease.")


def find_similar(pil_image, dr_label: str | None, top_k: int = config.REFERENCE_TOP_K) -> list:
    """Feature-space similarity against the PRIMARY_DR reference index.

    Returns [] when no index has been built (honest empty state, never fake).
    """
    index_path = config.REFERENCE_INDEX_PATH
    if not index_path.exists():
        return []
    try:
        import json

        import numpy as np
        import torch

        from ai.primary_dr.data.dataset import build_transforms
        from ai.primary_dr.models.efficientnet_b0_dr import load_checkpoint

        index = json.loads(index_path.read_text(encoding="utf-8"))
        items = index.get("items") or []
        if not items:
            return []
        model, meta = load_checkpoint(Path(index["checkpoint"]), device="cpu")
        feats: dict = {}

        def hook(_m, _inp, out):
            feats["x"] = out.detach()

        handle = model.features[-1].register_forward_hook(hook)
        _, tf = build_transforms(224)
        x = tf(pil_image).unsqueeze(0)
        with torch.no_grad():
            model(x)
        handle.remove()
        q = feats["x"].mean(dim=(2, 3)).flatten().numpy()
        q = q / (np.linalg.norm(q) + 1e-12)

        scored = []
        for it in items:
            v = np.array(it["features"], dtype=np.float32)
            v = v / (np.linalg.norm(v) + 1e-12)
            scored.append((float(np.dot(q, v)), it))
        scored.sort(key=lambda t: -t[0])
        return [
            ReferenceExample(
                image_ref=it.get("image_ref", ""),
                label=it.get("label", ""),
                similarity=round(sim, 4),
                note=REFERENCE_NOTE,
            ).to_dict()
            for sim, it in scored[:top_k]
        ]
    except Exception:  # noqa: BLE001 - reference lookup must never break inference
        return []
