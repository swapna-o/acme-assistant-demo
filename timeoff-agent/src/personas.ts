import type { Role } from '../shared/types'

export interface Persona {
  key: string
  label: string
  name: string
  email: string
  ragUser: string      // matching user in the HR policy RAG demo
  blurb: string
  role: Role
}

export const PERSONAS: Persona[] = [
  { key: 'employee', label: 'Employee', name: 'Alex Chen', email: 'alex.chen@acme.com', ragUser: 'alice@corp.com', blurb: 'Senior engineer, sees the on-call policy', role: 'employee' },
  { key: 'parttime', label: 'Part-time employee', name: 'Priya Sharma', email: 'priya.sharma@acme.com', ragUser: 'dave@corp.com', blurb: 'UX designer, 3 days a week', role: 'employee' },
  { key: 'contractor', label: 'Contractor', name: 'Marcus Johnson', email: 'marcus.johnson@acme.com', ragUser: 'contractor@ext.com', blurb: 'Contract developer, no paid leave', role: 'employee' },
  { key: 'sarah', label: 'Employee (US)', name: 'Sarah Kim', email: 'sarah.kim@acme.com', ragUser: 'sarah@corp.com', blurb: 'Engineer in California, parental leave under US rules', role: 'employee' },
  { key: 'ananya', label: 'Employee (India)', name: 'Ananya Iyer', email: 'ananya.iyer@acme.com', ragUser: 'ananya@corp.com', blurb: 'Engineer in Bengaluru, parental leave under India rules', role: 'employee' },
  { key: 'rohan', label: 'Manager (India)', name: 'Rohan Mehta', email: 'rohan.mehta@acme.com', ragUser: 'rohan@corp.com', blurb: 'Engineering manager in Bengaluru, Ananya\'s team', role: 'manager' },
  { key: 'manager', label: 'Manager', name: 'Jordan Park', email: 'jordan.park@acme.com', ragUser: 'carol@corp.com', blurb: 'Engineering manager, approves the team\'s time off', role: 'manager' },
  { key: 'hr', label: 'HR admin', name: 'Bob Rivera', email: 'bob.rivera@acme.com', ragUser: 'bob@corp.com', blurb: 'HR business partner, sees compensation bands', role: 'hr_admin' },
]

export type UseCaseKey = 'ask' | 'library' | 'requests' | 'approvals' | 'org'

/** Nav groups. 'Ask' is rendered without a label: it is the front door, not a category. */
export type Moment = 'Ask' | 'Policies' | 'Time off'
export const MOMENTS: Moment[] = ['Ask', 'Policies', 'Time off']

export interface UseCase {
  key: UseCaseKey
  group: Moment
  label: string
  icon: string
  tagline: string
  availableFor: (p: Persona) => boolean
  suggestions: (p: Persona) => string[]
}

export const USE_CASES: UseCase[] = [
  {
    key: 'ask', group: 'Ask', label: 'Ask', icon: '◎',
    tagline: 'Ask a question and get the policy with its source, or ask for time off and the assistant takes it from there.',
    availableFor: () => true,
    // Policy phrasings checked against the RAG demo's offline embedder; the last chip in each set is a deliberate miss for that persona.
    suggestions: p => {
      if (p.role === 'hr_admin') return ['What are the compensation bands for executives?', '5 days around Thanksgiving', 'How long is parental leave?', 'What is the engineering on-call policy?']
      if (p.key === 'rohan') return ["Who's out on my team?", 'How much parental leave do my reports get?', 'I want to book a vacation', 'Can I carry over unused PTO?']
      if (p.role === 'manager') return ['I want to book a vacation', "Who's out on my team?", 'Can I carry over unused PTO?', 'What are the compensation bands for executives?']
      if (p.key === 'contractor') return ['I want to book a vacation', 'What is the code of conduct?', 'How much notice do I need?', 'Can I carry over unused PTO?']
      if (p.key === 'sarah' || p.key === 'ananya') return ['How much maternity leave do I get?', 'I want to book a vacation', 'Can I carry over unused PTO?', 'How long is parental leave?']
      if (p.key === 'parttime') return ['I want to book a vacation', 'Can I carry over unused PTO?', 'What are my balances?', 'What is the engineering on-call policy?']
      return ['I want to book a vacation', 'Can I carry over unused PTO?', 'What is the engineering on-call policy?', 'What are the compensation bands for executives?']
    },
  },
  {
    key: 'library', group: 'Policies', label: 'Library', icon: '📚',
    tagline: 'The policies that apply to you, in full.',
    availableFor: () => true,
    suggestions: () => [],
  },
  {
    key: 'requests', group: 'Time off', label: 'My requests', icon: '🏖️',
    tagline: 'Everything you have asked for, and where it stands.',
    availableFor: () => true,
    suggestions: () => [],
  },
  {
    key: 'approvals', group: 'Time off', label: 'Team approvals', icon: '✅',
    tagline: 'Everyone on your team who is out, and the requests waiting on you.',
    availableFor: p => p.role === 'manager',
    suggestions: () => [],
  },
  {
    key: 'org', group: 'Time off', label: 'Org overview', icon: '🗓️',
    tagline: 'Every request across the company, read-only.',
    availableFor: p => p.role === 'hr_admin',
    suggestions: () => [],
  },
]
