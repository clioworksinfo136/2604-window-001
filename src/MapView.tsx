import { Map, Marker } from "@vis.gl/react-google-maps";

// Hollywood, Florida
const HOLLYWOOD_FL = { lat: 26.0112, lng: -80.1495 };

/** Full-viewport map canvas with the Hollywood marker and an optional
 * searched-location marker. Must be rendered inside an <APIProvider>. */
function MapView({
  searched,
}: {
  searched: google.maps.LatLngLiteral | null;
}) {
  return (
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
    </div>
  );
}

export default MapView;
