import { useEffect, useRef, useState } from "react";
import {
  APIProvider,
  Map,
  Marker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";

// Hollywood, Florida
const HOLLYWOOD_FL = { lat: 26.0112, lng: -80.1495 };

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

/**
 * Top-right search control: a "Search" button that reveals an address input
 * with Google Places autocomplete. Selecting a suggestion zooms the map to the
 * location and drops a marker; the ✕ clears the input and removes the marker.
 */
function SearchControl({
  onPlace,
  onClear,
}: {
  onPlace: (loc: google.maps.LatLngLiteral) => void;
  onClear: () => void;
}) {
  const map = useMap();
  const placesLib = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

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
      const place = autocomplete.getPlace();
      const location = place.geometry?.location;
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
        right: 16,
        zIndex: 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      <button
        onClick={() => {
          setOpen((v) => !v);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        Search
      </button>

      {/* Input stays mounted so autocomplete binds once; hidden when closed. */}
      <div
        style={{
          display: open ? "flex" : "none",
          alignItems: "center",
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.25)",
          padding: "4px 4px 4px 10px",
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
            width: 260,
            background: "transparent",
          }}
        />
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search and remove marker"
          title="Clear"
          style={{
            background: "transparent",
            color: "#555",
            border: "none",
            padding: "0 8px",
            fontSize: "1.1rem",
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function MapView() {
  const [searched, setSearched] = useState<google.maps.LatLngLiteral | null>(
    null
  );

  if (!apiKey) {
    return (
      <div style={{ padding: "1rem", border: "1px solid #ccc", borderRadius: 8 }}>
        Missing <code>VITE_GOOGLE_MAPS_API_KEY</code>. Add it to a{" "}
        <code>.env.local</code> file to display the map.
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh" }}>
        <Map
          defaultCenter={HOLLYWOOD_FL}
          defaultZoom={14}
          gestureHandling="greedy"
          disableDefaultUI={false}
        >
          <Marker position={HOLLYWOOD_FL} title="Hollywood, Florida" />
          {searched && <Marker position={searched} title="Search result" />}
        </Map>
        <SearchControl
          onPlace={setSearched}
          onClear={() => setSearched(null)}
        />
      </div>
    </APIProvider>
  );
}

export default MapView;
