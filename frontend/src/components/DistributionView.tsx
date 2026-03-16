import type {
  AnalyzeResponse,
  ChannelDistribution,
  ColorSpace,
  DistributionViewOptions
} from "../types";
import Distribution3DView from "./Distribution3DView";

interface DistributionViewProps {
  analysis: AnalyzeResponse | null;
  options: DistributionViewOptions;
  onOptionsChange: (next: DistributionViewOptions) => void;
}

function channelColor(space: ColorSpace, channelName: string): string {
  if (space === "RGB") {
    if (channelName === "R") return "#ff6f59";
    if (channelName === "G") return "#2a9d8f";
    return "#3f88c5";
  }
  if (space === "HSV") {
    if (channelName === "H") return "#f4a261";
    if (channelName === "S") return "#2a9d8f";
    return "#e9c46a";
  }
  if (channelName === "L") return "#e9c46a";
  if (channelName === "a") return "#f28482";
  return "#84a59d";
}

function pointColor(space: ColorSpace, point: number[]): string {
  if (space === "RGB") {
    const [r, g, b] = point;
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }
  if (space === "HSV") {
    const [h, s, v] = point;
    return `hsl(${h.toFixed(0)} ${Math.max(20, s * 100).toFixed(0)}% ${Math.max(25, v * 60).toFixed(0)}%)`;
  }
  const [l, a, b] = point;
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const lightness = Math.min(90, Math.max(20, l));
  return `hsl(${hue.toFixed(0)} 55% ${lightness.toFixed(0)}%)`;
}

function normalize(value: number, min: number, max: number): number {
  if (max - min < 1e-8) {
    return 0.5;
  }
  return (value - min) / (max - min);
}

