/**
 * The IT knowledge base: a second document set with the same rule as policy search.
 * Check who may see each article first, rank only those, and cite the article by ID.
 * An article Sam publishes is visible to the next employee on the next message.
 */
import type { Employee, KBArticle } from '../../shared/types.js'
import { groupsFor } from '../policies/index.js'
import { event } from '../tracing/tracer.js'

const EVERYONE = ['all-employees', 'contractors']

function seedArticles(): KBArticle[] {
  return [
    {
      articleId: 'KB-101', title: 'Laptop will not turn on', allowedGroups: EVERYONE, author: 'IT knowledge base', publishedAt: '2026-03-02T10:00:00Z',
      symptoms: ['laptop will not turn on', 'no power', 'black screen on startup', 'dead battery'],
      steps: ['Plug in the charger and wait two minutes; the light on the charger should turn on.', 'Hold the power button for fifteen seconds, release, then press it once.', 'If nothing happens, log a ticket and IT will swap the charger or the battery.'],
    },
    {
      articleId: 'KB-102', title: 'Laptop freezes or stops responding', allowedGroups: EVERYONE, author: 'IT knowledge base', publishedAt: '2026-06-14T10:00:00Z',
      symptoms: ['laptop freezes', 'laptop not working', 'stops responding', 'hangs', 'cursor stuck', 'keeps freezing', 'unresponsive', 'slow'],
      steps: ['Restart the laptop. Hold the power button for ten seconds if it will not respond.', 'Open the endpoint agent and install the pending update (7.4.1). Restart again.'],
    },
    {
      articleId: 'KB-103', title: 'VPN keeps disconnecting', allowedGroups: EVERYONE, author: 'IT knowledge base', publishedAt: '2026-05-20T10:00:00Z',
      symptoms: ['vpn disconnects', 'vpn drops', 'vpn keeps disconnecting', 'cannot connect to vpn'],
      steps: ['Sign out of the VPN client completely, then sign back in.', 'Switch to the "Acme-Backup" profile from the profile menu.', 'If it still drops, log a ticket with the time it happened.'],
    },
    {
      articleId: 'KB-104', title: 'Wifi drops in the office', allowedGroups: EVERYONE, author: 'IT knowledge base', publishedAt: '2026-04-11T10:00:00Z',
      symptoms: ['wifi drops', 'wi-fi keeps disconnecting', 'no internet in the office', 'wireless unstable'],
      steps: ['Forget the "Acme-Corp" network and join it again with your badge ID and password.', 'Move away from the window wall on floors 2 and 3; those access points are being replaced.', 'Still dropping? Log a ticket with the floor and the desk area.'],
    },
    {
      articleId: 'KB-105', title: 'Reset your password or unlock your account', allowedGroups: EVERYONE, author: 'IT knowledge base', publishedAt: '2026-02-01T10:00:00Z',
      symptoms: ['locked out', 'forgot password', 'password reset', 'account locked', 'cannot log in'],
      steps: ['Go to the self-service portal and choose "Reset password". You will need your phone for the code.', 'Wait five minutes before trying the new password; it takes that long to reach every system.', 'If you have no phone with you, log a ticket and IT will verify you another way.'],
    },
    {
      articleId: 'KB-106', title: 'Badge access to floors and rooms', allowedGroups: ['all-employees'], author: 'IT knowledge base', publishedAt: '2026-01-15T10:00:00Z',
      symptoms: ['badge not working', 'badge access', 'door will not open', 'need access to a room'],
      steps: ['Badges are provisioned by floor from your record; ask your manager to request an extra floor.', 'If the badge worked yesterday and not today, hold it flat against the reader for two seconds.', 'Lost badge: log a ticket right away so it can be deactivated.'],
    },
    {
      articleId: 'KB-107', title: 'Requesting a second monitor or other equipment', allowedGroups: EVERYONE, author: 'IT knowledge base', publishedAt: '2026-03-30T10:00:00Z',
      symptoms: ['second monitor', 'need a monitor', 'new keyboard', 'request equipment', 'headset'],
      steps: ['Standard equipment (monitor, keyboard, mouse, headset) can be requested by ticket; no approval needed.', 'Anything outside the standard list needs your manager\'s approval on the ticket.'],
    },
  ]
}

let articles: KBArticle[] = seedArticles()
let articleSeq = 107

export function resetKb() {
  articles = seedArticles()
  articleSeq = 107
}

export function allArticles(): KBArticle[] {
  return articles
}

export function getArticle(id: string): KBArticle | undefined {
  return articles.find(a => a.articleId === id)
}

export function canSeeArticle(a: KBArticle, groups: string[]): boolean {
  if (a.allowedGroups.length === 0) return true
  if (groups.includes('hr-admins') || groups.includes('it-support')) return true
  return a.allowedGroups.some(g => groups.includes(g))
}

