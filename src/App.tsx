import { useEffect, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";
import MapView from "./MapView";
import ControlPanel from "./ControlPanel";
import TaskModal from "./TaskModal";

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

function App() {
  const [locations, setLocations] = useState<
    Array<Schema["Location"]["type"]>
  >([]);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [searched, setSearched] = useState<google.maps.LatLngLiteral | null>(
    null
  );
  const [picking, setPicking] = useState(false);

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

  function createProject(location: Schema["Location"]["type"]) {
    const name = window.prompt("New project name for this location:");
    if (!name) return;
    client.models.Project.create({
      locationid: location.locationid ?? 0,
      project: name,
      phase: "New",
    })
      .then(({ errors }) => {
        if (errors?.length) {
          alert(
            "Could not create project: " +
              errors.map((e) => e.message).join("; ")
          );
        } else {
          alert(`Project "${name}" created at Location ${location.locationid}.`);
        }
      })
      .catch((e: unknown) => {
        alert(
          "Could not create project: " +
            (e instanceof Error ? e.message : String(e))
        );
      });
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
        onCreateProject={createProject}
      />
      <ControlPanel
        onCreateLocation={() => setPicking((v) => !v)}
        picking={picking}
        onOpenTasks={() => setTasksOpen(true)}
        onPlace={setSearched}
        onClear={() => setSearched(null)}
        locations={locations}
      />
      {tasksOpen && <TaskModal onClose={() => setTasksOpen(false)} />}
    </APIProvider>
  );
}

export default App;
