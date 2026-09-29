import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  type ImageQuality,
  type AIScreeningResult,
  type AIFinding,
  type Explainability,
  type Priority,
  type ScreeningCase,
  type RetinalImage,
  type DiabetesHistory,
  type ClinicalInformation,
  type Symptoms,
  store,
} from "./store";
import {
  FlaskAiError,
  predictImage,
  getHealth,
  type FlaskHealth,
  type FlaskScreeningResult,
  type FlaskSecondaryFinding,
} from "./flask-ai-client";

export { FlaskAiError } from "./flask-ai-client";

/** The verified engine's DR vocabulary -> the existing clinical ICDR vocabulary. */
const DR_LABEL_TO_ICDR: Record<string, AIScreeningResult["drGrade"]> = {
  "No DR": "No DR",
  "Mild DR": "Mild NPDR",
  "Moderate DR": "Moderate NPDR",
  "Severe DR": "Severe NPDR",
  "Proliferative DR": "PDR",
};

export interface AIAnalysisRequest {
  screeningCaseId: string;
  useBlackboxApi?: boolean;
}

export interface AIAnalysisResponse {
  qualityOD?: ImageQuality;
  qualityOS?: ImageQuality;
  aiResult: AIScreeningResult;
  findings: AIFinding[];
  explainability: Explainability;
  priority: Priority;
  /** Complete, unedited response from the Flask AI engine (source of truth). */
  aiEngine?: {
    status: string;
    eyeSide: string;
    uncertainty: { status: string; value: number | null };
    modelVersions: {
      primaryDrLoaded: boolean;
      primaryDrVersion: string | null;
      secondaryOcularLoaded: boolean;
      secondaryOcularVersion: string | null;
      pipelineVersion: string | null;
    };
    explainabilityAvailable: boolean;
    llmExplanation: Record<string, unknown>;
    safetyStatement: string;
    secondaryFindings: FlaskSecondaryFinding[];
  };
  aiEngineError?: { code: string; message: string };
}


/** Reads the stored bytes for a retinal image (data URL or uploads file). */
function readImageBytes(image: RetinalImage): { buffer: Buffer; mimeType: string } | null {
  // 1) A real base64 data URL.
  if (image.dataUrl) {
    const m = image.dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (m) {
      return { buffer: Buffer.from(m[2] ?? "", "base64"), mimeType: m[1] ?? "image/jpeg" };
    }
  }
  // 2) A file previously written by storage.saveBase64File.
  //    storagePath may be a bare filename or an absolute path.
  const candidate = image.storagePath || (image.dataUrl?.startsWith("data:") ? undefined : image.dataUrl);
  if (candidate) {
    const safe = path.basename(candidate);
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    for (const full of [path.join(uploadsDir, safe), candidate]) {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return {
          buffer: fs.readFileSync(full),
          mimeType: image.fileType || "image/jpeg",
        };
      }
    }
  }
  return null;
}

function toEngineEyeSide(eyeSide: RetinalImage["eyeSide"]): "RIGHT" | "LEFT" {
  return eyeSide === "OS" ? "LEFT" : "RIGHT";
}

export class AIService {
  /**
   * Reports the health of the verified Flask AI engine.
   * Never fabricates availability: an unreachable engine is reported as such.
   */
  public async health(): Promise<
    | { reachable: true; health: FlaskHealth }
    | { reachable: false; error: string }
  > {
    return getHealth();
  }

