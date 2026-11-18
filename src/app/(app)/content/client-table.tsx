"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { callApi, describeError, type ApiReply } from "@/app/_lib/api";
import type { ClientPage } from "@/domain/client";
import { DEFAULT_PAGE_SIZE } from "@/domain/pagination";

interface Loaded {
  url: string;
  reply: ApiReply<ClientPage>;
}

const pageHref = (page: number) => `/content?page=${page}`;

/**
 * One page of clients, fetched from /api/clients. The server slices the list,
 * so each request carries a single page and the total, never all the clients.
 * The page number comes from the URL, so a page can be linked and the back
 * button works.
 */
export function ClientTable({ page }: { page: number }) {
  const url = `/api/clients?page=${page}&limit=${DEFAULT_PAGE_SIZE}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    void callApi<ClientPage>("GET", url).then((reply) => {
      if (!cancelled) setLoaded({ url, reply });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!loaded || loaded.url !== url) return <p className="muted">Loading clients…</p>;

  const { reply } = loaded;
  if (reply.status === 401) return <p>Your session has ended. Taking you to sign in…</p>;
  if (!reply.data) {
    return (
      <p className="error" role="alert">
        {describeError(reply.error)}
      </p>
    );
  }

  const { items, total, totalPages, limit } = reply.data;
  const first = items.length ? (page - 1) * limit + 1 : 0;
  const last = (page - 1) * limit + items.length;

  return (
    <>
      <p>
        {total} clients. {items.length ? `Showing ${first} to ${last}.` : "Nothing on this page."}
      </p>
      <Pager page={page} totalPages={totalPages} />
      {items.length ? (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Company</th>
              <th>Email</th>
              <th>Country</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((client) => (
              <tr key={client.id}>
                <td>{client.id}</td>
                <td>
                  <Link href={`/content/client/${client.id}`}>{client.name}</Link>
                </td>
                <td>{client.company}</td>
                <td>{client.email}</td>
                <td>{client.country}</td>
                <td>{client.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <Pager page={page} totalPages={totalPages} />
    </>
  );
}

function Pager({ page, totalPages }: { page: number; totalPages: number }) {
  return (
    <nav className="pager" aria-label="Pages">
      {page > 1 ? <Link href={pageHref(1)}>First</Link> : <span className="muted">First</span>}
      {page > 1 ? (
        <Link href={pageHref(page - 1)}>Previous</Link>
      ) : (
        <span className="muted">Previous</span>
      )}
      <span>
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={pageHref(page + 1)}>Next</Link>
      ) : (
        <span className="muted">Next</span>
      )}
      {page < totalPages ? (
        <Link href={pageHref(totalPages)}>Last</Link>
      ) : (
        <span className="muted">Last</span>
      )}
    </nav>
  );
}
