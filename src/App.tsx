import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import MapView from "./MapView";

const client = generateClient<Schema>();

function App() {
  const [locations, setLocations] = useState<
    Array<Schema["Location"]["type"]>
  >([]);

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
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>
          Hollywood, Florida
        </h1>
        <button onClick={createLocation}>+ new location</button>
        <ul>
          {locations.map((location) => (
            <li key={location.id}>{location.address ?? "(no address)"}</li>
          ))}
        </ul>
      </main>
    </>
  );
}

export default App;
