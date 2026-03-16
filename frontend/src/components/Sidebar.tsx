type PanelName = "upload" | "distribution" | "segmentation";

interface SidebarProps {
  activePanel: PanelName | null;
  onToggle: (panel: PanelName) => void;
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 16V4M12 4l-4 4M12 4l4 4M4 20h16" />
    </svg>
  );
}

function DistributionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 18V8M10 18V4M16 18v-6M22 18v-9M3 20h19" />
    </svg>
  );
}

function SegmentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="5.2" cy="7" r="2.1" />
      <circle cx="18.8" cy="7" r="2.1" />
      <circle cx="5.2" cy="17.2" r="2.1" />
      <circle cx="18.8" cy="17.2" r="2.1" />
      <path d="M9.2 10.5 6.8 8.7M14.8 10.5l2.4-1.8M9.2 13.5l-2.4 1.8M14.8 13.5l2.4 1.8" />
      <path d="M12 8.5a3.5 3.5 0 0 1 3.5 3.5" />
    </svg>
  );
}

const items = [
  { key: "upload" as const, label: "Chargement", icon: <UploadIcon /> },
  { key: "distribution" as const, label: "Distributions", icon: <DistributionIcon /> },
  { key: "segmentation" as const, label: "Segmentation", icon: <SegmentIcon /> }
];

export default function Sidebar({ activePanel, onToggle }: SidebarProps) {
  return (
    <aside className="left-rail">
      <div className="brand-dot" aria-hidden="true" />
      <nav className="rail-nav" aria-label="Modules">
        {items.map((item) => (
          <button
            key={item.key}
            className={`rail-btn ${activePanel === item.key ? "active" : ""}`}
            onClick={() => onToggle(item.key)}
            title={item.label}
            aria-label={item.label}
          >
            {item.icon}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export type { PanelName };
