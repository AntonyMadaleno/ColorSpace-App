import { useEffect, useMemo, useState } from "react";

import { analyzeImage, segmentImage } from "./api/client";
import DistributionPanel from "./components/DistributionPanel";
import DistributionView from "./components/DistributionView";
import SegmentationPanel from "./components/SegmentationPanel";
import SegmentationView from "./components/SegmentationView";
import Sidebar, { type PanelName } from "./components/Sidebar";
import UploadPanel from "./components/UploadPanel";
import type { AnalyzeResponse, DistributionViewOptions, SegmentOptions, SegmentResponse } from "./types";

const defaultDistributionOptions: DistributionViewOptions = {
  space: "RGB",
  view: "histogram",
  showAxes: true,
  hsvVolumeShape: "cylinder",
  xChannel: 0,
  yChannel: 1,
  maxPoints: 3000,
  render3DMode: "particles",
  shaderStyle: "soft",
  pointSize: 4.1,
  pointAlpha: 0.64,
  glow: 1.2,
  rotationSpeed: 0.45,
  gmmSamples: 3200
};

const defaultSegmentOptions: SegmentOptions = {
  color_space: "Lab",
  n_neighbors: 7,
  n_segments: 6,
  distance: "euclidean",
  normalize: true,
  sample_step: 4,
  channel_weights: [1, 1, 1],
  hsv_volume_shape: "cylinder"
};

export default function App() {
  const [activePanel, setActivePanel] = useState<PanelName | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [distributionOptions, setDistributionOptions] = useState<DistributionViewOptions>(defaultDistributionOptions);

  const [segmentOptions, setSegmentOptions] = useState<SegmentOptions>(defaultSegmentOptions);
  const [segmentResult, setSegmentResult] = useState<SegmentResponse | null>(null);
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [segmentError, setSegmentError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localPreview) {
        URL.revokeObjectURL(localPreview);
      }
    };
  }, [localPreview]);

  const previewImage = useMemo(() => analysis?.preview_image ?? localPreview, [analysis, localPreview]);

  useEffect(() => {
    if (!analysis) return;
    const pixelCount = analysis.metadata.pixel_count;
    if (distributionOptions.maxPoints > pixelCount) {
      setDistributionOptions((prev) => ({
        ...prev,
        maxPoints: pixelCount
      }));
    }
  }, [analysis, distributionOptions.maxPoints]);

  const handleTogglePanel = (panel: PanelName) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  const handleSelectFile = (selected: File) => {
    if (localPreview) {
      URL.revokeObjectURL(localPreview);
    }
    setFile(selected);
    setLocalPreview(URL.createObjectURL(selected));
    setAnalysis(null);
    setSegmentResult(null);
    setAnalysisError(null);
    setSegmentError(null);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    setSegmentResult(null);
    try {
      const response = await analyzeImage(file, {
        sample_size: 7000,
        histogram_bins: 48,
        gmm_components: 4,
        gmm_sample_size: 4500
      });
      setAnalysis(response);
      if (distributionOptions.space !== "RGB" && !response.distributions[distributionOptions.space]) {
        setDistributionOptions(defaultDistributionOptions);
      }
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Impossible d'analyser cette image.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleRunSegmentation = async () => {
    if (!file) return;
    setSegmentLoading(true);
    setSegmentError(null);
    try {
      const response = await segmentImage(file, segmentOptions);
      setSegmentResult(response);
    } catch (error) {
      setSegmentError(error instanceof Error ? error.message : "Echec de segmentation.");
    } finally {
      setSegmentLoading(false);
    }
  };

  const renderPanel = () => {
    if (activePanel === "upload") {
      return (
        <UploadPanel
          fileName={file?.name ?? null}
          onSelectFile={handleSelectFile}
          onAnalyze={handleAnalyze}
          loading={analysisLoading}
          error={analysisError}
          metadata={analysis?.metadata ?? null}
        />
      );
    }
    if (activePanel === "distribution") {
      return (
        <DistributionPanel
          analysis={analysis}
          options={distributionOptions}
          onChange={setDistributionOptions}
        />
      );
    }
    if (activePanel === "segmentation") {
      return (
        <SegmentationPanel
          hasFile={Boolean(file)}
          options={segmentOptions}
          onChange={setSegmentOptions}
          onRun={handleRunSegmentation}
          loading={segmentLoading}
          error={segmentError}
        />
      );
    }
    return (
      <div className="panel-content">
        <h2>Modules</h2>
        <p className="panel-subtitle">
          Les menus sont caches par defaut. Utilise la barre verticale a gauche pour ouvrir un module.
        </p>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <Sidebar activePanel={activePanel} onToggle={handleTogglePanel} />
      <aside className={`side-panel ${activePanel ? "open" : ""}`}>{renderPanel()}</aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <h1>ColorSpace Studio</h1>
            <p>Visualisation RGB/HSV/Lab et segmentation couleur KNN.</p>
          </div>
          <div className="workspace-status">
            {analysis?.metadata ? (
              <span>
                {analysis.metadata.width}x{analysis.metadata.height} - {analysis.metadata.format}
              </span>
            ) : (
              <span>Aucune image analysee</span>
            )}
          </div>
        </header>

        <section className="workspace-grid">
          <article className="image-stage">
            <h3>Image chargee</h3>
            {previewImage ? (
              <img src={previewImage} alt="Image chargee" />
            ) : (
              <div className="empty-image">Choisis un fichier depuis le module Chargement</div>
            )}
          </article>

          <article className="result-stage">
            {activePanel === "segmentation" ? (
              <SegmentationView originalImage={previewImage} result={segmentResult} />
            ) : (
              <DistributionView
                analysis={analysis}
                options={distributionOptions}
                onOptionsChange={setDistributionOptions}
              />
            )}
          </article>
        </section>
      </main>
    </div>
  );
}
