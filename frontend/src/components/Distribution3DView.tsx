import { useEffect, useMemo, useRef, useState } from "react";

import type { ColorSpace, DistributionSpaceData, DistributionViewOptions } from "../types";

interface Distribution3DViewProps {
  space: ColorSpace;
  spaceData: DistributionSpaceData;
  options: DistributionViewOptions;
  imageSrc: string;
  onToggleAxes: () => void;
}

interface PixelSource {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface PointCloudData {
  positions: Float32Array;
  colors: Float32Array;
  scales: Float32Array;
  count: number;
}

interface AxisGeometry {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
}

interface RenderSettings {
  pointSize: number;
  pointAlpha: number;
  glow: number;
  shaderStyle: DistributionViewOptions["shaderStyle"];
  rotationSpeed: number;
  showAxes: boolean;
}

interface CameraState {
  yaw: number;
  pitch: number;
  depth: number;
  panX: number;
  panY: number;
}

type CameraDragMode = "rotate" | "pan";

interface CameraPreset {
  key: "top" | "down" | "left" | "right" | "upperLeft" | "upper";
  label: string;
  target: CameraState;
}

const CAMERA_DEFAULT: CameraState = {
  yaw: 0.42,
  pitch: 0.35,
  depth: 3.2,
  panX: 0,
  panY: 0
};

const CAMERA_PRESETS: CameraPreset[] = [
  {
    key: "top",
    label: "Top",
    target: { yaw: 0, pitch: -1.32, depth: 3.2, panX: 0, panY: 0 }
  },
  {
    key: "down",
    label: "Down",
    target: { yaw: 0, pitch: 1.32, depth: 3.2, panX: 0, panY: 0 }
  },
  {
    key: "left",
    label: "Left",
    target: { yaw: -Math.PI / 2, pitch: 0, depth: 3.2, panX: 0, panY: 0 }
  },
  {
    key: "right",
    label: "Right",
    target: { yaw: Math.PI / 2, pitch: 0, depth: 3.2, panX: 0, panY: 0 }
  },
  {
    key: "upperLeft",
    label: "Upper Left",
    target: { yaw: -Math.PI / 4, pitch: -0.62, depth: 3.2, panX: 0, panY: 0 }
  },
  {
    key: "upper",
    label: "Upper",
    target: { yaw: 0, pitch: -0.62, depth: 3.2, panX: 0, panY: 0 }
  }
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalize01(value: number, min: number, max: number): number {
  const safeSpan = Math.max(1e-9, max - min);
  return clamp((value - min) / safeSpan, 0, 1);
}

function normalizeByAbs(value: number, min: number, max: number): number {
  const maxAbs = Math.max(1e-9, Math.abs(min), Math.abs(max));
  return clamp(value / maxAbs, -1, 1);
}

function mapPointToViewSpace(
  space: ColorSpace,
  channels: [number, number, number],
  channelRanges: [number, number][],
  hsvVolumeShape: DistributionViewOptions["hsvVolumeShape"]
): [number, number, number] {
  if (space === "HSV") {
    const h = channels[0];
    const s = normalize01(channels[1], channelRanges[1][0], channelRanges[1][1]);
    const v = normalize01(channels[2], channelRanges[2][0], channelRanges[2][1]);
    const angle = (h * Math.PI) / 180;
    const radial = hsvVolumeShape === "cone" ? s * v : s;
    const x = Math.cos(angle) * radial;
    const y = v;
    const z = Math.sin(angle) * radial;
    return [x, y, z];
  }

  if (space === "RGB") {
    return [
      normalize01(channels[0], channelRanges[0][0], channelRanges[0][1]),
      normalize01(channels[1], channelRanges[1][0], channelRanges[1][1]),
      normalize01(channels[2], channelRanges[2][0], channelRanges[2][1])
    ];
  }

  // Lab keeps a and b centered around zero, and L anchored at zero.
  return [
    normalizeByAbs(channels[0], channelRanges[0][0], channelRanges[0][1]),
    normalizeByAbs(channels[1], channelRanges[1][0], channelRanges[1][1]),
    normalizeByAbs(channels[2], channelRanges[2][0], channelRanges[2][1])
  ];
}

function axisLegend(
  space: ColorSpace,
  hsvVolumeShape: DistributionViewOptions["hsvVolumeShape"]
): [string, string, string] {
  if (space === "RGB") return ["R", "G", "B"];
  if (space === "Lab") return ["L", "a", "b"];
  if (hsvVolumeShape === "cone") {
    return ["V*S*cos(H)", "V", "V*S*sin(H)"];
  }
  return ["S*cos(H)", "V", "S*sin(H)"];
}

function shortestAngleDelta(from: number, to: number): number {
  const twoPi = Math.PI * 2;
  const wrapped = ((to - from + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  return wrapped;
}

function drawPresetIcon(key: CameraPreset["key"]): JSX.Element {
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

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function gaussianRandom(rng: () => number): number {
  const u1 = Math.max(1e-8, rng());
  const u2 = Math.max(1e-8, rng());
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return [r + m, g + m, b + m];
}

function pseudoLabToRgb(l: number, a: number, b: number): [number, number, number] {
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const sat = clamp(Math.sqrt(a * a + b * b) / 120, 0.2, 1);
  const val = clamp(l / 100, 0.2, 1);
  return hsvToRgb(hue, sat, val);
}

function rgb255ToHsv(r255: number, g255: number, b255: number): [number, number, number] {
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const cmax = Math.max(r, g, b);
  const cmin = Math.min(r, g, b);
  const delta = cmax - cmin;

  let h = 0;
  if (delta > 1e-8) {
    if (cmax === r) h = (((g - b) / delta) % 6) * 60;
    else if (cmax === g) h = (((b - r) / delta) + 2) * 60;
    else h = (((r - g) / delta) + 4) * 60;
  }
  if (h < 0) h += 360;
  const s = cmax <= 1e-8 ? 0 : delta / cmax;
  const v = cmax;
  return [h, s, v];
}

function rgb255ToLab(r255: number, g255: number, b255: number): [number, number, number] {
  const srgb = [r255 / 255, g255 / 255, b255 / 255];
  const linear = srgb.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );

  const x = linear[0] * 0.4124564 + linear[1] * 0.3575761 + linear[2] * 0.1804375;
  const y = linear[0] * 0.2126729 + linear[1] * 0.7151522 + linear[2] * 0.072175;
  const z = linear[0] * 0.0193339 + linear[1] * 0.119192 + linear[2] * 0.9503041;

  const xr = x / 0.95047;
  const yr = y / 1.0;
  const zr = z / 1.08883;

  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  const f = (v: number) => (v > epsilon ? Math.cbrt(v) : (kappa * v + 16) / 116);

  const fx = f(xr);
  const fy = f(yr);
  const fz = f(zr);

  const l = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);
  return [l, a, b];
}

function pointToRgb(space: ColorSpace, point: number[]): [number, number, number] {
  if (space === "RGB") return [point[0] / 255, point[1] / 255, point[2] / 255];
  if (space === "HSV") return hsvToRgb(point[0], clamp(point[1], 0, 1), clamp(point[2], 0, 1));
  return pseudoLabToRgb(point[0], point[1], point[2]);
}

function particleChannels(space: ColorSpace, r: number, g: number, b: number): [number, number, number] {
  if (space === "RGB") return [r, g, b];
  if (space === "HSV") return rgb255ToHsv(r, g, b);
  return rgb255ToLab(r, g, b);
}

function buildParticleCloudFromPixels(
  space: ColorSpace,
  spaceData: DistributionSpaceData,
  pixelSource: PixelSource,
  maxPoints: number,
  hsvVolumeShape: DistributionViewOptions["hsvVolumeShape"]
): PointCloudData {
  const totalPixels = pixelSource.width * pixelSource.height;
  const count = Math.max(1, Math.min(Math.floor(maxPoints), totalPixels));
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const data = pixelSource.data;

  const spacing = totalPixels / count;
  for (let i = 0; i < count; i += 1) {
    const pixelIndex = Math.min(totalPixels - 1, Math.floor(i * spacing));
    const base = pixelIndex * 4;
    const r = data[base];
    const g = data[base + 1];
    const b = data[base + 2];
    const channels = particleChannels(space, r, g, b);
    const mapped = mapPointToViewSpace(
      space,
      [channels[0], channels[1], channels[2]],
      spaceData.channel_ranges,
      hsvVolumeShape
    );

    positions[i * 3] = mapped[0];
    positions[i * 3 + 1] = mapped[1];
    positions[i * 3 + 2] = mapped[2];

    colors[i * 3] = r / 255;
    colors[i * 3 + 1] = g / 255;
    colors[i * 3 + 2] = b / 255;
    scales[i] = 1;
  }

  return { positions, colors, scales, count };
}

function cholesky3(covariance: number[][]): number[][] {
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const jitter = attempt === 0 ? 0 : 1e-6 * 10 ** attempt;
    const a00 = covariance[0][0] + jitter;
    const a10 = covariance[1][0];
    const a20 = covariance[2][0];
    const a11 = covariance[1][1] + jitter;
    const a21 = covariance[2][1];
    const a22 = covariance[2][2] + jitter;

    if (a00 <= 0) continue;
    const l00 = Math.sqrt(a00);
    const l10 = a10 / l00;
    const l20 = a20 / l00;
    const d11 = a11 - l10 * l10;
    if (d11 <= 0) continue;
    const l11 = Math.sqrt(d11);
    const l21 = (a21 - l20 * l10) / l11;
    const d22 = a22 - l20 * l20 - l21 * l21;
    if (d22 <= 0) continue;
    const l22 = Math.sqrt(d22);

    return [
      [l00, 0, 0],
      [l10, l11, 0],
      [l20, l21, l22]
    ];
  }
  return [
    [0.1, 0, 0],
    [0, 0.1, 0],
    [0, 0, 0.1]
  ];
}

function buildGmmCloud(
  space: ColorSpace,
  spaceData: DistributionSpaceData,
  totalSamples: number,
  hsvVolumeShape: DistributionViewOptions["hsvVolumeShape"]
): PointCloudData | null {
  const gmm = spaceData.gmm;
  if (!gmm || gmm.n_components < 1 || gmm.weights.length === 0) return null;

  const allocations = gmm.weights.map((weight) =>
    Math.max(18, Math.floor(totalSamples * clamp(weight, 0, 1)))
  );
  const count = allocations.reduce((sum, value) => sum + value, 0);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const rng = createRng(88);

  let cursor = 0;
  for (let component = 0; component < gmm.n_components; component += 1) {
    const mean = gmm.means[component];
    const covariance = gmm.covariances[component];
    const transform = cholesky3(covariance);
    const weight = clamp(gmm.weights[component], 0.05, 1);
    const color = pointToRgb(space, mean);

    for (let i = 0; i < allocations[component]; i += 1) {
      const z0 = gaussianRandom(rng);
      const z1 = gaussianRandom(rng);
      const z2 = gaussianRandom(rng);

      const x = mean[0] + transform[0][0] * z0;
      const y = mean[1] + transform[1][0] * z0 + transform[1][1] * z1;
      const z = mean[2] + transform[2][0] * z0 + transform[2][1] * z1 + transform[2][2] * z2;

      const clamped = [
        clamp(x, spaceData.channel_ranges[0][0], spaceData.channel_ranges[0][1]),
        clamp(y, spaceData.channel_ranges[1][0], spaceData.channel_ranges[1][1]),
        clamp(z, spaceData.channel_ranges[2][0], spaceData.channel_ranges[2][1])
      ] as [number, number, number];
      const mapped = mapPointToViewSpace(space, clamped, spaceData.channel_ranges, hsvVolumeShape);

      positions[cursor * 3] = mapped[0];
      positions[cursor * 3 + 1] = mapped[1];
      positions[cursor * 3 + 2] = mapped[2];

      colors[cursor * 3] = color[0];
      colors[cursor * 3 + 1] = color[1];
      colors[cursor * 3 + 2] = color[2];
      scales[cursor] = 0.9 + weight * 1.8;
      cursor += 1;
    }
  }

  return { positions, colors, scales, count };
}

function buildAxesGeometry(
  space: ColorSpace,
  hsvVolumeShape: DistributionViewOptions["hsvVolumeShape"]
): AxisGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const addLine = (
    from: [number, number, number],
    to: [number, number, number],
    color: [number, number, number]
  ) => {
    positions.push(from[0], from[1], from[2], to[0], to[1], to[2]);
    colors.push(color[0], color[1], color[2], color[0], color[1], color[2]);
  };
  const addCircle = (y: number, radius: number, segments: number, color: [number, number, number]) => {
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      addLine(
        [Math.cos(a0) * radius, y, Math.sin(a0) * radius],
        [Math.cos(a1) * radius, y, Math.sin(a1) * radius],
        color
      );
    }
  };
  const addArrowHead = (
    tip: [number, number, number],
    back: [number, number, number],
    color: [number, number, number],
    size = 0.12
  ) => {
    const vx = tip[0] - back[0];
    const vy = tip[1] - back[1];
    const vz = tip[2] - back[2];
    const vLen = Math.max(1e-9, Math.sqrt(vx * vx + vy * vy + vz * vz));
    const ux = vx / vLen;
    const uy = vy / vLen;
    const uz = vz / vLen;

    const wx = Math.abs(uy) < 0.9 ? 0 : 1;
    const wy = Math.abs(uy) < 0.9 ? 1 : 0;
    const wz = 0;

    let px = uy * wz - uz * wy;
    let py = uz * wx - ux * wz;
    let pz = ux * wy - uy * wx;
    const pLen = Math.max(1e-9, Math.sqrt(px * px + py * py + pz * pz));
    px /= pLen;
    py /= pLen;
    pz /= pLen;

    const bx = ux * size * 1.5;
    const by = uy * size * 1.5;
    const bz = uz * size * 1.5;
    const sx = px * size;
    const sy = py * size;
    const sz = pz * size;

    addLine(tip, [tip[0] - bx + sx, tip[1] - by + sy, tip[2] - bz + sz], color);
    addLine(tip, [tip[0] - bx - sx, tip[1] - by - sy, tip[2] - bz - sz], color);
  };
  const addBox = (
    min: [number, number, number],
    max: [number, number, number],
    color: [number, number, number]
  ) => {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const p = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1]
    ] as [number, number, number][];
    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];
    for (const [a, b] of edges) {
      addLine(p[a], p[b], color);
    }
  };

  if (space === "HSV") {
    addLine([0, 0, 0], [0, 1, 0], [0.94, 0.83, 0.34]); // V
    addArrowHead([0, 1, 0], [0, 0, 0], [0.94, 0.83, 0.34], 0.08);

    // S direction on the top section (V = 1).
    addLine([0, 1, 0], [1, 1, 0], [0.36, 0.91, 0.78]);
    addArrowHead([1, 1, 0], [0, 1, 0], [0.36, 0.91, 0.78], 0.08);

    if (hsvVolumeShape === "cone") {
      addCircle(1, 1, 64, [0.39, 0.48, 0.55]);
      addCircle(0.75, 0.75, 48, [0.33, 0.42, 0.49]);
      addCircle(0.5, 0.5, 40, [0.33, 0.42, 0.49]);
      addCircle(0.25, 0.25, 32, [0.33, 0.42, 0.49]);
      for (const angle of [0, 90, 180, 270]) {
        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad);
        const z = Math.sin(rad);
        addLine([0, 0, 0], [x, 1, z], [0.34, 0.43, 0.5]);
      }
    } else {
      addCircle(0, 1, 64, [0.39, 0.48, 0.55]);
      addCircle(1, 1, 64, [0.39, 0.48, 0.55]);
      for (const angle of [0, 90, 180, 270]) {
        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad);
        const z = Math.sin(rad);
        addLine([x, 0, z], [x, 1, z], [0.34, 0.43, 0.5]);
      }
    }
  } else if (space === "RGB") {
    addLine([0, 0, 0], [1, 0, 0], [1, 0.42, 0.35]);
    addLine([0, 0, 0], [0, 1, 0], [0.32, 0.93, 0.77]);
    addLine([0, 0, 0], [0, 0, 1], [0.37, 0.61, 1]);
    addArrowHead([1, 0, 0], [0, 0, 0], [1, 0.42, 0.35], 0.08);
    addArrowHead([0, 1, 0], [0, 0, 0], [0.32, 0.93, 0.77], 0.08);
    addArrowHead([0, 0, 1], [0, 0, 0], [0.37, 0.61, 1], 0.08);
    addBox([0, 0, 0], [1, 1, 1], [0.34, 0.43, 0.5]);
  } else {
    // Lab: origin anchored at (L=0, a=0, b=0).
    addLine([0, 0, 0], [1, 0, 0], [1, 0.42, 0.35]); // L+
    addLine([0, -1, 0], [0, 1, 0], [0.32, 0.93, 0.77]); // a
    addLine([0, 0, -1], [0, 0, 1], [0.37, 0.61, 1]); // b
    addArrowHead([1, 0, 0], [0, 0, 0], [1, 0.42, 0.35], 0.08);
    addArrowHead([0, 1, 0], [0, -1, 0], [0.32, 0.93, 0.77], 0.08);
    addArrowHead([0, 0, 1], [0, 0, -1], [0.37, 0.61, 1], 0.08);
    addBox([0, -1, -1], [1, 1, 1], [0.34, 0.43, 0.5]);
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    count: positions.length / 3
  };
}

