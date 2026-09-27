"""RetinoAI AI layer.

Safety invariants:
- models are PENDING until actually trained (no fake results)
- quality gate is replaceable and NOT_CONFIGURED by default
- explainability returns UNAVAILABLE rather than fabricated heatmaps
- LLM narrates structured results only; it never diagnoses images
"""
