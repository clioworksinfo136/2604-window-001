import { useEffect, useRef, useState } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";

type Location = Schema["Location"]["type"];
type Phase = Schema["Phase"]["type"];
type Project = Schema["Project"]["type"];

/** Single top-left panel holding the Location, Task, and Search controls. */
function ControlPanel({
  onCreateLocation,
  picking = false,
  onPlace,
  onClear,
  locations,
}: {
  onCreateLocation: () => void;
  picking?: boolean;
  onPlace: (loc: google.maps.LatLngLiteral) => void;
  onClear: () => void;
  locations: Location[];
}) {
  const map = useMap();
  const placesLib = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Phase list and all projects feed the summary table below the controls.
  useEffect(() => {
    const sub = client.models.Phase.observeQuery().subscribe({
      next: ({ items }) =>
        setPhases(
          [...items].sort((a, b) => (a.phaseid ?? 0) - (b.phaseid ?? 0))
        ),
      error: () => setPhases([]),
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = client.models.Project.observeQuery().subscribe({
      next: ({ items }) => setProjects([...items]),
      error: () => setProjects([]),
    });
    return () => sub.unsubscribe();
  }, []);

  // Panel position; null means "use the default top-left CSS offsets".
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  function handleDragStart(e: React.PointerEvent<HTMLDivElement>) {
    // Don't start a drag from an interactive element inside the handle.
    if ((e.target as HTMLElement).closest("button, input")) return;
    const panel = e.currentTarget.parentElement as HTMLElement;
    const rect = panel.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    setPos({
      x: e.clientX - dragRef.current.dx,
      y: e.clientY - dragRef.current.dy,
    });
  }

  function handleDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  // Keep the latest map/callback available to the single place_changed listener.
  const mapRef = useRef(map);
  mapRef.current = map;
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ["geometry", "name", "formatted_address"],
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const location = autocomplete.getPlace().geometry?.location;
      if (!location) return;
      const latLng = { lat: location.lat(), lng: location.lng() };
      onPlaceRef.current(latLng);
      const m = mapRef.current;
      if (m) {
        m.panTo(latLng);
        m.setZoom(16);
      }
    });

    return () => {
      listener.remove();
      google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, [placesLib]);

  function handleClear() {
    if (inputRef.current) inputRef.current.value = "";
    onClear();
    inputRef.current?.focus();
  }

  // Points (locations) that currently exist on the map.
  const pointIds = new Set(
    locations.map((l) => l.locationid).filter((v): v is number => v != null)
  );

  /** How many points have at least one project in this phase. */
  function pointsInPhase(phaseName: string) {
    const ids = new Set<number>();
    for (const p of projects) {
      if (
        p.phase === phaseName &&
        p.locationid != null &&
        pointIds.has(p.locationid)
      ) {
        ids.add(p.locationid);
      }
    }
    return ids.size;
  }

  const pointsWithProjects = new Set(
    projects.map((p) => p.locationid).filter((v): v is number => v != null)
  );
  const unassignedCount = [...pointIds].filter(
    (id) => !pointsWithProjects.has(id)
  ).length;

  return (
    <div
      style={{
        position: "fixed",
        ...(pos
          ? { left: pos.x, top: pos.y }
          : { top: 60, left: 16 }),
        zIndex: 2,
        maxWidth: 320,
        padding: 8,
        background: "rgba(255, 255, 255, 0.95)",
        borderRadius: 12,
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.25)",
        textAlign: "left",
      }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 16,
          marginBottom: 6,
          cursor: "grab",
          touchAction: "none",
        }}
        title="Drag to move"
      >
        <div
          style={{
            width: 32,
            height: 4,
            borderRadius: 2,
            background: "#c4c4c8",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <IconButton
          title={picking ? "Click the map to place location" : "Add location"}
          onClick={onCreateLocation}
          active={picking}
        >
          <LocationIcon />
        </IconButton>
        <IconButton
          title="Search"
          onClick={() => {
            setSearchOpen((v) => !v);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <SearchIcon />
        </IconButton>
        <IconButton
          title="Phase summary"
          onClick={() => setSummaryOpen((v) => !v)}
          active={summaryOpen}
        >
          <SummaryIcon />
        </IconButton>
      </div>

      {/* Input stays mounted so autocomplete binds once; hidden when closed. */}
      <div
        style={{
          display: searchOpen ? "flex" : "none",
          alignItems: "center",
          marginTop: 8,
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          padding: "2px 2px 2px 10px",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Search an address"
          style={{
            border: "none",
            outline: "none",
            fontSize: "1rem",
            width: 220,
            background: "transparent",
          }}
        />
        <IconButton title="Clear" onClick={handleClear}>
          <CloseIcon />
        </IconButton>
      </div>

      {summaryOpen && locations.length > 0 && (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: 10,
            fontSize: "0.82rem",
          }}
        >
          <thead>
            <tr>
              <th style={sumHead}>Phase</th>
              <th style={{ ...sumHead, textAlign: "right", width: 54 }}>
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {phases.map((ph) => (
              <tr key={ph.id}>
                <td style={sumCell}>{ph.phase}</td>
                <td style={{ ...sumCell, textAlign: "right" }}>
                  {pointsInPhase(ph.phase ?? "")}
                </td>
              </tr>
            ))}
            {unassignedCount > 0 && (
              <tr>
                <td style={{ ...sumCell, color: "#888" }}>No project</td>
                <td style={{ ...sumCell, textAlign: "right", color: "#888" }}>
                  {unassignedCount}
                </td>
              </tr>
            )}
            <tr>
              <td style={{ ...sumCell, fontWeight: 700, borderBottom: "none" }}>
                Total
              </td>
              <td
                style={{
                  ...sumCell,
                  textAlign: "right",
                  fontWeight: 700,
                  borderBottom: "none",
                }}
              >
                {locations.length}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

const sumHead: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: "4px 6px",
  fontWeight: 600,
  color: "#555",
};

const sumCell: React.CSSProperties = {
  borderBottom: "1px solid #f0f0f0",
  padding: "4px 6px",
};

/** Small square button that shows an icon image instead of text. */
function IconButton({
  title,
  onClick,
  active = false,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        width: 40,
        height: 40,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        background: active ? "#1a73e8" : "#fff",
        color: active ? "#fff" : "#333",
        border: active ? "1px solid #1a73e8" : "1px solid #e0e0e0",
        borderRadius: 8,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

const ICON = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function LocationIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 21s-7-6.4-7-11a7 7 0 1 1 14 0c0 4.6-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg {...ICON}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function SummaryIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...ICON}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export default ControlPanel;
