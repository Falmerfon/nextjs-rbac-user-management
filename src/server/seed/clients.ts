import "server-only";
import { CLIENT_STATUS, type Client } from "@/domain/client";

export const DEFAULT_CLIENT_COUNT = 1200;
export const DEFAULT_CLIENT_SEED = 20260101;
/** Share of clients that come out churned. */
export const CHURN_RATE = 0.28;

const FIRST_NAMES = [
  "Alice", "Benjamin", "Clara", "Daniel", "Elena", "Felix", "Grace", "Hugo",
  "Isabel", "Jonas", "Karina", "Liam", "Maria", "Noah", "Olivia", "Pavel",
  "Quinn", "Rosa", "Samuel", "Tessa", "Umar", "Vera", "Walter", "Xenia",
  "Yusuf", "Zoe", "Andrei", "Bianca", "Carlos", "Diana", "Emil", "Farah",
] as const;

const LAST_NAMES = [
  "Andersen", "Bauer", "Costa", "Dubois", "Eriksson", "Fischer", "Garcia",
  "Hansen", "Ivanov", "Jensen", "Kowalski", "Larsen", "Moreau", "Nowak",
  "Olsen", "Petrov", "Quintero", "Rossi", "Schmidt", "Tanaka", "Ulrich",
  "Vargas", "Weber", "Xu", "Yilmaz", "Zielinski", "Novak", "Silva", "Horvat",
  "Popescu", "Murphy", "Kaya",
] as const;

const COMPANY_HEADS = [
  "Northwind", "Bluebird", "Ironwood", "Silverline", "Redwood", "Harborview",
  "Summit", "Evergreen", "Clearwater", "Falcon", "Granite", "Lighthouse",
  "Maple", "Orchid", "Pioneer", "Quartz", "Riverbend", "Sterling", "Topaz",
  "Windmill",
] as const;

const COMPANY_TAILS = [
  "Logistics", "Foods", "Software", "Capital", "Energy", "Media", "Robotics",
  "Textiles", "Analytics", "Marine", "Pharma", "Constructions", "Travel",
  "Systems", "Brewing",
] as const;

const COUNTRIES = [
  "Germany", "France", "Spain", "Italy", "Poland", "Netherlands", "Sweden",
  "Portugal", "Czechia", "Austria", "Ireland", "Denmark", "Norway", "Finland",
  "Greece", "Romania",
] as const;

/** Clients are spread over three years starting here. */
const FIRST_CLIENT_AT = Date.UTC(2023, 0, 1);
const SPAN_MS = 3 * 365 * 24 * 60 * 60 * 1000;

/**
 * mulberry32, a tiny seeded generator. Math.random would give different
 * clients on every restart, which makes pagination bugs hard to reproduce.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("pick() needs a non-empty list");
  return item;
}

const slug = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Builds the client list. The same arguments always give the same clients, in
 * ascending id order, with createdAt rising along with the id.
 */
export function generateClients(
  count: number = DEFAULT_CLIENT_COUNT,
  seed: number = DEFAULT_CLIENT_SEED,
): Client[] {
  const random = createRandom(seed);
  const step = SPAN_MS / count;
  const clients: Client[] = [];

  for (let index = 0; index < count; index += 1) {
    const first = pick(random, FIRST_NAMES);
    const last = pick(random, LAST_NAMES);
    const company = `${pick(random, COMPANY_HEADS)} ${pick(random, COMPANY_TAILS)}`;

    clients.push({
      id: `cl_${String(index + 1).padStart(5, "0")}`,
      name: `${first} ${last}`,
      company,
      email: `${slug(first)}.${slug(last)}@${slug(company)}.example`,
      country: pick(random, COUNTRIES),
      status: random() < CHURN_RATE ? CLIENT_STATUS.CHURNED : CLIENT_STATUS.ACTIVE,
      createdAt: new Date(
        FIRST_CLIENT_AT + index * step + Math.floor(random() * step),
      ).toISOString(),
    });
  }

  return clients;
}
