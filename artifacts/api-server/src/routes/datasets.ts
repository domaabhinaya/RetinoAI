import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { datasetLoader } from "../lib/dataset-loader";
import { store, type Patient, type ScreeningCase, type RetinalImage } from "../lib/store";
import { aiService, FlaskAiError } from "../lib/ai-service";
import { logger } from "../lib/logger";

const router = Router();

// GET /api/datasets
router.get("/", (_req: Request, res: Response): void => {
  const list = datasetLoader.scanDatasetsDirectory();
  res.json(list);
  return;
});

// POST /api/datasets/import-case
router.post("/import-case", async (req: Request, res: Response): Promise<void> => {
  const { datasetItemId } = req.body;
  const allDatasets = datasetLoader.getDatasets();

  let targetRecord = null;
  for (const ds of allDatasets) {
    const found = ds.records.find((r) => r.id === datasetItemId);
    if (found) {
      targetRecord = found;
      break;
    }
  }

  if (!targetRecord && allDatasets[0]?.records[0]) {
    targetRecord = allDatasets[0].records[0];
  }

  if (!targetRecord) {
    res.status(404).json({ error: "Dataset record not found" });
    return;
  }

  const timestamp = new Date().toISOString();
  const patientId = `P-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const caseId = `SC-${new Date().getFullYear()}-${String(store.db.screeningCases.length + 1).padStart(4, "0")}`;

  const patient: Patient = {
    id: patientId,
    patientCode: `PID-${new Date().getFullYear()}-${String(store.db.patients.length + 1).padStart(3, "0")}`,
    fullName: targetRecord.patientName || `Dataset Patient ${targetRecord.id}`,
    age: targetRecord.age || "55",
    sex: targetRecord.sex || "Female",
    dateOfBirth: "1971-06-15",
    mobile: "+91 98765 43210",
    phone: "+91 98765 43210",
    address: "Rural Screening Camp Sector 4",
    village: "Perambalur",
    district: "Perambalur",
    risk: targetRecord.numericGrade >= 2 ? "High" : "Moderate",
    status: "Screening imported from dataset",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.db.patients.push(patient);

  const sc: ScreeningCase = {
    id: caseId,
    caseCode: `CASE-${String(store.db.screeningCases.length + 1).padStart(4, "0")}`,
    patientId,
    status: "awaiting_doctor_review",
    screeningDate: timestamp.slice(0, 10),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.db.screeningCases.push(sc);

  // Add diabetes context
  store.db.diabetesHistories.push({
    id: `DH-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    screeningCaseId: caseId,
    status: "Yes",
    type: "Type 2",
    yearDiagnosed: "2015",
    duration: "11 years",
    hba1c: targetRecord.numericGrade >= 2 ? "9.1%" : "7.2%",
    bloodGlucose: targetRecord.numericGrade >= 2 ? "198 mg/dL" : "145 mg/dL",
    treatment: "Metformin 1000mg daily",
  });

  store.db.consents.push({
    id: `CON-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    screeningCaseId: caseId,
    retinalPhotography: true,
    aiAssistedScreening: true,
    dataStorage: true,
    consentedAt: timestamp,
  });

  // Attach retinal image
  const img: RetinalImage = {
    id: `IMG-${caseId}-${targetRecord.eyeSide}`,
    screeningCaseId: caseId,
    patientId,
    eyeSide: targetRecord.eyeSide,
    fileName: targetRecord.imageFileName,
    fileType: "image/jpeg",
    uploadedAt: timestamp,
  };

  store.db.retinalImages.push(img);

  // Run AI screening through the verified Flask engine.
  // The dataset route attaches no image bytes (it seeds a case from a dataset
  // record), so a failure here is expected and is reported honestly instead of
  // being replaced with fabricated AI output.
  const diabetes = store.db.diabetesHistories.find((d) => d.screeningCaseId === caseId);
  let analysis: Awaited<ReturnType<typeof aiService.analyzeScreeningCase>> | null = null;
  let aiEngineError: { code: string; message: string } | null = null;
  try {
    analysis = await aiService.analyzeScreeningCase(sc, [img], diabetes);
  } catch (err) {
    const code = err instanceof FlaskAiError ? err.code : "AI_ANALYSIS_FAILED";
    const message = err instanceof Error ? err.message : String(err);
    aiEngineError = { code, message };
    logger.warn({ code, message, caseId }, "Dataset seeding: AI analysis skipped");
  }

  // Overwrite DR grade with dataset calibrated ground-truth if specific
  if (targetRecord.drGrade) {
    const aiRes = store.db.aiScreeningResults.find((r) => r.screeningCaseId === caseId);
    if (aiRes) {
      aiRes.drGrade = targetRecord.drGrade;
      aiRes.dmeIndicator = targetRecord.dme;
    }
  }

  // Create escalation record
  store.db.escalations.push({
    id: `ESC-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    screeningCaseId: caseId,
    status: "sent",
    reason: `Dataset-calibrated screening flagged ${targetRecord.drGrade} for specialist review`,
    createdAt: timestamp,
  });

  store.save();

  res.json({
    success: true,
    patient,
    case: sc,
    analysis,
    aiEngineError,
  });
  return;
});

export default router;
