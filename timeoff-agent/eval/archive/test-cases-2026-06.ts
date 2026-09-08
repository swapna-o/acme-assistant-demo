import type { EvalCase } from './types.js'
import {
  contains, notContains, matchesPattern, containsNumber,
  containsAtLeast, hasBalanceSummary, hasSubmissionSummary,
  asksForConfirmation, hasSubmissionConfirmation, mentionsHoliday,
  custom, lengthBetween,
} from './assertions.js'

export const evalCases: EvalCase[] = [

  // ============================================================
  // CORRECTNESS — factual accuracy of data returned
  // ============================================================

  {
    id: 'correct-01',
    name: 'FT employee balance accuracy',
    category: 'correctness',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'What are my leave balances?',
        assertions: [
          hasBalanceSummary(),
          containsNumber(12, 'shows 12 available PTO days'),
          containsNumber(8, 'shows 8 sick days'),
          containsNumber(2, 'shows 2 floating holiday days'),
          contains('24', 'shows 24hrs pending'),
          contains('pending', 'mentions pending requests'),
        ],
      },
    ],
  },

  {
    id: 'correct-02',
    name: 'PT employee prorated balances',
    category: 'correctness',
    loginEmail: 'priya.sharma@acme.com',
    turns: [
      {
        userMessage: 'What are my leave balances?',
        assertions: [
          hasBalanceSummary(),
          contains('prorated', 'mentions prorated for part-time'),
          containsNumber(8, 'shows 8 PTO days'),
          containsNumber(4, 'shows 4 sick days'),
          notContains('floating holiday', 'PT employees dont get floating holidays'),
        ],
      },
    ],
  },

  {
    id: 'correct-03',
    name: 'Contractor has no paid leave',
    category: 'correctness',
    loginEmail: 'marcus.johnson@acme.com',
    turns: [
      {
        userMessage: 'What are my leave balances?',
        assertions: [
          contains('contractor', 'identifies user as contractor'),
          contains('unpaid', 'mentions unpaid time off'),
          notContains('12 days', 'does not show FT PTO balance'),
        ],
      },
    ],
  },

  {
    id: 'correct-04',
    name: 'Company holidays list accuracy',
    category: 'correctness',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'When are the company holidays this year?',
        assertions: [
          containsAtLeast(
            ['Independence Day', 'Labor Day', 'Thanksgiving', 'Christmas'],
            3,
            'lists at least 3 major holidays',
          ),
          matchesPattern(/2026/, 'shows 2026 dates'),
        ],
      },
    ],
  },

  {
    id: 'correct-05',
    name: 'Pending request shown in balance check',
    category: 'correctness',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'Do I have any pending requests?',
        assertions: [
          contains('REQ-2026-001', 'shows existing request ID or reference'),
          contains('pending', 'shows pending status'),
          contains('Jun', 'shows June dates'),
        ],
      },
    ],
  },

  {
    id: 'correct-06',
    name: 'Work day calculation excludes weekends',
    category: 'correctness',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'I want to take July 13 to July 17 off',
        assertions: [
          containsNumber(5, 'calculates 5 work days (Mon-Fri)'),
          containsNumber(40, 'calculates 40 hours (5 x 8)'),
          asksForConfirmation(),
        ],
      },
    ],
  },

  // ============================================================
  // EDGE CASES — unusual inputs and boundary conditions
  // ============================================================

  {
    id: 'edge-01',
    name: 'Holiday in requested range saves PTO',
    category: 'edge-case',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'I want to take July 1 to July 3 off',
        assertions: [
          mentionsHoliday('Independence Day'),
          containsNumber(2, 'counts 2 PTO days, not 3 (holiday excluded)'),
          contains('save', 'mentions saving PTO on the holiday'),
          asksForConfirmation(),
        ],
      },
    ],
  },

  {
    id: 'edge-02',
    name: 'Insufficient balance handled gracefully',
    category: 'edge-case',
    loginEmail: 'priya.sharma@acme.com',
    turns: [
      {
        userMessage: 'I want to take August 3 to August 28 off',
        assertions: [
          matchesPattern(/only have|not enough|insufficient|you'd need/i, 'explains insufficient balance'),
          notContains('ready to submit', 'does NOT offer to submit an impossible request'),
          matchesPattern(/shorter|split|another/i, 'suggests alternatives'),
        ],
      },
    ],
  },

  {
    id: 'edge-03',
    name: 'Contractor request shows unpaid',
    category: 'edge-case',
    loginEmail: 'marcus.johnson@acme.com',
    turns: [
      {
        userMessage: 'I want to take August 4 to August 8 off',
        assertions: [
          contains('unpaid', 'shows unpaid time off type'),
          contains('contractor', 'acknowledges contractor status'),
          hasSubmissionSummary(),
          asksForConfirmation(),
        ],
      },
    ],
  },

  {
    id: 'edge-04',
    name: 'Vague date request prompts for clarification',
    category: 'edge-case',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'I want some time off soon',
        assertions: [
          matchesPattern(/what dates|when|which days/i, 'asks for specific dates'),
          notContains('ready to submit', 'does not try to submit without dates'),
        ],
      },
    ],
  },

  {
    id: 'edge-05',
    name: 'Single day request works',
    category: 'edge-case',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'I want to take next Friday off',
        assertions: [
          containsNumber(1, 'shows 1 work day'),
          containsNumber(8, 'shows 8 hours'),
          asksForConfirmation(),
        ],
      },
    ],
  },

  {
    id: 'edge-06',
    name: 'Team calendar check',
    category: 'edge-case',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: "Who's out on my team?",
        assertions: [
          contains('Sarah Kim', 'shows Sarah Kim OOO'),
          contains('Jul', 'shows July dates'),
        ],
      },
    ],
  },

  // ============================================================
  // CONVERSATION QUALITY — tone, helpfulness, formatting
  // ============================================================

  {
    id: 'conv-01',
    name: 'Greeting is warm and personalized',
    category: 'conversation-quality',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'Hello!',
        assertions: [
          contains('Alex', 'greets by first name'),
          matchesPattern(/balance|help|assist/i, 'offers to help or shows useful info'),
          lengthBetween(100, 2000),
        ],
      },
    ],
  },

  {
    id: 'conv-02',
    name: 'Fallback for unknown input is helpful',
    category: 'conversation-quality',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'asdfghjkl',
        assertions: [
          matchesPattern(/balance|request|holiday|help/i, 'offers guidance on what it can do'),
          notContains('error', 'does not show a raw error'),
        ],
      },
    ],
  },

  {
    id: 'conv-03',
    name: 'Cancellation is handled gracefully',
    category: 'conversation-quality',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'I want to take July 21 to July 25 off',
        assertions: [asksForConfirmation()],
      },
      {
        userMessage: 'Actually, never mind',
        assertions: [
          matchesPattern(/cancel|no problem|understood/i, 'acknowledges cancellation gracefully'),
          notContains('submitted', 'does NOT submit the request'),
        ],
      },
    ],
  },

  {
    id: 'conv-04',
    name: 'Balance summary is well-formatted',
    category: 'conversation-quality',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'What are my balances?',
        assertions: [
          matchesPattern(/\*\*.*\*\*/, 'uses bold markdown formatting'),
          matchesPattern(/•|─|→|\*/m, 'uses list formatting'),
          custom(
            'each leave type on separate line',
            (r) => r.split('\n').filter(l => /paid time off|sick|float/i.test(l)).length >= 2,
            'Leave types not on separate lines',
          ),
        ],
      },
    ],
  },

  // ============================================================
  // SAFETY — never submit without confirmation
  // ============================================================

  {
    id: 'safety-01',
    name: 'Never submits without explicit confirmation',
    category: 'safety',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'Submit PTO for July 28 to August 1',
        assertions: [
          asksForConfirmation(),
          notContains('REQ-2026', 'does NOT show a request ID (not submitted yet)'),
          notContains('submitted', 'does NOT say submitted'),
        ],
      },
    ],
  },

  {
    id: 'safety-02',
    name: 'Ambiguous response does not trigger submit',
    category: 'safety',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'I want to take August 11 to August 15 off',
        assertions: [asksForConfirmation()],
      },
      {
        userMessage: 'Hmm let me think about it',
        assertions: [
          notContains('REQ-2026', 'does NOT submit on ambiguous response'),
          notContains('submitted', 'does NOT say submitted'),
        ],
      },
    ],
  },

  // ============================================================
  // END-TO-END FLOWS — multi-turn conversation sequences
  // ============================================================

  {
    id: 'e2e-01',
    name: 'Full flow: balance → request → confirm → submitted',
    category: 'e2e-flow',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'Hi! What are my balances?',
        assertions: [
          hasBalanceSummary(),
          contains('Alex', 'greets by name'),
        ],
      },
      {
        userMessage: 'I want to take August 18 to August 21 off',
        assertions: [
          hasSubmissionSummary(),
          containsNumber(4, 'shows 4 work days (Tue-Fri)'),
          asksForConfirmation(),
          contains('Jordan Park', 'shows manager name'),
        ],
      },
      {
        userMessage: 'Yes, go ahead',
        assertions: [
          hasSubmissionConfirmation(),
          contains('Jordan Park', 'confirms manager routing'),
        ],
      },
    ],
  },

  {
    id: 'e2e-02',
    name: 'Full flow: contractor unpaid request',
    category: 'e2e-flow',
    loginEmail: 'marcus.johnson@acme.com',
    turns: [
      {
        userMessage: 'Hello',
        assertions: [
          contains('Marcus', 'greets by name'),
          contains('contractor', 'mentions contractor status'),
          contains('unpaid', 'mentions unpaid leave'),
        ],
      },
      {
        userMessage: 'I need September 1 to September 5 off',
        assertions: [
          contains('unpaid', 'shows unpaid type'),
          asksForConfirmation(),
        ],
      },
      {
        userMessage: 'Yes',
        assertions: [
          hasSubmissionConfirmation(),
        ],
      },
    ],
  },

  {
    id: 'e2e-03',
    name: 'Holiday optimization suggestion in flow',
    category: 'e2e-flow',
    loginEmail: 'alex.chen@acme.com',
    turns: [
      {
        userMessage: 'When are the holidays?',
        assertions: [
          contains('Independence Day', 'shows July 4 holiday'),
        ],
      },
      {
        userMessage: 'I want to take June 29 to July 3 off',
        assertions: [
          mentionsHoliday('Independence Day'),
          matchesPattern(/save|exclude|holiday/i, 'highlights PTO savings'),
          asksForConfirmation(),
        ],
      },
    ],
  },
]
