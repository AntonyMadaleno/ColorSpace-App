import type { SegmentOptions } from "../types";

interface SegmentationPanelProps {
  hasFile: boolean;
  options: SegmentOptions;
  onChange: (next: SegmentOptions) => void;
  onRun: () => void;
  loading: boolean;
  error: string | null;
}

export default function SegmentationPanel({
  hasFile,
  options,
  onChange,
  onRun,
  loading,
  error
}: SegmentationPanelProps) {
  const channelNames =
    options.color_space === "RGB"
      ? ["R", "G", "B"]
      : options.color_space === "HSV"
        ? ["H", "S", "V"]
        : ["L", "a", "b"];
  const setWeight = (index: 0 | 1 | 2, value: number) => {
    const nextWeights: [number, number, number] = [...options.channel_weights] as [number, number, number];
    nextWeights[index] = value;
    onChange({ ...options, channel_weights: nextWeights });
  };

  return (
    <div className="panel-content">
      <h2>Segmentation KNN</h2>
      <p className="panel-subtitle">Classe les pixels par similarite couleur dans l'espace choisi.</p>

      <label className="field-block">
        <span>Espace couleur</span>
        <select
          className="control-select"
          value={options.color_space}
          onChange={(event) =>
            onChange({
              ...options,
              color_space: event.target.value as SegmentOptions["color_space"],
              channel_weights: [1, 1, 1],
              hsv_volume_shape: "cylinder"
            })
          }
        >
          <option value="RGB">RGB</option>
          <option value="HSV">HSV</option>
          <option value="Lab">Lab</option>
        </select>
        <small>Helper: l'espace couleur influence fortement la notion de "proximite" entre pixels.</small>
      </label>

      {options.color_space === "HSV" && (
        <label className="field-block">
          <span>Volume HSV pour KNN</span>
          <select
            className="control-select"
            value={options.hsv_volume_shape}
            onChange={(event) =>
              onChange({
                ...options,
                hsv_volume_shape: event.target.value as SegmentOptions["hsv_volume_shape"]
              })
            }
          >
            <option value="cylinder">Cylindre (S radial)</option>
            <option value="cone">Cone (S*V radial)</option>
          </select>
          <small>
            Helper: ce choix change la geometrie HSV utilisee pour les distances KNN, donc impacte directement la classification.
          </small>
        </label>
      )}

      <label className="field-block">
        <span>k (nombre de voisins): {options.n_neighbors}</span>
        <input
          className="control-range"
          type="range"
          min={1}
          max={25}
          value={options.n_neighbors}
          onChange={(event) => onChange({ ...options, n_neighbors: Number(event.target.value) })}
        />
        <small>Helper: plus k est grand, plus la segmentation est lisse mais moins locale.</small>
      </label>

      <label className="field-block">
        <span>Nombre de segments: {options.n_segments}</span>
        <input
          className="control-range"
          type="range"
          min={2}
          max={20}
          value={options.n_segments}
          onChange={(event) => onChange({ ...options, n_segments: Number(event.target.value) })}
        />
        <small>Helper: fixe la granularite finale de la segmentation.</small>
      </label>

      <label className="field-block">
        <span>Distance</span>
        <select
          className="control-select"
          value={options.distance}
          onChange={(event) => onChange({ ...options, distance: event.target.value as SegmentOptions["distance"] })}
        >
          <option value="euclidean">Euclidienne</option>
          <option value="manhattan">Manhattan</option>
          <option value="chebyshev">Chebyshev</option>
          <option value="minkowski">Minkowski</option>
        </select>
        <small>Helper: la distance mesure la similarite entre deux couleurs.</small>
      </label>

      <label className="field-block field-inline">
        <input
          className="control-checkbox"
          type="checkbox"
          checked={options.normalize}
          onChange={(event) => onChange({ ...options, normalize: event.target.checked })}
        />
        <span>Normaliser les composantes</span>
      </label>
      <p className="field-help">
        Helper: evite qu'un canal avec une grande plage de valeurs domine artificiellement le calcul.
      </p>

      <div className="field-block">
        <span>Poids des dimensions ({options.color_space})</span>
        <small>
          Helper: les poids sont appliques apres normalisation. En HSV, H est cyclique (0.8 vs 0.2 donne 0.4 et pas 0.6).
        </small>
      </div>
      <label className="field-block">
        <span>{channelNames[0]}: {options.channel_weights[0].toFixed(2)}</span>
        <input
          className="control-range"
          type="range"
          min={0}
          max={4}
          step={0.05}
          value={options.channel_weights[0]}
          onChange={(event) => setWeight(0, Number(event.target.value))}
        />
      </label>
      <label className="field-block">
        <span>{channelNames[1]}: {options.channel_weights[1].toFixed(2)}</span>
        <input
          className="control-range"
          type="range"
          min={0}
          max={4}
          step={0.05}
          value={options.channel_weights[1]}
          onChange={(event) => setWeight(1, Number(event.target.value))}
        />
      </label>
      <label className="field-block">
        <span>{channelNames[2]}: {options.channel_weights[2].toFixed(2)}</span>
        <input
          className="control-range"
          type="range"
          min={0}
          max={4}
          step={0.05}
          value={options.channel_weights[2]}
          onChange={(event) => setWeight(2, Number(event.target.value))}
        />
      </label>

      <label className="field-block">
        <span>Sous-echantillonnage d'apprentissage: 1/{options.sample_step}</span>
        <input
          className="control-range"
          type="range"
          min={1}
          max={20}
          value={options.sample_step}
          onChange={(event) => onChange({ ...options, sample_step: Number(event.target.value) })}
        />
        <small>Helper: accelere l'apprentissage KNN, avec une possible perte de precision locale.</small>
      </label>

      <button className="primary-btn" disabled={!hasFile || loading} onClick={onRun}>
        {loading ? "Segmentation en cours..." : "Lancer la segmentation"}
      </button>

      {error && <p className="status-error">{error}</p>}
      {!hasFile && <p className="status-info">Charge une image dans le module upload pour activer la segmentation.</p>}
    </div>
  );
}
