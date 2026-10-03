import { environment } from '../../../environments/environment';
import { DemoTicketSeed } from '../../../environments/environment.interface';
import {
  ProfileRow,
  TicketAuditLogRow,
  TicketCommentRow,
  TicketPriority,
  TicketRow,
  TicketStatus,
  TicketType
} from '../models/database.types';

/**
 * Ticket history for the offline `demo` build, plus lookups into the identity
 * directory that `environment.demo.ts` declares.
 *
 * The directory itself lives in the environment file so a production bundle,
 * which replaces it with an empty list, carries none of the showcase addresses.
 * Timestamps here are generated relative to the moment the app loads, so the
 * showcase always looks like a workspace that was being worked on an hour ago.
 */

/** Local storage key holding the demo session email. */
export const MOCK_SESSION_KEY = 'MOCK_SESSION_V1';

/** Local storage key holding the demo dataset, including anything changed in the browser. */
export const MOCK_DATA_KEY = 'MOCK_DATA_V1';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}

/**
 * Identity id for a role, taken from the directory the environment declares.
 *
 * A build with no directory (production) falls back to a stable synthetic id, so
 * the offline backend still constructs and an empty workspace still opens
 * instead of the module failing at import time.
 */
function idForRole(role: ProfileRow['role'], ordinal = 0): string {
  const matches = environment.demoIdentities.filter((identity) => identity.role === role);
  return matches[ordinal]?.id ?? `offline-${role}-${ordinal + 1}`;
}

/**
 * The fixture keys point at the identities declared by the demo environment, so
 * the two can never drift apart.
 */
export const MOCK_PROFILE_IDS = {
  admin: idForRole('admin'),
  agent: idForRole('agent'),
  secondAgent: idForRole('agent', 1),
  customer: idForRole('customer'),
  secondCustomer: idForRole('customer', 1),
  thirdCustomer: idForRole('customer', 2)
} as const;

export const MOCK_PROFILES: readonly ProfileRow[] = Object.freeze(
  environment.demoIdentities.map((identity, index) => ({
    id: identity.id,
    email: identity.email,
    full_name: identity.fullName,
    avatar_url: null,
    role: identity.role,
    created_at: daysAgo(420 - index * 57),
    updated_at: daysAgo(40 - index * 5)
  }))
);

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


/** Builds a stable RFC 4122 shaped id from an 8 character prefix and a sequence number. */
function seededUuid(prefix: string, sequence: number): string {
  return `${prefix}-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

export interface MockDataset {
  readonly tickets: readonly TicketRow[];
  readonly comments: readonly TicketCommentRow[];
  readonly auditLogs: readonly TicketAuditLogRow[];
}

/**
 * Builds the starting dataset. Ids and numbers are derived from the position in
 * `SEEDS`, so the same ticket keeps the same identity across reloads.
 */
export function buildMockDataset(): MockDataset {
  const seeds: readonly DemoTicketSeed[] = environment.demoTicketSeeds;
  const tickets: TicketRow[] = [];
  const comments: TicketCommentRow[] = [];
  const auditLogs: TicketAuditLogRow[] = [];

  seeds.forEach((seed, index) => {
    const ticketId = seededUuid('7c1d4e20', index + 1);
    const createdAt = hoursAgo(seed.createdHoursAgo);
    const lastActivity = seed.comments.reduce(
      (latest, comment) =>
        Math.max(latest, Date.parse(hoursAgo(comment.hoursAgo ?? seed.createdHoursAgo))),
      Date.parse(createdAt)
    );

    tickets.push({
      id: ticketId,
      ticket_number: 1042 + index,
      requester_id: seed.requesterId,
      assignee_id: seed.assigneeId,
      subject: seed.subject,
      status: seed.status,
      priority: seed.priority,
      type: seed.type,
      tags: [...seed.tags],
      version: 1 + (seed.status === 'new' ? 0 : 1) + (seed.assigneeId ? 1 : 0),
      created_at: createdAt,
      updated_at: new Date(lastActivity).toISOString(),
      solved_at: seed.solvedHoursAgo === undefined ? null : hoursAgo(seed.solvedHoursAgo)
    });

    seed.comments.forEach((comment, commentIndex) => {
      const commentHoursAgo = comment.hoursAgo ?? seed.createdHoursAgo;
      comments.push({
        id: seededUuid('8d2e5f31', (index + 1) * 100 + commentIndex),
        ticket_id: ticketId,
        author_id: comment.authorId,
        body: comment.body,
        is_internal: comment.isInternal === true,
        attachments: [],
        created_at: hoursAgo(commentHoursAgo)
      });
    });

    auditLogs.push({
      id: seededUuid('9e3f6042', index + 1),
      ticket_id: ticketId,
      actor_id: seed.requesterId,
      action: 'ticket_created',
      changes: { subject: { from: null, to: seed.subject } },
      created_at: createdAt
    });

    if (seed.assigneeId) {
      auditLogs.push({
        id: seededUuid('9e3f6042', 500 + index),
        ticket_id: ticketId,
        actor_id: seed.assigneeId,
        action: 'ticket_updated',
        changes: { assignee_id: { from: null, to: seed.assigneeId } },
        created_at: new Date(lastActivity).toISOString()
      });
    }
  });

  return { tickets, comments, auditLogs };
}