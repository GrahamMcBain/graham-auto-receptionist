# Graham Auto Repair — AI Receptionist

A polished LiveKit-first receptionist dashboard demo. It models the core user experience: a customer call, a real-time transcript, scheduling tool results, and a staff takeover.

## Run the dashboard

```bash
npm install
npm run dev
```

Open the local address Vite prints. The demo works without credentials; it uses local representative call data so the interaction can be evaluated immediately.

## Production LiveKit path

The dashboard is ready to be connected to the following API contract:

| Endpoint | Responsibility |
| --- | --- |
| `POST /api/token` | Authenticate the requester and return a short-lived LiveKit room token. |
| `GET /api/availability` | Return actual service availability—never let the agent invent it. |
| `POST /api/appointments` | Atomically reserve and create an appointment. |
| `DELETE /api/appointments/:id` | Cancel an appointment. |

`src/livekit.ts` contains the browser-side token requests. A production call button should connect with `LiveKitRoom` from `@livekit/components-react`, while a Node/TypeScript LiveKit Agents worker joins the same room as the AI participant and exposes scheduling tools.

Set the values in `.env.example` on the server/worker. Never send the LiveKit secret or model-provider key to the browser.

## Agent rules

The agent should identify itself as Graham Auto Repair’s receptionist, use scheduling tools for all availability and booking claims, offer a human handoff when appropriate, and publish transcription updates to the staff dashboard. The UI’s “Join & take over” action maps to a staff participant joining the existing room; the agent can then mute or remain available as a quiet assistant.
