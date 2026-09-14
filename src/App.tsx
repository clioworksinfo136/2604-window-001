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
    <main>
      <h1>Hollywood, Florida</h1>
      <MapView />

      <h1>My locations</h1>
      <button onClick={createLocation}>+ new</button>
      <ul>
        {locations.map((location) => (
          <li key={location.id}>{location.address ?? "(no address)"}</li>
        ))}
      </ul>
      <div>
        🥳 App successfully hosted. Try creating a new location.
        <br />
        <a href="https://docs.amplify.aws/react/start/quickstart/#make-frontend-updates">
          Review next step of this tutorial.
        </a>
      </div>
    </main>
  );
}

export default App;
