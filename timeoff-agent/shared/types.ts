export type Role = 'employee' | 'manager' | 'hr_admin' | 'it_support'

export interface Employee {
  employeeId: string
  name: string
  email: string
  employeeType: 'full-time' | 'part-time' | 'contractor'
  role: Role
  department: string
  title: string
  hireDate: string
  location: string
  workSchedule: { days: string[]; hoursPerDay: number }
  manager: { id: string; name: string; email: string }
  ragUser: string   // identity in the policy RAG's directory
}

export interface LeaveType {
  leaveTypeId: string
  name: string
  accrualPolicy: string
  eligible: boolean
  category: 'paid' | 'unpaid'
}

export interface LeaveBalance {
  leaveType: string
  leaveTypeId: string
  balanceHours: number
  balanceDays: number
  pendingRequestsHours: number
  availableHours: number
  availableDays: number
  accrualRatePerPeriod: number
  nextAccrualDate: string
}

export type RequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled'

/** Extra facts on a leave-of-absence request (parental leave etc.). */
export interface LeaveDetails {
  kind: 'parental'
  country: 'IN' | 'US'
  entitlementWeeks: number
  paidWeeks: number
  jobProtectionWeeks?: number
  expectedDate?: string
  basis: string[]        // policy sections the entitlement rests on
  documents: string[]    // what HR needs
  routedTo: string[]     // manager + HR
}

export interface TimeOffRequest {
  requestId: string
  employeeId: string
  employeeName: string
  leaveTypeId: string
  leaveTypeName: string
  startDate: string
  endDate: string
  totalDays: number
  totalHours: number
  status: RequestStatus
  comment?: string
  managerName: string
  submittedAt: string
  decidedAt?: string
  decisionNote?: string
  details?: LeaveDetails
}

export interface DateConflict {
  type: 'blackout' | 'team_coverage' | 'holiday' | 'existing_request'
  description: string
  date: string
}

export interface Holiday {
  date: string
  name: string
  location: string
}

export interface TeamMemberOOO {
  employeeId: string
  name: string
  startDate: string
  endDate: string
  leaveType: string
  status: RequestStatus
  requestId: string
}

/** One candidate vacation window from the planner. */
export interface VacationOption {
  rank: number
  startDate: string
  endDate: string
  ptoDays: number
  totalDaysOff: number
  offFrom: string
  offThrough: string
  holidaysIncluded: string[]
  teammatesOut: string[]
  coverageOk: boolean
  balanceAfterDays: number
  reasons: string[]
  score: number
}

export interface PolicyHit {
  docId: string
  title: string
  heading: string
  text: string
  score: number
}

export interface PolicySearchResult {
  query: string
  hits: PolicyHit[]
  visibleDocs: string[]
  lockedDocs: string[]
}

/** A step the agent took, shown in the UI as the reasoning trace. */
export interface TraceStep {
  tool: string
  summary: string
  input?: Record<string, unknown>
}

export interface PendingSubmission {
  leaveTypeId: string
  leaveTypeName: string
  startDate: string
  endDate: string
  workDays: number
  totalHours: number
  balanceAfter: number
  approver: string
  note?: string
  details?: LeaveDetails
}

export interface Notification {
  id: string
  toEmployeeId: string
  kind: 'approval_request' | 'decision' | 'ticket_update' | 'article' | 'live_help'
  subject: string
  body: string
  requestId: string
  createdAt: string
  read: boolean
}

