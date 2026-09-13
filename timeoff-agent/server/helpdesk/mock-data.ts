/**
 * The ticketing system (stands in for Zendesk or Jira Service Management) and the roster
 * entry for IT support. Seeded with a fortnight of tickets so the "cases like this" analysis
 * has something to find: five laptop-freeze tickets that share one cause, and three others.
 */
import type { Employee, Ticket, TicketCategory, TicketDraft, TicketPriority, SimilarCase } from '../../shared/types.js'
import * as db from '../workday/mock-data.js'

export const SUPPORT_AGENT = { id: 'WD-10099', name: 'Sam Okafor', email: 'sam.okafor@acme.com' }

const CATEGORIES: TicketCategory[] = ['Hardware, laptop', 'Network, VPN', 'Network, wifi', 'Access, password', 'Software', 'Other']

function daysAgo(n: number, hour = 10): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

const ROLLBACK_NOTE = 'Rolled the endpoint agent back to 7.3.9 from the self-service portal and restarted; the freeze stopped. 7.4.1 is the cause on laptops with the 2024 firmware.'

function seedTickets(): Ticket[] {
  const laptop = (id: string, requesterId: string, subject: string, ago: number, status: Ticket['status'], resolved = false): Ticket => {
    const emp = db.employees[requesterId]
    const created = daysAgo(ago)
    const replies: Ticket['replies'] = [{ from: 'System', fromRole: 'system', text: 'Article KB-102 (Laptop freezes or stops responding) was offered before this ticket was logged.', at: created }]
    if (resolved) replies.push({ from: SUPPORT_AGENT.name, fromRole: 'support', text: ROLLBACK_NOTE, at: daysAgo(ago - 1, 15) })
    return {
      ticketId: id, requesterId, requesterName: emp.name, subject, category: 'Hardware, laptop', priority: 'Medium', status,
      ownerId: SUPPORT_AGENT.id, ownerName: SUPPORT_AGENT.name,
      tried: ['Restart', 'Endpoint agent update 7.4.1 (from the article)'], offeredArticle: 'KB-102',
      tags: ['laptop', 'freeze', 'endpoint-agent-7.4.1'], replies, createdAt: created, updatedAt: resolved ? daysAgo(ago - 1, 15) : created,
      resolvedAt: resolved ? daysAgo(ago - 1, 15) : undefined,
    }
  }
  const priya = db.employees['WD-10089'], marcus = db.employees['WD-10120'], ananya = db.employees['WD-10077'], david = db.employees['WD-10063']
  return [
    laptop('IT-1039', 'WD-10089', 'Laptop freezing since the endpoint update', 12, 'resolved', true),
    laptop('IT-1040', 'WD-10063', 'Machine hangs every hour after installing 7.4.1', 10, 'resolved', true),
    {
      ticketId: 'IT-1041', requesterId: marcus.employeeId, requesterName: marcus.name, subject: 'Wifi drops in the Austin office, floor 3', category: 'Network, wifi', priority: 'Low', status: 'open',
      ownerId: SUPPORT_AGENT.id, ownerName: SUPPORT_AGENT.name, tried: ['Forgot and rejoined Acme-Corp'], offeredArticle: 'KB-104', tags: ['wifi', 'austin'],
      replies: [], createdAt: daysAgo(8), updatedAt: daysAgo(8),
    },
    laptop('IT-1042', 'WD-10051', 'Laptop keeps freezing, restart does not help', 6, 'open'),
    {
      ticketId: 'IT-1043', requesterId: ananya.employeeId, requesterName: ananya.name, subject: 'Second monitor for the Bengaluru desk', category: 'Other', priority: 'Low', status: 'in_progress',
      ownerId: SUPPORT_AGENT.id, ownerName: SUPPORT_AGENT.name, tried: [], offeredArticle: 'KB-107', tags: ['monitor', 'equipment'],
      replies: [{ from: SUPPORT_AGENT.name, fromRole: 'support', text: 'Ordered; the Bengaluru office gets the shipment next Tuesday.', at: daysAgo(4, 14) }], createdAt: daysAgo(5), updatedAt: daysAgo(4, 14),
    },
    laptop('IT-1044', 'WD-10081', 'Cursor stuck and laptop unresponsive after update', 3, 'open'),
    laptop('IT-1045', 'WD-10082', 'Laptop not responding, tried the KB steps', 1, 'open'),
    {
      ticketId: 'IT-1046', requesterId: priya.employeeId, requesterName: priya.name, subject: 'Locked out after password change', category: 'Access, password', priority: 'Medium', status: 'resolved',
      ownerId: SUPPORT_AGENT.id, ownerName: SUPPORT_AGENT.name, tried: ['Self-service reset'], offeredArticle: 'KB-105', tags: ['password', 'locked-out'],
      replies: [{ from: SUPPORT_AGENT.name, fromRole: 'support', text: 'Unlocked the account; the reset had not reached the VPN directory yet.', at: daysAgo(1, 11) }], createdAt: daysAgo(1, 9), updatedAt: daysAgo(1, 11), resolvedAt: daysAgo(1, 11),
    },
  ]
}

let tickets: Ticket[] = seedTickets()
let ticketSeq = 1046

export function resetTickets() {
  tickets = seedTickets()
  ticketSeq = 1046
}

export function allTickets(): Ticket[] {
  return tickets
}

export function getTicket(id: string): Ticket | undefined {
  return tickets.find(t => t.ticketId === id)
}

