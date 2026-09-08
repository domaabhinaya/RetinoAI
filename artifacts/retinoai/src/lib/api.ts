export const API_BASE = "/api";

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`API Error ${res.status}: ${errorBody || res.statusText}`);
  }
  return res.json();
}

export const api = {
  // Patients
  getPatients: () => fetchJson<any[]>(`${API_BASE}/patients`),
  getPatient: (id: string) => fetchJson<any>(`${API_BASE}/patients/${id}`),
  createPatient: (data: any) =>
    fetchJson<any>(`${API_BASE}/patients`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Screening Cases
  getScreeningCases: (patientId?: string) =>
    fetchJson<any[]>(`${API_BASE}/screening-cases${patientId ? `?patientId=${patientId}` : ""}`),
  getScreeningCase: (id: string) => fetchJson<any>(`${API_BASE}/screening-cases/${id}`),
  createScreeningCase: (data: any) =>
    fetchJson<any>(`${API_BASE}/screening-cases`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  uploadCaseImage: (caseId: string, data: { eyeSide: "OD" | "OS"; fileName: string; fileType?: string; base64Data?: string; dataUrl?: string }) =>
    fetchJson<any>(`${API_BASE}/screening-cases/${caseId}/images`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  runAIAnalysis: (caseId: string) =>
    fetchJson<any>(`${API_BASE}/screening-cases/${caseId}/ai-analysis`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  escalateCase: (caseId: string, reason?: string) =>
    fetchJson<any>(`${API_BASE}/screening-cases/${caseId}/escalate`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  submitDoctorReview: (caseId: string, data: { decision: "monitor" | "refer"; notes: string; followUpDate?: string }) =>
    fetchJson<any>(`${API_BASE}/screening-cases/${caseId}/review`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Doctor Portal Referred Cases
  getReferredCases: () => fetchJson<any[]>(`${API_BASE}/referred-cases`),

  // Follow-ups
  getFollowUps: (patientId?: string) =>
    fetchJson<any[]>(`${API_BASE}/follow-ups${patientId ? `?patientId=${patientId}` : ""}`),
  createFollowUp: (data: any) =>
    fetchJson<any>(`${API_BASE}/follow-ups`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateFollowUp: (id: string, patch: any) =>
    fetchJson<any>(`${API_BASE}/follow-ups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  // Datasets
  getDatasets: () => fetchJson<any[]>(`${API_BASE}/datasets`),
  importDatasetCase: (datasetItemId: string) =>
    fetchJson<any>(`${API_BASE}/datasets/import-case`, {
      method: "POST",
      body: JSON.stringify({ datasetItemId }),
    }),
};
