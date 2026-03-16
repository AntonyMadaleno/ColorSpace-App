import type { AnalyzeResponse, DistributionViewOptions } from "../types";

interface DistributionPanelProps {
  analysis: AnalyzeResponse | null;
  options: DistributionViewOptions;
  onChange: (next: DistributionViewOptions) => void;
}

const colorSpaceHelp =
  "Helper: RGB travaille en intensites directes, HSV separe teinte/saturation/valeur, Lab approche mieux la perception humaine.";
const subsamplingHelp =
  "Helper: limite le nombre de points affiches pour conserver la fluidite. Plus faible = plus detail, plus lent.";
const shaderHelp =
  "Helper: le shader controle la taille, l'energie lumineuse et l'opacite des points pour rendre la densite lisible.";

export default function DistributionPanel({ analysis, options, onChange }: DistributionPanelProps) {
  const spaceData = analysis?.distributions[options.space];
  const channelNames = spaceData?.channels.map((channel) => channel.name) ?? ["C1", "C2", "C3"];
  const pixelCount = analysis?.metadata.pixel_count ?? options.maxPoints;
  const particleMax = Math.max(1, pixelCount);
  const particleStep = particleMax > 200000 ? 500 : particleMax > 60000 ? 100 : 10;
  const isHsvScatter = options.view === "scatter" && options.space === "HSV";

  return (
    <div className="panel-content">
      <h2>Distributions Couleur</h2>
      <p className="panel-subtitle">Explore les distributions en RGB, HSV et Lab.</p>

      <label className="field-block">
        <span>Espace couleur</span>
        <select
          className="control-select"
          value={options.space}
          onChange={(event) =>
            onChange({
              ...options,
              space: event.target.value as DistributionViewOptions["space"],
              xChannel: 0,
              yChannel: 1
            })
          }
        >
          <option value="RGB">RGB</option>
          <option value="HSV">HSV</option>
          <option value="Lab">Lab</option>
        </select>
        <small>{colorSpaceHelp}</small>
      </label>

      <label className="field-block">
        <span>Type de visualisation</span>
        <select
          className="control-select"
          value={options.view}
          onChange={(event) =>
            onChange({
              ...options,
              view: event.target.value as DistributionViewOptions["view"]
            })
          }
        >
          <option value="histogram">Histogramme</option>
          <option value="scatter">Projection 2D (nuage)</option>
          <option value="webgl3d">Vue 3D WebGL</option>
        </select>
        <small>Helper: histogramme = densite par canal, projection 2D = relation bi-canal, WebGL 3D = distribution complete.</small>
      </label>

      {options.view === "scatter" && (
        <>
          {!isHsvScatter && (
            <>
              <label className="field-block">
                <span>Axe X</span>
                <select
                  className="control-select"
                  value={options.xChannel}
                  onChange={(event) => onChange({ ...options, xChannel: Number(event.target.value) })}
                >
                  {channelNames.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-block">
                <span>Axe Y</span>
                <select
                  className="control-select"
                  value={options.yChannel}
                  onChange={(event) => onChange({ ...options, yChannel: Number(event.target.value) })}
                >
                  {channelNames.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
                <small>Helper: choisis les composantes affichees pour la projection.</small>
              </label>
            </>
          )}

          {isHsvScatter && (
            <p className="status-info">
              Projection HSV en vue cylindrique: H = angle, S = rayon et V est encodee par la luminosite.
            </p>
          )}

          <label className="field-block">
            <span>Sous-echantillonnage visuel</span>
            <input
              className="control-range"
              type="range"
              min={400}
              max={12000}
              step={200}
              value={options.maxPoints}
              onChange={(event) => onChange({ ...options, maxPoints: Number(event.target.value) })}
            />
            <small>{subsamplingHelp}</small>
          </label>
        </>
      )}

      {options.view === "webgl3d" && (
        <>
          {options.space === "HSV" && (
            <label className="field-block">
              <span>Volume HSV</span>
              <select
                className="control-select"
                value={options.hsvVolumeShape}
                onChange={(event) =>
                  onChange({
                    ...options,
                    hsvVolumeShape: event.target.value as DistributionViewOptions["hsvVolumeShape"]
                  })
                }
              >
                <option value="cylinder">Cylindre</option>
                <option value="cone">Cone (rayon depend de V)</option>
              </select>
              <small>
                Helper: en mode cone, le rayon vaut S*V. A V=0, tous les points convergent vers le noir.
              </small>
            </label>
          )}

          <label className="field-block">
            <span>Mode rendu 3D</span>
            <select
              className="control-select"
              value={options.render3DMode}
              onChange={(event) =>
                onChange({
                  ...options,
                  render3DMode: event.target.value as DistributionViewOptions["render3DMode"]
                })
              }
            >
              <option value="particles">Particules pixels</option>
              <option value="gmm">Approximation GMM</option>
            </select>
            <small>Helper: "Particules" affiche les pixels echantillonnes; "GMM" affiche une approximation gaussienne du volume couleur.</small>
          </label>

          <label className="field-block">
            <span>Style shader</span>
            <select
              className="control-select"
              value={options.shaderStyle}
              onChange={(event) =>
                onChange({
                  ...options,
                  shaderStyle: event.target.value as DistributionViewOptions["shaderStyle"]
                })
              }
            >
              <option value="soft">Soft volumetrique</option>
              <option value="neon">Neon dense</option>
            </select>
            <small>{shaderHelp}</small>
          </label>

          <label className="field-block">
            <span>Taille particules: {options.pointSize.toFixed(1)}</span>
            <input
              className="control-range"
              type="range"
              min={1}
              max={10}
              step={0.2}
              value={options.pointSize}
              onChange={(event) => onChange({ ...options, pointSize: Number(event.target.value) })}
            />
          </label>

          <label className="field-block">
            <span>Opacite: {options.pointAlpha.toFixed(2)}</span>
            <input
              className="control-range"
              type="range"
              min={0.2}
              max={1}
              step={0.02}
              value={options.pointAlpha}
              onChange={(event) => onChange({ ...options, pointAlpha: Number(event.target.value) })}
            />
          </label>

          <label className="field-block">
            <span>Intensite glow: {options.glow.toFixed(2)}</span>
            <input
              className="control-range"
              type="range"
              min={0.2}
              max={3.5}
              step={0.1}
              value={options.glow}
              onChange={(event) => onChange({ ...options, glow: Number(event.target.value) })}
            />
          </label>

          <label className="field-block">
            <span>Rotation auto: {options.rotationSpeed.toFixed(2)}</span>
            <input
              className="control-range"
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={options.rotationSpeed}
              onChange={(event) => onChange({ ...options, rotationSpeed: Number(event.target.value) })}
            />
            <small>Helper: 0 desactive la rotation automatique. Tu peux toujours tourner a la souris.</small>
          </label>

          {options.render3DMode === "particles" ? (
            <label className="field-block">
              <span>
                Nombre max de particules: {Math.min(options.maxPoints, particleMax).toLocaleString("fr-FR")}
              </span>
              <input
                className="control-range"
                type="range"
                min={1}
                max={particleMax}
                step={particleStep}
                value={Math.min(options.maxPoints, particleMax)}
                onChange={(event) =>
                  onChange({
                    ...options,
                    maxPoints: Math.min(Number(event.target.value), particleMax)
                  })
                }
              />
              <small>
                {subsamplingHelp} Maximum possible = nombre de pixels de l'image ({particleMax.toLocaleString("fr-FR")}).
              </small>
            </label>
          ) : (
            <label className="field-block">
              <span>Densite points GMM: {options.gmmSamples}</span>
              <input
                className="control-range"
                type="range"
                min={700}
                max={12000}
                step={100}
                value={options.gmmSamples}
                onChange={(event) => onChange({ ...options, gmmSamples: Number(event.target.value) })}
              />
              <small>Helper: augmente la densite du nuage genere a partir des composantes gaussiennes.</small>
            </label>
          )}
        </>
      )}

      {!analysis && (
        <p className="status-info">
          Charge puis analyse une image pour afficher les distributions.
        </p>
      )}
    </div>
  );
}
