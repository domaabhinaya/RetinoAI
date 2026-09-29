/**
 * Client for the verified local Flask AI engine.
 *
 * The Flask engine (ai/service/api_server.py) is the SINGLE SOURCE OF TRUTH for
 * retinal inference. This module performs no model inference of its own and
 * never fabricates a value.
 *
 *   GET  ${FLASK_AI_BASE_URL}/healthz
 *   POST ${FLASK_AI_BASE_URL}/predict        (multipart: file + eye_side)
 *   POST ${FLASK_AI_BASE_URL}/batch-predict  (JSON: base64 images)
 */

const DEFAULT_BASE_URL = "http://127.0.0.1:5001";
const DEFAULT_TIMEOUT_MS = 120_000;

export function flaskBaseUrl(): string {
  return (process.env["FLASK_AI_BASE_URL"] || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export class FlaskAiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "FlaskAiError";
    this.status = status;
    this.code = code;
  }
}

/** Mirrors ai/common/schema.py PrimaryDRResult. */
export interface FlaskPrimaryDR {
  status: string;
  class_id: number | null;
  label: string | null;
  confidence: number | null;
  probabilities: number[] | null;
  uncertainty_value: number | null;
  needs_human_review: boolean;
  eye_side: string;
  reason?: string | null;
}

/** Mirrors ai/common/schema.py ImageQualityResult (NOT_CONFIGURED when absent). */
export interface FlaskImageQuality {
  status: string;
  confidence: number | null;
  score: number | null;
  module: string;
  reason: string;
  eye_side: string;
}

/** Mirrors ai/common/schema.py SecondaryFinding. */
export interface FlaskSecondaryFinding {
  finding: string;
  confidence: number;
  eye_side: string;
  source: string;
}

/** Mirrors ai/common/schema.py ExplainabilityResult. */
export interface FlaskExplainability {
  status: string;
  method: string;
  heatmap_base64: string | null;
  overlay_base64: string | null;
  heatmap_points: Array<{ x: number; y: number; intensity: number }>;
  attention_description: string;
  reason?: string | null;
  eye_side: string;
}

/** Mirrors ai/common/schema.py LLMExplanation. */
export interface FlaskLlmExplanation {
  status: string;
  screening_summary: string;
  patient_friendly_explanation: string;
  specialist_review_reason: string;
  uncertainty_statement: string;
  safety_statement: string;
  provider: string;
  eye_side: string;
}

/** Mirrors ai/common/schema.py UnifiedAIResult. */
export interface FlaskScreeningResult {
  eye_side: string;
  status: string;
  image_quality: FlaskImageQuality;
  primary_dr: FlaskPrimaryDR;
  secondary_findings: FlaskSecondaryFinding[];
  uncertainty: { status: string; value: number | null };
  explainability: FlaskExplainability;
  reference_examples: Array<Record<string, unknown>>;
  llm_explanation: FlaskLlmExplanation;
  model_versioning: {
    primary_dr?: { model_name: string; model_version: string | null; loaded: boolean };
    secondary_ocular?: { model_name: string; model_version: string | null; loaded: boolean };
    quality_gate?: string;
    pipeline_version?: string;
    inference_timestamp?: string;
    explainability_available?: boolean;
  };
  priority_hint: string | null;
  needs_human_review: boolean;
  patient_prediction?: Record<string, unknown>;
}

export interface BatchItem {
  index: number;
  eye_side?: string;
  status?: string;
  result?: FlaskScreeningResult;
  error?: string;
  error_code?: string;
}

export interface BatchResponse {
  status: string;
  count: number;
  succeeded: number;
  failed: number;
  results: BatchItem[];
  safety_statement: string;
}

