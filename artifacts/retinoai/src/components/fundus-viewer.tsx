import React, { useState } from "react";
import { Eye, Layers, ZoomIn, ZoomOut, RotateCcw, AlertTriangle, Sparkles, Crosshair } from "lucide-react";

export interface LesionPoint {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  radius: number;
  label: string;
  confidence: number;
  type?: "microaneurysm" | "hemorrhage" | "hard_exudate" | "soft_exudate";
}

export interface HeatmapPoint {
  x: number;
  y: number;
  intensity: number;
}

export interface FundusViewerProps {
  eyeSide?: "OD" | "OS";
  imageUrl?: string;
  drGrade?: string;
  lesions?: LesionPoint[];
  heatmapPoints?: HeatmapPoint[];
  showCrosshairsDefault?: boolean;
}

export const FundusViewer: React.FC<FundusViewerProps> = ({
  eyeSide = "OD",
  imageUrl,
  drGrade = "Moderate NPDR",
  lesions = [],
  heatmapPoints = [],
  showCrosshairsDefault = false,
}) => {
  const [showLesions, setShowLesions] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapOpacity, setHeatmapOpacity] = useState(65);
  const [showCrosshairs, setShowCrosshairs] = useState(showCrosshairsDefault);
  const [activeLesion, setActiveLesion] = useState<LesionPoint | null>(null);
  const [zoom, setZoom] = useState(1);

  // Default sample lesions if none provided and not "No DR"
  const activeLesions: LesionPoint[] =
    lesions.length > 0
      ? lesions
      : drGrade !== "No DR"
      ? [
          { x: 42, y: 38, radius: 11, label: "Microaneurysm (OD Temporal)", confidence: 96, type: "microaneurysm" },
          { x: 48, y: 44, radius: 9, label: "Microaneurysm", confidence: 94, type: "microaneurysm" },
          { x: 62, y: 46, radius: 18, label: "Blot Retinal Hemorrhage", confidence: 92, type: "hemorrhage" },
          { x: 50, y: 49, radius: 22, label: "Circinate Hard Exudates", confidence: 95, type: "hard_exudate" },
          { x: 33, y: 52, radius: 16, label: "Cotton Wool Spot (Ischemia)", confidence: 88, type: "soft_exudate" },
        ]
      : [];

  const defaultHeatmap =
    heatmapPoints.length > 0
      ? heatmapPoints
      : [
          { x: 50, y: 49, intensity: 0.95 },
          { x: 43, y: 39, intensity: 0.84 },
          { x: 61, y: 46, intensity: 0.78 },
          { x: 34, y: 52, intensity: 0.7 },
        ];

  // Disc position: for OD (Right Eye), optic disc is nasal (left side on photograph ~28%); for OS, it's on the right ~72%
  const discX = eyeSide === "OD" ? 28 : 72;
  const foveaX = eyeSide === "OD" ? 54 : 46;

  return (
    <div className="fundus-viewer-container" style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#111817", border: "1px solid #2B3A36", color: "#F0F5F3" }}>
      {/* Control Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(18, 25, 23, 0.95)", borderBottom: "1px solid #263531", gap: 8, fontSize: 13 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ padding: "3px 8px", borderRadius: 6, background: eyeSide === "OD" ? "#2B4C3F" : "#2E4357", color: "#A7E4CD", fontWeight: 700, letterSpacing: 0.5, fontSize: 11 }}>
            {eyeSide === "OD" ? "RIGHT EYE · OD" : "LEFT EYE · OS"}
          </span>
          <span style={{ color: "#92A19D", fontSize: 12 }}>Standard 45° Fundus Field</span>
        </div>

        {/* Layer Toggles */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowLesions(!showLesions)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid",
              borderColor: showLesions ? "#C96F73" : "#32443F",
              background: showLesions ? "rgba(201, 111, 115, 0.2)" : "transparent",
              color: showLesions ? "#FFA8AC" : "#8A9995",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            <AlertTriangle size={13} />
            <span>Lesions ({activeLesions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHeatmap(!showHeatmap)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid",
              borderColor: showHeatmap ? "#7897A8" : "#32443F",
              background: showHeatmap ? "rgba(120, 151, 168, 0.25)" : "transparent",
              color: showHeatmap ? "#BFE0F2" : "#8A9995",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            <Sparkles size={13} />
            <span>AI Heatmap</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCrosshairs(!showCrosshairs)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 8px",
              borderRadius: 6,
              border: "1px solid",
              borderColor: showCrosshairs ? "#6E9B82" : "#32443F",
              background: showCrosshairs ? "rgba(110, 155, 130, 0.2)" : "transparent",
              color: showCrosshairs ? "#A4E2C2" : "#8A9995",
              cursor: "pointer",
              fontSize: 12,
            }}
            title="Toggle Macula & Optic Disc Crosshairs"
          >
            <Crosshair size={13} />
          </button>

          {/* Zoom controls */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 2, background: "#1C2724", padding: "2px 4px", borderRadius: 6, border: "1px solid #2B3A36" }}>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.9, Number((z - 0.15).toFixed(2))))}
              style={{ background: "none", border: "none", color: "#8A9995", cursor: "pointer", padding: 3 }}
              title="Zoom out"
            >
              <ZoomOut size={13} />
            </button>
            <span style={{ fontSize: 11, minWidth: 32, textAlign: "center", color: "#C0CBC7" }}>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))))}
              style={{ background: "none", border: "none", color: "#8A9995", cursor: "pointer", padding: 3 }}
              title="Zoom in"
            >
              <ZoomIn size={13} />
            </button>
            {zoom !== 1 && (
              <button
                type="button"
                onClick={() => setZoom(1)}
                style={{ background: "none", border: "none", color: "#8A9995", cursor: "pointer", padding: 3 }}
                title="Reset zoom"
              >
                <RotateCcw size={11} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Heatmap Opacity Bar (Visible when heatmap is on) */}
      {showHeatmap && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px", background: "rgba(24, 34, 31, 0.9)", borderBottom: "1px solid #283733", fontSize: 11, color: "#8FA39C" }}>
          <span>Heatmap Opacity:</span>
          <input
            type="range"
            min="20"
            max="100"
            value={heatmapOpacity}
            onChange={(e) => setHeatmapOpacity(Number(e.target.value))}
            style={{ width: 110, accentColor: "#7897A8", cursor: "pointer" }}
          />
          <span style={{ color: "#D1DDD9" }}>{heatmapOpacity}%</span>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#7897A8" }}>Gradient Attention Map (Blackbox-Calibrated)</span>
        </div>
      )}

      {/* Main Canvas / Visualizer Area */}
      <div style={{ position: "relative", width: "100%", height: 380, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at center, #17100D 0%, #080A0A 100%)" }}>
        <div
          style={{
            position: "relative",
            width: 340,
            height: 340,
            borderRadius: "50%",
            transform: `scale(${zoom})`,
            transition: "transform 0.2s ease-out",
            boxShadow: "0 0 45px rgba(0,0,0,0.8), inset 0 0 35px rgba(0,0,0,0.7)",
            overflow: "hidden",
          }}
        >
          {/* Base Retinal Fundus Graphic or Photo */}
          {imageUrl ? (
            <img src={imageUrl} alt="Fundus capture" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <svg viewBox="0 0 400 400" style={{ width: "100%", height: "100%", display: "block" }}>
              <defs>
                <radialGradient id="retinaGradient" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#C9542D" />
                  <stop offset="65%" stopColor="#A13619" />
                  <stop offset="90%" stopColor="#6C1E0D" />
                  <stop offset="100%" stopColor="#300903" />
                </radialGradient>
                <radialGradient id="opticDiscGradient" cx="45%" cy="45%" r="50%">
                  <stop offset="0%" stopColor="#FFECCC" />
                  <stop offset="40%" stopColor="#F8C488" />
                  <stop offset="85%" stopColor="#DF8F4F" />
                  <stop offset="100%" stopColor="#9C441E" />
                </radialGradient>
                <radialGradient id="foveaGradient" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#4A1308" />
                  <stop offset="70%" stopColor="#7B2411" />
                  <stop offset="100%" stopColor="#9F3518" stopOpacity="0" />
                </radialGradient>
                <filter id="lesionGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="1.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Fundus Background */}
              <circle cx="200" cy="200" r="198" fill="url(#retinaGradient)" />

              {/* Major Retinal Vessels (Arterioles and Venules) */}
              <g stroke="#641107" strokeWidth="6" fill="none" opacity="0.85" strokeLinecap="round">
                {/* Superior Temporal Arcade */}
                <path d={`M ${discX * 4} 190 Q ${discX * 4} 100, 200 85 T 320 110`} strokeWidth="5.5" />
                {/* Inferior Temporal Arcade */}
                <path d={`M ${discX * 4} 210 Q ${discX * 4} 300, 200 315 T 320 290`} strokeWidth="5.5" />
                {/* Nasal vessels */}
                <path d={`M ${discX * 4} 195 Q ${discX < 50 ? 50 : 350} 140, ${discX < 50 ? 30 : 370} 120`} strokeWidth="4" />
                <path d={`M ${discX * 4} 205 Q ${discX < 50 ? 50 : 350} 260, ${discX < 50 ? 30 : 370} 280`} strokeWidth="4" />
              </g>

              {/* Fine branches */}
              <g stroke="#78170B" strokeWidth="2.5" fill="none" opacity="0.75">
                <path d={`M ${foveaX * 4 - 40} 115 Q ${foveaX * 4} 130, ${foveaX * 4 + 30} 125`} />
                <path d={`M ${foveaX * 4 - 30} 285 Q ${foveaX * 4} 270, ${foveaX * 4 + 35} 275`} />
                <path d={`M 260 95 Q 290 90, 310 75`} />
                <path d={`M 260 305 Q 290 310, 310 325`} />
              </g>

              {/* Optic Disc */}
              <ellipse cx={discX * 4} cy="200" rx="30" ry="34" fill="url(#opticDiscGradient)" />
              <ellipse cx={discX * 4} cy="200" rx="14" ry="16" fill="#FFF2DC" opacity="0.8" />

              {/* Fovea / Macula (Darker central zone) */}
              <circle cx={foveaX * 4} cy="200" r="48" fill="url(#foveaGradient)" />
              <circle cx={foveaX * 4} cy="200" r="4" fill="#FFC9B0" opacity="0.65" />
            </svg>
          )}

          {/* AI Explainability Heatmap Layer */}
          {showHeatmap && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                opacity: heatmapOpacity / 100,
                mixBlendMode: "screen",
              }}
            >
              <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}>
                <defs>
                  {defaultHeatmap.map((pt, i) => (
                    <radialGradient key={`hm-grad-${i}`} id={`hmGrad${i}`} cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#FF1E28" stopOpacity={pt.intensity * 0.95} />
                      <stop offset="35%" stopColor="#FF961F" stopOpacity={pt.intensity * 0.75} />
                      <stop offset="70%" stopColor="#FFEB3B" stopOpacity={pt.intensity * 0.45} />
                      <stop offset="90%" stopColor="#2196F3" stopOpacity={pt.intensity * 0.15} />
                      <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                    </radialGradient>
                  ))}
                </defs>
                {defaultHeatmap.map((pt, i) => (
                  <circle key={`hm-circle-${i}`} cx={pt.x} cy={pt.y} r={pt.intensity * 26} fill={`url(#hmGrad${i})`} />
                ))}
              </svg>
            </div>
          )}

          {/* Crosshairs & Anatomical Landmarks */}
          {showCrosshairs && (
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {/* Optic Disc Marker */}
              <div
                style={{
                  position: "absolute",
                  left: `${discX}%`,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 52,
                  height: 52,
                  border: "1px dashed rgba(255, 230, 180, 0.7)",
                  borderRadius: "50%",
                }}
              >
                <span style={{ position: "absolute", bottom: -17, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: "#FFE2B3", fontWeight: 700, whiteSpace: "nowrap" }}>
                  OPTIC DISC
                </span>
              </div>

              {/* Fovea Centralis Marker */}
              <div
                style={{
                  position: "absolute",
                  left: `${foveaX}%`,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 58,
                  height: 58,
                  border: "1px dashed rgba(110, 195, 160, 0.7)",
                  borderRadius: "50%",
                }}
              >
                <span style={{ position: "absolute", bottom: -17, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: "#97E6C0", fontWeight: 700, whiteSpace: "nowrap" }}>
                  FOVEA / MACULA
                </span>
              </div>
            </div>
          )}

          {/* Interactive Lesion Overlay Markers */}
          {showLesions &&
            activeLesions.map((lesion, idx) => {
              const isHemorrhage = lesion.type === "hemorrhage" || lesion.label.toLowerCase().includes("hemorrhage");
              const isExudate = lesion.type === "hard_exudate" || lesion.label.toLowerCase().includes("exudate");
              const isCotton = lesion.type === "soft_exudate" || lesion.label.toLowerCase().includes("cotton");
              const strokeColor = isExudate ? "#FFD54F" : isCotton ? "#E0F2FE" : isHemorrhage ? "#E53935" : "#FF5252";
              const fillColor = isExudate ? "rgba(255, 213, 79, 0.35)" : isCotton ? "rgba(224, 242, 254, 0.4)" : "rgba(229, 57, 53, 0.45)";

              return (
                <div
                  key={`lesion-${idx}`}
                  onClick={() => setActiveLesion(lesion)}
                  style={{
                    position: "absolute",
                    left: `${lesion.x}%`,
                    top: `${lesion.y}%`,
                    width: lesion.radius * 1.5,
                    height: lesion.radius * 1.5,
                    transform: "translate(-50%, -50%)",
                    borderRadius: "50%",
                    border: `1.5px solid ${strokeColor}`,
                    background: fillColor,
                    cursor: "pointer",
                    boxShadow: `0 0 6px ${strokeColor}`,
                    transition: "transform 0.15s ease",
                  }}
                  title={`${lesion.label} (${lesion.confidence}%)`}
                >
                  <span
                    style={{
                      position: "absolute",
                      inset: -3,
                      borderRadius: "50%",
                      border: `1px solid ${strokeColor}`,
                      opacity: 0.6,
                      animation: "pulse 2s infinite",
                    }}
                  />
                </div>
              );
            })}
        </div>

        {/* Selected Lesion Callout */}
        {activeLesion && (
          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: 14,
              right: 14,
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(18, 26, 24, 0.94)",
              border: "1px solid #364944",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 12,
              backdropFilter: "blur(8px)",
              zIndex: 10,
            }}
          >
            <div>
              <strong style={{ color: "#F0F5F3" }}>{activeLesion.label}</strong>
              <div style={{ color: "#92A19D", fontSize: 11, marginTop: 2 }}>
                Model Confidence: <span style={{ color: "#74DFB4", fontWeight: 600 }}>{activeLesion.confidence}%</span> · Coordinates: X:{activeLesion.x}% Y:{activeLesion.y}%
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveLesion(null)}
              style={{ background: "#2B3A36", border: "none", color: "#C5D3CF", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 11 }}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Legend & Summary Footer */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "rgba(14, 20, 18, 0.95)", borderTop: "1px solid #23312D", fontSize: 11, color: "#8E9E99", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF5252" }} /> Microaneurysm
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#E53935" }} /> Hemorrhage
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FFD54F" }} /> Hard Exudate
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#E0F2FE" }} /> Soft Exudate (CWS)
          </span>
        </div>

        <div style={{ color: "#A8B8B3" }}>
          DR Grade: <strong style={{ color: drGrade === "No DR" ? "#6E9B82" : drGrade === "Mild NPDR" ? "#74A0B8" : drGrade === "Moderate NPDR" ? "#E59866" : "#C96F73" }}>{drGrade}</strong>
        </div>
      </div>
    </div>
  );
};
