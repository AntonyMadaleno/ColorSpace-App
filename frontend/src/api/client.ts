import type { AnalyzeOptions, AnalyzeResponse, SegmentOptions, SegmentResponse } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function parseApiError(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload
      .map((item) => {
        if (typeof item === "object" && item && "msg" in item) {
          return String(item.msg);
        }
        return JSON.stringify(item);
      })
      .join(" | ");
  }
  if (typeof payload === "object" && payload !== null && "detail" in payload) {
    const detail = (payload as Record<string, unknown>).detail;
    return parseApiError(detail);
  }
  return "Erreur inconnue du serveur.";
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: form
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(parseApiError(json));
  }
  return json as T;
}

export async function analyzeImage(
  file: File,
  options: Partial<AnalyzeOptions>
): Promise<AnalyzeResponse> {
  const payload: AnalyzeOptions = {
    sample_size: options.sample_size ?? 6000,
    histogram_bins: options.histogram_bins ?? 48,
    gmm_components: options.gmm_components ?? 4,
    gmm_sample_size: options.gmm_sample_size ?? 4500
  };

  const form = new FormData();
  form.append("file", file);
  form.append("options", JSON.stringify(payload));

  return postForm<AnalyzeResponse>("/api/analyze", form);
}

export async function segmentImage(
  file: File,
  options: SegmentOptions
): Promise<SegmentResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("options", JSON.stringify(options));
  return postForm<SegmentResponse>("/api/segment", form);
}
