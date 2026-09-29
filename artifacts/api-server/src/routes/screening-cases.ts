import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import {
  store,
  type ScreeningCase,
  type RetinalImage,
  type SupportingReport,
  type DoctorReview,
  type Escalation,
  type Priority,
} from "../lib/store";
import { aiService, FlaskAiError } from "../lib/ai-service";
import { saveBase64File } from "../lib/storage";
import { logger } from "../lib/logger";

const router = Router();

// GET /api/screening-cases
router.get("/", (req: Request, res: Response): void => {
  const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
  if (patientId) {
    const list = store.db.screeningCases.filter((c) => c.patientId === patientId);
    res.json(list);
    return;
  }
  res.json(store.db.screeningCases);
  return;
});

// GET /api/patients/:id/screening-cases
router.get("/by-patient/:id", (req: Request, res: Response): void => {
  const patientId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const list = store.db.screeningCases.filter((c) => c.patientId === patientId);
  res.json(list);
  return;
});

// POST /api/screening-cases
router.post("/", (req: Request, res: Response): void => {
  const body = req.body;
  if (!body.patientId) {
    res.status(400).json({ error: "patientId is required" });
    return;
  }

  const timestamp = new Date().toISOString();
  const year = new Date().getFullYear();
  const count = store.db.screeningCases.length + 1;
  const id = body.id || `SC-${year}-${String(count).padStart(4, "0")}`;
  const caseCode = body.caseCode || `CASE-${String(count).padStart(4, "0")}`;

  const sc: ScreeningCase = {
    id,
    caseCode,
    patientId: body.patientId,
    status: body.status || "in_progress",
    screeningDate: body.screeningDate || timestamp.slice(0, 10),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.db.screeningCases.push(sc);

  // Store intake sub-entities if provided
  if (body.diabetes) {
    store.db.diabetesHistories.push({
      id: `DH-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      screeningCaseId: id,
      ...body.diabetes,
    });
  }

  if (body.eye) {
    store.db.eyeHistories.push({
      id: `EH-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      screeningCaseId: id,
      ...body.eye,
    });
  }

  if (body.symptoms) {
    store.db.symptomsList.push({
      id: `SYM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      screeningCaseId: id,
      ...body.symptoms,
    });
  }

  if (body.clinical) {
    store.db.clinicalInformationList.push({
      id: `CLI-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      screeningCaseId: id,
      ...body.clinical,
    });
  }

  if (body.consent) {
    store.db.consents.push({
      id: `CON-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      screeningCaseId: id,
      ...body.consent,
    });
  }

  store.save();
  res.status(201).json(sc);
  return;
});

// GET /api/screening-cases/:id
router.get("/:id", (req: Request, res: Response): void => {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const sc = store.db.screeningCases.find((c) => c.id === caseId);
  if (!sc) {
    res.status(404).json({ error: "Screening case not found" });
    return;
  }

  const patient = store.db.patients.find((p) => p.id === sc.patientId);
  const images = store.db.retinalImages.filter((img) => img.screeningCaseId === sc.id);
  const reports = store.db.supportingReports.filter((r) => r.screeningCaseId === sc.id);
  const qualities = store.db.imageQualities.filter((q) => q.screeningCaseId === sc.id);
  const aiResult = store.db.aiScreeningResults.find((r) => r.screeningCaseId === sc.id) || null;
  const findings = store.db.aiFindings.filter((f) => f.screeningCaseId === sc.id);
  const explainability = store.db.explainabilities.find((e) => e.screeningCaseId === sc.id) || null;
  const priority = store.db.priorities.find((p) => p.screeningCaseId === sc.id) || null;
  const escalation = store.db.escalations.find((e) => e.screeningCaseId === sc.id) || null;
  const doctorReview = store.db.doctorReviews.find((dr) => dr.screeningCaseId === sc.id) || null;
  const diabetes = store.db.diabetesHistories.find((d) => d.screeningCaseId === sc.id) || null;
  const eye = store.db.eyeHistories.find((e) => e.screeningCaseId === sc.id) || null;
  const symptoms = store.db.symptomsList.find((s) => s.screeningCaseId === sc.id) || null;
  const clinical = store.db.clinicalInformationList.find((c) => c.screeningCaseId === sc.id) || null;
  const consent = store.db.consents.find((c) => c.screeningCaseId === sc.id) || null;

  res.json({
    ...sc,
    patient,
    images,
    reports,
    qualities,
    aiResult,
    findings,
    explainability,
    priority,
    escalation,
    doctorReview,
    diabetesHistory: diabetes,
    eyeHistory: eye,
    symptoms,
    clinicalInformation: clinical,
    consent,
  });
  return;
});

// PATCH /api/screening-cases/:id
router.patch("/:id", (req: Request, res: Response): void => {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const idx = store.db.screeningCases.findIndex((c) => c.id === caseId);
  if (idx < 0) {
    res.status(404).json({ error: "Screening case not found" });
    return;
  }

  const updated: ScreeningCase = {
    ...store.db.screeningCases[idx],
    ...req.body,
    updatedAt: new Date().toISOString(),
  };

  store.db.screeningCases[idx] = updated;
  store.save();

  res.json(updated);
  return;
});

// POST /api/screening-cases/:id/images
router.post("/:id/images", (req: Request, res: Response): void => {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const sc = store.db.screeningCases.find((c) => c.id === caseId);
  if (!sc) {
    res.status(404).json({ error: "Screening case not found" });
    return;
  }

  const { eyeSide, fileName, fileType, base64Data, dataUrl } = req.body;
  if (!eyeSide || (eyeSide !== "OD" && eyeSide !== "OS")) {
    res.status(400).json({ error: "Valid eyeSide (OD or OS) is required" });
    return;
  }

  const timestamp = new Date().toISOString();
  let storagePath: string | undefined;

  if (base64Data) {
    try {
      const saved = saveBase64File(base64Data, fileName || `fundus_${eyeSide}.jpg`, `img-${sc.id}-${eyeSide}`);
      storagePath = saved.urlPath;
    } catch (e) {
      console.error("Error saving uploaded image:", e);
    }
  }

  // Remove previous image for this eye if present
  store.db.retinalImages = store.db.retinalImages.filter(
    (img) => !(img.screeningCaseId === sc.id && img.eyeSide === eyeSide)
  );

  const img: RetinalImage = {
    id: `IMG-${sc.id}-${eyeSide}`,
    screeningCaseId: sc.id,
    patientId: sc.patientId,
    eyeSide,
    fileName: fileName || `fundus_${eyeSide}.jpg`,
    fileType: fileType || "image/jpeg",
    storagePath,
    dataUrl: dataUrl || storagePath,
    uploadedAt: timestamp,
  };

  store.db.retinalImages.push(img);
  store.save();

  res.status(201).json(img);
  return;
});

// GET /api/screening-cases/:id/images
router.get("/:id/images", (req: Request, res: Response): void => {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const images = store.db.retinalImages.filter((img) => img.screeningCaseId === caseId);
  res.json(images);
  return;
});

// POST /api/screening-cases/:id/reports
router.post("/:id/reports", (req: Request, res: Response): void => {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const sc = store.db.screeningCases.find((c) => c.id === caseId);
  if (!sc) {
    res.status(404).json({ error: "Screening case not found" });
    return;
  }

  const { fileName, fileType, base64Data, dataUrl } = req.body;
  const timestamp = new Date().toISOString();
  let storagePath: string | undefined;

  if (base64Data) {
    try {
      const saved = saveBase64File(base64Data, fileName || "report.pdf", `rep-${sc.id}`);
      storagePath = saved.urlPath;
    } catch (e) {
      console.error("Error saving report file:", e);
    }
  }

  const report: SupportingReport = {
    id: `REP-${sc.id}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    screeningCaseId: sc.id,
    patientId: sc.patientId,
    fileName: fileName || "Supporting Document",
    fileType: fileType || "application/pdf",
    storagePath,
    dataUrl: dataUrl || storagePath,
    uploadedAt: timestamp,
  };

  store.db.supportingReports.push(report);
  store.save();

  res.status(201).json(report);
  return;
});

// GET /api/screening-cases/:id/reports
router.get("/:id/reports", (req: Request, res: Response): void => {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const reports = store.db.supportingReports.filter((r) => r.screeningCaseId === caseId);
  res.json(reports);
  return;
});

// POST /api/screening-cases/:id/ai-analysis
router.post("/:id/ai-analysis", async (req: Request, res: Response): Promise<void> => {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const sc = store.db.screeningCases.find((c) => c.id === caseId);
  if (!sc) {
    res.status(404).json({ error: "Screening case not found" });
    return;
  }

  const images = store.db.retinalImages.filter((img) => img.screeningCaseId === sc.id);
  const diabetes = store.db.diabetesHistories.find((d) => d.screeningCaseId === sc.id);
  const eye = store.db.eyeHistories.find((e) => e.screeningCaseId === sc.id);
  const symptoms = store.db.symptomsList.find((s) => s.screeningCaseId === sc.id);
  const clinical = store.db.clinicalInformationList.find((c) => c.screeningCaseId === sc.id);

  try {
    const analysis = await aiService.analyzeScreeningCase(sc, images, diabetes, clinical, symptoms);
    res.json(analysis);
    return;
  } catch (err) {
    if (err instanceof FlaskAiError) {
      // Never fall back to fabricated AI output: surface the real failure.
      logger.error(
        { code: err.code, status: err.status, caseId },
        "AI engine rejected or could not serve the analysis",
      );
      res.status(err.status).json({
        error: err.message,
        error_code: err.code,
        aiEngineAvailable: err.status !== 503,
      });
      return;
    }
    logger.error({ err, caseId }, "AI analysis pipeline failed");
    res.status(500).json({ error: "AI analysis pipeline failed" });
    return;
  }
});

// GET /api/screening-cases/:id/ai-result
router.get("/:id/ai-result", (req: Request, res: Response): void => {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const result = store.db.aiScreeningResults.find((r) => r.screeningCaseId === caseId);
  if (!result) {
    res.json({ status: "pending", result: null });
    return;
  }
  res.json({ status: "completed", result });
  return;
});

// GET /api/screening-cases/:id/findings
router.get("/:id/findings", (req: Request, res: Response): void => {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const findings = store.db.aiFindings.filter((f) => f.screeningCaseId === caseId);
  res.json(findings);
  return;
});

// GET /api/screening-cases/:id/priority
router.get("/:id/priority", (req: Request, res: Response): void => {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const prio = store.db.priorities.find((p) => p.screeningCaseId === caseId);
  if (!prio) {
    res.json({ priority: "pending", reason: "Analysis not yet run" });
    return;
  }
  res.json(prio);
  return;
});

// POST /api/screening-cases/:id/priority
router.post("/:id/priority", (req: Request, res: Response): void => {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { priority, reason } = req.body;
  const timestamp = new Date().toISOString();

  const existingIdx = store.db.priorities.findIndex((p) => p.screeningCaseId === caseId);
  const record: Priority = {
    id: `PRIO-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    screeningCaseId: caseId,
    priority: priority || "routine",
    reason: reason || "",
    calculatedAt: timestamp,
  };

  if (existingIdx >= 0) store.db.priorities[existingIdx] = record;
  else store.db.priorities.push(record);

  store.save();
  res.json(record);
  return;
});

// POST /api/screening-cases/:id/escalate
router.post("/:id/escalate", (req: Request, res: Response): void => {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const sc = store.db.screeningCases.find((c) => c.id === caseId);
  if (!sc) {
    res.status(404).json({ error: "Screening case not found" });
    return;
  }

  const timestamp = new Date().toISOString();
  const reason = req.body.reason || "Escalated by frontline screening operator for specialist clinical review";

  // Update case status
  sc.status = "awaiting_doctor_review";
  sc.updatedAt = timestamp;

  // Update patient status
  const patient = store.db.patients.find((p) => p.id === sc.patientId);
  if (patient) {
    patient.status = "Awaiting specialist review";
    patient.updatedAt = timestamp;
  }

  const escalation: Escalation = {
    id: `ESC-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    screeningCaseId: sc.id,
    status: "sent",
    reason,
    createdAt: timestamp,
  };

  const existingEscIdx = store.db.escalations.findIndex((e) => e.screeningCaseId === sc.id);
  if (existingEscIdx >= 0) store.db.escalations[existingEscIdx] = escalation;
  else store.db.escalations.push(escalation);

  store.save();

  res.json({ success: true, case: sc, escalation });
  return;
});

// GET /api/screening-cases/:id/review
router.get("/:id/review", (req: Request, res: Response): void => {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const review = store.db.doctorReviews.find((r) => r.screeningCaseId === caseId);
  res.json(review || null);
  return;
});

// POST /api/screening-cases/:id/review
router.post("/:id/review", (req: Request, res: Response): void => {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const sc = store.db.screeningCases.find((c) => c.id === caseId);
  if (!sc) {
    res.status(404).json({ error: "Screening case not found" });
    return;
  }

  const { decision, notes, doctorId, followUpDate } = req.body;
  if (!decision || (decision !== "monitor" && decision !== "refer")) {
    res.status(400).json({ error: "Decision must be 'monitor' or 'refer'" });
    return;
  }

  const timestamp = new Date().toISOString();

  const review: DoctorReview = {
    id: `REV-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    screeningCaseId: sc.id,
    doctorId: doctorId || "DR-SPECIALIST-01",
    decision,
    notes: notes || "",
    followUpDate,
    reviewedAt: timestamp,
  };

  const existingIdx = store.db.doctorReviews.findIndex((r) => r.screeningCaseId === sc.id);
  if (existingIdx >= 0) store.db.doctorReviews[existingIdx] = review;
  else store.db.doctorReviews.push(review);

  // Update case status
  sc.status = "doctor_reviewed";
  sc.updatedAt = timestamp;

  // Update escalation status if exists
  const esc = store.db.escalations.find((e) => e.screeningCaseId === sc.id);
  if (esc) {
    esc.status = "reviewed";
    esc.resolvedAt = timestamp;
  }

  // If doctor scheduled a follow up or chose monitor/refer, create or update follow-up record
  if (followUpDate || decision === "refer") {
    store.db.followUps.push({
      id: `FU-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      screeningCaseId: sc.id,
      patientId: sc.patientId,
      dueDate: followUpDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      urgency: decision === "refer" ? "Due today" : "Upcoming",
      status: "pending",
      reason: decision === "refer" ? "Specialist Referral Consultation" : "Routine Follow-up & Retinal Re-check",
      notes,
      createdAt: timestamp,
    });
  }

  store.save();
  res.json({ success: true, review });
  return;
});

export default router;
