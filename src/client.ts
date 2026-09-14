import { generateClient } from "aws-amplify/data";
import type { Schema } from "../amplify/data/resource";

// Shared Amplify Data client used across the app.
export const client = generateClient<Schema>();
