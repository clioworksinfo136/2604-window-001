import { useEffect, useRef, useState } from "react";
import { InfoWindow, Map, Marker } from "@vis.gl/react-google-maps";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";

type Location = Schema["Location"]["type"];
type Project = Schema["Project"]["type"];

/** Editable fields on a location (coordinates come from the map pin). */
export type LocationEdits = {
  locationid: number;
  address: string;
  contact: string;
  phone: string;
  email: string;
  comments: string;
};

const EMPTY_DRAFT = {
  locationid: "",
  address: "",
  contact: "",
  phone: "",
  email: "",
  comments: "",
};

// Hollywood, Florida
const HOLLYWOOD_FL = { lat: 26.0112, lng: -80.1495 };

/** Full-viewport map canvas with the Hollywood marker and an optional
 * searched-location marker. Must be rendered inside an <APIProvider>. */
function MapView({
  searched,
  picking = false,
  onMapClick,
  locations = [],
  onDeleteLocation,
  onListProjects,
  onUpdateLocation,
}: {
  searched: google.maps.LatLngLiteral | null;
  picking?: boolean;
  onMapClick?: (latLng: google.maps.LatLngLiteral) => void;
  locations?: Location[];
  onDeleteLocation?: (location: Location) => void;
  onListProjects?: (location: Location) => void;
  onUpdateLocation?: (
    location: Location,
    edits: LocationEdits
  ) => Promise<void> | void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  // All projects, so the popup can list the ones at the selected point.
  useEffect(() => {
    const sub = client.models.Project.observeQuery().subscribe({
      next: ({ items }) => setProjects([...items]),
      error: () => setProjects([]),
    });
    return () => sub.unsubscribe();
  }, []);
  // Closing the hover card is delayed slightly: the card is drawn right
  // above the dot, so a brief mouseout as it opens must not close it.
  const hoverTimer = useRef<number | null>(null);

  function showHover(id: string) {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setHoveredId(id);
  }

  function hideHover() {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setHoveredId(null);
      hoverTimer.current = null;
    }, 150);
  }

  useEffect(
    () => () => {
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    },
    []
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  // Resolve against the live list so the popup reflects the latest data.
  const selected = locations.find((l) => l.id === selectedId) ?? null;
  // Hover preview, suppressed while that same point's popup is already open.
  const hovered =
    hoveredId && hoveredId !== selectedId
      ? (locations.find((l) => l.id === hoveredId) ?? null)
      : null;

  function startEdit(l: Location) {
    setDraft({
      locationid: String(l.locationid ?? ""),
      address: l.address ?? "",
      contact: l.contact ?? "",
      phone: l.phone ?? "",
      email: l.email ?? "",
      comments: l.comments ?? "",
    });
    setEditing(true);
  }

  async function saveLocation() {
    if (!selected) return;
    const idNum = Number.parseInt(draft.locationid, 10);
    // locationid is a 32-bit GraphQL Int.
    if (!Number.isInteger(idNum) || idNum > 2147483647 || idNum < -2147483648) {
      alert("Location ID must be a whole number within the 32-bit range.");
      return;
    }
    setBusy(true);
    try {
      await onUpdateLocation?.(selected, {
        locationid: idNum,
        address: draft.address,
        contact: draft.contact,
        phone: draft.phone,
        email: draft.email,
        comments: draft.comments,
      });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh" }}>
      <Map
        defaultCenter={HOLLYWOOD_FL}
        defaultZoom={14}
        gestureHandling="greedy"
        disableDefaultUI={false}
        draggableCursor={picking ? "crosshair" : undefined}
        onClick={(e) => {
          const latLng = e.detail.latLng;
          if (latLng) onMapClick?.(latLng);
        }}
      >
        {locations.map((location) =>
          location.latitude != null && location.longitude != null ? (
            <Marker
              key={location.id}
              position={{ lat: location.latitude, lng: location.longitude }}
              onMouseOver={() => showHover(location.id)}
              onMouseOut={hideHover}
              onClick={() => {
                setSelectedId(location.id);
                setEditing(false);
              }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: "#e00",
                fillOpacity: 1,
                strokeColor: "#fff",
                strokeWeight: 2,
              }}
            />
          ) : null
        )}

        {hovered &&
          hovered.latitude != null &&
          hovered.longitude != null && (
            <InfoWindow
              position={{ lat: hovered.latitude, lng: hovered.longitude }}
              pixelOffset={[0, -18]}
              disableAutoPan
              headerDisabled
            >
              <HoverCard location={hovered} />
            </InfoWindow>
          )}

        {selected &&
          selected.latitude != null &&
          selected.longitude != null && (
            <InfoWindow
              position={{ lat: selected.latitude, lng: selected.longitude }}
              onCloseClick={() => {
                setSelectedId(null);
                setEditing(false);
              }}
            >
              {editing ? (
                <LocationEditor
                  draft={draft}
                  setDraft={setDraft}
                  busy={busy}
                  onSave={saveLocation}
                  onCancel={() => setEditing(false)}
                />
              ) : (
                <>
              <LocationDetails
                location={selected}
                onEdit={() => startEdit(selected)}
              />
              <ProjectList
                projects={projects.filter(
                  (p) => p.locationid === selected.locationid
                )}
                onOpen={() => onListProjects?.(selected)}
              />
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => onDeleteLocation?.(selected)}
                  style={{
                    background: "#fff",
                    color: "#b00020",
                    border: "1px solid #f0c0c8",
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
                </>
              )}
            </InfoWindow>
          )}

        {searched && <Marker position={searched} title="Search result" />}
      </Map>
    </div>
  );
}

function LocationDetails({
  location,
  onEdit,
}: {
  location: Location;
  onEdit?: () => void;
}) {
  // The popup is headed by the address, with the contact beneath it.
  // Falls back to the location number only when there is no address.
  const heading = location.address || `Location ${location.locationid}`;

  return (
    <div style={{ minWidth: 180, color: "#222", fontSize: "0.85rem" }}>
      <button
        type="button"
        onClick={onEdit}
        title="Click to edit this location"
        style={{
          display: "block",
          textAlign: "left",
          background: "transparent",
          border: "none",
          padding: 0,
          font: "inherit",
          fontWeight: 700,
          color: "#1a73e8",
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          cursor: "pointer",
        }}
      >
        {heading}
      </button>
      {location.contact && (
        <div style={{ marginTop: 2, color: "#555" }}>{location.contact}</div>
      )}
      {!location.address && !location.contact && (
        <div style={{ marginTop: 2, color: "#777" }}>No details yet.</div>
      )}
    </div>
  );
}

/** Projects at this point, listed under the heading. Clicking one opens
 * the full projects view for the location. */
function ProjectList({
  projects,
  onOpen,
}: {
  projects: Project[];
  onOpen: () => void;
}) {
  if (projects.length === 0) {
    return (
      <div style={{ marginTop: 6, fontSize: "0.8rem", color: "#888" }}>
        No projects yet.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column" }}>
      {projects.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={onOpen}
          title="Open projects"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            width: "100%",
            textAlign: "left",
            background: "transparent",
            border: "none",
            borderTop: "1px solid #eee",
            padding: "4px 0",
            font: "inherit",
            fontSize: "0.8rem",
            color: "#222",
            cursor: "pointer",
          }}
        >
          <span>{p.project || "(untitled)"}</span>
          <span style={{ color: "#888", whiteSpace: "nowrap" }}>{p.phase}</span>
        </button>
      ))}
    </div>
  );
}

