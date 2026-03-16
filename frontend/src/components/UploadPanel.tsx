import type { ChangeEvent } from "react";

import type { ImageMetadata } from "../types";

interface UploadPanelProps {
  fileName: string | null;
  onSelectFile: (file: File) => void;
  onAnalyze: () => void;
  loading: boolean;
  error: string | null;
  metadata: ImageMetadata | null;
}

export default function UploadPanel({
  fileName,
  onSelectFile,
  onAnalyze,
  loading,
  error,
  metadata
}: UploadPanelProps) {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) {
      onSelectFile(selected);
    }
    event.target.value = "";
  };

  return (
    <div className="panel-content">
      <h2>Chargement Image</h2>
      <p className="panel-subtitle">PNG, JPG/JPEG ou PPM. L'image est convertie en RGB standard.</p>

      <label className="upload-dropzone">
        <input type="file" accept=".png,.jpg,.jpeg,.ppm,image/png,image/jpeg,image/x-portable-pixmap" onChange={handleFileChange} />
        <span>{fileName ? `Fichier: ${fileName}` : "Deposer une image ou cliquer pour choisir"}</span>
      </label>
      <p className="field-help">
        Helper: ce chargement initialise le pipeline complet (metadata, conversions RGB/HSV/Lab, distributions).
      </p>

      <button className="primary-btn" onClick={onAnalyze} disabled={!fileName || loading}>
        {loading ? "Analyse en cours..." : "Analyser l'image"}
      </button>

      {error && <p className="status-error">{error}</p>}
      {metadata && (
        <div className="meta-grid">
          <div>
            <strong>Format</strong>
            <span>{metadata.format}</span>
          </div>
          <div>
            <strong>Dimensions</strong>
            <span>
              {metadata.width} x {metadata.height}
            </span>
          </div>
          <div>
            <strong>Pixels</strong>
            <span>{metadata.pixel_count.toLocaleString("fr-FR")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
