import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface Patient {
  id: string;
  patientCode: string;
  fullName: string;
  dateOfBirth?: string;
  age?: string;
  sex?: string;
  mobile?: string;
  address?: string;
  village?: string;
  district?: string;
  phone?: string;
  risk?: string;
  lastScreening?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiabetesHistory {
  id: string;
  screeningCaseId: string;
  status: "" | "Yes" | "No" | "Unknown";
  type?: "" | "Type 1" | "Type 2" | "Other" | "Unknown";
  yearDiagnosed?: string;
  duration?: string;
  hba1c?: string;
  bloodGlucose?: string;
  treatment?: string;
}

export interface EyeHistory {
  id: string;
  screeningCaseId: string;
  previousEyeExam: "" | "Yes" | "No" | "Unknown";
  previousDR: "" | "Yes" | "No" | "Unknown";
  knownEyeCondition?: string;
  previousEyeSurgery: "" | "Yes" | "No" | "Unknown";
  previousTreatment?: string;
  previousScreeningDate?: string;
}

export interface Symptoms {
  id: string;
  screeningCaseId: string;
  symptoms: string[];
  notes?: string;
}

export interface ClinicalInformation {
  id: string;
  screeningCaseId: string;
  systolicBP?: string;
  diastolicBP?: string;
  familyHistory?: string;
  notes?: string;
}

export interface Consent {
  id: string;
  screeningCaseId: string;
  retinalPhotography: boolean;
  aiAssistedScreening: boolean;
  dataStorage: boolean;
  consentedAt: string;
}

export interface RetinalImage {
  id: string;
  screeningCaseId: string;
  patientId: string;
  eyeSide: "OD" | "OS";
  fileName: string;
  fileType: string;
  storagePath?: string;
  dataUrl?: string;
  uploadedAt: string;
}

export interface SupportingReport {
  id: string;
  screeningCaseId: string;
  patientId: string;
  fileName: string;
  fileType: string;
  storagePath?: string;
  dataUrl?: string;
  uploadedAt: string;
}

export interface ImageQuality {
  id: string;
  retinalImageId: string;
  screeningCaseId: string;
  eyeSide: "OD" | "OS";
  status: "pending" | "good" | "needs_recapture" | "failed";
  /**
   * Real quality score from the AI engine, or null when the engine reports
   * NOT_CONFIGURED (no quality model exists). Never invented.
   */
  score: number | null;
  blur: "sharp" | "mild_blur" | "severe_blur";
  brightness: "optimal" | "underexposed" | "overexposed";
  retinaVisibility: number; // percentage 0-100 (0 when not assessed)
  fieldOfView: string; // e.g. "45° standard" or "not assessed"
  centering: "centered" | "off_center";
  artifacts: string[];
  mediaOpacity: boolean;
  processedAt: string;
  /** Verbatim engine status, e.g. "GOOD" | "NOT_CONFIGURED". */
  qualityStatus?: string;
  /** Why the engine could not assess quality. */
  qualityReason?: string;
}

export interface LesionRegion {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  radius: number;
  label: string;
  confidence: number;
}

export interface AIFinding {
  id: string;
  aiResultId: string;
  screeningCaseId: string;
  findingType:
    | "microaneurysm"
    | "hemorrhage"
    | "hard exudate"
    | "soft exudate"
    | "macular sign"
    | "neovascularization"
    | "possible optic-disc edema"
    | "possible glaucoma-related change"
    | "possible AMD-related change"
    | "possible hypertensive change"
    | "vascular abnormality";
  eyeSide: "OD" | "OS";
  confidence: number; // 0-100
  severity: "mild" | "moderate" | "severe";
  description: string;
  regionData: LesionRegion[];
  createdAt: string;
  /** Original RFMiD multi-label name, preserved verbatim (e.g. "TSLN"). */
  rfmIdLabel?: string;
  source?: string;
}

export interface Explainability {
  id: string;
  aiResultId: string;
  screeningCaseId: string;
  heatmapPoints: Array<{ x: number; y: number; intensity: number }>;
  attentionDescription: string;
  annotationData: Record<string, unknown>;
  createdAt: string;
}

export interface AIScreeningResult {
  id: string;
  screeningCaseId: string;
  status: "pending" | "processing" | "completed" | "failed" | "low_confidence";
  modelVersion: string;
  drGrade: "No DR" | "Mild NPDR" | "Moderate NPDR" | "Severe NPDR" | "PDR";
  /**
   * DME indicator, or null when the AI engine does not provide one.
   * The verified engine has no DME head, so this is never asserted.
   */
  dmeIndicator: "None" | "Mild" | "Clinically Significant Macular Edema (CSME)" | null;
  confidence: number | null; // 0-1, straight from the engine
  summary: string;
  processedAt: string;
  /** Verbatim engine DR label, e.g. "Severe DR". */
  drLabel?: string | null;
  /** All 5 DR probabilities [No DR, Mild, Moderate, Severe, Proliferative]. */
  drProbabilities?: number[] | null;
  /** Normalized entropy uncertainty, or null when unavailable. */
  uncertainty?: number | null;
  needsHumanReview?: boolean;
  eyeSide?: string;
}

export interface Priority {
  id: string;
  screeningCaseId: string;
  priority: "pending" | "routine" | "review_recommended" | "high_priority";
  reason: string;
  calculatedAt: string;
}

export interface Escalation {
  id: string;
  screeningCaseId: string;
  status: "pending" | "sent" | "under_review" | "reviewed" | "closed";
  reason: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface DoctorReview {
  id: string;
  screeningCaseId: string;
  doctorId: string;
  decision: "monitor" | "refer";
  notes: string;
  followUpDate?: string;
  reviewedAt: string;
}

export interface FollowUp {
  id: string;
  screeningCaseId: string;
  patientId: string;
  dueDate: string;
  urgency?: "Due today" | "This week" | "Upcoming" | "Overdue";
  status: "pending" | "completed" | "cancelled";
  reason: string;
  notes?: string;
  createdAt: string;
}

export interface ScreeningCase {
  id: string;
  caseCode: string;
  patientId: string;
  status:
    | "draft"
    | "in_progress"
    | "awaiting_quality"
    | "awaiting_ai"
    | "screening_complete"
    | "pending_priority"
    | "awaiting_doctor_review"
    | "doctor_reviewed"
    | "closed";
  screeningDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseSchema {
  patients: Patient[];
  screeningCases: ScreeningCase[];
  diabetesHistories: DiabetesHistory[];
  eyeHistories: EyeHistory[];
  symptomsList: Symptoms[];
  clinicalInformationList: ClinicalInformation[];
  consents: Consent[];
  retinalImages: RetinalImage[];
  supportingReports: SupportingReport[];
  imageQualities: ImageQuality[];
  aiScreeningResults: AIScreeningResult[];
  aiFindings: AIFinding[];
  explainabilities: Explainability[];
  priorities: Priority[];
  escalations: Escalation[];
  doctorReviews: DoctorReview[];
  followUps: FollowUp[];
}

const defaultData: DatabaseSchema = {
  patients: [],
  screeningCases: [],
  diabetesHistories: [],
  eyeHistories: [],
  symptomsList: [],
  clinicalInformationList: [],
  consents: [],
  retinalImages: [],
  supportingReports: [],
  imageQualities: [],
  aiScreeningResults: [],
  aiFindings: [],
  explainabilities: [],
  priorities: [],
  escalations: [],
  doctorReviews: [],
  followUps: [],
};

class PersistentStore {
  private data: DatabaseSchema;
  private filePath: string;

  constructor() {
    const dataDir = path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.filePath = path.join(dataDir, "retinoai-store.json");
    this.data = this.load();
    if (this.data.patients.length === 0) {
      this.seedInitialData();
    }
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        return { ...defaultData, ...JSON.parse(raw) };
      }
    } catch (err) {
      console.error("Error reading persistence file, using defaults:", err);
    }
    return { ...defaultData };
  }

  public save(): void {
    try {
      const serialized = JSON.stringify(this.data, null, 2);
      const tempPath = `${this.filePath}.${Date.now()}.${crypto.randomBytes(3).toString("hex")}.tmp`;
      fs.writeFileSync(tempPath, serialized, "utf-8");

      try {
        if (fs.existsSync(this.filePath)) {
          fs.copyFileSync(tempPath, this.filePath);
          fs.unlinkSync(tempPath);
        } else {
          fs.renameSync(tempPath, this.filePath);
        }
      } catch {
        fs.writeFileSync(this.filePath, serialized, "utf-8");
        if (fs.existsSync(tempPath)) {
          try {
            fs.unlinkSync(tempPath);
          } catch {
            // Ignore cleanup failure
          }
        }
      }
    } catch (err) {
      console.error("Failed to persist data store:", err);
    }
  }

  public get db(): DatabaseSchema {
    return this.data;
  }

  private seedInitialData() {
    const p1Id = "P-A78B12";
    const p2Id = "P-C34F90";
    const p1Date = new Date(Date.now() - 3 * 86400000).toISOString();
    const p2Date = new Date(Date.now() - 1 * 86400000).toISOString();

    const p1: Patient = {
      id: p1Id,
      patientCode: "PID-2026-001",
      fullName: "Lakshmi Narayanan",
      dateOfBirth: "1968-04-12",
      age: "58",
      sex: "Female",
      mobile: "+91 98450 12345",
      phone: "+91 98450 12345",
      address: "14 North Car Street",
      village: "Kallakurichi",
      district: "Viluppuram",
      risk: "High",
      lastScreening: p1Date.slice(0, 10),
      status: "Awaiting specialist review",
      createdAt: p1Date,
      updatedAt: p1Date,
    };

    const p2: Patient = {
      id: p2Id,
      patientCode: "PID-2026-002",
      fullName: "Rajesh Kumar",
      dateOfBirth: "1974-09-22",
      age: "52",
      sex: "Male",
      mobile: "+91 94432 67890",
      phone: "+91 94432 67890",
      address: "Bypass Road",
      village: "Thirukoilur",
      district: "Kallakurichi",
      risk: "Moderate",
      lastScreening: p2Date.slice(0, 10),
      status: "Screening completed",
      createdAt: p2Date,
      updatedAt: p2Date,
    };

    this.data.patients.push(p1, p2);

    const sc1Id = "SC-2026-0001";
    const sc1: ScreeningCase = {
      id: sc1Id,
      caseCode: "CASE-0001",
      patientId: p1Id,
      status: "awaiting_doctor_review",
      screeningDate: p1Date.slice(0, 10),
      createdAt: p1Date,
      updatedAt: p1Date,
    };

    this.data.screeningCases.push(sc1);

    this.data.diabetesHistories.push({
      id: "DH-0001",
      screeningCaseId: sc1Id,
      status: "Yes",
      type: "Type 2",
      yearDiagnosed: "2014",
      duration: "12 years",
      hba1c: "8.9%",
      bloodGlucose: "194 mg/dL",
      treatment: "Metformin 500mg, Glimepiride 2mg",
    });

    this.data.eyeHistories.push({
      id: "EH-0001",
      screeningCaseId: sc1Id,
      previousEyeExam: "Yes",
      previousDR: "Unknown",
      knownEyeCondition: "Presbyopia, intermittent blurring",
      previousEyeSurgery: "No",
      previousTreatment: "None",
      previousScreeningDate: "2024-11-10",
    });

    this.data.symptomsList.push({
      id: "SYM-0001",
      screeningCaseId: sc1Id,
      symptoms: ["Blurred vision", "Floaters", "Difficulty seeing at night"],
      notes: "Symptoms worsening over past 3 months in right eye",
    });

    this.data.clinicalInformationList.push({
      id: "CI-0001",
      screeningCaseId: sc1Id,
      systolicBP: "142",
      diastolicBP: "88",
      familyHistory: "Mother had diabetes and visual impairment",
      notes: "Screened at mobile rural camp. Pupils dilated with Tropicamide 0.5%.",
    });

    this.data.consents.push({
      id: "CON-0001",
      screeningCaseId: sc1Id,
      retinalPhotography: true,
      aiAssistedScreening: true,
      dataStorage: true,
      consentedAt: p1Date,
    });

    const imgOdId = "IMG-0001-OD";
    const imgOsId = "IMG-0001-OS";

    this.data.retinalImages.push(
      {
        id: imgOdId,
        screeningCaseId: sc1Id,
        patientId: p1Id,
        eyeSide: "OD",
        fileName: "fundus_OD_macula_centered.jpg",
        fileType: "image/jpeg",
        uploadedAt: p1Date,
      },
      {
        id: imgOsId,
        screeningCaseId: sc1Id,
        patientId: p1Id,
        eyeSide: "OS",
        fileName: "fundus_OS_macula_centered.jpg",
        fileType: "image/jpeg",
        uploadedAt: p1Date,
      }
    );

    this.data.imageQualities.push(
      {
        id: "QUAL-0001-OD",
        retinalImageId: imgOdId,
        screeningCaseId: sc1Id,
        eyeSide: "OD",
        status: "good",
        score: 94,
        blur: "sharp",
        brightness: "optimal",
        retinaVisibility: 96,
        fieldOfView: "45° standard",
        centering: "centered",
        artifacts: [],
        mediaOpacity: false,
        processedAt: p1Date,
      },
      {
        id: "QUAL-0001-OS",
        retinalImageId: imgOsId,
        screeningCaseId: sc1Id,
        eyeSide: "OS",
        status: "good",
        score: 91,
        blur: "sharp",
        brightness: "optimal",
        retinaVisibility: 92,
        fieldOfView: "45° standard",
        centering: "centered",
        artifacts: [],
        mediaOpacity: false,
        processedAt: p1Date,
      }
    );

    const aiResId = "AIRES-0001";
    this.data.aiScreeningResults.push({
      id: aiResId,
      screeningCaseId: sc1Id,
      status: "completed",
      modelVersion: "RetinoAI-Net v2.4 (Blackbox-Calibrated Vision)",
      drGrade: "Moderate NPDR",
      dmeIndicator: "Clinically Significant Macular Edema (CSME)",
      confidence: 93.4,
      summary: "Multiple microaneurysms, blot hemorrhages in 2 quadrants, hard exudates circinate ring near macula",
      processedAt: p1Date,
    });

    this.data.aiFindings.push(
      {
        id: "FND-001",
        aiResultId: aiResId,
        screeningCaseId: sc1Id,
        findingType: "microaneurysm",
        eyeSide: "OD",
        confidence: 96,
        severity: "moderate",
        description: "Cluster of microaneurysms in the temporal superior arcade",
        regionData: [
          { x: 42, y: 38, radius: 12, label: "Microaneurysm", confidence: 95 },
          { x: 48, y: 44, radius: 10, label: "Microaneurysm", confidence: 97 },
          { x: 39, y: 52, radius: 11, label: "Microaneurysm", confidence: 93 },
        ],
        createdAt: p1Date,
      },
      {
        id: "FND-002",
        aiResultId: aiResId,
        screeningCaseId: sc1Id,
        findingType: "hemorrhage",
        eyeSide: "OD",
        confidence: 94,
        severity: "moderate",
        description: "Blot and flame-shaped retinal hemorrhages in temporal quadrant",
        regionData: [
          { x: 62, y: 46, radius: 18, label: "Blot Hemorrhage", confidence: 94 },
          { x: 57, y: 60, radius: 15, label: "Deep Retinal Hemorrhage", confidence: 91 },
        ],
        createdAt: p1Date,
      },
      {
        id: "FND-003",
        aiResultId: aiResId,
        screeningCaseId: sc1Id,
        findingType: "hard exudate",
        eyeSide: "OD",
        confidence: 92,
        severity: "severe",
        description: "Circinate hard exudates impinging within 500 microns of foveal center (DME Risk)",
        regionData: [
          { x: 50, y: 49, radius: 22, label: "Hard Exudate Ring", confidence: 92 },
          { x: 53, y: 53, radius: 16, label: "Foveal Lipid Deposition", confidence: 89 },
        ],
        createdAt: p1Date,
      }
    );

    this.data.explainabilities.push({
      id: "EXPL-0001",
      aiResultId: aiResId,
      screeningCaseId: sc1Id,
      heatmapPoints: [
        { x: 51, y: 50, intensity: 0.95 },
        { x: 45, y: 42, intensity: 0.82 },
        { x: 60, y: 52, intensity: 0.76 },
        { x: 38, y: 48, intensity: 0.68 },
      ],
      attentionDescription: "Model attention is concentrated heavily on the macula and temporal arcade where exudates and hemorrhages co-occur.",
      annotationData: { primaryLesionDensity: "high", quadrantCount: 2 },
      createdAt: p1Date,
    });

    this.data.priorities.push({
      id: "PRIO-0001",
      screeningCaseId: sc1Id,
      priority: "high_priority",
      reason: "Moderate NPDR with Clinically Significant Macular Edema indicators and elevated HbA1c (8.9%)",
      calculatedAt: p1Date,
    });

    this.data.escalations.push({
      id: "ESC-0001",
      screeningCaseId: sc1Id,
      status: "sent",
      reason: "Frontline screening operator flagged High Priority case for specialist ophthalmologist review",
      createdAt: p1Date,
    });

    this.data.followUps.push({
      id: "FU-0001",
      screeningCaseId: sc1Id,
      patientId: p1Id,
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      urgency: "This week",
      status: "pending",
      reason: "Specialist referral consultation for OCT evaluation and potential anti-VEGF therapy",
      notes: "Patient advised to bring current diabetes medications and fasting report.",
      createdAt: p1Date,
    });

    this.save();
  }
}

export const store = new PersistentStore();