/** Compact address + contact summary shown while hovering a point. */
function HoverCard({ location }: { location: Location }) {
  const contactLines = [location.contact, location.phone, location.email].filter(
    (v): v is string => Boolean(v)
  );

  return (
    <div
      style={{
        minWidth: 150,
        color: "#222",
        fontSize: "0.82rem",
        // Never let the card itself take the pointer away from the marker.
        pointerEvents: "none",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 2 }}>
        Location {location.locationid}
      </div>
      <div>{location.address || <em style={{ color: "#888" }}>No address</em>}</div>
      {contactLines.length > 0 && (
        <div style={{ marginTop: 4, color: "#555" }}>
          {contactLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inline form for editing a location's details inside the InfoWindow. */
function LocationEditor({
  draft,
  setDraft,
  busy,
  onSave,
  onCancel,
}: {
  draft: typeof EMPTY_DRAFT;
  setDraft: React.Dispatch<React.SetStateAction<typeof EMPTY_DRAFT>>;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const field = (
    label: string,
    key: keyof typeof EMPTY_DRAFT,
    type = "text"
  ) => (
    <label style={{ display: "block", marginBottom: 6 }}>
      <span style={{ display: "block", color: "#777", fontSize: "0.72rem" }}>
        {label}
      </span>
      <input
        type={type}
        value={draft[key]}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "3px 6px",
          fontSize: "0.85rem",
          border: "1px solid #ccc",
          borderRadius: 5,
          fontFamily: "inherit",
        }}
      />
    </label>
  );

  return (
    <div style={{ minWidth: 230, color: "#222", fontSize: "0.85rem" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Edit location</div>
      {field("Location ID", "locationid", "number")}
      {field("Address", "address")}
      {field("Contact", "contact")}
      {field("Phone", "phone", "tel")}
      {field("Email", "email", "email")}
      <label style={{ display: "block", marginBottom: 6 }}>
        <span style={{ display: "block", color: "#777", fontSize: "0.72rem" }}>
          Comments
        </span>
        <textarea
          value={draft.comments}
          onChange={(e) =>
            setDraft((d) => ({ ...d, comments: e.target.value }))
          }
          rows={2}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "3px 6px",
            fontSize: "0.85rem",
            border: "1px solid #ccc",
            borderRadius: 5,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          style={{
            background: "#e8f0fe",
            color: "#1a73e8",
            border: "none",
            borderRadius: 6,
            padding: "4px 12px",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
          }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            background: "#fff",
            color: "#444",
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: "4px 12px",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default MapView;
