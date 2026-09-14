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

  useEffect(() => {
    const sub = client.models.Location.observeQuery().subscribe({
      next: (data) => setLocations([...data.items]),
    });
    return () => sub.unsubscribe();
  }, []);

  function createLocation() {
    const address = window.prompt("Location address");
    if (!address) return;
    client.models.Location.create({ locationid: Date.now(), address });
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
      <MapView searched={searched} />
      <ControlPanel
        onCreateLocation={createLocation}
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
