import { useState } from "react";
import { InfoWindow, Map, Marker } from "@vis.gl/react-google-maps";
import type { Schema } from "../amplify/data/resource";

type Location = Schema["Location"]["type"];

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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  // Resolve against the live list so the popup reflects the latest data.
  const selected = locations.find((l) => l.id === selectedId) ?? null;

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
              title={location.address ?? undefined}
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
                  onClick={() => onListProjects?.(selected)}
                  style={{
                    background: "#e8f0fe",
                    color: "#1a73e8",
                    border: "none",
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  List Project
                </button>
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
  const rows: Array<[string, string]> = [];
  if (location.address) rows.push(["Address", location.address]);
  if (location.contact) rows.push(["Contact", location.contact]);
  if (location.phone) rows.push(["Phone", location.phone]);
  if (location.email) rows.push(["Email", location.email]);
  if (location.comments) rows.push(["Comments", location.comments]);

  return (
    <div style={{ minWidth: 180, color: "#222", fontSize: "0.85rem" }}>
      <button
        type="button"
        onClick={onEdit}
        title="Click to edit this location"
        style={{
          display: "block",
          background: "transparent",
          border: "none",
          padding: 0,
          marginBottom: 4,
          font: "inherit",
          fontWeight: 700,
          color: "#1a73e8",
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          cursor: "pointer",
        }}
      >
        Location {location.locationid}
      </button>
      {rows.length === 0 ? (
        <div style={{ color: "#777" }}>No details yet.</div>
      ) : (
        <table>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td
                  style={{
                    color: "#777",
                    paddingRight: 8,
                    verticalAlign: "top",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </td>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
