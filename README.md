# Graham Auto Receptionist

An AI voice receptionist for Graham Auto Repair, powered by LiveKit.

## Projects

- `web/`: Vite/React dashboard and Vercel token endpoint.
- `agent/`: Node.js LiveKit agent with scheduling tools and staff-event data packets.

## Local development

Start the agent in `agent/` with `pnpm dev`. Start the web token API and dashboard in separate terminals:

```bash
cd web
npm run dev:token
npm run dev
```

For local development, the token service reads credentials from the original sibling agent project. Deployments must configure `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_AGENT_NAME` as secrets.

## Deployment

Deploy `web/` to Vercel with Root Directory set to `web`. Deploy `agent/` separately with `lk agent create` from `agent/`.
