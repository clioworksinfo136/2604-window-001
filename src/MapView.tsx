import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";

// Hollywood, Florida
const HOLLYWOOD_FL = { lat: 26.0112, lng: -80.1495 };

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

function MapView() {
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
      <div style={{ width: "100%", height: "500px" }}>
        <Map
          defaultCenter={HOLLYWOOD_FL}
          defaultZoom={14}
          gestureHandling="greedy"
          disableDefaultUI={false}
        >
          <Marker position={HOLLYWOOD_FL} title="Hollywood, Florida" />
        </Map>
      </div>
    </APIProvider>
  );
}

export default MapView;