const vertexShaderSource = `
attribute vec3 aPosition;
attribute vec3 aColor;
attribute float aScale;

uniform float uYaw;
uniform float uPitch;
uniform float uDepth;
uniform float uPointSize;
uniform vec2 uPan;

varying vec3 vColor;
varying float vDepth;

void main() {
  float cy = cos(uYaw);
  float sy = sin(uYaw);
  float cx = cos(uPitch);
  float sx = sin(uPitch);

  mat3 ry = mat3(
    cy, 0.0, -sy,
    0.0, 1.0, 0.0,
    sy, 0.0, cy
  );
  mat3 rx = mat3(
    1.0, 0.0, 0.0,
    0.0, cx, -sx,
    0.0, sx, cx
  );

  vec3 world = ry * rx * aPosition;
  float z = world.z - uDepth;
  float inv = 1.0 / max(0.22, -z);
  vec2 clip = (world.xy + uPan) * inv;

  gl_Position = vec4(clip, clamp((-z) / 8.0, 0.0, 1.0) * 2.0 - 1.0, 1.0);
  gl_PointSize = uPointSize * aScale * (0.55 + inv * 1.7);
  vColor = aColor;
  vDepth = clamp((-z) / 8.0, 0.0, 1.0);
}
`;

const fragmentShaderSource = `
precision mediump float;

varying vec3 vColor;
varying float vDepth;

uniform float uAlpha;
uniform float uGlow;
uniform float uStyle;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;

  float core = exp(-r2 * (3.0 + uGlow * 2.4));
  float edge = smoothstep(1.0, 0.0, r2);
  vec3 color = vColor;

  if (uStyle > 0.5) {
    color = mix(color, vec3(0.94, 0.99, 1.0), core * 0.42);
    color += vec3(0.04, 0.08, 0.16) * (1.0 - edge);
  } else {
    color = mix(color, vec3(1.0), core * 0.2);
  }

  float alpha = uAlpha * max(edge * 0.85, core);
  alpha *= mix(0.54, 1.0, 1.0 - vDepth);
  gl_FragColor = vec4(color, alpha);
}
`;

