import { DemoTicketSeed } from './environment.interface';

/**
 * Sample conversation for the offline workspace.
 *
 * Imported only by the `demo` and `development` targets, so a production
 * bundle carries the offline backend without carrying fabricated ticket
 * content. Every identity referenced here is declared in the same file's
 * `demoIdentities` list.
 */
/**
 * Identities referenced by the seeds. The `demo` and `development` targets build
 * their `demoIdentities` lists from these same values, so a ticket can never point
 * at an address that is not in the directory.
 */
export const DEMO_PROFILE_IDS = {
  admin: '5f2b9c10-0001-4c7a-9a11-000000000001',
  agent: '5f2b9c10-0002-4c7a-9a11-000000000002',
  secondAgent: '5f2b9c10-0003-4c7a-9a11-000000000003',
  customer: '5f2b9c10-0004-4c7a-9a11-000000000004',
  secondCustomer: '5f2b9c10-0005-4c7a-9a11-000000000005',
  thirdCustomer: '5f2b9c10-0006-4c7a-9a11-000000000006'
} as const;

export const DEMO_TICKET_SEEDS: readonly DemoTicketSeed[] = [
  {
    requesterId: DEMO_PROFILE_IDS.customer,
    assigneeId: null,
    subject: 'March invoice export downloads an empty file',
    status: 'new',
    priority: 'high',
    type: 'incident',
    tags: ['billing', 'export'],
    createdHoursAgo: 2,
    comments: [
      {
        authorId: DEMO_PROFILE_IDS.customer,
        body: 'Our finance team runs the invoice export every last working day of the month. Since the February release the download is a 0 byte file, both from the UI and from the scheduled job. Nothing changed on our side.'
      }
    ]
  },
  {
    requesterId: DEMO_PROFILE_IDS.secondCustomer,
    assigneeId: DEMO_PROFILE_IDS.agent,
    subject: 'Cannot add a second billing contact to our workspace',
    status: 'open',
    priority: 'normal',
    type: 'problem',
    tags: ['accounts', 'contacts'],
    createdHoursAgo: 7,
    comments: [
      {
        authorId: DEMO_PROFILE_IDS.secondCustomer,
        body: 'The "Add contact" button is greyed out for our second billing contact. We have owner, admin and billing roles assigned already.'
      },
      {
        authorId: DEMO_PROFILE_IDS.agent,
        body: 'Thanks for the screenshots. The workspace is on the legacy contact model, which only allows one billing contact. I am checking with the account team whether we can move you across.'
      }
    ]
  },
  {
    requesterId: DEMO_PROFILE_IDS.thirdCustomer,
    assigneeId: null,
    subject: 'SSO login loop for users with two email addresses',
    status: 'new',
    priority: 'urgent',
    type: 'incident',
    tags: ['sso', 'login'],
    createdHoursAgo: 11,
    comments: [
      {
        authorId: DEMO_PROFILE_IDS.thirdCustomer,
        body: 'Around forty users are bounced back to the sign in page after the identity provider. They all have a personal address as a secondary alias.'
      }
    ]
  },
  {
    requesterId: DEMO_PROFILE_IDS.customer,
    assigneeId: DEMO_PROFILE_IDS.secondAgent,
    subject: 'Webhook retries are duplicating order updates',
    status: 'pending',
    priority: 'normal',
    type: 'problem',
    tags: ['api', 'webhooks'],
    createdHoursAgo: 26,
    comments: [
      {
        authorId: DEMO_PROFILE_IDS.customer,
        body: 'We receive the same order.updated event two or three times when our endpoint takes longer than two seconds to answer.'
      },
      {
        authorId: DEMO_PROFILE_IDS.secondAgent,
        body: 'That matches the retry window we changed last quarter. Could you send a request id from one duplicated delivery so I can look at the attempt log?'
      }
    ]
  },
  {
    requesterId: DEMO_PROFILE_IDS.secondCustomer,
    assigneeId: DEMO_PROFILE_IDS.agent,
    subject: 'How do I move a ticket to a different team?',
    status: 'solved',
    priority: 'low',
    type: 'question',
    tags: [],
    createdHoursAgo: 50,
    solvedHoursAgo: 44,
    comments: [
      {
        authorId: DEMO_PROFILE_IDS.secondCustomer,
        body: 'We want to route billing questions to a different group of agents without reassigning every ticket by hand.'
      },
      {
        authorId: DEMO_PROFILE_IDS.agent,
        body: 'Open the ticket properties and pick a different team in the assignee field. The view on the left filters by team afterwards.',
        hoursAgo: 46
      },
      {
        authorId: DEMO_PROFILE_IDS.secondCustomer,
        body: 'That is exactly what we needed. Thank you.',
        hoursAgo: 44
      }
    ]
  },
  {
    requesterId: DEMO_PROFILE_IDS.thirdCustomer,
    assigneeId: DEMO_PROFILE_IDS.agent,
    subject: 'Attachment upload fails for files larger than 4 MB',
    status: 'open',
    priority: 'normal',
    type: 'incident',
    tags: ['attachments', 'upload'],
    createdHoursAgo: 73,
    comments: [
      {
        authorId: DEMO_PROFILE_IDS.thirdCustomer,
        body: 'Screenshots of 4.5 MB fail with "upload failed". Smaller files go through.'
      },
      {
        authorId: DEMO_PROFILE_IDS.agent,
        body: 'Confirmed on our side as well. The storage limit is currently applied lower than the documented 10 MB.',
        hoursAgo: 60
      },
      {
        authorId: DEMO_PROFILE_IDS.agent,
        body: 'Infrastructure ticket raised internally, reference OPS-2291. I will keep this thread updated.',
        hoursAgo: 58,
        isInternal: true
      }
    ]
  },
  {
    requesterId: DEMO_PROFILE_IDS.customer,
    assigneeId: DEMO_PROFILE_IDS.agent,
    subject: 'Password reset emails never arrive',
    status: 'solved',
    priority: 'urgent',
    type: 'incident',
    tags: ['login', 'email'],
    createdHoursAgo: 96,
    solvedHoursAgo: 90,
    comments: [
      {
        authorId: DEMO_PROFILE_IDS.customer,
        body: 'Three colleagues asked for a reset link this morning and none of the emails arrived, including the spam folder.'
      },
      {
        authorId: DEMO_PROFILE_IDS.agent,
        body: 'Our mail provider was rate limiting the workspace. The limit is lifted and pending resets go out on the next retry.',
        hoursAgo: 92
      },
      {
        authorId: DEMO_PROFILE_IDS.customer,
        body: 'All three people are back in. Thanks for the quick turnaround.',
        hoursAgo: 90
      }
    ]
  },
  {
    requesterId: DEMO_PROFILE_IDS.secondCustomer,
    assigneeId: null,
    subject: 'Custom fields are missing from the ticket export',
    status: 'new',
    priority: 'low',
    type: 'task',
    tags: ['export'],
    createdHoursAgo: 120,
    comments: [
      {
        authorId: DEMO_PROFILE_IDS.secondCustomer,
        body: 'We added a "Region" field last month. It shows in the UI but not in the CSV we download each Monday.'
      }
    ]
  },
  {
    requesterId: DEMO_PROFILE_IDS.thirdCustomer,
    assigneeId: DEMO_PROFILE_IDS.secondAgent,
    subject: 'Audit log retention: can we extend beyond 90 days?',
    status: 'closed',
    priority: 'normal',
    type: 'question',
    tags: ['compliance', 'audit'],
    createdHoursAgo: 240,
    solvedHoursAgo: 200,
    comments: [
      {
        authorId: DEMO_PROFILE_IDS.thirdCustomer,
        body: 'Our auditors ask for a year of change history. The workspace only keeps 90 days.'
      },
      {
        authorId: DEMO_PROFILE_IDS.secondAgent,
        body: 'Retention can be raised to 400 days on your plan. I have sent the self service form.',
        hoursAgo: 230
      },
      {
        authorId: DEMO_PROFILE_IDS.thirdCustomer,
        body: 'Form submitted, thank you for confirming the limit.',
        hoursAgo: 225
      }
    ]
  },
  {
    requesterId: DEMO_PROFILE_IDS.customer,
    assigneeId: DEMO_PROFILE_IDS.agent,
    subject: 'Ticket numbers restarted after the workspace merge',
    status: 'pending',
    priority: 'normal',
    type: 'question',
    tags: ['accounts'],
    createdHoursAgo: 300,
    comments: [
      {
        authorId: DEMO_PROFILE_IDS.customer,
        body: 'After we merged the two workspaces our ticket numbers started again at 1, which breaks the reference in our audit documents.'
      },
      {
        authorId: DEMO_PROFILE_IDS.agent,
        body: 'Numbering is continuous per workspace in the current release. I am checking whether the merged workspace can keep its original range.',
        hoursAgo: 280
      }
    ]
  }
];
