import { useEffect, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";
import MapView from "./MapView";
import type { LocationEdits } from "./MapView";
import ControlPanel from "./ControlPanel";
import ProjectModal from "./ProjectModal";
import ProjectGallery from "./ProjectGallery";

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

function App() {
  const [locations, setLocations] = useState<
    Array<Schema["Location"]["type"]>
  >([]);
  const [searched, setSearched] = useState<google.maps.LatLngLiteral | null>(
    null
  );
  const [picking, setPicking] = useState(false);
  const [projectsAdd, setProjectsAdd] = useState(false);
  const [projectsFor, setProjectsFor] = useState<
    Schema["Location"]["type"] | null
  >(null);

  useEffect(() => {
    const sub = client.models.Location.observeQuery().subscribe({
      next: (data) => setLocations([...data.items]),
    });
    return () => sub.unsubscribe();
  }, []);

  function handleMapClick(latLng: google.maps.LatLngLiteral) {
    if (!picking) return;
    // locationid is a 32-bit GraphQL Int; Date.now() overflows it, so use
    // the next value after the current max (falling back to 1).
    const nextId = locations.length
      ? Math.max(...locations.map((l) => l.locationid ?? 0)) + 1
      : 1;
    client.models.Location.create({
      locationid: nextId,
      latitude: latLng.lat,
      longitude: latLng.lng,
    })
      .then(({ errors }) => {
        if (errors?.length) {
          alert(
            "Could not create location: " +
              errors.map((e) => e.message).join("; ")
          );
        }
      })
      .catch((e: unknown) => {
        alert(
          "Could not create location: " +
            (e instanceof Error ? e.message : String(e))
        );
      });
    setPicking(false);
  }

  async function deleteLocation(location: Schema["Location"]["type"]) {
    if (
      !window.confirm(`Delete this location (Location ${location.locationid})?`)
    )
      return;
    try {
      await client.models.Location.delete({ id: location.id });
    } catch (e: unknown) {
      alert(
        "Could not delete location: " +
          (e instanceof Error ? e.message : String(e))
      );
    }
  }

  async function updateLocation(
    location: Schema["Location"]["type"],
    edits: LocationEdits
  ) {
    try {
      const { errors } = await client.models.Location.update({
        id: location.id,
        ...edits,
      });
      if (errors?.length) {
        alert(
          "Could not save location: " + errors.map((e) => e.message).join("; ")
        );
      }
    } catch (e: unknown) {
      alert(
        "Could not save location: " +
          (e instanceof Error ? e.message : String(e))
      );
    }
  }

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
      <MapView
        searched={searched}
        picking={picking}
        onMapClick={handleMapClick}
        locations={locations}
        onDeleteLocation={deleteLocation}
        onListProjects={(l) => {
          setProjectsAdd(false);
          setProjectsFor(l);
        }}
        onAddProject={(l) => {
          setProjectsAdd(true);
          setProjectsFor(l);
        }}
        onUpdateLocation={updateLocation}
      />
      <ProjectGallery />
      <ControlPanel
        onCreateLocation={() => setPicking((v) => !v)}
        picking={picking}
        onPlace={setSearched}
        onClear={() => setSearched(null)}
        locations={locations}
      />
      {projectsFor && (
        <ProjectModal
          location={projectsFor}
          autoAdd={projectsAdd}
          onClose={() => setProjectsFor(null)}
        />
      )}
    </APIProvider>
  );
}

export default App;
