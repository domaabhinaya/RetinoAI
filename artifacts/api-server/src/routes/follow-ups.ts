import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { store, type FollowUp } from "../lib/store";

const router = Router();

// GET /api/follow-ups
router.get("/", (req: Request, res: Response): void => {
  const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
  let items = store.db.followUps;
  if (patientId) {
    items = items.filter((f) => f.patientId === patientId);
  }

  const enriched = items.map((fu) => {
    const patient = store.db.patients.find((p) => p.id === fu.patientId);
    return {
      ...fu,
      patientName: patient?.fullName || "Patient",
    };
  });

  res.json(enriched);
  return;
});

// POST /api/follow-ups
router.post("/", (req: Request, res: Response): void => {
  const { patientId, screeningCaseId, dueDate, reason, notes, urgency } = req.body;
  if (!patientId) {
    res.status(400).json({ error: "patientId is required" });
    return;
  }

  const fu: FollowUp = {
    id: `FU-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    screeningCaseId: screeningCaseId || "",
    patientId,
    dueDate: dueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    urgency: urgency || "Upcoming",
    status: "pending",
    reason: reason || "Follow-up review",
    notes: notes || "",
    createdAt: new Date().toISOString(),
  };

  store.db.followUps.push(fu);
  store.save();

  res.status(201).json(fu);
  return;
});

// PATCH /api/follow-ups/:id
router.patch("/:id", (req: Request, res: Response): void => {
  const followUpId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const idx = store.db.followUps.findIndex((f) => f.id === followUpId);
  if (idx < 0) {
    res.status(404).json({ error: "Follow-up not found" });
    return;
  }

  store.db.followUps[idx] = {
    ...store.db.followUps[idx],
    ...req.body,
  };
  store.save();

  res.json(store.db.followUps[idx]);
  return;
});

export default router;