/** Response of GET /healthz. */
export interface FlaskHealth {
  status: string;
  service: string;
  api_version: string;
  device: string;
  gpu: string | null;
  primary_dr: {
    model_name: string;
    registered: boolean;
    status: string;
    model_version: string | null;
    dataset_version: string | null;
    checkpoint_path: string | null;
  };
  secondary_ocular: {
    model_name: string;
    registered: boolean;
    status: string;
    model_version: string | null;
    dataset_version: string | null;
    checkpoint_path: string | null;
  };
  quality_gate: { status: string };
  models_loaded: boolean;
  safety_statement: string;
}

function timeoutMs(): number {
  const raw = process.env["FLASK_AI_TIMEOUT_MS"];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

async function readErrorBody(res: Response): Promise<{ message?: string; code?: string }> {
  try {
    const text = await res.text();
    if (!text) return {};
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const rec = parsed as Record<string, unknown>;
      return {
        message: typeof rec["error"] === "string" ? (rec["error"] as string) : undefined,
        code: typeof rec["error_code"] === "string" ? (rec["error_code"] as string) : undefined,
      };
    }
    return {};
  } catch {
    // Non-JSON error body (e.g. HTML) - report the status instead of crashing.
    return {};
  }
}

function upstreamError(res: Response): FlaskAiError {
  if (res.status === 503) {
    return new FlaskAiError(
      "AI engine reports a model is unavailable",
      503,
      "AI_ENGINE_MODEL_UNAVAILABLE",
    );
  }
  return new FlaskAiError(
    `AI engine rejected the request (${res.status})`,
    400,
    "AI_ENGINE_REJECTED",
  );
}

/** GET /healthz - never throws; reports reachability instead. */
export async function getHealth(): Promise<
  { reachable: true; health: FlaskHealth } | { reachable: false; error: string }
> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${flaskBaseUrl()}/healthz`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { reachable: false, error: `AI engine returned status ${res.status}` };
    }
    return { reachable: true, health: (await res.json()) as FlaskHealth };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { reachable: false, error: `AI engine unreachable at ${flaskBaseUrl()}: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

/** POST /predict with multipart/form-data (file + eye_side). */
export async function predictImage(
  imageBytes: Buffer,
  fileName: string,
  mimeType: string,
  eyeSide: "RIGHT" | "LEFT",
): Promise<FlaskScreeningResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(imageBytes)], { type: mimeType }), fileName);
  form.append("eye_side", eyeSide);

  let res: Response;
  try {
    res = await fetch(`${flaskBaseUrl()}/predict`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new FlaskAiError(
      `AI engine unreachable at ${flaskBaseUrl()}: ${msg}`,
      503,
      "AI_ENGINE_UNREACHABLE",
    );
  }

  if (!res.ok) {
    const body = await readErrorBody(res);
    const mapped = upstreamError(res);
    throw new FlaskAiError(body.message || mapped.message, mapped.status, body.code || mapped.code);
  }

  try {
    return (await res.json()) as FlaskScreeningResult;
  } catch (err) {
    throw new FlaskAiError(
      `AI engine returned malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
      502,
      "AI_ENGINE_MALFORMED_RESPONSE",
    );
  }
}

/** POST /batch-predict with base64 images. */
export async function batchPredict(
  images: Array<{ imageBase64: string; eyeSide: "RIGHT" | "LEFT" }>,
): Promise<BatchResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs());
  try {
    const res = await fetch(`${flaskBaseUrl()}/batch-predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: images.map((i) => ({ image_base64: i.imageBase64, eye_side: i.eyeSide })),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await readErrorBody(res);
      const mapped = upstreamError(res);
      throw new FlaskAiError(body.message || mapped.message, mapped.status, body.code || mapped.code);
    }
    return (await res.json()) as BatchResponse;
  } catch (err) {
    if (err instanceof FlaskAiError) throw err;
    throw new FlaskAiError(
      `AI engine unreachable at ${flaskBaseUrl()}: ${err instanceof Error ? err.message : String(err)}`,
      503,
      "AI_ENGINE_UNREACHABLE",
    );
  } finally {
    clearTimeout(timer);
  }
}

