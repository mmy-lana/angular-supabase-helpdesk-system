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
 * Synthetic directory and ticket history used by the offline `demo` build.
 *
 * Every address is an RFC 2606 reserved domain and every identity is fictional:
 * `agent@example.com` and `customer@example.com` are the two addresses the demo
 * login screen offers, the rest only exist to make lists and assignment pickers
 * look like a real workspace.
 *
 * Timestamps are generated relative to the moment the app loads, so the showcase
 * always looks like a workspace that was being worked on an hour ago.
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

export const MOCK_PROFILES: readonly ProfileRow[] = Object.freeze([
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
    id: MOCK_PROFILE_IDS.agent,
    email: 'agent@example.com',
    full_name: 'Nina Okafor',
    avatar_url: null,
    role: 'agent',
    created_at: daysAgo(180),
    updated_at: daysAgo(12)
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
    id: MOCK_PROFILE_IDS.customer,
    email: 'customer@example.com',
    full_name: 'Tomas Eriksen',
    avatar_url: null,
    role: 'customer',
    created_at: daysAgo(96),
    updated_at: daysAgo(3)
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

interface CommentSeed {
  readonly authorId: string;
  readonly body: string;
  /** Defaults to the age of the ticket, i.e. the opening message. */
  readonly hoursAgo?: number;
  readonly isInternal?: boolean;
}

interface TicketSeed {
  readonly requesterId: string;
  readonly assigneeId: string | null;
  readonly subject: string;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly type: TicketType;
  readonly tags: readonly string[];
  readonly createdHoursAgo: number;
  readonly solvedHoursAgo?: number;
  readonly comments: readonly CommentSeed[];
}

const SEEDS: readonly TicketSeed[] = [
  {
    requesterId: MOCK_PROFILE_IDS.customer,
    assigneeId: null,
    subject: 'March invoice export downloads an empty file',
    status: 'new',
    priority: 'high',
    type: 'incident',
    tags: ['billing', 'export'],
    createdHoursAgo: 2,
    comments: [
      {
        authorId: MOCK_PROFILE_IDS.customer,
        body: 'Our finance team runs the invoice export every last working day of the month. Since the February release the download is a 0 byte file, both from the UI and from the scheduled job. Nothing changed on our side.'
      }
    ]
  },
  {
    requesterId: MOCK_PROFILE_IDS.secondCustomer,
    assigneeId: MOCK_PROFILE_IDS.agent,
    subject: 'Cannot add a second billing contact to our workspace',
    status: 'open',
    priority: 'normal',
    type: 'problem',
    tags: ['accounts', 'contacts'],
    createdHoursAgo: 7,
    comments: [
      {
        authorId: MOCK_PROFILE_IDS.secondCustomer,
        body: 'The "Add contact" button is greyed out for our second billing contact. We have owner, admin and billing roles assigned already.'
      },
      {
        authorId: MOCK_PROFILE_IDS.agent,
        body: 'Thanks for the screenshots. The workspace is on the legacy contact model, which only allows one billing contact. I am checking with the account team whether we can move you across.'
      }
    ]
  },
  {
    requesterId: MOCK_PROFILE_IDS.thirdCustomer,
    assigneeId: null,
    subject: 'SSO login loop for users with two email addresses',
    status: 'new',
    priority: 'urgent',
    type: 'incident',
    tags: ['sso', 'login'],
    createdHoursAgo: 11,
    comments: [
      {
        authorId: MOCK_PROFILE_IDS.thirdCustomer,
        body: 'Around forty users are bounced back to the sign in page after the identity provider. They all have a personal address as a secondary alias.'
      }
    ]
  },
  {
    requesterId: MOCK_PROFILE_IDS.customer,
    assigneeId: MOCK_PROFILE_IDS.secondAgent,
    subject: 'Webhook retries are duplicating order updates',
    status: 'pending',
    priority: 'normal',
    type: 'problem',
    tags: ['api', 'webhooks'],
    createdHoursAgo: 26,
    comments: [
      {
        authorId: MOCK_PROFILE_IDS.customer,
        body: 'We receive the same order.updated event two or three times when our endpoint takes longer than two seconds to answer.'
      },
      {
        authorId: MOCK_PROFILE_IDS.secondAgent,
        body: 'That matches the retry window we changed last quarter. Could you send a request id from one duplicated delivery so I can look at the attempt log?'
      }
    ]
  },
  {
    requesterId: MOCK_PROFILE_IDS.secondCustomer,
    assigneeId: MOCK_PROFILE_IDS.agent,
    subject: 'How do I move a ticket to a different team?',
    status: 'solved',
    priority: 'low',
    type: 'question',
    tags: [],
    createdHoursAgo: 50,
    solvedHoursAgo: 44,
    comments: [
      {
        authorId: MOCK_PROFILE_IDS.secondCustomer,
        body: 'We want to route billing questions to a different group of agents without reassigning every ticket by hand.'
      },
      {
        authorId: MOCK_PROFILE_IDS.agent,
        body: 'Open the ticket properties and pick a different team in the assignee field. The view on the left filters by team afterwards.',
        hoursAgo: 46
      },
      {
        authorId: MOCK_PROFILE_IDS.secondCustomer,
        body: 'That is exactly what we needed. Thank you.',
        hoursAgo: 44
      }
    ]
  },
  {
    requesterId: MOCK_PROFILE_IDS.thirdCustomer,
    assigneeId: MOCK_PROFILE_IDS.agent,
    subject: 'Attachment upload fails for files larger than 4 MB',
    status: 'open',
    priority: 'normal',
    type: 'incident',
    tags: ['attachments', 'upload'],
    createdHoursAgo: 73,
    comments: [
      {
        authorId: MOCK_PROFILE_IDS.thirdCustomer,
        body: 'Screenshots of 4.5 MB fail with "upload failed". Smaller files go through.'
      },
      {
        authorId: MOCK_PROFILE_IDS.agent,
        body: 'Confirmed on our side as well. The storage limit is currently applied lower than the documented 10 MB.',
        hoursAgo: 60
      },
      {
        authorId: MOCK_PROFILE_IDS.agent,
        body: 'Infrastructure ticket raised internally, reference OPS-2291. I will keep this thread updated.',
        hoursAgo: 58,
        isInternal: true
      }
    ]
  },
  {
    requesterId: MOCK_PROFILE_IDS.customer,
    assigneeId: MOCK_PROFILE_IDS.agent,
    subject: 'Password reset emails never arrive',
    status: 'solved',
    priority: 'urgent',
    type: 'incident',
    tags: ['login', 'email'],
    createdHoursAgo: 96,
    solvedHoursAgo: 90,
    comments: [
      {
        authorId: MOCK_PROFILE_IDS.customer,
        body: 'Three colleagues asked for a reset link this morning and none of the emails arrived, including the spam folder.'
      },
      {
        authorId: MOCK_PROFILE_IDS.agent,
        body: 'Our mail provider was rate limiting the workspace. The limit is lifted and pending resets go out on the next retry.',
        hoursAgo: 92
      },
      {
        authorId: MOCK_PROFILE_IDS.customer,
        body: 'All three people are back in. Thanks for the quick turnaround.',
        hoursAgo: 90
      }
    ]
  },
  {
    requesterId: MOCK_PROFILE_IDS.secondCustomer,
    assigneeId: null,
    subject: 'Custom fields are missing from the ticket export',
    status: 'new',
    priority: 'low',
    type: 'task',
    tags: ['export'],
    createdHoursAgo: 120,
    comments: [
      {
        authorId: MOCK_PROFILE_IDS.secondCustomer,
        body: 'We added a "Region" field last month. It shows in the UI but not in the CSV we download each Monday.'
      }
    ]
  },
  {
    requesterId: MOCK_PROFILE_IDS.thirdCustomer,
    assigneeId: MOCK_PROFILE_IDS.secondAgent,
    subject: 'Audit log retention: can we extend beyond 90 days?',
    status: 'closed',
    priority: 'normal',
    type: 'question',
    tags: ['compliance', 'audit'],
    createdHoursAgo: 240,
    solvedHoursAgo: 200,
    comments: [
      {
        authorId: MOCK_PROFILE_IDS.thirdCustomer,
        body: 'Our auditors ask for a year of change history. The workspace only keeps 90 days.'
      },
      {
        authorId: MOCK_PROFILE_IDS.secondAgent,
        body: 'Retention can be raised to 400 days on your plan. I have sent the self service form.',
        hoursAgo: 230
      },
      {
        authorId: MOCK_PROFILE_IDS.thirdCustomer,
        body: 'Form submitted, thank you for confirming the limit.',
        hoursAgo: 225
      }
    ]
  },
  {
    requesterId: MOCK_PROFILE_IDS.customer,
    assigneeId: MOCK_PROFILE_IDS.agent,
    subject: 'Ticket numbers restarted after the workspace merge',
    status: 'pending',
    priority: 'normal',
    type: 'question',
    tags: ['accounts'],
    createdHoursAgo: 300,
    comments: [
      {
        authorId: MOCK_PROFILE_IDS.customer,
        body: 'After we merged the two workspaces our ticket numbers started again at 1, which breaks the reference in our audit documents.'
      },
      {
        authorId: MOCK_PROFILE_IDS.agent,
        body: 'Numbering is continuous per workspace in the current release. I am checking whether the merged workspace can keep its original range.',
        hoursAgo: 280
      }
    ]
  }
];

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
  const tickets: TicketRow[] = [];
  const comments: TicketCommentRow[] = [];
  const auditLogs: TicketAuditLogRow[] = [];

  SEEDS.forEach((seed, index) => {
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