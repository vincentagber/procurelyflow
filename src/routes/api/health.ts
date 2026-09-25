import { createFileRoute } from "@tanstack/react-router";

/**
 * Health Check Endpoint — /api/health
 *
 * Used by Render, load balancers, and uptime monitors to verify the service
 * is alive and able to serve requests. Returns 200 JSON with basic metadata.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json(
          {
            status: "ok",
            service: "procurely-flow",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            node: process.version,
          },
          { status: 200 },
        );
      },
    },
  },
});