function formatAxisValue(value: number): string {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function ChannelHistogram({
  channel,
  fill,
  showAxes,
  arrowId
}: {
  channel: ChannelDistribution;
  fill: string;
  showAxes: boolean;
  arrowId: string;
}) {
  const width = 252;
  const height = 176;
  const margin = { left: 38, right: 10, top: 10, bottom: 32 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const maxCount = Math.max(...channel.counts, 1);
  const barCount = Math.max(1, channel.counts.length);
  const barWidth = plotWidth / barCount;
  const xMin = channel.bin_edges[0] ?? 0;
  const xMax = channel.bin_edges[channel.bin_edges.length - 1] ?? 1;
  const yFractions = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="hist-svg"
      role="img"
      aria-label={`Histogramme du canal ${channel.name}`}
    >
      {showAxes && (
        <defs>
          <marker
            id={arrowId}
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={5}
            markerHeight={5}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="axis-arrow-head" />
          </marker>
        </defs>
      )}
      <rect x={0} y={0} width={width} height={height} rx={10} />
      {showAxes &&
        yFractions.map((fraction) => {
          const y = margin.top + plotHeight - fraction * plotHeight;
          const tick = Math.round(maxCount * fraction);
          return (
            <g key={`y-${fraction.toFixed(2)}`}>
              <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} className="axis-grid-line" />
              <text x={margin.left - 6} y={y + 4} textAnchor="end">
                {tick.toLocaleString("fr-FR")}
              </text>
            </g>
          );
        })}

      {channel.counts.map((count, idx) => {
        const heightRatio = count / maxCount;
        const h = Math.max(1, plotHeight * heightRatio);
        const x = margin.left + idx * barWidth + 0.35;
        const y = margin.top + plotHeight - h;
        return (
          <rect
            key={idx}
            x={x}
            y={y}
            width={Math.max(1, barWidth - 0.7)}
            height={h}
            fill={fill}
            opacity={0.92}
            rx={1}
          />
        );
      })}

      {showAxes && (
        <>
          <line
            x1={margin.left}
            y1={height - margin.bottom}
            x2={margin.left}
            y2={margin.top}
            className="axis-line"
            markerEnd={`url(#${arrowId})`}
          />
          <line
            x1={margin.left}
            y1={height - margin.bottom}
            x2={width - margin.right}
            y2={height - margin.bottom}
            className="axis-line"
            markerEnd={`url(#${arrowId})`}
          />

          <text x={margin.left} y={height - 10} textAnchor="start">
            {formatAxisValue(xMin)}
          </text>
          <text x={margin.left + plotWidth / 2} y={height - 10} textAnchor="middle">
            {formatAxisValue((xMin + xMax) * 0.5)}
          </text>
          <text x={width - margin.right} y={height - 10} textAnchor="end">
            {formatAxisValue(xMax)}
          </text>
          <text
            x={13}
            y={margin.top + plotHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 13 ${margin.top + plotHeight / 2})`}
          >
            pixels
          </text>
          <text x={margin.left + plotWidth / 2} y={height - 2} textAnchor="middle">
            {channel.name}
          </text>
        </>
      )}
    </svg>
  );
}

export default function DistributionView({ analysis, options, onOptionsChange }: DistributionViewProps) {
  if (!analysis) {
    return (
      <div className="empty-view">
        <h3>Analyse couleur</h3>
        <p>Charge une image puis lance l'analyse pour debloquer les vues RGB, HSV et Lab.</p>
      </div>
    );
  }

  const spaceData = analysis.distributions[options.space];
  if (!spaceData) {
    return (
      <div className="empty-view">
        <h3>Espace indisponible</h3>
      </div>
    );
  }

  const axisX = Math.max(0, Math.min(2, options.xChannel));
  const axisY = Math.max(0, Math.min(2, options.yChannel));

  if (options.view === "webgl3d") {
    return (
      <section className="view-card">
        <div className="view-header">
          <h3>Nuage 3D WebGL - {options.space}</h3>
          <span>{options.render3DMode === "gmm" ? "Approximation GMM" : "Particules pixels"}</span>
        </div>
        <Distribution3DView
          space={options.space}
          spaceData={spaceData}
          options={options}
          imageSrc={analysis.preview_image}
          onToggleAxes={() => onOptionsChange({ ...options, showAxes: !options.showAxes })}
        />
      </section>
    );
  }

  if (options.view === "scatter") {
    const points = spaceData.points.slice(0, options.maxPoints);
    const width = 760;

    if (options.space === "HSV") {
      const height = 420;
      const centerX = width * 0.5;
      const centerY = height * 0.5;
      const radius = Math.min(width, height) * 0.5 - 56;
      const ringFractions = [0.25, 0.5, 0.75, 1];
      const spokeAngles = Array.from({ length: 12 }, (_, idx) => idx * 30);
      const cardinalAngles = [0, 90, 180, 270];

      return (
        <section className="view-card">
          <div className="view-header">
            <h3>Projection HSV cylindrique (H angle, S rayon)</h3>
            <span>{points.length.toLocaleString("fr-FR")} points - V porte la luminosite</span>
          </div>
          <svg viewBox={`0 0 ${width} ${height}`} className="scatter-svg" role="img" aria-label="Projection cylindrique HSV">
            {options.showAxes && (
              <defs>
                <marker
                  id="scatter-hsv-axis-arrow"
                  viewBox="0 0 10 10"
                  refX={9}
                  refY={5}
                  markerWidth={5}
                  markerHeight={5}
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" className="axis-arrow-head" />
                </marker>
              </defs>
            )}
            <rect x={0} y={0} width={width} height={height} rx={12} />
            {options.showAxes &&
              ringFractions.map((fraction) => (
                <circle
                  key={`ring-${fraction.toFixed(2)}`}
                  cx={centerX}
                  cy={centerY}
                  r={radius * fraction}
                  className="axis-grid-ring"
                />
              ))}
            {options.showAxes &&
              spokeAngles.map((angle) => {
                const rad = (angle * Math.PI) / 180;
                const x = centerX + radius * Math.cos(rad);
                const y = centerY - radius * Math.sin(rad);
                return <line key={`spoke-${angle}`} x1={centerX} y1={centerY} x2={x} y2={y} className="axis-grid-line" />;
              })}
            {options.showAxes && (
              <>
                <line
                  x1={centerX}
                  y1={centerY}
                  x2={centerX + radius}
                  y2={centerY}
                  className="axis-line"
                  markerEnd="url(#scatter-hsv-axis-arrow)"
                />
                <line
                  x1={centerX}
                  y1={centerY}
                  x2={centerX}
                  y2={centerY - radius}
                  className="axis-line"
                  markerEnd="url(#scatter-hsv-axis-arrow)"
                />
              </>
            )}

            {points.map((point, index) => {
              const h = point[0];
              const s = Math.max(0, Math.min(1, point[1]));
              const angle = (h * Math.PI) / 180;
              const x = centerX + Math.cos(angle) * radius * s;
              const y = centerY - Math.sin(angle) * radius * s;
              return (
                <circle
                  key={`${index}-${point[0].toFixed(2)}-${point[1].toFixed(2)}`}
                  cx={x}
                  cy={y}
                  r={1.8}
                  fill={pointColor(options.space, point)}
                  opacity={0.76}
                />
              );
            })}

            {options.showAxes &&
              cardinalAngles.map((angle) => {
                const rad = (angle * Math.PI) / 180;
                const x = centerX + (radius + 16) * Math.cos(rad);
                const y = centerY - (radius + 16) * Math.sin(rad);
                return (
                  <text key={`card-${angle}`} x={x} y={y + 4} textAnchor="middle">
                    {angle}deg
                  </text>
                );
              })}

            {options.showAxes && (
              <>
                <text x={centerX} y={centerY + 4} textAnchor="middle">
                  S=0
                </text>
                <text x={centerX + radius - 8} y={centerY - 6} textAnchor="end">
                  S=1
                </text>
              </>
            )}
          </svg>
        </section>
      );
    }

    const height = 410;
    const margin = { left: 56, right: 18, top: 16, bottom: 44 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const [xMin, xMax] = spaceData.channel_ranges[axisX];
    const [yMin, yMax] = spaceData.channel_ranges[axisY];
    const tickFractions = [0, 0.25, 0.5, 0.75, 1];

    return (
      <section className="view-card">
        <div className="view-header">
          <h3>
            Projection {options.space} ({spaceData.channels[axisX].name} vs {spaceData.channels[axisY].name})
          </h3>
          <span>{points.length.toLocaleString("fr-FR")} points</span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="scatter-svg" role="img" aria-label="Nuage de points couleur">
          {options.showAxes && (
            <defs>
              <marker
                id="scatter-axis-arrow"
                viewBox="0 0 10 10"
                refX={9}
                refY={5}
                markerWidth={5}
                markerHeight={5}
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="axis-arrow-head" />
              </marker>
            </defs>
          )}
          <rect x={0} y={0} width={width} height={height} rx={12} />

          {options.showAxes &&
            tickFractions.map((fraction) => {
              const x = margin.left + fraction * plotWidth;
              const y = margin.top + (1 - fraction) * plotHeight;
              const xValue = xMin + fraction * (xMax - xMin);
              const yValue = yMin + fraction * (yMax - yMin);
              return (
                <g key={`tick-${fraction.toFixed(2)}`}>
                  <line x1={x} y1={margin.top} x2={x} y2={height - margin.bottom} className="axis-grid-line" />
                  <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} className="axis-grid-line" />
                  <text x={x} y={height - margin.bottom + 16} textAnchor="middle">
                    {formatAxisValue(xValue)}
                  </text>
                  <text x={margin.left - 7} y={y + 4} textAnchor="end">
                    {formatAxisValue(yValue)}
                  </text>
                </g>
              );
            })}

          {options.showAxes && (
            <>
              <line
                x1={margin.left}
                y1={height - margin.bottom}
                x2={margin.left}
                y2={margin.top}
                className="axis-line"
                markerEnd="url(#scatter-axis-arrow)"
              />
              <line
                x1={margin.left}
                y1={height - margin.bottom}
                x2={width - margin.right}
                y2={height - margin.bottom}
                className="axis-line"
                markerEnd="url(#scatter-axis-arrow)"
              />
            </>
          )}

          {points.map((point, index) => {
            const x = normalize(point[axisX], xMin, xMax) * plotWidth + margin.left;
            const y = margin.top + (1 - normalize(point[axisY], yMin, yMax)) * plotHeight;
            return (
              <circle
                key={`${index}-${point[0].toFixed(2)}-${point[1].toFixed(2)}`}
                cx={x}
                cy={y}
                r={1.7}
                fill={pointColor(options.space, point)}
                opacity={0.72}
              />
            );
          })}

          {options.showAxes && (
            <>
              <text x={margin.left + plotWidth / 2} y={height - 8} textAnchor="middle">
                {spaceData.channels[axisX].name}
              </text>
              <text
                x={16}
                y={margin.top + plotHeight / 2}
                textAnchor="middle"
                transform={`rotate(-90 16 ${margin.top + plotHeight / 2})`}
              >
                {spaceData.channels[axisY].name}
              </text>
            </>
          )}
        </svg>
      </section>
    );
  }

  return (
    <section className="view-card">
      <div className="view-header">
        <h3>Histogrammes {options.space}</h3>
      </div>
      <div className="hist-grid">
        {spaceData.channels.map((channel, channelIndex) => {
          const fill = channelColor(options.space, channel.name);
          return (
            <article key={channel.name} className="hist-card">
              <header>
                <strong>{channel.name}</strong>
                <span>
                  moyenne {spaceData.mean[channelIndex].toFixed(2)}
                </span>
              </header>
              <ChannelHistogram
                channel={channel}
                fill={fill}
                showAxes={options.showAxes}
                arrowId={`hist-axis-arrow-${channel.name}`}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
