/**
 * Use case 04, the help agent. Deterministic in both modes (every write here is gated and
 * should not depend on a model), the same call the manager steps make.
 *
 * Employee path, in a fixed order: the article first, then the ticket, then a person.
 * Support path (Sam): open a ticket, find the cases like it, draft the article, publish.
 */
import type { ArticleDraft, Employee, HelpReply, KBArticle, SimilarCase, Ticket, TicketDraft, TraceStep } from '../../shared/types.js'
import { searchKb, getArticle, publishArticle, visibleArticles } from '../helpdesk/kb.js'
import * as hd from '../helpdesk/mock-data.js'
import * as live from '../helpdesk/livechat.js'
import * as db from '../workday/mock-data.js'
import { CONFIRM, CANCEL } from './intent.js'
import { event, span } from '../tracing/tracer.js'

export interface HelpSession {
  /** The article offered on the last turn, so "still broken" knows what was tried. */
  offered?: string
  ticketDraft?: TicketDraft
  liveAsk?: boolean
  liveChatId?: string
  /** Support side. */
  viewing?: string
  similar?: SimilarCase[]
  articleDraft?: ArticleDraft
}

export const LIVE_HELP = /talk to (a |an |some)?(person|human|someone|agent|real)|live (help|agent|chat|person|support)|real person|speak to (a |an )?(person|human|someone|agent)|chat with (a |an |someone|support)|connect me/i
export const WORKED = /\b(it worked|that worked|worked|fixed|solved|resolved|all good|sorted|working now|works now|thanks?,? (that|it) (did|worked))\b/i
export const STILL_BROKEN = /still|didn'?t (work|help|fix)|did not (work|help|fix)|not (working|fixed|helping)|no luck|same (problem|issue|thing)|again|broken|doesn'?t work|does not work|no change|nothing changed|keeps/i
export const TICKET_STATUS = /where('s| is) my ticket|my tickets?\b|ticket status|status of (my )?ticket|any update|open tickets?/i
export const END_CHAT = /\b(end (the )?chat|end live help|leave (the )?chat|close (the )?chat|bye|that'?s all)\b/i
const TICKET_ID = /\bIT-(\d{4})\b/i

function fmtAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function articleOffer(a: KBArticle, ticket?: Ticket): string {
  const fresh = a.replaces ? `There is a new article for exactly this, published by ${a.author} ${fmtAgo(a.publishedAt)}: ` : 'The knowledge base has an article that matches: '
  const mins = a.steps.length <= 2 ? 'Two steps, about five minutes.' : `${a.steps.length} steps.`
  const tail = ticket
    ? ` Your ticket ${ticket.ticketId} is still open; say "it worked" and I will close it.`
    : ` Try them and tell me whether it worked. If it does not, I will log a ticket with what you already tried, so IT does not ask you to do it twice.`
  return `${fresh}**${a.title}** [${a.articleId}]. ${mins}${tail}`
}

/** A short label for a step the employee tried, for the ticket. */
function triedLabel(step: string): string {
  if (/endpoint agent/i.test(step)) return `Endpoint agent update ${step.match(/\(([\d.]+)\)/)?.[1] ?? ''}`.trim()
  if (/^restart/i.test(step)) return 'Restart'
  if (/roll ?back|7\.3\.9/i.test(step)) return 'Rollback to 7.3.9'
  const first = step.split(/\. (?=[A-Z])/)[0].replace(/[.]+$/, '')
  return first.length > 60 ? first.slice(0, 57).trimEnd() + '...' : first
}

function draftText(d: TicketDraft): string {
  return [
    'Sorry about that. Here is the ticket I would log:',
    `**Subject:** ${d.subject}`,
    `**Category:** ${d.category} · **Priority:** ${d.priority}`,
    `**Already tried:** ${d.tried.length ? d.tried.join('; ') : 'nothing yet'}${d.offeredArticle ? ` (from ${d.offeredArticle})` : ''}`,
    'Log it?',
  ].join('\n')
}

function ticketLine(t: Ticket): string {
  const last = t.replies.filter(r => r.fromRole !== 'system').at(-1)
  return `**${t.ticketId}** · ${t.subject} · ${t.status.replace('_', ' ')} · owned by ${t.ownerName ?? 'the IT queue'}${last ? `. ${last.from} ${fmtAgo(last.at)}: "${last.text}"` : ''}`
}

function articleDraftText(d: ArticleDraft): string {
  return [
    'Draft article:',
    `**Title:** ${d.title}`,
    `**Applies to:** ${d.allowedGroups.includes('contractors') ? 'everyone' : 'all employees'} · **Symptom:** ${d.symptoms[0]}`,
    `**Steps:**\n${d.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
    d.replaces ? `**Replaces:** ${d.replaces}` : '',
    `Publish it? It goes to the knowledge base, and the ${d.sourceTickets.length} open ticket${d.sourceTickets.length === 1 ? '' : 's'} on this get a reply with the link.`,
  ].filter(Boolean).join('\n')
}

/** The article Sam would write from the resolved cases: the rollback the earlier tickets used. */
function articleFromCases(ticket: Ticket, similar: SimilarCase[]): ArticleDraft | undefined {
  const resolved = similar.find(s => s.resolution)
  if (!resolved) return undefined
  const open = [ticket, ...similar.filter(s => s.status !== 'resolved').map(s => hd.getTicket(s.ticketId)!)].filter(t => t && t.status !== 'resolved')
  if (ticket.tags.includes('endpoint-agent-7.4.1')) {
    return {
      title: 'Laptop freezes after endpoint agent 7.4.1: roll back to 7.3.9',
      symptoms: ['laptop freezes or stops responding after the 7.4.1 update', 'cursor stuck after update', 'laptop not working after endpoint agent update', 'keeps freezing'],
      steps: ['Open the self-service portal and choose Endpoint agent, then Versions.', 'Select 7.3.9 and install it. This takes about two minutes.', 'Restart the laptop. If it freezes again after the restart, log a ticket and say "rollback done".'],
      allowedGroups: ['all-employees', 'contractors'],
      replaces: ticket.offeredArticle,
      sourceTickets: open.map(t => t.ticketId),
    }
  }
  return {
    title: `${ticket.subject}: the fix IT used`,
    symptoms: [ticket.subject.toLowerCase(), ...ticket.tags],
    steps: [resolved.resolution!, 'If that does not help, log a ticket and say what you tried.'],
    allowedGroups: ['all-employees', 'contractors'],
    replaces: ticket.offeredArticle,
    sourceTickets: open.map(t => t.ticketId),
  }
}

export interface HelpTurn { content: string; help?: HelpReply; trace: TraceStep[] }

export async function runHelp(hs: HelpSession, emp: Employee, message: string): Promise<HelpTurn> {
  const trace: TraceStep[] = []
  const lower = message.toLowerCase()
  const first = emp.name.split(' ')[0]
  const yes = CONFIRM.test(lower) && !CANCEL.test(lower)
  const call = <T>(tool: string, input: Record<string, unknown>, fn: () => T, summary: (r: T) => string): T => {
    const out = fn()
    trace.push({ tool, input, summary: summary(out) })
    event('tool', tool, { input, output: out as unknown })
    return out
  }
  const done = (content: string, help?: HelpReply): HelpTurn => ({ content, help, trace })

  // ---------------- support side ----------------
  if (emp.role === 'it_support') return supportTurn(hs, emp, message, lower, yes, call, done)

  // ---------------- employee side ----------------

  // 0. Live chat is open: the message goes to the person, not the agent.
  const chat = hs.liveChatId ? live.getChat(hs.liveChatId) : undefined
  if (chat && chat.status !== 'ended') {
    if (END_CHAT.test(lower)) {
      const c = call('end_live_chat', { chat_id: chat.chatId }, () => live.endChat(chat.chatId, emp.name)!, () => `Ended ${chat.chatId}`)
      hs.liveChatId = undefined
      return done('Chat ended. Your ticket stays where it is; ask me "where is my ticket" any time.', { liveChat: c })
    }
    const c = call('send_live_message', { chat_id: chat.chatId }, () => live.addMessage(chat.chatId, 'employee', emp.name, message)!, () => `Relayed to ${chat.agentName ?? 'the live help queue'}`)
    return done('', { liveChat: c })
  }
  if (hs.liveChatId) hs.liveChatId = undefined

  // 1. Live help asked, waiting for a yes.
  if (hs.liveAsk) {
    hs.liveAsk = false
    if (yes) {
      const open = hd.openTicketFor(emp.employeeId)
      const c = await span('tool', 'request_live_help', { ticket_id: open?.ticketId }, async () => live.openChat(emp, open?.ticketId), { output: x => ({ chatId: x.chatId, status: x.status }) })
      trace.push({ tool: 'request_live_help', input: { ticket_id: open?.ticketId }, summary: `Opened ${c.chatId}${open ? ` with ${open.ticketId} attached` : ''}; waiting for an agent` })
      hs.liveChatId = c.chatId
      return done(`You are in the live help queue${open ? `, with ${open.ticketId} and what you tried attached` : ''}. ${hd.SUPPORT_AGENT.name} will join here; keep typing in this thread and they will see it. Say "end chat" when you are done.`, { liveChat: c })
    }
    if (CANCEL.test(lower)) return done('No problem. I am still here; tell me more about the problem or ask for a person any time.')
  }

  // 2. A ticket is drafted, waiting for a yes.
  if (hs.ticketDraft) {
    if (yes) {
      const d = hs.ticketDraft
      const t = await span('tool', 'submit_ticket', { subject: d.subject, category: d.category }, async () => hd.createTicket(emp, d), { output: x => ({ ticketId: x.ticketId }) })
      trace.push({ tool: 'submit_ticket', input: { subject: d.subject, category: d.category, priority: d.priority }, summary: `Logged ${t.ticketId} in the ticketing system, owned by ${t.ownerName}; ${t.tried.length} tried step${t.tried.length === 1 ? '' : 's'} attached` })
      hs.ticketDraft = undefined
      hs.offered = undefined
      return done(`Logged. Ticket **${t.ticketId}** is in the IT queue, owned by ${t.ownerName}, with the steps you tried attached. Ask me "where is my ticket" any time, or say "talk to a person" if you cannot wait.`, { ticket: t })
    }
    if (CANCEL.test(lower)) {
      hs.ticketDraft = undefined
      trace.push({ tool: 'propose_ticket', input: {}, summary: 'Draft discarded at the employee\'s request' })
      return done('No problem, nothing was logged. Tell me more, or say "talk to a person".')
    }
    event('gate', 'confirm_gate', { denied: true, reason: 'ticket drafted; message is neither a yes nor a cancel', input: { message } })
    return done(`${draftText(hs.ticketDraft)}\n\n(Say yes to log it, or no to drop it.)`, { ticketDraft: hs.ticketDraft })
  }

  // 3. Asking for a person.
  if (LIVE_HELP.test(lower)) {
    const open = hd.openTicketFor(emp.employeeId)
    hs.liveAsk = true
    trace.push({ tool: 'get_my_tickets', input: {}, summary: open ? `Open ticket ${open.ticketId} will travel with the chat` : 'No open ticket to attach' })
    return done(`I can connect you with IT support now.${open ? ` Your ticket ${open.ticketId} and what you tried go with you, so you will not repeat yourself.` : ''} Connect?`, { liveAsk: true })
  }

  // 4. Follow-up on an offered article.
  const offered = hs.offered ? getArticle(hs.offered) : undefined
  if (offered && WORKED.test(lower) && !STILL_BROKEN.test(lower)) {
    hs.offered = undefined
    const open = hd.openTicketFor(emp.employeeId)
    if (open) {
      const t = call('close_ticket', { ticket_id: open.ticketId }, () => hd.resolveTicket(open.ticketId, emp, `Fixed with ${offered.articleId}: ${offered.title}.`)!, x => `Closed ${x.ticketId} at the requester's word`)
      return done(`Glad that did it. I closed ${t.ticketId} and noted that ${offered.articleId} fixed it.`, { ticket: t })
    }
    trace.push({ tool: 'close_ticket', input: {}, summary: 'No ticket to close; noted the article as the fix' })
    return done(`Glad that did it, ${first}. No ticket needed.`)
  }
  if (offered && STILL_BROKEN.test(lower)) {
    const open = hd.openTicketFor(emp.employeeId)
    if (open) {
      const t = call('reply_on_ticket', { ticket_id: open.ticketId }, () => hd.replyOnTicket(open.ticketId, emp.name, 'employee', `Tried ${offered.articleId}: ${message}`)!, x => `Added the employee's note to ${x.ticketId}`)
      hs.offered = undefined
      return done(`Noted on ${t.ticketId}, so ${t.ownerName} sees you tried ${offered.articleId}. Say "talk to a person" if you cannot wait.`, { ticket: t })
    }
    const tried = offered.steps.map(triedLabel)
    const shortTitle = offered.title.split(/:| or /)[0]
    const draft: TicketDraft = {
      subject: `${shortTitle} after ${tried.map(t => t.toLowerCase()).join(' and ')}`.replace(/^[a-z]/, c => c.toUpperCase()),
      category: hd.categoryFor(offered.title + ' ' + message),
      priority: hd.priorityFor(message),
      tried, offeredArticle: offered.articleId,
    }
    hs.ticketDraft = call('propose_ticket', { subject: draft.subject, category: draft.category }, () => draft, d => `Drafted a ${d.priority} ${d.category} ticket carrying ${d.tried.length} tried steps; waiting for a yes`)
    return done(draftText(draft), { ticketDraft: draft })
  }

  // 5. Ticket status.
  if (TICKET_ID.test(message) || TICKET_STATUS.test(lower)) {
    const id = message.match(TICKET_ID)?.[0].toUpperCase()
    const mine = call('get_my_tickets', {}, () => hd.ticketsFor(emp.employeeId), x => `${x.length} ticket${x.length === 1 ? '' : 's'} on file for ${emp.name}`)
    if (id) {
      const t = hd.getTicket(id)
      if (!t || t.requesterId !== emp.employeeId) {
        event('gate', 'ticket_scope', { denied: true, reason: `${emp.name} is not the requester of ${id}`, input: { ticket_id: id } })
        return done(`I can only show tickets you logged. ${id} is not one of yours.`)
      }
      return done(ticketLine(t), { ticket: t })
    }
    if (!mine.length) return done('You have no tickets. Tell me what is broken and I will start with the knowledge base.')
    const open = mine.filter(t => t.status !== 'resolved')
    const list = (open.length ? open : mine.slice(0, 3)).map(ticketLine).join('\n')
    return done(`${open.length ? `${open.length} open:` : 'Nothing open. Most recent:'}\n${list}`, { tickets: open.length ? open : mine.slice(0, 3) })
  }

  // 6. "It worked" with an open ticket and nothing offered this turn.
  if (WORKED.test(lower) && !STILL_BROKEN.test(lower)) {
    const open = hd.openTicketFor(emp.employeeId)
    if (open) {
      const t = call('close_ticket', { ticket_id: open.ticketId }, () => hd.resolveTicket(open.ticketId, emp, 'Fixed; closed by the requester.')!, x => `Closed ${x.ticketId} at the requester's word`)
      return done(`Closed ${t.ticketId}. Reply here if it comes back.`, { ticket: t })
    }
  }

  // 7. A new problem: the knowledge base first.
  const r = call('search_kb', { query: message }, () => searchKb(message, emp), x => `Checked access: ${x.visible} articles apply to ${emp.name}; ${x.hits.length} match${x.hits.length === 1 ? '' : 'es'}`)
  const open = hd.openTicketFor(emp.employeeId)
  if (r.hits.length) {
    const a = r.hits[0].article
    hs.offered = a.articleId
    return done(articleOffer(a, open && open.category === hd.categoryFor(a.title) ? open : undefined), { article: a, articleAsk: true })
  }
  const draft: TicketDraft = { subject: message.slice(0, 90).replace(/[.?!]+$/, ''), category: hd.categoryFor(message), priority: hd.priorityFor(message), tried: [] }
  hs.ticketDraft = call('propose_ticket', { subject: draft.subject, category: draft.category }, () => draft, d => `No article covers this; drafted a ${d.category} ticket and waited for a yes`)
  return done(`Nothing in the knowledge base you can see covers that. ${draftText(draft).replace('Sorry about that. Here is the ticket I would log:', 'I can log a ticket instead:')}`, { ticketDraft: draft })
}

// ---------------- support side ----------------

function supportTurn(
  hs: HelpSession, emp: Employee, message: string, lower: string, yes: boolean,
  call: <T>(tool: string, input: Record<string, unknown>, fn: () => T, summary: (r: T) => string) => T,
  done: (content: string, help?: HelpReply) => HelpTurn,
): HelpTurn {
  // A. An article is drafted, waiting for a yes.
  if (hs.articleDraft) {
    const d = hs.articleDraft
    if (yes || /\bpublish\b/.test(lower)) {
      const a = call('publish_article', { title: d.title, replaces: d.replaces }, () => publishArticle(d, emp.name), x => `Published ${x.articleId} to the knowledge base${d.replaces ? `; ${d.replaces} now points to it` : ''}`)
      const replied: string[] = []
      for (const id of d.sourceTickets) {
        const t = hd.replyOnTicket(id, emp.name, 'support', `A fix is published: ${a.articleId} "${a.title}". Follow the steps and reply "it worked" to close this ticket.`)
        if (t) replied.push(t.ticketId)
      }
      trace_push(call, 'reply_on_tickets', { ticket_ids: replied }, `Replied on ${replied.length} ticket${replied.length === 1 ? '' : 's'} with the templated note; each requester notified`)
      hs.articleDraft = undefined
      hs.viewing = undefined
      hs.similar = undefined
      return done(`Published **${a.articleId}**. Replied on ${replied.join(', ')} with the article; each requester was notified.${d.replaces ? ` ${d.replaces} now points to it.` : ''} The tickets stay open until each employee confirms.`, { published: a })
    }
    if (CANCEL.test(lower)) {
      hs.articleDraft = undefined
      return done('Draft discarded. Nothing was published.')
    }
    event('gate', 'confirm_gate', { denied: true, reason: 'article drafted; message is neither a yes nor a cancel', input: { message } })
    return done(`${articleDraftText(d)}\n\n(Say publish to put it in the knowledge base, or no to drop it.)`, { articleDraft: d })
  }

  // B. Viewing a ticket with similar cases: "yes" or "draft" starts the article.
  if (hs.viewing && hs.similar?.length && (yes || /\b(draft|article|write)\b/.test(lower))) {
    const t = hd.getTicket(hs.viewing)!
    const draft = articleFromCases(t, hs.similar)
    if (!draft) return done('None of the similar tickets has a resolution note yet, so there is nothing to turn into an article. Resolve one with the fix and ask again.')
    hs.articleDraft = call('propose_article', { title: draft.title, source_tickets: draft.sourceTickets }, () => draft, d => `Drafted an article from the resolved cases; ${d.sourceTickets.length} open tickets would get the link; waiting for a yes`)
    return done(articleDraftText(draft), { articleDraft: draft })
  }

  // C. Resolve a ticket.
  const idMatch = message.match(TICKET_ID)
  if (idMatch && /\b(resolve|close|closed|fixed)\b/.test(lower)) {
    const id = idMatch[0].toUpperCase()
    const t = call('close_ticket', { ticket_id: id }, () => hd.resolveTicket(id, emp, 'Resolved by IT support.'), x => x ? `Resolved ${x.ticketId}; requester notified` : `No ticket ${id}`)
    return t ? done(`Resolved ${t.ticketId}. ${t.requesterName} has been told.`, { ticket: t }) : done(`I do not see a ticket ${id}.`)
  }

  // D. Open a ticket and find the cases like it.
  if (idMatch) {
    const id = idMatch[0].toUpperCase()
    const t = hd.getTicket(id)
    if (!t) return done(`I do not see a ticket ${id}.`)
    call('open_ticket', { ticket_id: id }, () => t, x => `Opened ${x.ticketId} (${x.requesterName}, ${x.category}, ${x.priority})`)
    const similar = call('find_similar_tickets', { ticket_id: id, days: 14 }, () => hd.findSimilar(t), x => `${x.length} ticket${x.length === 1 ? '' : 's'} in the last 14 days share the category and a symptom tag`)
    hs.viewing = id
    hs.similar = similar
    const head = `**${t.ticketId}**, ${t.requesterName}, "${t.subject}", ${t.priority}, opened ${fmtAgo(t.createdAt)}, ${t.status.replace('_', ' ')}. Already tried: ${t.tried.length ? t.tried.join('; ') : 'nothing yet'}.${t.offeredArticle ? ` Offered ${t.offeredArticle} first.` : ''}`
    if (!similar.length) return done(`${head}\n\nNo other ticket in the last 14 days looks like this. Reply on it from the queue, or say "resolve ${t.ticketId}" when it is fixed.`, { ticket: t, similar })
    const resolved = similar.filter(s => s.status === 'resolved')
    const open = similar.filter(s => s.status !== 'resolved')
    const cause = similar.find(s => s.resolution)?.resolution
    const lines = similar.map(s => `- ${s.ticketId} ${s.requesterName}, "${s.subject}", ${s.status.replace('_', ' ')}`).join('\n')
    const body = [
      head,
      `\n**${similar.length} other ticket${similar.length === 1 ? '' : 's'} in the last 14 days look${similar.length === 1 ? 's' : ''} like this** (same category, same symptom${t.tags.includes('endpoint-agent-7.4.1') ? ', every one mentions the endpoint agent 7.4 update' : ''}): ${resolved.length} resolved, ${open.length} still open.`,
      lines,
      t.offeredArticle && t.tags.includes('endpoint-agent-7.4.1') ? `\nThe article these employees were offered (${t.offeredArticle}) tells them to install 7.4.1, which is the version that freezes.` : '',
      cause ? `\nLikely cause, from the resolved tickets: ${cause}` : '\nNone of them has a resolution note yet.',
      cause ? `\nWant me to draft a help article so the next employee can do this themselves?` : '',
    ].filter(Boolean).join('\n')
    return done(body, { ticket: t, similar })
  }

  // E. The queue.
  if (/queue|open tickets?|what('s| is) (open|waiting|in)|waiting|my tickets|tickets/.test(lower)) {
    const open = call('get_queue', {}, () => hd.allTickets().filter(t => t.status !== 'resolved').sort((a, b) => a.createdAt.localeCompare(b.createdAt)), x => `${x.length} open ticket${x.length === 1 ? '' : 's'} in the queue`)
    if (!open.length) return done('The queue is empty.')
    const lines = open.map(t => `- **${t.ticketId}** ${t.requesterName}, "${t.subject}", ${t.priority}, ${t.status.replace('_', ' ')}, opened ${fmtAgo(t.createdAt)}`).join('\n')
    const waiting = live.allChats().filter(c => c.status === 'waiting')
    return done(`${open.length} open:\n${lines}${waiting.length ? `\n\n${waiting.length} employee${waiting.length === 1 ? ' is' : 's are'} waiting for live help: ${waiting.map(c => c.employeeName).join(', ')}. Open Support queue to join.` : ''}\n\nSay "open IT-1047" to see a ticket and the cases like it.`, { tickets: open })
  }

  // F. Knowledge base lookups for Sam.
  if (/\bkb\b|article|knowledge/.test(lower)) {
    const arts = call('search_kb', { query: message }, () => visibleArticles(emp), x => `${x.length} articles in the knowledge base`)
    return done(`${arts.length} articles:\n${arts.map(a => `- ${a.articleId} ${a.title}${a.supersededBy ? ` (replaced by ${a.supersededBy})` : ''}`).join('\n')}`)
  }

  return done(`Hi ${emp.name.split(' ')[0]}. I can show the queue ("what is open"), open a ticket and find the cases like it ("open IT-1047"), draft and publish an article from the fix, and resolve a ticket ("resolve IT-1047"). Live help chats are under Support queue.`)
}

function trace_push<T>(call: (tool: string, input: Record<string, unknown>, fn: () => T, summary: (r: T) => string) => T, tool: string, input: Record<string, unknown>, summary: string) {
  call(tool, input, () => undefined as unknown as T, () => summary)
}

/** Sam's suggested reply for a live chat: the ticket's tried steps plus the best article. Never sent by the assistant. */
export function suggestReply(chatId: string): { text: string; basis: string[] } | undefined {
  const c = live.getChat(chatId)
  if (!c) return undefined
  const emp = db.employees[c.employeeId]
  const t = c.ticketId ? hd.getTicket(c.ticketId) : hd.openTicketFor(c.employeeId)
  const first = c.employeeName.split(' ')[0]
  const query = t ? `${t.subject} ${t.tags.join(' ')}` : c.messages.filter(m => m.from === 'employee').map(m => m.text).join(' ')
  const r = emp ? searchKb(query || 'help', emp) : { hits: [], visible: 0, locked: [] }
  const a = r.hits[0]?.article
  const basis = [t ? `ticket ${t.ticketId}` : 'no ticket', a ? `article ${a.articleId}` : 'no article matched']
  if (t && a && a.replaces && t.tags.includes('endpoint-agent-7.4.1')) {
    return { text: `Hi ${first}, I see you tried the 7.4.1 update. That version is the cause. ${a.steps[0]} ${a.steps[1]} Then restart. Article ${a.articleId} has the steps.`, basis }
  }
  if (t && a) return { text: `Hi ${first}, I have ${t.ticketId} open and can see you tried: ${t.tried.join('; ') || 'nothing yet'}. Next thing to try: ${a.steps[0]} (${a.articleId}).`, basis }
  if (t) return { text: `Hi ${first}, I have ${t.ticketId} open. Tell me what you see on the screen right now and I will take it from there.`, basis }
  return { text: `Hi ${first}, Sam from IT. What is going on?`, basis }
}
