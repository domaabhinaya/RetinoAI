import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { store, type Patient } from "../lib/store";

const router = Router();

// GET /api/patients
router.get("/", (_req: Request, res: Response): void => {
  res.json(store.db.patients);
  return;
});

// GET /api/patients/:id
router.get("/:id", (req: Request, res: Response): void => {
  const patientId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const patient = store.db.patients.find((p) => p.id === patientId);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }
  res.json(patient);
  return;
});

// POST /api/patients
router.post("/", (req: Request, res: Response): void => {
  const body = req.body;
  if (!body.fullName || !body.fullName.trim()) {
    res.status(400).json({ error: "Full name is required" });
    return;
  }

  const timestamp = new Date().toISOString();
  const id = body.id || `P-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const count = store.db.patients.length + 1;
  const patientCode = body.patientCode || `PID-${new Date().getFullYear()}-${String(count).padStart(3, "0")}`;

  const patient: Patient = {
    id,
    patientCode,
    fullName: body.fullName.trim(),
    dateOfBirth: body.dateOfBirth || "",
    age: body.age ? String(body.age) : "",
    sex: body.sex || "Not recorded",
    mobile: body.mobile || "",
    address: body.address || "",
    village: body.village || "",
    district: body.district || "",
    phone: body.phone || body.mobile || "",
    risk: body.risk || "",
    lastScreening: body.lastScreening || "",
    status: body.status || "Registered",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.db.patients.push(patient);
  store.save();

  res.status(201).json(patient);
  return;
});

// PATCH /api/patients/:id
router.patch("/:id", (req: Request, res: Response): void => {
  const patientId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const idx = store.db.patients.findIndex((p) => p.id === patientId);
  if (idx < 0) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const updated: Patient = {
    ...store.db.patients[idx],
    ...req.body,
    updatedAt: new Date().toISOString(),
  };

  store.db.patients[idx] = updated;
  store.save();

  res.json(updated);
  return;
});

export default router;
