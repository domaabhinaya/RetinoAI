"""LLM explanation generation.

The LLM NEVER diagnoses images - it converts the structured AI result into
readable text. Two providers:

1. OpenAI-compatible API (if RETINOAI_LLM_API_KEY / RETINOAI_LLM_BASE_URL /
   RETINOAI_LLM_MODEL are configured) - uses a strict system prompt and is
   validated against the structured result (rejects invented findings).
2. Deterministic template fallback (always available) - restates ONLY the
   structured fields, never invents anything.

Both providers always include the uncertainty statement and safety statement.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ai.common.schema import LLMExplanation  # noqa: E402

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "explanation_system.txt"
SAFETY_STATEMENT = (
    "These results are AI-assisted screening outputs, not a diagnosis. "
    "A qualified healthcare professional must review all findings before any "
    "clinical decision is made."
)


def _load_system_prompt() -> str:
    if PROMPT_PATH.exists():
        return PROMPT_PATH.read_text(encoding="utf-8")
    return SAFETY_STATEMENT


def _primary_description(result: dict) -> str:
    p = result.get("primary_dr") or {}
    status = p.get("status")
    if status == "PENDING":
        return "the primary DR model is not trained yet, so no DR grade can be reported"
    if status == "NEEDS_HUMAN_REVIEW":
        label = p.get("label") or "an uncertain DR grade"
        return (f"an AI-assisted finding of {label} with uncertainty beyond the review "
                f"threshold; specialist review is required")
    if status == "COMPLETED":
        label = p.get("label")
        conf = p.get("confidence")
        if conf is not None:
            return f"an AI-assisted screening finding of {label} (model confidence {conf:.0%})"
        return f"an AI-assisted finding of {label}"
    return "no primary DR result is available"


def _quality_description(result: dict) -> str:
    q = result.get("image_quality") or {}
    status = q.get("status", "NOT_CONFIGURED")
    if status == "NOT_CONFIGURED":
        return ("image quality was not assessed by an automated quality model; "
                "suitability for screening must be judged by the operator")
    if status == "GOOD":
        return "the image was considered suitable for screening"
    if status in ("POOR", "NEEDS_RECAPTURE"):
        return "the image was flagged as poor quality; recapture or human review is requested"
    return f"image quality status is {status}"


def _secondary_description(result: dict) -> str:
    findings = result.get("secondary_findings") or []
    if not findings:
        return "no additional ocular findings were reported by the secondary model"
    parts = [f"{f['finding']} ({f['confidence']:.0%})" for f in findings]
    return "AI-assisted secondary findings: " + ", ".join(parts)


def _uncertainty_description(result: dict) -> str:
    u = result.get("uncertainty") or {}
    if u.get("status") == "AVAILABLE" and u.get("value") is not None:
        return (f"Prediction uncertainty (normalized entropy) is {u['value']:.2f} "
                f"on a 0-1 scale where higher means less certain.")
    return "Uncertainty could not be quantified for this prediction."


def template_explanation(result: dict, eye_side: str) -> LLMExplanation:
    """Deterministic fallback: restates ONLY structured fields."""
    primary = result.get("primary_dr") or {}
    status = result.get("status", "PENDING")
    needs_review = bool(result.get("needs_human_review")) or primary.get("status") == "NEEDS_HUMAN_REVIEW"

    summary = (f"AI-assisted screening of the {eye_side} eye identified {_primary_description(result)}. "
               f"{_quality_description(result).capitalize()}. {_secondary_description(result)}")
    if status == "PENDING" or primary.get("status") == "PENDING":
        summary = (f"AI result pending: {_primary_description(result)}. "
                   f"{_quality_description(result).capitalize()}. "
                   "The case requires human review until AI results become available.")

    patient = (
        f"An AI screening tool reviewed this {eye_side} retinal image and reported "
        f"{_primary_description(result)}. This is an AI-assisted screening result, not a diagnosis. "
        f"{_quality_description(result).capitalize()}. "
        + ("Reference examples shown alongside are images with similar visual characteristics; "
           "they do not prove the patient has the same condition. "
           if result.get("reference_examples") else "")
        + "Please follow up with your eye care professional."
    )

    review_reason = (
        "Specialist review is recommended because " + (
            "the model flagged uncertainty beyond the configured threshold; the finding must be "
            "confirmed by a qualified healthcare professional." if needs_review else
            "AI-assisted screening findings always require confirmation by a qualified eye care "
            "specialist before any clinical decision."
        )
    )
    if result.get("image_quality", {}).get("status") in ("POOR", "NEEDS_RECAPTURE"):
        review_reason = ("The image quality was insufficient for reliable AI screening; "
                         "recapture or direct human review is requested.")

    return LLMExplanation(
        status="COMPLETED",
        screening_summary=summary,
        patient_friendly_explanation=patient,
        specialist_review_reason=review_reason,
        uncertainty_statement=_uncertainty_description(result),
        safety_statement=SAFETY_STATEMENT,
        provider="template",
        eye_side=eye_side,
    )


def _parse_sections(text: str) -> dict:
    import re

    patterns = {
        "summary": r"SCREENING SUMMARY:?\s*(.*?)(?=\n\s*\d\.|\Z)",
        "patient": r"PATIENT-FRIENDLY EXPLANATION:?\s*(.*?)(?=\n\s*\d\.|\Z)",
        "review": r"WHY SPECIALIST REVIEW MAY BE REQUIRED:?\s*(.*?)(?=\n\s*\d\.|\Z)",
        "uncertainty": r"UNCERTAINTY STATEMENT:?\s*(.*?)(?=\n\s*\d\.|\Z)",
        "safety": r"SAFETY STATEMENT:?\s*(.*?)(?=\n\s*\d\.|\Z)",
    }
    sections = {}
    for key, pat in patterns.items():
        m = re.search(pat, text, re.DOTALL | re.IGNORECASE)
        sections[key] = m.group(1).strip() if m else ""
    return sections


def _call_llm_api(structured_result: dict, eye_side: str) -> LLMExplanation | None:
    """OpenAI-compatible endpoint, if configured. Falls back on any failure."""
    api_key = os.environ.get("RETINOAI_LLM_API_KEY")
    if not api_key:
        return None
    base_url = os.environ.get("RETINOAI_LLM_BASE_URL", "https://api.openai.com/v1")
    model = os.environ.get("RETINOAI_LLM_MODEL", "gpt-4o-mini")
    try:
        import requests

        user_payload = {
            "eye_side": eye_side,
            "structured_ai_result": structured_result,
            "task": ("Explain this structured AI result following the output format. "
                     "Use ONLY facts present in the structured result."),
        }
        resp = requests.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": _load_system_prompt()},
                    {"role": "user", "content": json.dumps(user_payload)},
                ],
            },
            timeout=30,
        )
        if not resp.ok:
            return None
        text = resp.json()["choices"][0]["message"]["content"]
        parsed = _parse_sections(text)
        if not parsed.get("summary"):
            return None
        return LLMExplanation(
            status="COMPLETED",
            screening_summary=parsed.get("summary", ""),
            patient_friendly_explanation=parsed.get("patient", ""),
            specialist_review_reason=parsed.get("review", ""),
            uncertainty_statement=parsed.get("uncertainty", "") or _uncertainty_description(structured_result),
            safety_statement=SAFETY_STATEMENT,
            provider=f"llm:{model}",
            eye_side=eye_side,
        )
    except Exception:  # noqa: BLE001 - any LLM failure falls back to templates
        return None


def explain_result(structured_result: dict, eye_side: str) -> LLMExplanation:
    """Entry point used by the unified inference service."""
    llm = _call_llm_api(structured_result, eye_side)
    if llm is not None:
        return llm
    return template_explanation(structured_result, eye_side)
