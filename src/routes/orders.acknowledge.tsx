import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/orders/acknowledge")({
  validateSearch: (search) => searchSchema.parse(search),
  beforeLoad: ({ search }) => {
    if (search.token) {
      throw redirect({
        to: "/quote/$token",
        params: { token: search.token },
      });
    }
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});
