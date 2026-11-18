export const CLIENT_STATUS = {
  ACTIVE: "active",
  CHURNED: "churned",
} as const;

export type ClientStatus = (typeof CLIENT_STATUS)[keyof typeof CLIENT_STATUS];

/** An end client of the business. Clients do not log in. */
export interface Client {
  id: string;
  name: string;
  company: string;
  email: string;
  country: string;
  status: ClientStatus;
  /** ISO 8601 timestamp. */
  createdAt: string;
}
