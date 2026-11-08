import { useState } from "react";
import { InfoWindow, Map, Marker } from "@vis.gl/react-google-maps";
import type { Schema } from "../amplify/data/resource";

type Location = Schema["Location"]["type"];

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
  onCreateProject,
}: {
  searched: google.maps.LatLngLiteral | null;
  picking?: boolean;
  onMapClick?: (latLng: google.maps.LatLngLiteral) => void;
  locations?: Location[];
  onDeleteLocation?: (location: Location) => void;
  onCreateProject?: (location: Location) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Resolve against the live list so the popup reflects the latest data.
  const selected = locations.find((l) => l.id === selectedId) ?? null;

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
              onClick={() => setSelectedId(location.id)}
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
              onCloseClick={() => setSelectedId(null)}
            >
              <LocationDetails location={selected} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => onCreateProject?.(selected)}
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
                  + Project
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
            </InfoWindow>
          )}

        {searched && <Marker position={searched} title="Search result" />}
      </Map>
    </div>
  );
}

function LocationDetails({ location }: { location: Location }) {
  const rows: Array<[string, string]> = [];
  if (location.address) rows.push(["Address", location.address]);
  if (location.contact) rows.push(["Contact", location.contact]);
  if (location.phone) rows.push(["Phone", location.phone]);
  if (location.email) rows.push(["Email", location.email]);
  if (location.comments) rows.push(["Comments", location.comments]);
  if (location.latitude != null && location.longitude != null) {
    rows.push([
      "Coordinates",
      `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`,
    ]);
  }

  return (
    <div style={{ minWidth: 180, color: "#222", fontSize: "0.85rem" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        Location {location.locationid}
      </div>
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

export default MapView;
