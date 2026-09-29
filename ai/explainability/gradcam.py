"""Grad-CAM explainability for EfficientNet-B0 models.

Produces the localized heatmap + overlay for the retinal image. The output is
always framed as "Model attention / supporting image region" - it is NOT proof
of a disease and NOT definitive lesion localization.

When explainability cannot be produced (model not loaded, hook failure),
an explicit UNAVAILABLE state is returned instead of a fabricated heatmap.
"""
from __future__ import annotations

import base64
import io

import numpy as np

from ai.common.eye_side import EyeSide
from ai.common.schema import ExplainabilityResult


def _to_b64(pil_image) -> str:
    buf = io.BytesIO()
    pil_image.convert("RGB").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _heatmap_points(cam: np.ndarray, top_k: int = 8) -> list:
    """Top-K CAM peaks as {x, y, intensity} in percentage coordinates."""
    h, w = cam.shape
    flat = cam.flatten()
    idx = np.argpartition(flat, -min(top_k, flat.size))[-min(top_k, flat.size):]
    points = []
    for i in idx:
        yy, xx = divmod(int(i), w)
        intensity = float(cam[yy, xx])
        if intensity <= 0.05:
            continue
        points.append({
            "x": round(xx / w * 100, 1),
            "y": round(yy / h * 100, 1),
            "intensity": round(intensity, 3),
        })
    points.sort(key=lambda p: -p["intensity"])
    return points


def _overlay(pil_image, cam_resized: np.ndarray) -> str:
    from PIL import Image

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.cm as cm

    base = pil_image.convert("RGB").resize((cam_resized.shape[1], cam_resized.shape[0]))
    # matplotlib >= 3.9 removed cm.get_cmap; use the registered colormap API,
    # falling back to the legacy call for older versions.
    try:
        jet = matplotlib.colormaps["jet"]
    except (AttributeError, KeyError):  # older matplotlib
        jet = cm.get_cmap("jet")
    heat = jet(cam_resized)[..., :3]  # HxWx3 in 0..1
    blended = (np.asarray(base, dtype=np.float32) / 255.0) * 0.6 + heat * 0.4
    blended = np.clip(blended * 255, 0, 255).astype(np.uint8)
    out = Image.fromarray(blended)
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def generate_gradcam(model, pil_image, device, eye_side: EyeSide) -> ExplainabilityResult:
    """Real Grad-CAM on the model's last conv block."""
    import torch

    eye = EyeSide.normalize(eye_side.value if hasattr(eye_side, "value") else eye_side)
    try:
        from ai.primary_dr.data.dataset import build_transforms

        target_layer = model.features[-1]
        activations: list = []
        gradients: list = []

        def fwd_hook(_m, _inp, out):
            activations.append(out.detach())

        def bwd_hook(_m, _inp, out):
            gradients.append(out[0].detach())

        h1 = target_layer.register_forward_hook(fwd_hook)
        h2 = target_layer.register_full_backward_hook(bwd_hook)

        _, eval_tf = build_transforms(224)
        x = eval_tf(pil_image).unsqueeze(0).to(device)
        logits = model(x)
        cls = int(logits.argmax(dim=1))
        model.zero_grad(set_to_none=True)
        logits[0, cls].backward()

        acts = activations[0][0]  # (C, h, w)
        grads = gradients[0]  # (C, h, w)
        weights = grads.mean(dim=tuple(range(1, grads.ndim)))  # GAP over spatial dims
        cam = torch.relu((weights[:, None, None] * acts).sum(dim=0))
        cam = cam.cpu().numpy()
        cam = cam / (cam.max() + 1e-12)
    except Exception as exc:  # noqa: BLE001
        return ExplainabilityResult(
            status="UNAVAILABLE", eye_side=eye.value,
            reason=f"Grad-CAM generation failed: {exc}")

    h1.remove()
    h2.remove()

    from PIL import Image

    heatmap_img = Image.fromarray((cam * 255).astype(np.uint8)).resize(pil_image.size)
    cam_resized = np.asarray(heatmap_img, dtype=np.float32) / 255.0

    return ExplainabilityResult(
        status="AVAILABLE",
        method="grad_cam",
        heatmap_base64=_to_b64(heatmap_img),
        overlay_base64=_overlay(pil_image, cam_resized),
        heatmap_points=_heatmap_points(cam_resized),
        attention_description=(
            "Model attention / supporting image region. This heatmap shows where the model "
            "looked when forming its output; it is not proof of a disease and not definitive "
            "lesion localization."),
        eye_side=eye.value,
    )