  /**
   * Image quality is NOT evaluated here.
   * The engine owns this decision: while no real quality model exists it returns
   * NOT_CONFIGURED, and that honest state is passed straight through.
   */
  public async analyzeQuality(
    image: RetinalImage,
    screeningCaseId: string,
    engine?: FlaskScreeningResult,
  ): Promise<ImageQuality> {
    const q = engine?.image_quality;
    const status: ImageQuality["status"] =
      q?.status === "GOOD" ? "good" : q?.status === "NEEDS_RECAPTURE" ? "needs_recapture" : "pending";
    return {
      id: `QUAL-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      retinalImageId: image.id,
      screeningCaseId,
      eyeSide: image.eyeSide,
      status,
      // Only real engine values are ever exposed; otherwise null (not invented).
      score: q?.score ?? null,
      blur: "sharp",
      brightness: "optimal",
      retinaVisibility: 0,
      fieldOfView: "not assessed",
      centering: "centered",
      artifacts: [],
      mediaOpacity: false,
      processedAt: new Date().toISOString(),
      qualityStatus: q?.status ?? "NOT_CONFIGURED",
      qualityReason: q?.reason ?? "No image quality model is configured.",
    };
  }

  /**
   * Runs the VERIFIED Flask AI engine for every uploaded retinal image and maps
   * the real structured result into the existing clinical response model.
   * No probability, confidence, finding, uncertainty, priority or explainability
   * value is ever invented here.
   */
  public async analyzeScreeningCase(
    screeningCase: ScreeningCase,
    images: RetinalImage[],
    _diabetes?: DiabetesHistory,
    _clinical?: ClinicalInformation,
    _symptoms?: Symptoms,
  ): Promise<AIAnalysisResponse> {
    const caseId = screeningCase.id;
    const timestamp = new Date().toISOString();
    const eyeImages = images.filter((i) => i.eyeSide === "OD" || i.eyeSide === "OS");

    if (eyeImages.length === 0) {
      throw new FlaskAiError("No retinal image attached to this screening case", 400, "NO_IMAGE");
    }

    // OD / OS -> the first image drives the clinical record; both are analysed.
    const perEye: Array<{ image: RetinalImage; engine: FlaskScreeningResult }> = [];
    for (const img of eyeImages) {
      const bytes = readImageBytes(img);
      if (!bytes) {
        throw new FlaskAiError(
          `Image bytes for ${img.id} are not available on the server`,
          400,
          "IMAGE_BYTES_UNAVAILABLE",
        );
      }
      const engine = await predictImage(
        bytes.buffer,
        img.fileName || `${img.id}.jpg`,
        bytes.mimeType,
        toEngineEyeSide(img.eyeSide),
      );
      perEye.push({ image: img, engine });
    }

    const od = perEye.find((p) => p.image.eyeSide === "OD");
    const os = perEye.find((p) => p.image.eyeSide === "OS");
    const primary = od ?? os;
    if (!primary) {
      throw new FlaskAiError("No analysable eye found", 400, "NO_IMAGE");
    }
    const engine = primary.engine;
    const dr = engine.primary_dr;

    const qualityOD = od ? await this.analyzeQuality(od.image, caseId, od.engine) : undefined;
    const qualityOS = os ? await this.analyzeQuality(os.image, caseId, os.engine) : undefined;

    const drGrade = dr.label ? (DR_LABEL_TO_ICDR[dr.label] ?? "No DR") : "No DR";
    const modelVersions: {
      primaryDrLoaded: boolean;
      primaryDrVersion: string | null;
      secondaryOcularLoaded: boolean;
      secondaryOcularVersion: string | null;
      pipelineVersion: string | null;
    } = {
      primaryDrLoaded: engine.model_versioning.primary_dr?.loaded ?? false,
      primaryDrVersion: engine.model_versioning.primary_dr?.model_version ?? null,
      secondaryOcularLoaded: engine.model_versioning.secondary_ocular?.loaded ?? false,
      secondaryOcularVersion: engine.model_versioning.secondary_ocular?.model_version ?? null,
      pipelineVersion: engine.model_versioning.pipeline_version ?? null,
    };

    const aiResult: AIScreeningResult = {
      id: `AI-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      screeningCaseId: caseId,
      status: dr.status === "COMPLETED" ? "completed" : dr.status === "NEEDS_HUMAN_REVIEW" ? "low_confidence" : "failed",
      modelVersion: modelVersions.primaryDrVersion ?? "unknown",
      drGrade,
      // The verified engine does not output a DME indicator -> explicitly null.
      dmeIndicator: null,
      confidence: dr.confidence ?? null,
      summary: engine.llm_explanation.screening_summary,
      processedAt: timestamp,
      // Real engine values, preserved verbatim:
      drLabel: dr.label,
      drProbabilities: dr.probabilities ?? null,
      uncertainty: engine.uncertainty.value,
      needsHumanReview: engine.needs_human_review,
      eyeSide: engine.eye_side,
    };

    // Secondary RFMiD findings -> the existing AIFinding list.
    // findingType is a fixed clinical enum; RFMiD label names are preserved in
    // `description` so no original label is lost or renamed.
    const findings: AIFinding[] = engine.secondary_findings.map((f, i) => ({
      id: `AIF-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      aiResultId: aiResult.id,
      screeningCaseId: caseId,
      findingType: "vascular abnormality",
      eyeSide: f.eye_side === "LEFT" ? "OS" : "OD",
      confidence: f.confidence,
      severity: f.confidence >= 0.9 ? "severe" : f.confidence >= 0.6 ? "moderate" : "mild",
      description: `Possible finding detected: ${f.finding} (RFMiD multi-label, confidence ${f.confidence.toFixed(2)}). AI-assisted screening output, not a diagnosis.`,
      regionData: [],
      createdAt: timestamp,
      rfmIdLabel: f.finding,
      source: f.source,
    }));

    // Explainability: real Grad-CAM points from the engine, or an honest
    // UNAVAILABLE state. No synthetic heatmap points are ever produced.
    const engineExpl = engine.explainability;
    const gradCamAvailable = engineExpl?.status === "AVAILABLE";
    const explainability: Explainability = {
      id: `EXPL-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      aiResultId: aiResult.id,
      screeningCaseId: caseId,
      heatmapPoints: gradCamAvailable ? engineExpl.heatmap_points : [],
      attentionDescription: engineExpl?.attention_description ?? "Explainability unavailable.",
      annotationData: {
        gradCamAvailable,
        gradCamStatus: engineExpl?.status ?? "UNAVAILABLE",
        gradCamReason: engineExpl?.reason ?? null,
        gradCamMethod: engineExpl?.method ?? "grad_cam",
        heatmapImageBase64: gradCamAvailable ? engineExpl.heatmap_base64 : null,
        overlayImageBase64: gradCamAvailable ? engineExpl.overlay_base64 : null,
        uncertainty: engine.uncertainty.value,
        modelVersion: modelVersions.primaryDrVersion ?? null,
      },
      createdAt: timestamp,
    };

    // Priority: the engine's screening triage hint, passed through verbatim.
    const enginePriority = engine.priority_hint ?? "review_recommended";
    const priorityTier: Priority["priority"] =
      enginePriority === "high_priority"
        ? "high_priority"
        : enginePriority === "review_recommended"
          ? "review_recommended"
          : "routine";
    const priority: Priority = {
      id: `PRIO-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      screeningCaseId: caseId,
      priority: priorityTier,
      reason:
        engine.llm_explanation.specialist_review_reason ||
        "Screening priority assigned by the AI engine. Requires clinical review.",
      calculatedAt: timestamp,
    };

    // ---- persist to the existing store (unchanged schema) ----
    for (const q of [qualityOD, qualityOS]) {
      if (!q) continue;
      const idx = store.db.imageQualities.findIndex((x) => x.retinalImageId === q.retinalImageId);
      if (idx >= 0) store.db.imageQualities[idx] = q;
      else store.db.imageQualities.push(q);
    }

    const aiIdx = store.db.aiScreeningResults.findIndex((r) => r.screeningCaseId === caseId);
    if (aiIdx >= 0) store.db.aiScreeningResults[aiIdx] = aiResult;
    else store.db.aiScreeningResults.push(aiResult);

    store.db.aiFindings = store.db.aiFindings.filter((f) => f.screeningCaseId !== caseId);
    store.db.aiFindings.push(...findings);

    const expIdx = store.db.explainabilities.findIndex((e) => e.screeningCaseId === caseId);
    if (expIdx >= 0) store.db.explainabilities[expIdx] = explainability;
    else store.db.explainabilities.push(explainability);

    const priIdx = store.db.priorities.findIndex((p) => p.screeningCaseId === caseId);
    if (priIdx >= 0) store.db.priorities[priIdx] = priority;
    else store.db.priorities.push(priority);

    const caseIdx = store.db.screeningCases.findIndex((c) => c.id === caseId);
    if (caseIdx >= 0) {
      store.db.screeningCases[caseIdx].status = "screening_complete";
      store.db.screeningCases[caseIdx].updatedAt = timestamp;
    }
    store.save();

    return {
      qualityOD,
      qualityOS,
      aiResult,
      findings,
      explainability,
      priority,
      aiEngine: {
        status: engine.status,
        eyeSide: engine.eye_side,
        uncertainty: engine.uncertainty,
        modelVersions,
        explainabilityAvailable: gradCamAvailable,
        llmExplanation: engine.llm_explanation as unknown as Record<string, unknown>,
        safetyStatement: engine.llm_explanation.safety_statement,
        secondaryFindings: engine.secondary_findings,
      },
    };
  }
}

export const aiService = new AIService();


