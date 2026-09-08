import assert from "node:assert";

const BASE_URL = process.env.TEST_API_URL || "http://localhost:5000/api";

async function runTests() {
  console.log("==================================================");
  console.log("  RetinoAI Production Suite - Automated API Tests ");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`  Testing: ${name}... `);
      await fn();
      console.log("PASS");
      passed++;
    } catch (err) {
      console.log("FAIL");
      console.error("    Error:", err.message);
      failed++;
    }
  }

  // 1. Healthcheck
  await test("GET /api/healthz (Healthcheck)", async () => {
    const res = await fetch(`${BASE_URL}/healthz`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, "ok");
  });

  // 2. Patient Registration
  let testPatientId = "";
  await test("POST /api/patients (Register Patient)", async () => {
    const res = await fetch(`${BASE_URL}/patients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Smt. Meenakshi Sundaram",
        age: "58",
        sex: "Female",
        dateOfBirth: "1968-04-12",
        mobile: "+91 94432 10987",
        village: "Valikandapuram",
        district: "Perambalur",
        risk: "High",
      }),
    });
    assert.strictEqual(res.status, 201);
    const patient = await res.json();
    assert.ok(patient.id, "Patient must have an ID");
    assert.strictEqual(patient.fullName, "Smt. Meenakshi Sundaram");
    testPatientId = patient.id;
  });

  // 3. Patient Retrieval
  await test("GET /api/patients/:id (Retrieve Patient)", async () => {
    const res = await fetch(`${BASE_URL}/patients/${testPatientId}`);
    assert.strictEqual(res.status, 200);
    const patient = await res.json();
    assert.strictEqual(patient.id, testPatientId);
    assert.strictEqual(patient.village, "Valikandapuram");
  });

  // 4. Create Screening Case with Clinical Covariates
  let testCaseId = "";
  await test("POST /api/screening-cases (Create Case with Clinical Data)", async () => {
    const res = await fetch(`${BASE_URL}/screening-cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: testPatientId,
        diabetes: {
          status: "Yes",
          type: "Type 2",
          yearDiagnosed: "2012",
          duration: "14 years",
          hba1c: "9.6%",
          bloodGlucose: "210 mg/dL",
          treatment: "Insulin & Metformin",
        },
        clinical: {
          systolicBP: "145",
          diastolicBP: "92",
          visualAcuityOD: "6/18",
          visualAcuityOS: "6/12",
          iopOD: "17",
          iopOS: "16",
        },
        symptoms: {
          symptoms: ["Blurry vision in central field", "Occasional floaters"],
        },
        consent: {
          retinalPhotography: true,
          aiAssistedScreening: true,
          dataStorage: true,
        },
      }),
    });
    assert.strictEqual(res.status, 201);
    const sc = await res.json();
    assert.ok(sc.id, "Screening case must have ID");
    testCaseId = sc.id;
  });

  // 5. Upload Fundus Images (OD & OS)
  await test("POST /api/screening-cases/:id/images (Upload Fundus Images)", async () => {
    const resOD = await fetch(`${BASE_URL}/screening-cases/${testCaseId}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eyeSide: "OD",
        fileName: "fundus_OD_case.jpg",
        fileType: "image/jpeg",
        dataUrl: "data:image/jpeg;base64,sampleODBase64Data",
      }),
    });
    assert.strictEqual(resOD.status, 201);
    const imgOD = await resOD.json();
    assert.strictEqual(imgOD.eyeSide, "OD");

    const resOS = await fetch(`${BASE_URL}/screening-cases/${testCaseId}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eyeSide: "OS",
        fileName: "fundus_OS_case.jpg",
        fileType: "image/jpeg",
        dataUrl: "data:image/jpeg;base64,sampleOSBase64Data",
      }),
    });
    assert.strictEqual(resOS.status, 201);
  });

  // 6. Medical Vision AI Screening Pipeline
  await test("POST /api/screening-cases/:id/ai-analysis (Vision Engine & ICDR Scale)", async () => {
    const res = await fetch(`${BASE_URL}/screening-cases/${testCaseId}/ai-analysis`, {
      method: "POST",
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    // Verify AI screening result
    assert.ok(data.aiResult, "aiResult must be present");
    assert.ok(
      ["No DR", "Mild NPDR", "Moderate NPDR", "Severe NPDR", "PDR"].includes(data.aiResult.drGrade),
      `drGrade must follow ICDR scale, got ${data.aiResult.drGrade}`
    );
    assert.ok(
      ["None", "Mild", "Clinically Significant Macular Edema (CSME)"].includes(data.aiResult.dmeIndicator),
      `dmeIndicator must follow clinical scale, got ${data.aiResult.dmeIndicator}`
    );
    assert.ok(data.aiResult.confidence >= 80, "Confidence should be high");

    // Verify Quality assessment
    assert.ok(data.qualityOD, "qualityOD must be evaluated");
    assert.strictEqual(data.qualityOD.fieldOfView, "45° standard fundus");
    assert.strictEqual(data.qualityOD.centering, "centered");

    // Verify Explainability & Green channel calibration
    assert.ok(data.explainability, "explainability must be generated");
    assert.ok(Array.isArray(data.explainability.heatmapPoints), "heatmapPoints must be an array");
    assert.ok(data.explainability.annotationData.greenChannelContrastRatio > 1.0, "green channel ratio must be > 1.0");

    // Verify Priority Tier
    assert.ok(data.priority, "priority must be computed");
    assert.ok(
      ["routine", "review_recommended", "high_priority"].includes(data.priority.priority),
      `Priority must be valid tier, got ${data.priority.priority}`
    );
  });

  // 7. Case Escalation
  await test("POST /api/screening-cases/:id/escalate (Escalate to Doctor Review)", async () => {
    const res = await fetch(`${BASE_URL}/screening-cases/${testCaseId}/escalate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Patient has elevated HbA1c (9.6%) and severe microvascular findings requiring prompt review.",
      }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.case.status, "awaiting_doctor_review");
    assert.strictEqual(data.escalation.status, "sent");
  });

  // 8. Doctor Review Portal Queue
  await test("GET /api/referred-cases (Doctor Worklist Queue)", async () => {
    const res = await fetch(`${BASE_URL}/referred-cases`);
    assert.strictEqual(res.status, 200);
    const queue = await res.json();
    assert.ok(Array.isArray(queue), "Queue must be an array");
    const found = queue.find((c) => c.id === testCaseId || c.screeningCaseId === testCaseId);
    assert.ok(found, "Escalated case must appear in doctor review queue");
    assert.strictEqual(found.patientName, "Smt. Meenakshi Sundaram");
  });

  // 9. Doctor Clinical Decision & Order
  await test("POST /api/screening-cases/:id/review (Doctor Specialist Signoff)", async () => {
    const res = await fetch(`${BASE_URL}/screening-cases/${testCaseId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "refer",
        notes: "Confirmed Severe NPDR with high risk for macular edema. Referred to tertiary eye hospital for anti-VEGF consult.",
        doctorId: "DR-RADHA-RETINA-01",
        followUpDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
      }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.review.decision, "refer");
    assert.strictEqual(data.review.doctorId, "DR-RADHA-RETINA-01");
  });

  // 10. Follow-up Tracking
  await test("GET /api/follow-ups (Follow-up Registry Verification)", async () => {
    const res = await fetch(`${BASE_URL}/follow-ups?patientId=${testPatientId}`);
    assert.strictEqual(res.status, 200);
    const followUps = await res.json();
    assert.ok(Array.isArray(followUps), "Follow-ups must be an array");
    assert.ok(followUps.length > 0, "At least one follow-up record must be scheduled for referred patient");
    assert.strictEqual(followUps[0].patientId, testPatientId);
  });

  // 11. Datasets Scan & Ingestion
  await test("GET /api/datasets (Benchmark Datasets Registry)", async () => {
    const res = await fetch(`${BASE_URL}/datasets`);
    assert.strictEqual(res.status, 200);
    const datasets = await res.json();
    assert.ok(Array.isArray(datasets), "Datasets must be an array");
    assert.ok(datasets.length > 0, "Benchmark datasets must be available");
    assert.ok(
      (datasets[0].totalRecords || datasets[0].records?.length) > 0,
      "Dataset must have records"
    );
  });

  // 12. Dataset Case Ingestion
  await test("POST /api/datasets/import-case (Ingest Pre-calibrated Dataset Case)", async () => {
    const res = await fetch(`${BASE_URL}/datasets/import-case`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        datasetItemId: "MESSIDOR-002",
      }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.patient, "Imported patient must be created");
    assert.ok(data.case, "Imported case must be created");
    assert.ok(data.analysis.aiResult, "Analysis must be performed on imported case");
  });

  console.log("==================================================");
  console.log(`  Tests completed: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test suite runner crashed:", err);
  process.exit(1);
});
