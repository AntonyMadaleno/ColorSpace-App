export type ColorSpace = "RGB" | "HSV" | "Lab";
export type DistanceMetric = "euclidean" | "manhattan" | "chebyshev" | "minkowski";

export interface ImageMetadata {
  filename: string;
  format: string;
  width: number;
  height: number;
  pixel_count: number;
}

export interface ChannelDistribution {
  name: string;
  counts: number[];
  bin_edges: number[];
}

export interface DistributionSpaceData {
  channels: ChannelDistribution[];
  points: number[][];
  channel_ranges: [number, number][];
  mean: number[];
  std: number[];
  gmm: GmmModel | null;
}

export interface GmmModel {
  n_components: number;
  sample_count: number;
  weights: number[];
  means: number[][];
  covariances: number[][][];
  converged: boolean;
  lower_bound: number;
}

export interface AnalyzeOptions {
  sample_size: number;
  histogram_bins: number;
  gmm_components: number;
  gmm_sample_size: number;
}

export interface AnalyzeResponse {
  metadata: ImageMetadata;
  preview_image: string;
  distributions: Record<ColorSpace, DistributionSpaceData>;
  options_used: AnalyzeOptions;
}

export interface SegmentOptions {
  color_space: ColorSpace;
  n_neighbors: number;
  n_segments: number;
  distance: DistanceMetric;
  normalize: boolean;
  sample_step: number;
  channel_weights: [number, number, number];
  hsv_volume_shape: "cylinder" | "cone";
}

export interface SegmentLabelStat {
  label: number;
  pixel_count: number;
  ratio: number;
  mean_rgb: [number, number, number];
}

export interface SegmentClusterCentroid {
  label: number;
  point: [number, number, number];
  pixel_count: number;
}

export interface SegmentResponse {
  metadata: ImageMetadata;
  segmented_image: string;
  label_map_image: string;
  label_index_image: string;
  label_stats: SegmentLabelStat[];
  cluster_points_by_space: Record<ColorSpace, [number, number, number, number][]>;
  cluster_centroids_by_space: Record<ColorSpace, SegmentClusterCentroid[]>;
  channel_names_by_space: Record<ColorSpace, [string, string, string]>;
  channel_ranges_by_space: Record<ColorSpace, [number, number][]>;
  used_options: SegmentOptions & {
    training_points: number;
    scaler: "standard" | "none";
    hue_cyclic?: boolean;
  };
}

export interface DistributionViewOptions {
  space: ColorSpace;
  view: "histogram" | "scatter" | "webgl3d";
  showAxes: boolean;
  hsvVolumeShape: "cylinder" | "cone";
  xChannel: number;
  yChannel: number;
  maxPoints: number;
  render3DMode: "particles" | "gmm";
  shaderStyle: "soft" | "neon";
  pointSize: number;
  pointAlpha: number;
  glow: number;
  rotationSpeed: number;
  gmmSamples: number;
}
