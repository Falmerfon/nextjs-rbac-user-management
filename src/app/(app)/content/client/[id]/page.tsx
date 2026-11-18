import Link from "next/link";
import { getClient } from "@/server/services/clients";
import { orInterrupt, requirePageUser } from "@/server/page-guards";
import { getStore } from "@/server/store";

export default async function ClientPage({
  params,
}: PageProps<"/content/client/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;

  // The service asks the policy. A role without content access gets the 403
  // page, an unknown id gets the 404 page.
  const client = orInterrupt(getClient(getStore(), user, id));

  return (
    <>
      <p>
        <Link href="/content">Back to clients</Link>
      </p>
      <h1>{client.name}</h1>
      <dl>
        <dt>ID</dt>
        <dd>{client.id}</dd>
        <dt>Company</dt>
        <dd>{client.company}</dd>
        <dt>Email</dt>
        <dd>{client.email}</dd>
        <dt>Country</dt>
        <dd>{client.country}</dd>
        <dt>Status</dt>
        <dd>{client.status}</dd>
        <dt>Client since</dt>
        <dd>{new Date(client.createdAt).toISOString().slice(0, 10)}</dd>
      </dl>
    </>
  );
}