/** A policy answer, in the shape the Python RAG demo returns (plus engine). */
export interface PolicyAnswer {
  answer: string
  abstained: boolean
  sources: string[]
  model: string
  engine: 'rag' | 'local'
  shelf: { title: string; allowed: boolean }[]
  trace: { step: string; detail: string }[]
  elapsed_ms: number
  retrieved: { title: string; score: number; excerpt: string }[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  agentLabel?: string
  timestamp: string
  trace?: TraceStep[]
  suggestions?: VacationOption[]
  pending?: PendingSubmission
  submitted?: TimeOffRequest
  policy?: PolicyAnswer
  /** Use case 04: what the help agent offered, drafted, logged, or published this turn. */
  help?: HelpReply
  mode?: 'claude' | 'offline'
  /** L2: id of the stored trace for this turn (traces/*.jsonl, GET /api/traces/:id). */
  traceId?: string
}

export interface AuthUser {
  employeeId: string
  email: string
  name: string
  role: Role
  avatarUrl?: string
}

export interface TeamMemberView {
  employee: Employee
  balances: LeaveBalance[]
  requests: TimeOffRequest[]
}

export interface ManagerDashboard {
  manager: Employee
  team: TeamMemberView[]
  pending: TimeOffRequest[]
  decided: TimeOffRequest[]
  calendar: TeamMemberOOO[]
  holidays: Holiday[]
  coverage: { date: string; out: string[]; present: number; teamSize: number; ok: boolean }[]
  notifications: Notification[]
}

// ---------- use case 04: get help ----------

/** A knowledge base article. Visibility works like policy documents: groups, filtered before ranking. */
export interface KBArticle {
  articleId: string
  title: string
  symptoms: string[]
  steps: string[]
  allowedGroups: string[]   // empty = public
  author: string
  publishedAt: string
  /** The article this one replaces (its step is wrong or out of date). */
  replaces?: string
  /** Set on the old article when a newer one replaces it. */
  supersededBy?: string
}

export type TicketCategory = 'Hardware, laptop' | 'Network, VPN' | 'Network, wifi' | 'Access, password' | 'Software' | 'Other'
export type TicketPriority = 'Low' | 'Medium' | 'High'
export type TicketStatus = 'open' | 'in_progress' | 'resolved'

export interface TicketReply {
  from: string
  fromRole: 'employee' | 'support' | 'system'
  text: string
  at: string
}

export interface Ticket {
  ticketId: string
  requesterId: string
  requesterName: string
  subject: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  ownerId?: string
  ownerName?: string
  /** What the employee already tried before the ticket was logged. */
  tried: string[]
  /** The article offered before the ticket existed, if any. */
  offeredArticle?: string
  tags: string[]
  replies: TicketReply[]
  createdAt: string
  updatedAt: string
  resolvedAt?: string
  chatId?: string
}

export interface TicketDraft {
  subject: string
  category: TicketCategory
  priority: TicketPriority
  tried: string[]
  offeredArticle?: string
}

export interface ArticleDraft {
  title: string
  symptoms: string[]
  steps: string[]
  allowedGroups: string[]
  replaces?: string
  sourceTickets: string[]
}

export interface SimilarCase {
  ticketId: string
  requesterName: string
  subject: string
  status: TicketStatus
  createdAt: string
  resolution?: string
}

export interface LiveChatMessage {
  id: number
  from: 'employee' | 'agent' | 'system'
  name: string
  text: string
  at: string
}

export interface LiveChat {
  chatId: string
  employeeId: string
  employeeName: string
  agentId?: string
  agentName?: string
  status: 'waiting' | 'active' | 'ended'
  ticketId?: string
  /** 'hr' chats come from the stop rule and never appear in the IT queue. */
  route?: 'it' | 'hr'
  messages: LiveChatMessage[]
  createdAt: string
  endedAt?: string
}

/** What the help agent attaches to a reply so the client can render cards and buttons. */
export interface HelpReply {
  /** An article was offered; the client shows its steps and the "It worked" / "Still broken" buttons. */
  article?: KBArticle
  articleAsk?: boolean
  /** A ticket is drafted and waits for a yes. */
  ticketDraft?: TicketDraft
  /** A ticket was logged, closed, or is being shown. */
  ticket?: Ticket
  tickets?: Ticket[]
  /** Support side: the cases that look like the open ticket. */
  similar?: SimilarCase[]
  articleDraft?: ArticleDraft
  published?: KBArticle
  /** Live help: waiting for a yes, or a chat was opened. */
  liveAsk?: boolean
  liveChat?: LiveChat
}