export function kbGroupsFor(emp: Employee): string[] {
  const groups = groupsFor(emp)
  if (emp.role === 'it_support') groups.push('it-support')
  return groups
}

export function visibleArticles(emp: Employee): KBArticle[] {
  const groups = kbGroupsFor(emp)
  return articles.filter(a => canSeeArticle(a, groups))
}

const STOP = new Set('a an and are as at be by can do does for from how i in into is it its my of on or s t the to we what when who you your me please since this that has have keeps keep still again not working broken work help need get with'.split(' '))
const SYN: Record<string, string[]> = {
  laptop: ['laptop', 'computer', 'machine', 'macbook'],
  computer: ['laptop', 'computer', 'machine'],
  machine: ['laptop', 'computer'],
  freezing: ['freezes', 'freeze', 'frozen', 'hangs', 'stuck', 'unresponsive', 'responding'],
  freezes: ['freezing', 'freeze', 'frozen', 'hangs', 'stuck', 'unresponsive'],
  freeze: ['freezes', 'freezing', 'frozen', 'hangs'],
  frozen: ['freezes', 'freezing', 'hangs', 'stuck'],
  hanging: ['hangs', 'freezes', 'stuck'],
  hangs: ['freezes', 'stuck'],
  stuck: ['freezes', 'hangs', 'cursor'],
  slow: ['slow', 'freezes'],
  crashing: ['freezes', 'stops', 'responding'],
  crashes: ['freezes', 'stops', 'responding'],
  wifi: ['wifi', 'wi', 'fi', 'wireless', 'internet'],
  wireless: ['wifi'],
  internet: ['wifi', 'vpn'],
  vpn: ['vpn', 'disconnects', 'drops'],
  disconnecting: ['disconnects', 'drops'],
  password: ['password', 'locked', 'reset', 'log'],
  locked: ['locked', 'password', 'account'],
  login: ['log', 'locked', 'password'],
  monitor: ['monitor', 'screen', 'equipment'],
  screen: ['monitor', 'black'],
  badge: ['badge', 'door', 'access'],
  door: ['badge', 'door'],
  power: ['power', 'turn', 'battery'],
  battery: ['battery', 'power', 'turn'],
  update: ['update', 'agent', 'endpoint'],
  rollback: ['roll', 'back', 'version'],
}

function terms(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9.]+/g) ?? []
  const out = new Set<string>()
  for (const w of words) {
    if (STOP.has(w)) continue
    out.add(w)
    for (const s of SYN[w] ?? []) out.add(s)
  }
  return [...out]
}

export interface KBHit { article: KBArticle; score: number }

/**
 * Rank the articles this employee may see. A replaced article drops out when its replacement
 * is visible, so the next employee gets the corrected fix, not the one that caused the ticket.
 */
export function searchKb(query: string, emp: Employee, topK = 2): { hits: KBHit[]; visible: number; locked: string[] } {
  const groups = kbGroupsFor(emp)
  const visible = articles.filter(a => canSeeArticle(a, groups))
  const locked = articles.filter(a => !canSeeArticle(a, groups)).map(a => a.articleId)
  event('policy', 'kb_acl_filter', { input: { principal: emp.email, groups }, output: { visible: visible.map(a => a.articleId), locked }, meta: { index: 'kb' } })
  const visibleIds = new Set(visible.map(a => a.articleId))
  const q = terms(query)
  const hits: KBHit[] = []
  for (const a of visible) {
    if (a.supersededBy && visibleIds.has(a.supersededBy)) continue
    const words = new Set((a.title + ' ' + a.symptoms.join(' ')).toLowerCase().match(/[a-z0-9.]+/g) ?? [])
    const overlap = q.filter(t => words.has(t)).length
    // One shared word is a coincidence ("room", "screen"); two is a symptom.
    if (overlap < 2) continue
    // Newer articles win ties: a published fix outranks the seed it replaced.
    hits.push({ article: a, score: overlap / Math.sqrt(q.length || 1) + (a.replaces ? 0.05 : 0) })
  }
  hits.sort((x, y) => y.score - x.score)
  return { hits: hits.slice(0, topK), visible: visible.length, locked }
}

export function publishArticle(draft: { title: string; symptoms: string[]; steps: string[]; allowedGroups: string[]; replaces?: string }, author: string): KBArticle {
  articleSeq += 1
  const a: KBArticle = { articleId: `KB-${articleSeq}`, title: draft.title, symptoms: draft.symptoms, steps: draft.steps, allowedGroups: draft.allowedGroups, author, publishedAt: new Date().toISOString(), replaces: draft.replaces }
  articles.push(a)
  if (draft.replaces) {
    const old = getArticle(draft.replaces)
    if (old) old.supersededBy = a.articleId
  }
  return a
}