export function ticketsFor(employeeId: string): Ticket[] {
  return tickets.filter(t => t.requesterId === employeeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function openTicketFor(employeeId: string): Ticket | undefined {
  return ticketsFor(employeeId).find(t => t.status !== 'resolved')
}

export function isSupport(emp: Employee): boolean {
  return emp.role === 'it_support'
}

export function readsQueue(emp: Employee): boolean {
  return emp.role === 'it_support' || emp.role === 'hr_admin'
}

/** Category from a fixed list, chosen by keyword; the employee never types a category. */
export function categoryFor(text: string): TicketCategory {
  const t = text.toLowerCase()
  if (/vpn/.test(t)) return 'Network, VPN'
  if (/wi-?fi|wireless|internet/.test(t)) return 'Network, wifi'
  if (/password|locked out|lock(ed)? out|log ?in|account/.test(t)) return 'Access, password'
  if (/laptop|computer|machine|macbook|freez|frozen|hang|screen|battery|keyboard|monitor|charger/.test(t)) return 'Hardware, laptop'
  if (/install|software|app\b|application|license|slack|zoom|browser/.test(t)) return 'Software'
  return 'Other'
}

export function tagsFor(text: string, category: TicketCategory): string[] {
  const t = text.toLowerCase()
  const tags = new Set<string>()
  if (category === 'Hardware, laptop') tags.add('laptop')
  if (/freez|frozen|hang|stuck|unresponsive|not responding|responding/.test(t)) tags.add('freeze')
  if (/7\.4|endpoint|update/.test(t)) tags.add('endpoint-agent-7.4.1')
  if (/wi-?fi/.test(t)) tags.add('wifi')
  if (/vpn/.test(t)) tags.add('vpn')
  if (/password|locked/.test(t)) tags.add('password')
  if (/monitor/.test(t)) tags.add('monitor')
  return [...tags]
}

export function priorityFor(text: string): TicketPriority {
  const t = text.toLowerCase()
  if (/urgent|asap|cannot work|can't work|blocked|down for everyone|outage/.test(t)) return 'High'
  return 'Medium'
}

export function isCategory(x: string): x is TicketCategory {
  return (CATEGORIES as string[]).includes(x)
}

export function createTicket(emp: Employee, draft: TicketDraft): Ticket {
  ticketSeq += 1
  const now = new Date().toISOString()
  const t: Ticket = {
    ticketId: `IT-${ticketSeq}`, requesterId: emp.employeeId, requesterName: emp.name,
    subject: draft.subject, category: draft.category, priority: draft.priority, status: 'open',
    ownerId: SUPPORT_AGENT.id, ownerName: SUPPORT_AGENT.name,
    tried: draft.tried, offeredArticle: draft.offeredArticle, tags: tagsFor(`${draft.subject} ${draft.tried.join(' ')}`, draft.category),
    replies: draft.offeredArticle ? [{ from: 'System', fromRole: 'system', text: `Article ${draft.offeredArticle} was offered before this ticket was logged; the employee tried: ${draft.tried.join('; ') || 'nothing yet'}.`, at: now }] : [],
    createdAt: now, updatedAt: now,
  }
  tickets.push(t)
  db.pushNotification({ toEmployeeId: SUPPORT_AGENT.id, kind: 'ticket_update', subject: `New ticket ${t.ticketId} from ${emp.name}`, body: `${t.subject} (${t.category}, ${t.priority}). Already tried: ${t.tried.join('; ') || 'nothing yet'}.`, requestId: t.ticketId })
  return t
}

export function replyOnTicket(id: string, from: string, fromRole: 'employee' | 'support' | 'system', text: string, notifyRequester = true): Ticket | undefined {
  const t = getTicket(id)
  if (!t) return undefined
  const now = new Date().toISOString()
  t.replies.push({ from, fromRole, text, at: now })
  t.updatedAt = now
  if (t.status === 'open' && fromRole === 'support') t.status = 'in_progress'
  if (notifyRequester && fromRole !== 'employee') {
    db.pushNotification({ toEmployeeId: t.requesterId, kind: 'ticket_update', subject: `${from} replied on ${t.ticketId}`, body: text, requestId: t.ticketId })
  }
  return t
}

export function resolveTicket(id: string, by: Employee, note?: string): Ticket | undefined {
  const t = getTicket(id)
  if (!t) return undefined
  const now = new Date().toISOString()
  t.status = 'resolved'
  t.resolvedAt = now
  t.updatedAt = now
  if (note) t.replies.push({ from: by.name, fromRole: by.role === 'it_support' ? 'support' : 'employee', text: note, at: now })
  if (by.employeeId !== t.requesterId) {
    db.pushNotification({ toEmployeeId: t.requesterId, kind: 'ticket_update', subject: `${by.name} resolved ${t.ticketId}`, body: note ?? `${t.subject} is resolved. Reply if it comes back.`, requestId: t.ticketId })
  }
  return t
}

/**
 * The "cases like this" analysis: tickets in the same category that share a symptom tag,
 * opened in the last 14 days. Names and subjects only; nothing else about the requester.
 */
export function findSimilar(ticket: Ticket, days = 14): SimilarCase[] {
  const since = daysAgo(days)
  const symptomTags = ticket.tags.filter(t => t !== 'laptop')
  return tickets
    .filter(t => t.ticketId !== ticket.ticketId && t.category === ticket.category && t.createdAt >= since && t.tags.some(x => symptomTags.includes(x)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(t => ({ ticketId: t.ticketId, requesterName: t.requesterName, subject: t.subject, status: t.status, createdAt: t.createdAt, resolution: t.replies.find(r => r.fromRole === 'support' && t.status === 'resolved')?.text }))
}
