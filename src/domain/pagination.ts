export const DEFAULT_PAGE_SIZE = 25;

/**
 * The most clients one request can return. A larger `limit` is cut down to
 * this, so no request, however it is written, can fetch the whole list.
 */
export const MAX_PAGE_SIZE = 100;
