import { useEffect, useRef, useState, type MouseEvent } from "react";

import type { SegmentResponse } from "../types";

interface SegmentationViewProps {
  originalImage: string | null;
  result: SegmentResponse | null;
}

interface Point2D {
  x: number;
  y: number;
  label: number;
  color: string;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
  label: number;
  color: string;
}

interface HullVolume {
  label: number;
  color: string;
  points: Point3D[];
  faces: [number, number, number][];
}

interface CameraState {
  yaw: number;
  pitch: number;
  depth: number;
  panX: number;
  panY: number;
}

interface LabelIndexData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const PLOT_SIZE = { width: 760, height: 380 };
const PLOT_MARGIN = { left: 52, right: 16, top: 14, bottom: 44 };
const MAX_RENDER_POINTS_2D = 9000;
const MAX_RENDER_POINTS_3D = 11000;
const CAMERA_DEFAULT: CameraState = { yaw: 0.42, pitch: 0.35, depth: 3.2, panX: 0, panY: 0 };
const CAMERA_PRESETS = [
  { key: "top", label: "Top", target: { yaw: 0, pitch: -1.32, depth: 3.2, panX: 0, panY: 0 } },
  { key: "down", label: "Down", target: { yaw: 0, pitch: 1.32, depth: 3.2, panX: 0, panY: 0 } },
  { key: "left", label: "Left", target: { yaw: -Math.PI / 2, pitch: 0, depth: 3.2, panX: 0, panY: 0 } },
  { key: "right", label: "Right", target: { yaw: Math.PI / 2, pitch: 0, depth: 3.2, panX: 0, panY: 0 } },
  { key: "upperLeft", label: "Upper Left", target: { yaw: -Math.PI / 4, pitch: -0.62, depth: 3.2, panX: 0, panY: 0 } },
  { key: "upper", label: "Upper", target: { yaw: 0, pitch: -0.62, depth: 3.2, panX: 0, panY: 0 } }
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalize01(value: number, min: number, max: number): number {
  const span = Math.max(1e-9, max - min);
  return clamp((value - min) / span, 0, 1);
}

function rgbToCss(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function buildConvexHull2D(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return [];
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: { x: number; y: number }[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: { x: number; y: number }[] = [];
  for (let idx = sorted.length - 1; idx >= 0; idx -= 1) {
    const p = sorted[idx];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function cross3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): [number, number, number] {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

function buildConvexHullFaces3D(points: Point3D[]): [number, number, number][] {
  const n = points.length;
  if (n < 4) return [];
  const centroid = points.reduce(
    (acc, p) => ({ x: acc.x + p.x / n, y: acc.y + p.y / n, z: acc.z + p.z / n }),
    { x: 0, y: 0, z: 0 }
  );
  const eps = 1e-7;
  const faces: [number, number, number][] = [];
  for (let i = 0; i < n - 2; i += 1) {
    for (let j = i + 1; j < n - 1; j += 1) {
      for (let k = j + 1; k < n; k += 1) {
        const a = points[i];
        const b = points[j];
        const c = points[k];
        const ux = b.x - a.x;
        const uy = b.y - a.y;
        const uz = b.z - a.z;
        const vx = c.x - a.x;
        const vy = c.y - a.y;
        const vz = c.z - a.z;
        const [nx, ny, nz] = cross3(ux, uy, uz, vx, vy, vz);
        if (Math.hypot(nx, ny, nz) < eps) continue;
        let pos = false;
        let neg = false;
        for (let m = 0; m < n; m += 1) {
          if (m === i || m === j || m === k) continue;
          const p = points[m];
          const d = nx * (p.x - a.x) + ny * (p.y - a.y) + nz * (p.z - a.z);
          if (d > eps) pos = true;
          else if (d < -eps) neg = true;
          if (pos && neg) break;
        }
        if (pos && neg) continue;
        const centerDot = nx * (centroid.x - a.x) + ny * (centroid.y - a.y) + nz * (centroid.z - a.z);
        faces.push(centerDot > 0 ? [i, k, j] : [i, j, k]);
      }
    }
  }
  return faces;
}

function to3DPoint(
  point: [number, number, number, number],
  space: string,
  ranges: [number, number][],
  hsvVolumeShape: "cylinder" | "cone"
): { x: number; y: number; z: number } {
  if (space === "HSV") {
    const h = point[0];
    const s = normalize01(point[1], ranges[1][0], ranges[1][1]);
    const v = normalize01(point[2], ranges[2][0], ranges[2][1]);
    const radial = hsvVolumeShape === "cone" ? s * v : s;
    const angle = (h * Math.PI) / 180;
    return { x: Math.cos(angle) * radial, y: v * 2 - 1, z: Math.sin(angle) * radial };
  }
  return {
    x: normalize01(point[0], ranges[0][0], ranges[0][1]) * 2 - 1,
    y: normalize01(point[1], ranges[1][0], ranges[1][1]) * 2 - 1,
    z: normalize01(point[2], ranges[2][0], ranges[2][1]) * 2 - 1
  };
}

function drawPresetIcon(key: string): JSX.Element {
  const stroke = "currentColor";
  if (key === "top") {
    return (
      <svg viewBox="0 0 24 24" className="cam-icon" aria-hidden="true">
        <circle cx="12" cy="12" r="7" fill="none" stroke={stroke} strokeWidth="1.8" />
        <path d="M12 4v5M9.5 6.5 12 4l2.5 2.5" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (key === "down") {
    return (
      <svg viewBox="0 0 24 24" className="cam-icon" aria-hidden="true">
        <circle cx="12" cy="12" r="7" fill="none" stroke={stroke} strokeWidth="1.8" />
        <path d="M12 20v-5M9.5 17.5 12 20l2.5-2.5" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (key === "left") {
    return (
      <svg viewBox="0 0 24 24" className="cam-icon" aria-hidden="true">
        <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" fill="none" stroke={stroke} strokeWidth="1.8" />
        <path d="M5 12h8M8 9l-3 3 3 3" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (key === "right") {
    return (
      <svg viewBox="0 0 24 24" className="cam-icon" aria-hidden="true">
        <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" fill="none" stroke={stroke} strokeWidth="1.8" />
        <path d="M19 12h-8M16 9l3 3-3 3" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (key === "upperLeft") {
    return (
      <svg viewBox="0 0 24 24" className="cam-icon" aria-hidden="true">
        <path d="M5 19V5h14" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8.5 8.5 5 5l3.5.2M8.5 8.5 5.2 8.5" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="cam-icon" aria-hidden="true">
      <path d="M12 20V4M8.5 7.5 12 4l3.5 3.5" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6 18a6 6 0 0 1 12 0" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

async function decodeImageData(src: string): Promise<LabelIndexData> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height).data;
  return { width: image.width, height: image.height, data };
}

function Segmentation3DPlot({
  points,
  centroids,
  hullVolumes,
  showPixels,
  showCentroids,
  showHull,
  showAxes,
  hullOpacity,
  onToggleAxes,
  selectedLabel
}: {
  points: Point3D[];
  centroids: Point3D[];
  hullVolumes: HullVolume[];
  showPixels: boolean;
  showCentroids: boolean;
  showHull: boolean;
  showAxes: boolean;
  hullOpacity: number;
  onToggleAxes: () => void;
  selectedLabel: number | null;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<CameraState>({ ...CAMERA_DEFAULT });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  useEffect(() => {
    const onFs = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let dragging = false;
    let pointerId = -1;
    let dragMode: "rotate" | "pan" = "rotate";
    let lastX = 0;
    let lastY = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const project = (p: Point3D, w: number, h: number) => {
      const c = cameraRef.current;
      const cy = Math.cos(c.yaw);
      const sy = Math.sin(c.yaw);
      const cp = Math.cos(c.pitch);
      const sp = Math.sin(c.pitch);
      const x1 = p.x * cy + p.z * sy;
      const z1 = -p.x * sy + p.z * cy;
      const y1 = p.y * cp - z1 * sp;
      const z2 = p.y * sp + z1 * cp;
      const depth = c.depth - z2 * 0.8;
      const s = 1 / Math.max(0.8, depth);
      return { ...p, sx: w * 0.5 + (x1 + c.panX) * (w * 0.25) * s, sy: h * 0.5 - (y1 + c.panY) * (h * 0.25) * s, depth };
    };

    const draw = () => {
      resize();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(10,18,21,0.74)";
      ctx.fillRect(0, 0, w, h);
      const projected = points.slice(0, MAX_RENDER_POINTS_3D).map((p) => project(p, w, h)).sort((a, b) => b.depth - a.depth);

      if (showAxes) {
        const o = project({ x: 0, y: 0, z: 0, label: -1, color: "" }, w, h);
        const x = project({ x: 1.2, y: 0, z: 0, label: -1, color: "" }, w, h);
        const y = project({ x: 0, y: 1.2, z: 0, label: -1, color: "" }, w, h);
        const z = project({ x: 0, y: 0, z: 1.2, label: -1, color: "" }, w, h);
        const dl = (a: any, b: any, c: string) => {
          ctx.strokeStyle = c;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.stroke();
        };
        dl(o, x, "rgba(255,111,89,0.88)");
        dl(o, y, "rgba(42,157,143,0.88)");
        dl(o, z, "rgba(63,136,197,0.88)");
      }

      if (showHull) {
        const triangles: { a: any; b: any; c: any; color: string; depth: number; label: number }[] = [];
        for (const volume of hullVolumes) {
          const pp = volume.points.map((p) => project(p, w, h));
          for (const [ia, ib, ic] of volume.faces) {
            const a = pp[ia];
            const b = pp[ib];
            const c = pp[ic];
            triangles.push({ a, b, c, color: volume.color, depth: (a.depth + b.depth + c.depth) / 3, label: volume.label });
          }
        }
        triangles.sort((a, b) => b.depth - a.depth);
        for (const t of triangles) {
          ctx.beginPath();
          ctx.moveTo(t.a.sx, t.a.sy);
          ctx.lineTo(t.b.sx, t.b.sy);
          ctx.lineTo(t.c.sx, t.c.sy);
          ctx.closePath();
          ctx.fillStyle = t.color;
          ctx.globalAlpha = selectedLabel === null ? hullOpacity : t.label === selectedLabel ? hullOpacity : 0.03;
          ctx.fill();
          ctx.globalAlpha = Math.min(1, (selectedLabel === null ? hullOpacity : 0.06) + 0.14);
          ctx.strokeStyle = t.color;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      if (showPixels) {
        for (const p of projected) {
          ctx.fillStyle = p.color;
          ctx.globalAlpha = selectedLabel === null ? 0.5 : p.label === selectedLabel ? 0.9 : 0.06;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, selectedLabel !== null && p.label === selectedLabel ? 2.2 : 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (showCentroids) {
        for (const c of centroids) {
          const p = project(c, w, h);
          const isSelected = selectedLabel !== null && c.label === selectedLabel;
          if (selectedLabel !== null && !isSelected) ctx.globalAlpha = 0.18;
          ctx.strokeStyle = c.color;
          ctx.lineWidth = isSelected ? 3.2 : 2.3;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, isSelected ? 8 : 6, 0, Math.PI * 2);
          ctx.stroke();
          if (isSelected) {
            ctx.strokeStyle = "rgba(255,255,255,0.95)";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(p.sx, p.sy, 10, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      }

      raf = window.requestAnimationFrame(draw);
    };
    raf = window.requestAnimationFrame(draw);

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      dragging = true;
      dragMode = e.button === 1 ? "pan" : "rotate";
      pointerId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointerId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const c = cameraRef.current;
      if (dragMode === "pan") {
        c.panX += dx * 0.0032;
        c.panY -= dy * 0.0032;
      } else {
        c.yaw += dx * 0.008;
        c.pitch = clamp(c.pitch + dy * 0.008, -1.45, 1.45);
      }
      setActivePreset(null);
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraRef.current.depth = clamp(cameraRef.current.depth + e.deltaY * 0.0025, 1.1, 8.5);
      setActivePreset(null);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", resize);
    return () => {
      window.cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", resize);
    };
  }, [centroids, hullOpacity, hullVolumes, points, selectedLabel, showAxes, showCentroids, showHull, showPixels]);

  const toggleFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement === stage) await document.exitFullscreen().catch(() => undefined);
    else await stage.requestFullscreen().catch(() => undefined);
  };
  const recenter = () => {
    cameraRef.current = { ...CAMERA_DEFAULT };
    setActivePreset(null);
  };
  const preset = (idx: number) => {
    cameraRef.current = { ...CAMERA_PRESETS[idx].target };
    setActivePreset(CAMERA_PRESETS[idx].key);
  };

  return (
    <div ref={stageRef} className="webgl-stage seg-webgl-stage">
      <canvas ref={canvasRef} className="webgl-canvas seg-webgl-canvas" aria-label="Visualisation 3D KNN" />
      <div className="webgl-actions">
        <button type="button" className={`webgl-action-btn ${showAxes ? "active" : ""}`} onClick={onToggleAxes}>
          {showAxes ? "Axes: ON" : "Axes: OFF"}
        </button>
        <button type="button" className="webgl-action-btn" onClick={toggleFullscreen}>
          {isFullscreen ? "Quitter plein ecran" : "Plein ecran"}
        </button>
        <button type="button" className="webgl-action-btn" onClick={recenter}>Recentrer</button>
        <div className="webgl-presets" aria-label="Positions camera predefinies">
          {CAMERA_PRESETS.map((p, idx) => (
            <button key={p.key} type="button" className={`webgl-preset-btn ${activePreset === p.key ? "active" : ""}`} title={p.label} aria-label={p.label} onClick={() => preset(idx)}>
              {drawPresetIcon(p.key)}
            </button>
          ))}
        </div>
      </div>
      <div className="webgl-overlay">
        <span>Drag gauche: rotation | clic molette + drag: deplacement | molette: zoom</span>
      </div>
    </div>
  );
}

export default function SegmentationView({ originalImage, result }: SegmentationViewProps) {
  const [activeLabels, setActiveLabels] = useState<Set<number>>(new Set());
  const [displaySpace, setDisplaySpace] = useState<"RGB" | "HSV" | "Lab">("Lab");
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [axisX, setAxisX] = useState(0);
  const [axisY, setAxisY] = useState(1);
  const [showPixels, setShowPixels] = useState(true);
  const [showCentroids, setShowCentroids] = useState(true);
  const [showHull, setShowHull] = useState(true);
  const [showAxes3D, setShowAxes3D] = useState(true);
  const [hullPointCount, setHullPointCount] = useState(32);
  const [hullOpacity, setHullOpacity] = useState(0.25);
  const [filteredSegmentedImage, setFilteredSegmentedImage] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<number | null>(null);
  const [labelIndexData, setLabelIndexData] = useState<LabelIndexData | null>(null);

  useEffect(() => {
    if (!result) {
      setActiveLabels(new Set());
      return;
    }
    setActiveLabels(new Set(result.label_stats.map((s) => s.label)));
    setFilteredSegmentedImage(result.segmented_image);
    setDisplaySpace(result.used_options.color_space);
    setAxisX(0);
    setAxisY(1);
    setSelectedLabel(null);
  }, [result]);

  useEffect(() => {
    setAxisX(0);
    setAxisY(1);
  }, [displaySpace]);

  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    const run = async () => {
      try {
        const decoded = await decodeImageData(result.label_index_image);
        if (!cancelled) setLabelIndexData(decoded);
      } catch {
        if (!cancelled) setLabelIndexData(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [result]);

  useEffect(() => {
    if (!result) return;
    const allVisible = result.label_stats.every((s) => activeLabels.has(s.label));
    if (allVisible) {
      setFilteredSegmentedImage(result.segmented_image);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const [segData, idxData] = await Promise.all([
        (await fetch(result.segmented_image)).blob(),
        (await fetch(result.label_index_image)).blob()
      ]);
      if (cancelled) return;
      const [segUrl, idxUrl] = [URL.createObjectURL(segData), URL.createObjectURL(idxData)];
      const decode = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("load"));
          img.src = src;
        });
      try {
        const [seg, idx] = await Promise.all([decode(segUrl), decode(idxUrl)]);
        if (cancelled) return;
        const canvas = document.createElement("canvas");
        canvas.width = seg.width;
        canvas.height = seg.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(seg, 0, 0);
        const segPx = ctx.getImageData(0, 0, seg.width, seg.height);
        const idxCanvas = document.createElement("canvas");
        idxCanvas.width = idx.width;
        idxCanvas.height = idx.height;
        const idxCtx = idxCanvas.getContext("2d");
        if (!idxCtx) return;
        idxCtx.drawImage(idx, 0, 0);
        const idxPx = idxCtx.getImageData(0, 0, idx.width, idx.height);
        for (let i = 0; i < segPx.data.length; i += 4) {
          if (!activeLabels.has(idxPx.data[i])) {
            segPx.data[i] = 0;
            segPx.data[i + 1] = 0;
            segPx.data[i + 2] = 0;
          }
        }
        ctx.putImageData(segPx, 0, 0);
        setFilteredSegmentedImage(canvas.toDataURL("image/png"));
      } finally {
        URL.revokeObjectURL(segUrl);
        URL.revokeObjectURL(idxUrl);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeLabels, result]);

  if (!result) {
    return (
      <div className="empty-view">
        <h3>Resultat segmentation</h3>
        <p>Configure les parametres puis lance la segmentation KNN.</p>
      </div>
    );
  }

  const ranges = result.channel_ranges_by_space[displaySpace] as [number, number][];
  const channelNames = result.channel_names_by_space[displaySpace] as [string, string, string];
  const hsvVolumeShape = result.used_options.hsv_volume_shape ?? "cylinder";
  const isHsvSpace = displaySpace === "HSV";
  const xRange = ranges[axisX] ?? [0, 1];
  const yRange = ranges[axisY] ?? [0, 1];
  const colorMap = new Map<number, string>(result.label_stats.map((s) => [s.label, rgbToCss(s.mean_rgb)]));
  const visibleRaw = result.cluster_points_by_space[displaySpace].filter((p) => activeLabels.has(p[3]));

  const points2D: Point2D[] = visibleRaw.slice(0, MAX_RENDER_POINTS_2D).map((p) => {
    if (isHsvSpace) {
      const h = p[0];
      const s = normalize01(p[1], ranges[1][0], ranges[1][1]);
      const v = normalize01(p[2], ranges[2][0], ranges[2][1]);
      const radial = hsvVolumeShape === "cone" ? s * v : s;
      const angle = (h * Math.PI) / 180;
      return {
        x: clamp(Math.cos(angle) * radial * 0.5 + 0.5, 0, 1),
        y: 1 - v,
        label: p[3],
        color: colorMap.get(p[3]) ?? "rgba(240,240,240,0.8)"
      };
    }
    return {
      x: normalize01(p[axisX], xRange[0], xRange[1]),
      y: 1 - normalize01(p[axisY], yRange[0], yRange[1]),
      label: p[3],
      color: colorMap.get(p[3]) ?? "rgba(240,240,240,0.8)"
    };
  });

  const centroids2D: Point2D[] = result.cluster_centroids_by_space[displaySpace]
    .filter((c) => activeLabels.has(c.label))
    .map((c) => {
      if (isHsvSpace) {
        const s = normalize01(c.point[1], ranges[1][0], ranges[1][1]);
        const v = normalize01(c.point[2], ranges[2][0], ranges[2][1]);
        const radial = hsvVolumeShape === "cone" ? s * v : s;
        const angle = (c.point[0] * Math.PI) / 180;
        return {
          x: clamp(Math.cos(angle) * radial * 0.5 + 0.5, 0, 1),
          y: 1 - v,
          label: c.label,
          color: colorMap.get(c.label) ?? "rgba(240,240,240,0.9)"
        };
      }
      return {
        x: normalize01(c.point[axisX], xRange[0], xRange[1]),
        y: 1 - normalize01(c.point[axisY], yRange[0], yRange[1]),
        label: c.label,
        color: colorMap.get(c.label) ?? "rgba(240,240,240,0.9)"
      };
    });

  const byLabel2D = new Map<number, { x: number; y: number }[]>();
  for (const p of points2D) {
    const arr = byLabel2D.get(p.label);
    if (arr) arr.push({ x: p.x, y: p.y });
    else byLabel2D.set(p.label, [{ x: p.x, y: p.y }]);
  }
  const hulls2D = new Map<number, { x: number; y: number }[]>();
  for (const [label, arr] of byLabel2D.entries()) {
    if (arr.length < 8) continue;
    const hull = buildConvexHull2D(arr);
    if (hull.length >= 3) hulls2D.set(label, hull);
  }

  const points3D: Point3D[] = visibleRaw.slice(0, MAX_RENDER_POINTS_3D).map((p) => {
    const xyz = to3DPoint(p, displaySpace, ranges, hsvVolumeShape);
    return { ...xyz, label: p[3], color: colorMap.get(p[3]) ?? "rgba(240,240,240,0.8)" };
  });

  const centroids3D: Point3D[] = result.cluster_centroids_by_space[displaySpace]
    .filter((c) => activeLabels.has(c.label))
    .map((c) => {
      const xyz = to3DPoint(
        [c.point[0], c.point[1], c.point[2], c.label],
        displaySpace,
        ranges,
        hsvVolumeShape
      );
      return { ...xyz, label: c.label, color: colorMap.get(c.label) ?? "rgba(240,240,240,0.9)" };
    });

  const byLabel3D = new Map<number, Point3D[]>();
  for (const p of points3D) {
    const arr = byLabel3D.get(p.label);
    if (arr) arr.push(p);
    else byLabel3D.set(p.label, [p]);
  }
  const hullVolumes: HullVolume[] = [];
  if (showHull) {
    for (const [label, arr] of byLabel3D.entries()) {
      if (arr.length < 12) continue;
      const step = Math.max(1, Math.floor(arr.length / Math.max(8, hullPointCount)));
      const sampled = arr.filter((_, idx) => idx % step === 0).slice(0, Math.max(8, hullPointCount));
      if (sampled.length < 4) continue;
      const faces = buildConvexHullFaces3D(sampled);
      if (faces.length === 0) continue;
      hullVolumes.push({ label, color: colorMap.get(label) ?? "rgba(240,240,240,0.8)", points: sampled, faces });
    }
  }

  const plotW = PLOT_SIZE.width - PLOT_MARGIN.left - PLOT_MARGIN.right;
  const plotH = PLOT_SIZE.height - PLOT_MARGIN.top - PLOT_MARGIN.bottom;

  const handleOriginalImageClick = (event: MouseEvent<HTMLImageElement>) => {
    if (!labelIndexData) return;
    const image = event.currentTarget;
    const rect = image.getBoundingClientRect();
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    if (naturalWidth <= 0 || naturalHeight <= 0) return;

    const boxAspect = rect.width / rect.height;
    const imageAspect = naturalWidth / naturalHeight;
    let renderedWidth = rect.width;
    let renderedHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;
    if (imageAspect > boxAspect) {
      renderedHeight = rect.width / imageAspect;
      offsetY = (rect.height - renderedHeight) * 0.5;
    } else {
      renderedWidth = rect.height * imageAspect;
      offsetX = (rect.width - renderedWidth) * 0.5;
    }

    const localX = event.clientX - rect.left - offsetX;
    const localY = event.clientY - rect.top - offsetY;
    if (localX < 0 || localY < 0 || localX > renderedWidth || localY > renderedHeight) return;

    const px = Math.floor((localX / renderedWidth) * naturalWidth);
    const py = Math.floor((localY / renderedHeight) * naturalHeight);
    const labelX = clamp(Math.floor((px / naturalWidth) * labelIndexData.width), 0, labelIndexData.width - 1);
    const labelY = clamp(Math.floor((py / naturalHeight) * labelIndexData.height), 0, labelIndexData.height - 1);
    const idx = (labelY * labelIndexData.width + labelX) * 4;
    const label = labelIndexData.data[idx];
    setSelectedLabel(label);
    setActiveLabels((prev) => {
      const next = new Set(prev);
      next.add(label);
      return next;
    });
  };

  return (
    <section className="view-card">
      <div className="view-header">
        <h3>Comparaison segmentation</h3>
        <span>{result.used_options.training_points.toLocaleString("fr-FR")} points d'apprentissage</span>
      </div>

      <div className="segment-compare">
        <article>
          <h4>Originale</h4>
          {originalImage ? <img src={originalImage} alt="Image originale" className="seg-original-pick" onClick={handleOriginalImageClick} /> : <div className="empty-image">Apercu indisponible</div>}
        </article>
        <article>
          <h4>Segmentee (labels actifs)</h4>
          <img src={filteredSegmentedImage ?? result.segmented_image} alt="Image segmentee filtree" />
        </article>
        <article>
          <h4>Carte etiquettes</h4>
          <img src={result.label_map_image} alt="Carte etiquettes segmentation" />
        </article>
      </div>

      <div className="seg-visual-controls">
        {selectedLabel !== null && (
          <span className="chip">Classe selectionnee: Label {selectedLabel}</span>
        )}
        <label className="field-block">
          <span>Espace d'affichage</span>
          <select className="control-select" value={displaySpace} onChange={(e) => setDisplaySpace(e.target.value as "RGB" | "HSV" | "Lab")}>
            <option value="RGB">RGB</option>
            <option value="HSV">HSV</option>
            <option value="Lab">Lab</option>
          </select>
        </label>
        <label className="field-block">
          <span>Vue KNN</span>
          <select className="control-select" value={viewMode} onChange={(e) => setViewMode(e.target.value as "2d" | "3d")}>
            <option value="2d">2D</option>
            <option value="3d">3D</option>
          </select>
        </label>
        {viewMode === "2d" && !isHsvSpace && (
          <>
            <label className="field-block">
              <span>Axe X</span>
              <select className="control-select" value={axisX} onChange={(e) => setAxisX(Number(e.target.value))}>
                {channelNames.map((name, idx) => <option key={`x-${name}-${idx}`} value={idx}>{name}</option>)}
              </select>
            </label>
            <label className="field-block">
              <span>Axe Y</span>
              <select className="control-select" value={axisY} onChange={(e) => setAxisY(Number(e.target.value))}>
                {channelNames.map((name, idx) => <option key={`y-${name}-${idx}`} value={idx}>{name}</option>)}
              </select>
            </label>
          </>
        )}
        <label className="field-inline"><input className="control-checkbox" type="checkbox" checked={showPixels} onChange={(e) => setShowPixels(e.target.checked)} /><span>Pixels classes</span></label>
        <label className="field-inline"><input className="control-checkbox" type="checkbox" checked={showCentroids} onChange={(e) => setShowCentroids(e.target.checked)} /><span>Centroides</span></label>
        <label className="field-inline"><input className="control-checkbox" type="checkbox" checked={showHull} onChange={(e) => setShowHull(e.target.checked)} /><span>Enveloppe</span></label>
        <label className="seg-hull-points">
          Points enveloppe: {hullPointCount}
          <input className="control-range" type="range" min={8} max={128} step={1} value={hullPointCount} onChange={(e) => setHullPointCount(Number(e.target.value))} />
        </label>
        {viewMode === "3d" && (
          <label className="seg-hull-points">
            Opacite volume: {hullOpacity.toFixed(2)}
            <input className="control-range" type="range" min={0.05} max={0.9} step={0.01} value={hullOpacity} onChange={(e) => setHullOpacity(Number(e.target.value))} />
          </label>
        )}
      </div>

      {viewMode === "2d" ? (
        <div className="seg-plot-card">
          <header><strong>Projection 2D clusters</strong><span>{points2D.length.toLocaleString("fr-FR")} points visibles</span></header>
          <svg viewBox={`0 0 ${PLOT_SIZE.width} ${PLOT_SIZE.height}`} className="scatter-svg" role="img" aria-label="Projection 2D des clusters KNN">
            <rect x={0} y={0} width={PLOT_SIZE.width} height={PLOT_SIZE.height} rx={12} />
            <line className="axis-line" x1={PLOT_MARGIN.left} y1={PLOT_MARGIN.top + plotH} x2={PLOT_MARGIN.left + plotW} y2={PLOT_MARGIN.top + plotH} />
            <line className="axis-line" x1={PLOT_MARGIN.left} y1={PLOT_MARGIN.top + plotH} x2={PLOT_MARGIN.left} y2={PLOT_MARGIN.top} />
            <text x={PLOT_MARGIN.left + plotW * 0.5} y={PLOT_SIZE.height - 10} textAnchor="middle">
              {isHsvSpace ? (hsvVolumeShape === "cone" ? "V*S*cos(H)" : "S*cos(H)") : channelNames[axisX]}
            </text>
            <text x={16} y={PLOT_MARGIN.top + plotH * 0.5} textAnchor="middle" transform={`rotate(-90 16 ${PLOT_MARGIN.top + plotH * 0.5})`}>
              {isHsvSpace ? "V" : channelNames[axisY]}
            </text>
            {showHull && Array.from(hulls2D.entries()).map(([label, hull]) => (
              <polygon
                key={`hull-${label}`}
                points={hull.map((p) => `${PLOT_MARGIN.left + p.x * plotW},${PLOT_MARGIN.top + p.y * plotH}`).join(" ")}
                fill="none"
                stroke={colorMap.get(label) ?? "rgba(220,220,220,0.7)"}
                strokeOpacity={selectedLabel === null ? 0.65 : selectedLabel === label ? 0.95 : 0.15}
                strokeWidth={selectedLabel === label ? 2.5 : 1.5}
              />
            ))}
            {showPixels && points2D.map((p, i) => (
              <circle
                key={`p-${i}`}
                cx={PLOT_MARGIN.left + p.x * plotW}
                cy={PLOT_MARGIN.top + p.y * plotH}
                r={selectedLabel !== null && p.label === selectedLabel ? 2.2 : 1.4}
                fill={p.color}
                fillOpacity={selectedLabel === null ? 0.52 : p.label === selectedLabel ? 0.92 : 0.08}
              />
            ))}
            {showCentroids && centroids2D.map((c) => {
              const x = PLOT_MARGIN.left + c.x * plotW;
              const y = PLOT_MARGIN.top + c.y * plotH;
              const isSelected = selectedLabel !== null && c.label === selectedLabel;
              return (
                <g
                  key={`c-${c.label}`}
                  stroke={c.color}
                  strokeOpacity={selectedLabel === null ? 1 : isSelected ? 1 : 0.2}
                  strokeWidth={isSelected ? 3.2 : 2.4}
                  strokeLinecap="round"
                >
                  <line x1={x - (isSelected ? 7 : 5)} y1={y} x2={x + (isSelected ? 7 : 5)} y2={y} />
                  <line x1={x} y1={y - (isSelected ? 7 : 5)} x2={x} y2={y + (isSelected ? 7 : 5)} />
                  {isSelected && <circle cx={x} cy={y} r={10} fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth={1.2} />}
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <Segmentation3DPlot points={points3D} centroids={centroids3D} hullVolumes={hullVolumes} showPixels={showPixels} showCentroids={showCentroids} showHull={showHull} showAxes={showAxes3D} hullOpacity={hullOpacity} selectedLabel={selectedLabel} onToggleAxes={() => setShowAxes3D((v) => !v)} />
      )}

      <div className="label-stats">
        {result.label_stats.map((stat) => {
          const active = activeLabels.has(stat.label);
          return (
            <button
              key={stat.label}
              type="button"
              className={`label-item ${active ? "active" : "muted"} ${selectedLabel === stat.label ? "picked" : ""}`}
              onClick={() => {
                setSelectedLabel(stat.label);
                setActiveLabels((prev) => {
                  const n = new Set(prev);
                  if (n.has(stat.label)) n.delete(stat.label);
                  else n.add(stat.label);
                  return n;
                });
              }}
            >
              <span className="swatch" style={{ background: rgbToCss(stat.mean_rgb) }} />
              <strong>Label {stat.label}</strong>
              <span>{(stat.ratio * 100).toFixed(1)}%</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
