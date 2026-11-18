import { describe, expect, it } from "vitest";
import { CLIENT_STATUS } from "@/domain/client";
import { DEFAULT_CLIENT_COUNT, generateClients } from "./clients";

describe("generateClients", () => {
  const clients = generateClients();

  it("makes more than a thousand clients by default", () => {
    expect(clients).toHaveLength(DEFAULT_CLIENT_COUNT);
    expect(clients.length).toBeGreaterThan(1000);
  });

  it("honours an explicit count", () => {
    expect(generateClients(25)).toHaveLength(25);
  });

  it("gives every client a unique, sequential id", () => {
    expect(new Set(clients.map((client) => client.id)).size).toBe(
      clients.length,
    );
    expect(clients[0]?.id).toBe("cl_00001");
    expect(clients.at(-1)?.id).toBe(
      `cl_${String(DEFAULT_CLIENT_COUNT).padStart(5, "0")}`,
    );
  });

  it("is deterministic for a given seed and differs for another", () => {
    expect(generateClients()).toEqual(clients);
    expect(generateClients(DEFAULT_CLIENT_COUNT, 7)).not.toEqual(clients);
  });

  it("leaves a meaningful share of clients churned", () => {
    const churned = clients.filter(
      (client) => client.status === CLIENT_STATUS.CHURNED,
    ).length;
    const share = churned / clients.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.4);
  });

  it("fills every field with a plausible value", () => {
    for (const client of clients) {
      expect(client.name).toMatch(/^\S+ \S+$/);
      expect(client.company).not.toBe("");
      expect(client.country).not.toBe("");
      expect(client.email).toMatch(/^[a-z0-9.-]+@[a-z0-9-]+\.example$/);
      expect(Number.isNaN(Date.parse(client.createdAt))).toBe(false);
    }
  });

  it("orders createdAt along with the id", () => {
    const times = clients.map((client) => Date.parse(client.createdAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