const lineVertexShaderSource = `
attribute vec3 aPosition;
attribute vec3 aColor;

uniform float uYaw;
uniform float uPitch;
uniform float uDepth;
uniform vec2 uPan;

varying vec3 vColor;

void main() {
  float cy = cos(uYaw);
  float sy = sin(uYaw);
  float cx = cos(uPitch);
  float sx = sin(uPitch);

  mat3 ry = mat3(
    cy, 0.0, -sy,
    0.0, 1.0, 0.0,
    sy, 0.0, cy
  );
  mat3 rx = mat3(
    1.0, 0.0, 0.0,
    0.0, cx, -sx,
    0.0, sx, cx
  );

  vec3 world = ry * rx * aPosition;
  float z = world.z - uDepth;
  float inv = 1.0 / max(0.22, -z);
  vec2 clip = (world.xy + uPan) * inv;

  gl_Position = vec4(clip, clamp((-z) / 8.0, 0.0, 1.0) * 2.0 - 1.0, 1.0);
  vColor = aColor;
}
`;

const lineFragmentShaderSource = `
precision mediump float;

varying vec3 vColor;
uniform float uAlpha;

void main() {
  gl_FragColor = vec4(vColor, uAlpha);
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Impossible de creer le shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader) ?? "Erreur shader inconnue.";
    gl.deleteShader(shader);
    throw new Error(error);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Impossible de creer le programme WebGL.");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program) ?? "Erreur link programme inconnue.";
    gl.deleteProgram(program);
    throw new Error(error);
  }
  return program;
}

export default function Distribution3DView({
  space,
  spaceData,
  options,
  imageSrc,
  onToggleAxes
}: Distribution3DViewProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<CameraState>({ ...CAMERA_DEFAULT });
  const cameraTargetRef = useRef<CameraState | null>(null);
  const renderSettingsRef = useRef<RenderSettings>({
    pointSize: options.pointSize,
    pointAlpha: options.pointAlpha,
    glow: options.glow,
    shaderStyle: options.shaderStyle,
    rotationSpeed: options.rotationSpeed,
    showAxes: options.showAxes
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activePreset, setActivePreset] = useState<CameraPreset["key"] | null>(null);
  const [pixelSource, setPixelSource] = useState<PixelSource | null>(null);
  const [pixelLoading, setPixelLoading] = useState(false);
  const [pixelError, setPixelError] = useState<string | null>(null);

  useEffect(() => {
    renderSettingsRef.current = {
      pointSize: options.pointSize,
      pointAlpha: options.pointAlpha,
      glow: options.glow,
      shaderStyle: options.shaderStyle,
      rotationSpeed: options.rotationSpeed,
      showAxes: options.showAxes
    };
  }, [
    options.pointSize,
    options.pointAlpha,
    options.glow,
    options.shaderStyle,
    options.rotationSpeed,
    options.showAxes
  ]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === stageRef.current);
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    syncFullscreenState();
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (!imageSrc || options.render3DMode !== "particles") {
      setPixelSource(null);
      setPixelLoading(false);
      setPixelError(null);
      return;
    }

    let cancelled = false;
    const image = new Image();
    setPixelLoading(true);
    setPixelError(null);

    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        setPixelError("Impossible d'acceder au buffer image.");
        setPixelLoading(false);
        return;
      }
      ctx.drawImage(image, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setPixelSource({
        data: new Uint8ClampedArray(imgData.data),
        width: canvas.width,
        height: canvas.height
      });
      setPixelLoading(false);
    };

    image.onerror = () => {
      if (cancelled) return;
      setPixelError("Echec de chargement des pixels de l'image.");
      setPixelLoading(false);
    };
    image.src = imageSrc;

    return () => {
      cancelled = true;
    };
  }, [imageSrc, options.render3DMode]);

  const hasGmmError = options.render3DMode === "gmm" && !spaceData.gmm;
  const cloud = useMemo(() => {
    if (options.render3DMode === "gmm") {
      return buildGmmCloud(space, spaceData, options.gmmSamples, options.hsvVolumeShape);
    }
    if (!pixelSource) return null;
    return buildParticleCloudFromPixels(
      space,
      spaceData,
      pixelSource,
      options.maxPoints,
      options.hsvVolumeShape
    );
  }, [
    options.render3DMode,
    options.gmmSamples,
    options.maxPoints,
    options.hsvVolumeShape,
    pixelSource,
    space,
    spaceData
  ]);
  const axes = useMemo(() => buildAxesGeometry(space, options.hsvVolumeShape), [space, options.hsvVolumeShape]);
  const [xAxisLabel, yAxisLabel, zAxisLabel] = axisLegend(space, options.hsvVolumeShape);
  const toggleFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage) return;

    try {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen();
      } else {
        await stage.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen API errors (browser policy / user gesture constraints).
    }
  };
  const recenterCamera = () => {
    cameraTargetRef.current = { ...CAMERA_DEFAULT };
    setActivePreset(null);
  };
  const applyPreset = (preset: CameraPreset) => {
    cameraTargetRef.current = { ...preset.target };
    setActivePreset(preset.key);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cloud || cloud.count === 0) return;

    const gl = canvas.getContext("webgl", { antialias: true, premultipliedAlpha: false });
    if (!gl) return;

    let pointProgram: WebGLProgram | null = null;
    let lineProgram: WebGLProgram | null = null;
    try {
      pointProgram = createProgram(gl, vertexShaderSource, fragmentShaderSource);
      lineProgram = createProgram(gl, lineVertexShaderSource, lineFragmentShaderSource);
    } catch {
      if (pointProgram) gl.deleteProgram(pointProgram);
      return;
    }
    if (!pointProgram || !lineProgram) return;

    const positionBuffer = gl.createBuffer();
    const colorBuffer = gl.createBuffer();
    const scaleBuffer = gl.createBuffer();
    const axisPositionBuffer = gl.createBuffer();
    const axisColorBuffer = gl.createBuffer();
    if (!positionBuffer || !colorBuffer || !scaleBuffer || !axisPositionBuffer || !axisColorBuffer) {
      gl.deleteProgram(pointProgram);
      gl.deleteProgram(lineProgram);
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cloud.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cloud.colors, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, scaleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cloud.scales, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, axisPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, axes.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, axisColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, axes.colors, gl.STATIC_DRAW);

    const pointAPosition = gl.getAttribLocation(pointProgram, "aPosition");
    const pointAColor = gl.getAttribLocation(pointProgram, "aColor");
    const pointAScale = gl.getAttribLocation(pointProgram, "aScale");
    const pointUYaw = gl.getUniformLocation(pointProgram, "uYaw");
    const pointUPitch = gl.getUniformLocation(pointProgram, "uPitch");
    const pointUDepth = gl.getUniformLocation(pointProgram, "uDepth");
    const pointUPointSize = gl.getUniformLocation(pointProgram, "uPointSize");
    const pointUAlpha = gl.getUniformLocation(pointProgram, "uAlpha");
    const pointUGlow = gl.getUniformLocation(pointProgram, "uGlow");
    const pointUStyle = gl.getUniformLocation(pointProgram, "uStyle");

    const lineAPosition = gl.getAttribLocation(lineProgram, "aPosition");
    const lineAColor = gl.getAttribLocation(lineProgram, "aColor");
    const lineUYaw = gl.getUniformLocation(lineProgram, "uYaw");
    const lineUPitch = gl.getUniformLocation(lineProgram, "uPitch");
    const lineUDepth = gl.getUniformLocation(lineProgram, "uDepth");
    const lineUAlpha = gl.getUniformLocation(lineProgram, "uAlpha");

    gl.clearColor(0.05, 0.08, 0.1, 1);
    gl.enable(gl.DEPTH_TEST);

    let isDragging = false;
    let dragMode: CameraDragMode = "rotate";
    let activePointerId: number | null = null;
    let dragX = 0;
    let dragY = 0;
    let rafId = 0;
    let lastTime = performance.now();

    const resize = () => {
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.floor(canvas.clientWidth * ratio);
      const height = Math.floor(canvas.clientHeight * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0 && event.ctrlKey) {
        event.preventDefault();
        onToggleAxes();
        return;
      }
      if (event.button !== 0 && event.button !== 1) return;
      event.preventDefault();
      isDragging = true;
      dragMode = event.button === 1 ? "pan" : "rotate";
      setActivePreset(null);
      cameraTargetRef.current = null;
      activePointerId = event.pointerId;
      dragX = event.clientX;
      dragY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (activePointerId !== null && event.pointerId !== activePointerId) return;
      isDragging = false;
      if (activePointerId !== null && canvas.hasPointerCapture(activePointerId)) {
        canvas.releasePointerCapture(activePointerId);
      }
      activePointerId = null;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!isDragging || (activePointerId !== null && event.pointerId !== activePointerId)) return;
      const dx = event.clientX - dragX;
      const dy = event.clientY - dragY;
      dragX = event.clientX;
      dragY = event.clientY;
      const cam = cameraRef.current;
      if (dragMode === "pan") {
        const factor = cam.depth * 0.0017;
        cam.panX = clamp(cam.panX + dx * factor, -6, 6);
        cam.panY = clamp(cam.panY - dy * factor, -6, 6);
        return;
      }
      cam.yaw += dx * 0.008;
      cam.pitch = clamp(cam.pitch + dy * 0.006, -1.35, 1.35);
    };
    const onPointerCancel = (event: PointerEvent) => {
      onPointerUp(event);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const cam = cameraRef.current;
      cam.depth = clamp(cam.depth + event.deltaY * 0.0025, 1.8, 6.4);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const drawAxes = (yaw: number, pitch: number, depth: number, panX: number, panY: number) => {
      gl.useProgram(lineProgram);

      gl.bindBuffer(gl.ARRAY_BUFFER, axisPositionBuffer);
      if (lineAPosition >= 0) {
        gl.enableVertexAttribArray(lineAPosition);
        gl.vertexAttribPointer(lineAPosition, 3, gl.FLOAT, false, 0, 0);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, axisColorBuffer);
      if (lineAColor >= 0) {
        gl.enableVertexAttribArray(lineAColor);
        gl.vertexAttribPointer(lineAColor, 3, gl.FLOAT, false, 0, 0);
      }

      gl.uniform1f(lineUYaw, yaw);
      gl.uniform1f(lineUPitch, pitch);
      gl.uniform1f(lineUDepth, depth);
      if (lineUPan) gl.uniform2f(lineUPan, panX, panY);
      gl.uniform1f(lineUAlpha, 0.86);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.LINES, 0, axes.count);
    };

    const pointUPan = gl.getUniformLocation(pointProgram, "uPan");
    const lineUPan = gl.getUniformLocation(lineProgram, "uPan");

    const drawCloud = (
      yaw: number,
      pitch: number,
      depth: number,
      panX: number,
      panY: number,
      renderSettings: RenderSettings
    ) => {
      gl.useProgram(pointProgram);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      if (pointAPosition >= 0) {
        gl.enableVertexAttribArray(pointAPosition);
        gl.vertexAttribPointer(pointAPosition, 3, gl.FLOAT, false, 0, 0);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
      if (pointAColor >= 0) {
        gl.enableVertexAttribArray(pointAColor);
        gl.vertexAttribPointer(pointAColor, 3, gl.FLOAT, false, 0, 0);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, scaleBuffer);
      if (pointAScale >= 0) {
        gl.enableVertexAttribArray(pointAScale);
        gl.vertexAttribPointer(pointAScale, 1, gl.FLOAT, false, 0, 0);
      }

      gl.uniform1f(pointUYaw, yaw);
      gl.uniform1f(pointUPitch, pitch);
      gl.uniform1f(pointUDepth, depth);
      if (pointUPan) gl.uniform2f(pointUPan, panX, panY);
      gl.uniform1f(pointUPointSize, renderSettings.pointSize);
      gl.uniform1f(pointUAlpha, renderSettings.pointAlpha);
      gl.uniform1f(pointUGlow, renderSettings.glow);
      gl.uniform1f(pointUStyle, renderSettings.shaderStyle === "neon" ? 1 : 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.drawArrays(gl.POINTS, 0, cloud.count);
    };

    const render = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      resize();
      const renderSettings = renderSettingsRef.current;
      const cam = cameraRef.current;

      const target = cameraTargetRef.current;
      if (target) {
        cam.yaw += shortestAngleDelta(cam.yaw, target.yaw) * 0.2;
        cam.pitch += (target.pitch - cam.pitch) * 0.2;
        cam.depth += (target.depth - cam.depth) * 0.2;
        cam.panX += (target.panX - cam.panX) * 0.2;
        cam.panY += (target.panY - cam.panY) * 0.2;
        const done =
          Math.abs(shortestAngleDelta(cam.yaw, target.yaw)) < 1e-3 &&
          Math.abs(cam.pitch - target.pitch) < 1e-3 &&
          Math.abs(cam.depth - target.depth) < 1e-3 &&
          Math.abs(cam.panX - target.panX) < 1e-3 &&
          Math.abs(cam.panY - target.panY) < 1e-3;
        if (done) {
          cam.yaw = target.yaw;
          cam.pitch = target.pitch;
          cam.depth = target.depth;
          cam.panX = target.panX;
          cam.panY = target.panY;
          cameraTargetRef.current = null;
        }
      }

      if (!isDragging) cam.yaw += renderSettings.rotationSpeed * 0.0014 * dt;

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (renderSettings.showAxes) {
        drawAxes(cam.yaw, cam.pitch, cam.depth, cam.panX, cam.panY);
      }
      drawCloud(cam.yaw, cam.pitch, cam.depth, cam.panX, cam.panY, renderSettings);
      rafId = window.requestAnimationFrame(render);
    };
    rafId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("wheel", onWheel);
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(colorBuffer);
      gl.deleteBuffer(scaleBuffer);
      gl.deleteBuffer(axisPositionBuffer);
      gl.deleteBuffer(axisColorBuffer);
      gl.deleteProgram(pointProgram);
      gl.deleteProgram(lineProgram);
    };
  }, [axes, cloud]);

  if (hasGmmError) {
    return (
      <div className="empty-view">
        <h3>Vue 3D indisponible</h3>
        <p>Mode GMM indisponible: aucune approximation valide n'a ete calculee.</p>
      </div>
    );
  }

  if (options.render3DMode === "particles" && pixelLoading) {
    return (
      <div className="empty-view">
        <h3>Preparation de la vue 3D</h3>
        <p>Lecture des pixels en cours...</p>
      </div>
    );
  }

  if (options.render3DMode === "particles" && pixelError) {
    return (
      <div className="empty-view">
        <h3>Vue 3D indisponible</h3>
        <p>{pixelError}</p>
      </div>
    );
  }

  if (!cloud || cloud.count === 0) {
    return (
      <div className="empty-view">
        <h3>Vue 3D indisponible</h3>
        <p>Impossible de generer le nuage 3D pour cette configuration.</p>
      </div>
    );
  }

  return (
    <div ref={stageRef} className="webgl-stage">
      <canvas ref={canvasRef} className="webgl-canvas" aria-label="Visualisation 3D WebGL de la distribution couleur" />
      <div className="webgl-actions">
        <button
          type="button"
          className={`webgl-action-btn ${options.showAxes ? "active" : ""}`}
          onClick={onToggleAxes}
          title={options.showAxes ? "Masquer les axes" : "Afficher les axes"}
          aria-pressed={options.showAxes}
        >
          {options.showAxes ? "Axes: ON" : "Axes: OFF"}
        </button>
        <button type="button" className="webgl-action-btn" onClick={toggleFullscreen} title="Basculer plein ecran">
          {isFullscreen ? "Quitter plein ecran" : "Plein ecran"}
        </button>
        <button type="button" className="webgl-action-btn" onClick={recenterCamera} title="Recentrer camera">
          Recentrer
        </button>
        <div className="webgl-presets" aria-label="Positions camera predefinies">
          {CAMERA_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={`webgl-preset-btn ${activePreset === preset.key ? "active" : ""}`}
              title={preset.label}
              aria-label={preset.label}
              onClick={() => applyPreset(preset)}
            >
              {drawPresetIcon(preset.key)}
            </button>
          ))}
        </div>
      </div>
      {options.showAxes && (
        <div className="webgl-axis-tags">
          <span>X: {xAxisLabel}</span>
          <span>Y: {yAxisLabel}</span>
          <span>Z: {zAxisLabel}</span>
        </div>
      )}
      <div className="webgl-overlay">
        <span>{options.render3DMode === "gmm" ? "Mode GMM" : "Mode particules"}</span>
        <span>{cloud.count.toLocaleString("fr-FR")} points</span>
        {space === "HSV" && (
          <span>HSV: {options.hsvVolumeShape === "cone" ? "cone" : "cylindre"}</span>
        )}
        <span>Drag gauche: rotation | clic molette + drag: deplacement | molette: zoom</span>
      </div>
    </div>
  );
}
