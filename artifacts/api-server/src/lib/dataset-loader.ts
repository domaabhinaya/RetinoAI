import fs from "node:fs";
import path from "node:path";

export interface DatasetItem {
  id: string;
  imageFileName: string;
  imagePath?: string;
  patientName?: string;
  age?: string;
  sex?: string;
  eyeSide: "OD" | "OS";
  drGrade: "No DR" | "Mild NPDR" | "Moderate NPDR" | "Severe NPDR" | "PDR";
  numericGrade: number; // 0-4
  dme: "None" | "Mild" | "Clinically Significant Macular Edema (CSME)";
  notes?: string;
}

export interface DatasetInfo {
  name: string;
  totalRecords: number;
  gradeDistribution: Record<string, number>;
  sourcePath: string;
  records: DatasetItem[];
}

const datasetsDir = path.resolve(process.cwd(), "datasets");
if (!fs.existsSync(datasetsDir)) {
  fs.mkdirSync(datasetsDir, { recursive: true });
}

export class DatasetLoader {
  private datasets: DatasetInfo[] = [];

  constructor() {
    this.initDefaultDataset();
    this.scanDatasetsDirectory();
  }

  private initDefaultDataset() {
    // Benchmark clinical dataset records
    const benchmarkItems: DatasetItem[] = [
      {
        id: "RET-BENCH-001",
        imageFileName: "normal_fundus_OD.jpg",
        patientName: "Meenakshi Sundaram",
        age: "48",
        sex: "Female",
        eyeSide: "OD",
        drGrade: "No DR",
        numericGrade: 0,
        dme: "None",
        notes: "Healthy retina, distinct foveal reflex, cup-to-disc ratio 0.3",
      },
      {
        id: "RET-BENCH-002",
        imageFileName: "mild_npdr_OS.jpg",
        patientName: "Karthik Raja",
        age: "54",
        sex: "Male",
        eyeSide: "OS",
        drGrade: "Mild NPDR",
        numericGrade: 1,
        dme: "None",
        notes: "Scattered microaneurysms, HbA1c 7.4%, diabetes duration 6 yrs",
      },
      {
        id: "RET-BENCH-003",
        imageFileName: "mod_npdr_OD.jpg",
        patientName: "Ananya Sen",
        age: "61",
        sex: "Female",
        eyeSide: "OD",
        drGrade: "Moderate NPDR",
        numericGrade: 2,
        dme: "Mild",
        notes: "Blot hemorrhages in 2 quadrants, circinate hard exudates",
      },
      {
        id: "RET-BENCH-004",
        imageFileName: "severe_npdr_OD.jpg",
        patientName: "Venkatesh Rao",
        age: "66",
        sex: "Male",
        eyeSide: "OD",
        drGrade: "Severe NPDR",
        numericGrade: 3,
        dme: "Clinically Significant Macular Edema (CSME)",
        notes: "4-2-1 rule met: 4 quadrants hemorrhages, 2 quadrants venous beading, IRMA",
      },
      {
        id: "RET-BENCH-005",
        imageFileName: "pdr_active_OD.jpg",
        patientName: "Deepak Sharma",
        age: "59",
        sex: "Male",
        eyeSide: "OD",
        drGrade: "PDR",
        numericGrade: 4,
        dme: "Clinically Significant Macular Edema (CSME)",
        notes: "Neovascularization of the disc (NVD), vitreous hemorrhage risk",
      },
    ];

    const distribution: Record<string, number> = {
      "No DR": 1,
      "Mild NPDR": 1,
      "Moderate NPDR": 1,
      "Severe NPDR": 1,
      PDR: 1,
    };

    this.datasets.push({
      name: "RetinoAI Clinical Benchmark Dataset",
      totalRecords: benchmarkItems.length,
      gradeDistribution: distribution,
      sourcePath: "builtin:benchmark",
      records: benchmarkItems,
    });
  }

  public scanDatasetsDirectory(): DatasetInfo[] {
    try {
      if (!fs.existsSync(datasetsDir)) return this.datasets;

      const files = fs.readdirSync(datasetsDir);
      for (const file of files) {
        const fullPath = path.join(datasetsDir, file);
        if (file.endsWith(".json")) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
              this.addCustomDataset(file, parsed, fullPath);
            }
          } catch (e) {
            console.error(`Failed to parse dataset JSON: ${file}`, e);
          }
        } else if (file.endsWith(".csv")) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
            if (lines.length > 1) {
              const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
              const items: DatasetItem[] = [];

              for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(",").map((p) => p.trim());
                if (parts.length >= 2) {
                  const idCol = parts[0];
                  const gradeCol = parseInt(parts[1], 10);
                  const gradeMap: Array<DatasetItem["drGrade"]> = [
                    "No DR",
                    "Mild NPDR",
                    "Moderate NPDR",
                    "Severe NPDR",
                    "PDR",
                  ];
                  const drGrade = gradeMap[gradeCol] || "No DR";

                  items.push({
                    id: idCol,
                    imageFileName: `${idCol}.jpg`,
                    eyeSide: "OD",
                    drGrade,
                    numericGrade: Number.isNaN(gradeCol) ? 0 : gradeCol,
                    dme: gradeCol >= 2 ? "Mild" : "None",
                  });
                }
              }

              this.addCustomDataset(file, items, fullPath);
            }
          } catch (e) {
            console.error(`Failed to parse dataset CSV: ${file}`, e);
          }
        }
      }
    } catch (err) {
      console.error("Error scanning datasets directory:", err);
    }

    return this.datasets;
  }

  private addCustomDataset(name: string, items: DatasetItem[], sourcePath: string) {
    const distribution: Record<string, number> = {};
    for (const item of items) {
      distribution[item.drGrade] = (distribution[item.drGrade] || 0) + 1;
    }

    // Check if already registered
    const existingIdx = this.datasets.findIndex((d) => d.name === name);
    const info: DatasetInfo = {
      name,
      totalRecords: items.length,
      gradeDistribution: distribution,
      sourcePath,
      records: items,
    };

    if (existingIdx >= 0) {
      this.datasets[existingIdx] = info;
    } else {
      this.datasets.push(info);
    }
  }

  public getDatasets(): DatasetInfo[] {
    return this.datasets;
  }
}

export const datasetLoader = new DatasetLoader();
