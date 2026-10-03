import { ProfileRow } from '../models/database.types';

/**
 * Synthetic directory used by the offline `demo` build.
 *
 * Every address is an RFC 2606 reserved domain and every identity is fictional:
 * `agent@example.com` and `customer@example.com` are the two addresses the demo
 * login screen offers, the rest only exist to make lists and assignment pickers
 * look like a real workspace.
 */
export const MOCK_PROFILE_IDS = {
  admin: '5f2b9c10-0001-4c7a-9a11-000000000001',
  agent: '5f2b9c10-0002-4c7a-9a11-000000000002',
  secondAgent: '5f2b9c10-0003-4c7a-9a11-000000000003',
  customer: '5f2b9c10-0004-4c7a-9a11-000000000004',
  secondCustomer: '5f2b9c10-0005-4c7a-9a11-000000000005',
  thirdCustomer: '5f2b9c10-0006-4c7a-9a11-000000000006'
} as const;

/** Local storage key holding the demo session email. */
export const MOCK_SESSION_KEY = 'MOCK_SESSION_V1';

/** Local storage key holding demo mutations applied on top of the fixtures. */
export const MOCK_DATA_KEY = 'MOCK_DATA_V1';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}

export const MOCK_PROFILES: readonly ProfileRow[] = Object.freeze([
  {
    id: MOCK_PROFILE_IDS.agent,
    email: 'agent@example.com',
    full_name: 'Nina Okafor',
    avatar_url: null,
    role: 'agent',
    created_at: daysAgo(180),
    updated_at: daysAgo(12)
  },
  {
    id: MOCK_PROFILE_IDS.customer,
    email: 'customer@example.com',
    full_name: 'Tomas Eriksen',
    avatar_url: null,
    role: 'customer',
    created_at: daysAgo(96),
    updated_at: daysAgo(3)
  },
  {
    id: MOCK_PROFILE_IDS.admin,
    email: 'admin@example.org',
    full_name: 'Priya Raman',
    avatar_url: null,
    role: 'admin',
    created_at: daysAgo(420),
    updated_at: daysAgo(40)
  },
  {
    id: MOCK_PROFILE_IDS.secondAgent,
    email: 'marcus.feld@example.org',
    full_name: 'Marcus Feld',
    avatar_url: null,
    role: 'agent',
    created_at: daysAgo(240),
    updated_at: daysAgo(21)
  },
  {
    id: MOCK_PROFILE_IDS.secondCustomer,
    email: 'aiko.tanaka@example.org',
    full_name: 'Aiko Tanaka',
    avatar_url: null,
    role: 'customer',
    created_at: daysAgo(64),
    updated_at: daysAgo(9)
  },
  {
    id: MOCK_PROFILE_IDS.thirdCustomer,
    email: 'samuel.ortiz@example.org',
    full_name: 'Samuel Ortiz',
    avatar_url: null,
    role: 'customer',
    created_at: daysAgo(31),
    updated_at: daysAgo(6)
  }
]);

export function findMockProfileByEmail(email: string): ProfileRow | null {
  const needle = email.trim().toLowerCase();
  return MOCK_PROFILES.find((profile) => profile.email.toLowerCase() === needle) ?? null;
}

export function findMockProfileById(id: string): ProfileRow | null {
  return MOCK_PROFILES.find((profile) => profile.id === id) ?? null;
}

/** Agents and admins, i.e. everyone a ticket may be assigned to. */
export function assignableMockProfiles(): readonly ProfileRow[] {
  return Object.freeze(MOCK_PROFILES.filter((profile) => profile.role !== 'customer'));
}

export function mockTimestamp(hours: number): string {
  return hoursAgo(hours);
}