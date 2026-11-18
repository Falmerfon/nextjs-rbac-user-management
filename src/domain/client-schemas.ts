import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./pagination";

/**
 * Query parameters of the client list. Both arrive as strings, hence coerce.
 * Unknown parameters are ignored, unlike request bodies, because query strings
 * routinely carry extras such as cache busters.
 */
export const clientPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_PAGE_SIZE)
    .transform((limit) => Math.min(limit, MAX_PAGE_SIZE)),
});

export type ClientPageQuery = z.infer<typeof clientPageQuerySchema>;
