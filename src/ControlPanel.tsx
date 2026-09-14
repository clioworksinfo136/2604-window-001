import { useEffect, useRef, useState } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import type { Schema } from "../amplify/data/resource";

type Location = Schema["Location"]["type"];

/** Single top-left panel holding the Location, Task, and Search controls. */
function ControlPanel({
  onCreateLocation,
  onOpenTasks,
  onPlace,
  onClear,
  locations,
}: {
  onCreateLocation: () => void;
  onOpenTasks: () => void;
  onPlace: (loc: google.maps.LatLngLiteral) => void;
  onClear: () => void;
  locations: Location[];
}) {
  const map = useMap();
  const placesLib = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);

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

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: 16,
        zIndex: 2,
        maxWidth: 320,
        padding: 8,
        background: "rgba(255, 255, 255, 0.95)",
        borderRadius: 12,
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.25)",
        textAlign: "left",
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        <IconButton title="Add location" onClick={onCreateLocation}>
          <LocationIcon />
        </IconButton>
        <IconButton title="Tasks" onClick={onOpenTasks}>
          <TaskIcon />
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

      {locations.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "8px 0 0",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            border: "none",
            background: "transparent",
          }}
        >
          {locations.map((location) => (
            <li
              key={location.id}
              style={{
                background: "#f4f4f6",
                borderRadius: 6,
                padding: "6px 8px",
                fontSize: "0.9rem",
              }}
            >
              {location.address ?? "(no address)"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Small square button that shows an icon image instead of text. */
function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
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
        background: "#fff",
        color: "#333",
        border: "1px solid #e0e0e0",
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

function TaskIcon() {
  return (
    <svg {...ICON}>
      <path d="M9 5h9M9 12h9M9 19h9" />
      <path d="M4 5l1.2 1.2L7 4M4 12l1.2 1.2L7 11M4 19l1.2 1.2L7 18" />
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

function CloseIcon() {
  return (
    <svg {...ICON}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export default ControlPanel;
