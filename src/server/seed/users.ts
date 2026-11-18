import "server-only";
import { USER_STATUS, type User } from "@/domain/user";
import { ROLES } from "@/permissions/roles";

/**
 * A seeded account: the public User plus its plain-text password. The task
 * explicitly allows plain-text passwords. Passwords never live on User, so
 * they cannot end up in an API response by accident.
 *
 * Every login and password here is listed in the README.
 */
export interface SeedAccount extends User {
  password: string;
}

export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  // Two IT accounts, so rule 4 (never zero active IT) can be tested.
  {
    id: "usr_ivan",
    fullName: "Ivan Petrenko",
    email: "ivan@example.com",
    password: "ivan123",
    role: ROLES.IT,
    status: USER_STATUS.ACTIVE,
    managerId: null,
    createdAt: "2025-01-10T09:00:00.000Z",
  },
  {
    id: "usr_iryna",
    fullName: "Iryna Kovalenko",
    email: "iryna@example.com",
    password: "iryna123",
    role: ROLES.IT,
    status: USER_STATUS.ACTIVE,
    managerId: null,
    createdAt: "2025-01-10T09:05:00.000Z",
  },

  // Anna has four direct reports (scenario 7).
  {
    id: "usr_anna",
    fullName: "Anna Shevchenko",
    email: "anna@example.com",
    password: "anna123",
    role: ROLES.MANAGER,
    status: USER_STATUS.ACTIVE,
    managerId: null,
    createdAt: "2025-02-03T09:00:00.000Z",
  },
  // Taras is a manager with no direct reports.
  {
    id: "usr_taras",
    fullName: "Taras Bondar",
    email: "taras@example.com",
    password: "taras123",
    role: ROLES.MANAGER,
    status: USER_STATUS.ACTIVE,
    managerId: null,
    createdAt: "2025-02-03T09:10:00.000Z",
  },
  // Viktor is a deactivated manager. Dmytro reports to him.
  {
    id: "usr_viktor",
    fullName: "Viktor Melnyk",
    email: "viktor@example.com",
    password: "viktor123",
    role: ROLES.MANAGER,
    status: USER_STATUS.DEACTIVATED,
    managerId: null,
    createdAt: "2025-02-03T09:20:00.000Z",
  },

  // Anna's direct reports. Olena is the user from scenario 12.
  {
    id: "usr_olena",
    fullName: "Olena Kravets",
    email: "olena@example.com",
    password: "olena123",
    role: ROLES.USER,
    status: USER_STATUS.ACTIVE,
    managerId: "usr_anna",
    createdAt: "2025-03-01T09:00:00.000Z",
  },
  {
    id: "usr_maksym",
    fullName: "Maksym Hnatiuk",
    email: "maksym@example.com",
    password: "maksym123",
    role: ROLES.USER,
    status: USER_STATUS.ACTIVE,
    managerId: "usr_anna",
    createdAt: "2025-03-01T09:10:00.000Z",
  },
  {
    id: "usr_sofiia",
    fullName: "Sofiia Tkachenko",
    email: "sofiia@example.com",
    password: "sofiia123",
    role: ROLES.USER,
    status: USER_STATUS.ACTIVE,
    managerId: "usr_anna",
    createdAt: "2025-03-01T09:20:00.000Z",
  },
  // Already deactivated.
  {
    id: "usr_bohdan",
    fullName: "Bohdan Lysenko",
    email: "bohdan@example.com",
    password: "bohdan123",
    role: ROLES.USER,
    status: USER_STATUS.DEACTIVATED,
    managerId: "usr_anna",
    createdAt: "2025-03-01T09:30:00.000Z",
  },

  // Dmytro reports to a different manager, and that manager is deactivated.
  {
    id: "usr_dmytro",
    fullName: "Dmytro Savchuk",
    email: "dmytro@example.com",
    password: "dmytro123",
    role: ROLES.USER,
    status: USER_STATUS.ACTIVE,
    managerId: "usr_viktor",
    createdAt: "2025-03-15T09:00:00.000Z",
  },
  // Nobody manages Kateryna.
  {
    id: "usr_kateryna",
    fullName: "Kateryna Moroz",
    email: "kateryna@example.com",
    password: "kateryna123",
    role: ROLES.USER,
    status: USER_STATUS.ACTIVE,
    managerId: null,
    createdAt: "2025-03-20T09:00:00.000Z",
  },
];
