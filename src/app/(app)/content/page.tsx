import { authorizeContentView } from "@/permissions/policy";
import { requireAllowed } from "@/server/page-guards";
import { ClientTable } from "./client-table";

function parsePage(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export default async function ContentPage({ searchParams }: PageProps<"/content">) {
  await requireAllowed(authorizeContentView);
  const { page } = await searchParams;

  return (
    <>
      <h1>Clients</h1>
      <ClientTable page={parsePage(page)} />
    </>
  );
}
