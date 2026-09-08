export interface PresetScreeningCase {
  id: string;
  title: string;
  grade: "No DR" | "Mild NPDR" | "Moderate NPDR" | "Severe NPDR" | "PDR";
  numericGrade: number;
  dme: "None" | "Mild" | "Clinically Significant Macular Edema (CSME)";
  patientName: string;
  age: string;
  sex: string;
  diabetesStatus: "Yes" | "No" | "Unknown";
  diabetesType?: "Type 1" | "Type 2";
  yearDiagnosed?: string;
  hba1c?: string;
  systolicBP?: string;
  diastolicBP?: string;
  symptoms: string[];
  description: string;
  odFileName: string;
  osFileName: string;
  findingsCount: number;
}

export const PRESET_CASES: PresetScreeningCase[] = [
  {
    id: "preset-moderate-npdr",
    title: "Moderate NPDR with Macular Exudates",
    grade: "Moderate NPDR",
    numericGrade: 2,
    dme: "Mild",
    patientName: "Lakshmi Narayanan",
    age: "58",
    sex: "Female",
    diabetesStatus: "Yes",
    diabetesType: "Type 2",
    yearDiagnosed: "2014",
    hba1c: "8.9%",
    systolicBP: "142",
    diastolicBP: "88",
    symptoms: ["Blurred vision", "Floaters", "Difficulty seeing at night"],
    description: "Microaneurysms in temporal arcade, blot hemorrhages in 2 quadrants, circinate hard exudates near macula.",
    odFileName: "fundus_OD_moderate_npdr.jpg",
    osFileName: "fundus_OS_mild_npdr.jpg",
    findingsCount: 4,
  },
  {
    id: "preset-severe-npdr",
    title: "Severe NPDR with Clinically Significant Macular Edema",
    grade: "Severe NPDR",
    numericGrade: 3,
    dme: "Clinically Significant Macular Edema (CSME)",
    patientName: "K. Venkateshwaran",
    age: "64",
    sex: "Male",
    diabetesStatus: "Yes",
    diabetesType: "Type 2",
    yearDiagnosed: "2009",
    hba1c: "9.8%",
    systolicBP: "158",
    diastolicBP: "96",
    symptoms: ["Sudden vision loss", "Distorted vision", "Blurred vision"],
    description: "Extensive retinal hemorrhages across 4 quadrants, cotton wool spots, foveal hard exudate plaque with acute edema risk.",
    odFileName: "fundus_OD_severe_npdr_csme.jpg",
    osFileName: "fundus_OS_severe_npdr.jpg",
    findingsCount: 6,
  },
  {
    id: "preset-mild-npdr",
    title: "Mild NPDR (Early Microaneurysms)",
    grade: "Mild NPDR",
    numericGrade: 1,
    dme: "None",
    patientName: "Savita Murthy",
    age: "51",
    sex: "Female",
    diabetesStatus: "Yes",
    diabetesType: "Type 2",
    yearDiagnosed: "2020",
    hba1c: "7.2%",
    systolicBP: "128",
    diastolicBP: "82",
    symptoms: ["No symptoms"],
    description: "Discrete microaneurysms only. No macular edema or hard exudates detected. Routine annual monitoring recommended.",
    odFileName: "fundus_OD_mild_npdr.jpg",
    osFileName: "fundus_OS_normal.jpg",
    findingsCount: 1,
  },
  {
    id: "preset-normal",
    title: "Normal Retinal Architecture (No DR)",
    grade: "No DR",
    numericGrade: 0,
    dme: "None",
    patientName: "Ramesh Babu",
    age: "45",
    sex: "Male",
    diabetesStatus: "No",
    systolicBP: "118",
    diastolicBP: "78",
    symptoms: ["No symptoms"],
    description: "Normal retinal vascular caliber, sharp optic disc boundaries, uniform macular pigmentation.",
    odFileName: "fundus_OD_healthy_retina.jpg",
    osFileName: "fundus_OS_healthy_retina.jpg",
    findingsCount: 0,
  },
];
