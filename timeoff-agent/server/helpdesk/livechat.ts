/**
 * Live help: the employee's thread becomes a chat with a person, with the ticket attached.
 * Polling on both sides (the client already polls approvals every four seconds); no websocket.
 */
import type { Employee, LiveChat } from '../../shared/types.js'
import * as db from '../workday/mock-data.js'
import { SUPPORT_AGENT } from './mock-data.js'

let chats: LiveChat[] = []
let chatSeq = 0
let msgSeq = 0

export function resetChats() {
  chats = []
  chatSeq = 0
  msgSeq = 0
}

export function allChats(): LiveChat[] {
  return chats
}

export function getChat(id: string): LiveChat | undefined {
  return chats.find(c => c.chatId === id)
}

/** The employee's current chat: waiting or active. */
export function chatFor(employeeId: string): LiveChat | undefined {
  return [...chats].reverse().find(c => c.employeeId === employeeId && c.status !== 'ended')
}

export function openChat(emp: Employee, ticketId?: string): LiveChat {
  const existing = chatFor(emp.employeeId)
  if (existing) return existing
  chatSeq += 1
  const now = new Date().toISOString()
  const c: LiveChat = {
    chatId: `CHAT-${chatSeq}`, employeeId: emp.employeeId, employeeName: emp.name, status: 'waiting', ticketId,
    messages: [{ id: ++msgSeq, from: 'system', name: 'Acme Assistant', text: `${emp.name} asked for live help${ticketId ? ` on ${ticketId}` : ''}. Waiting for an agent.`, at: now }],
    createdAt: now,
  }
  chats.push(c)
  db.pushNotification({ toEmployeeId: SUPPORT_AGENT.id, kind: 'live_help', subject: `${emp.name} is waiting for live help`, body: ticketId ? `Ticket ${ticketId} is attached.` : 'No ticket attached.', requestId: c.chatId })
  return c
}

export function joinChat(id: string, agent: Employee): LiveChat | undefined {
  const c = getChat(id)
  if (!c || c.status === 'ended') return c
  if (c.status === 'waiting') {
    c.status = 'active'
    c.agentId = agent.employeeId
    c.agentName = agent.name
    c.messages.push({ id: ++msgSeq, from: 'system', name: 'Acme Assistant', text: `${agent.name} joined.`, at: new Date().toISOString() })
  }
  return c
}

export function addMessage(id: string, from: 'employee' | 'agent', name: string, text: string): LiveChat | undefined {
  const c = getChat(id)
  if (!c || c.status === 'ended') return undefined
  c.messages.push({ id: ++msgSeq, from, name, text, at: new Date().toISOString() })
  return c
}

export function endChat(id: string, by: string): LiveChat | undefined {
  const c = getChat(id)
  if (!c || c.status === 'ended') return c
  c.status = 'ended'
  c.endedAt = new Date().toISOString()
  c.messages.push({ id: ++msgSeq, from: 'system', name: 'Acme Assistant', text: `${by} ended the chat.`, at: c.endedAt })
  return c
}
