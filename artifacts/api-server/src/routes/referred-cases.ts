import { Router, type Request, type Response } from "express";
import { store } from "../lib/store";

const router = Router();

// GET /api/referred-cases
router.get("/", (_req: Request, res: Response) => {
  const escalatedCases = store.db.screeningCases.filter(
    (c) =>
      c.status === "awaiting_doctor_review" ||
      c.status === "doctor_reviewed" ||
      store.db.escalations.some((e) => e.screeningCaseId === c.id)
  );

  const result = escalatedCases.map((sc) => {
    const patient = store.db.patients.find((p) => p.id === sc.patientId);
    const escalation = store.db.escalations.find((e) => e.screeningCaseId === sc.id);
    const priorityRecord = store.db.priorities.find((p) => p.screeningCaseId === sc.id);
    const aiResult = store.db.aiScreeningResults.find((r) => r.screeningCaseId === sc.id);
    const review = store.db.doctorReviews.find((r) => r.screeningCaseId === sc.id);
    const images = store.db.retinalImages.filter((img) => img.screeningCaseId === sc.id);

    let priority: "High" | "Moderate" | "Pending" = "Pending";
    if (priorityRecord?.priority === "high_priority" || aiResult?.drGrade === "Severe NPDR" || aiResult?.drGrade === "PDR") {
      priority = "High";
    } else if (priorityRecord?.priority === "review_recommended" || aiResult?.drGrade === "Moderate NPDR") {
      priority = "Moderate";
    }

    let status: "Awaiting review" | "In review" | "Reviewed" = "Awaiting review";
    if (review) {
      status = "Reviewed";
    } else if (escalation?.status === "under_review") {
      status = "In review";
    }

    return {
      id: sc.id,
      screeningCaseId: sc.id,
      patientId: sc.patientId,
      patientName: patient?.fullName || "Unlinked Patient",
      screeningId: sc.id,
      screeningDate: sc.screeningDate,
      priority,
      summary:
        aiResult?.summary ||
        (escalation?.reason ? escalation.reason : "Case escalated for specialist evaluation"),
      reason:
        escalation?.reason ||
        (priorityRecord?.reason ? priorityRecord.reason : "Awaiting specialist ophthalmology review"),
      status,
      decision: review?.decision === "monitor" ? ("Monitor" as const) : review?.decision === "refer" ? ("Refer" as const) : undefined,
      note: review?.notes,
      imagesCount: images.length,
      drGrade: aiResult?.drGrade || "Pending",
      dmeIndicator: aiResult?.dmeIndicator || "Pending",
    };
  });

  res.json(result);
});

export default router;
