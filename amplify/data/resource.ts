import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/*== STEP 1 ===============================================================
The section below creates a Todo database table with a "content" field. Try
adding a new "isDone" field as a boolean. The authorization rule below
specifies that any user authenticated via an API key can "create", "read",
"update", and "delete" any "Todo" records.
=========================================================================*/
const schema = a.schema({
Location: a
    .model({
      locationid: a.integer().required(),
      longitude: a.float(),
      latitude: a.float(),
      contact: a.string(),
      address: a.string(),
      phone: a.string(),
      email: a.string(),
      comments: a.string(),
    })
    .authorization((allow) => [allow.publicApiKey()]),  
Project: a
    .model({
      locationid: a.integer().required(),
      project: a.string(),
      startdate: a.date(),
      enddate: a.date(),
      description: a.string(),
      // A project owns many tasks.
      tasks: a.hasMany("Task", "projectId"),
    })
    .authorization((allow) => [allow.publicApiKey()]),
Task: a
    .model({
      taskid: a.integer().required(),
      task: a.string(),
      // Phase now lives on the task rather than the project.
      phase: a.string().required(),
      // Each task belongs to exactly one project. Optional so tasks that
      // predate this relationship stay readable until they are assigned.
      projectId: a.id(),
      project: a.belongsTo("Project", "projectId"),
      // A task owns many photos.
      photos: a.hasMany("Photo", "taskId"),
    })
    .authorization((allow) => [allow.publicApiKey()]),
Phase: a
    .model({
      phaseid: a.integer().required(),
      phase: a.string(),
    })
    .authorization((allow) => [allow.publicApiKey()]),
Photo: a
    .model({
      // Task this photo belongs to.
      taskId: a.id(),
      task: a.belongsTo("Task", "taskId"),
      // Legacy owner from when photos hung off a project. Kept, and no
      // longer required, so photos taken before the move stay readable.
      projectId: a.string(),
      // S3 path under the "photos/" prefix
      path: a.string().required(),
      note: a.string(),
    })
    .authorization((allow) => [allow.publicApiKey()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "apiKey",
    // API Key is used for a.allow.public() rules
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});

/*== STEP 2 ===============================================================
Go to your frontend source code. From your client-side code, generate a
Data client to make CRUDL requests to your table. (THIS SNIPPET WILL ONLY
WORK IN THE FRONTEND CODE FILE.)

Using JavaScript or Next.js React Server Components, Middleware, Server 
Actions or Pages Router? Review how to generate Data clients for those use
cases: https://docs.amplify.aws/gen2/build-a-backend/data/connect-to-API/
=========================================================================*/

/*
"use client"
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>() // use this Data client for CRUDL requests
*/

/*== STEP 3 ===============================================================
Fetch records from the database and use them in your frontend component.
(THIS SNIPPET WILL ONLY WORK IN THE FRONTEND CODE FILE.)
=========================================================================*/

/* For example, in a React component, you can use this snippet in your
  function's RETURN statement */
// const { data: todos } = await client.models.Todo.list()

// return <ul>{todos.map(todo => <li key={todo.id}>{todo.content}</li>)}</ul>
