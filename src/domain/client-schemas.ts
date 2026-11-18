import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 25;

/**
 * The most clients one request can return. A larger `limit` is cut down to
 * this, so no request, however it is written, can fetch the whole list.
 */
export const MAX_PAGE_SIZE = 100;

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
