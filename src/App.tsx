import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";
import MapView from "./MapView";
import TaskModal from "./TaskModal";

function App() {
  const [locations, setLocations] = useState<
    Array<Schema["Location"]["type"]>
  >([]);
  const [tasksOpen, setTasksOpen] = useState(false);

  useEffect(() => {
    client.models.Location.observeQuery().subscribe({
      next: (data) => setLocations([...data.items]),
    });
  }, []);

  function createLocation() {
    const address = window.prompt("Location address");
    if (!address) return;
    client.models.Location.create({
      locationid: Date.now(),
      address,
    });
  }

  return (
    <>
      <MapView />

      <main
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: 1,
          maxWidth: 320,
          padding: "1rem",
          background: "rgba(255, 255, 255, 0.92)",
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.25)",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={createLocation}>Location</button>
          <button onClick={() => setTasksOpen(true)}>Task</button>
        </div>
        <ul>
          {locations.map((location) => (
            <li key={location.id}>{location.address ?? "(no address)"}</li>
          ))}
        </ul>
      </main>

      {tasksOpen && <TaskModal onClose={() => setTasksOpen(false)} />}
    </>
  );
}

export default App;
