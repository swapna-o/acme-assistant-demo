/**
 * The stop rule.
 *
 * Some things an employee says should never be answered by an assistant, and the
 * first job is to stop before the details arrive. A harassment report is the clear
 * case: the moment the assistant collects the account, that narrative sits in a
 * ticket table that IT support can read, in a system with no confidentiality and no
 * investigator. So this runs in front of routing, before retrieval, and it writes
 * nothing.
 *
 * Two behaviours, because they are not the same problem:
 *
 *   STOP     harassment, discrimination, retaliation, an ethics report, a person in
 *            crisis. Name the human channels, offer to connect, store nothing.
 *   PROCESS  a pay dispute, an accommodation request. The assistant is useful here:
 *            say how the process works and who owns it, decide nothing.
 *
 * LOOKUP is the guard against over-blocking. "Where is the anti-harassment policy"
 * is an ordinary policy question and must still be answered from the document. The
 * tripwire is someone reporting an incident, not someone asking what the rule is.
 * A guardrail that swallows the policy question is worse than no guardrail.
 *
 * The word lists are configuration. In production they are owned by HR and legal,
 * not by whoever last edited this file.
 */
import type { Employee } from '../../shared/types.js'

/** Named categories. These trip on their own, whatever else the sentence says. */
export const STOP =
  /harass|discriminat|retaliat|whistle ?bl|hostile work environment|\bbullied\b|bullying|threaten(ed|ing)?\b|assault|groped|ethics (report|complaint|hotline|line)|report (him|her|them|someone|my (manager|boss|lead))|hurt myself|harm myself|suicid|kill myself/i

/**
 * The paraphrase layer, added 2026-09-13 after the first version missed every sentence that
 * described the situation without naming the category: "I want to report a safety concern",
 * "I need to raise a concern about how my team lead treats people". A report verb near a
 * sensitive object counts as a report.
 *
 * This is still words. A person in distress does not reach for the vocabulary in either list,
 * so production puts a classifier behind them. What the lists buy is a deterministic floor that
 * runs before retrieval and needs no model call.
 */
export const REPORT_VERB =
  /\b(report|reporting|raise|raising|escalate|escalating|flag|complain|complaint|speak up|blow the whistle)\b/i
export const SENSITIVE_OBJECT =
  /\b(concern|issue|incident|misconduct|wrongdoing|violation|unsafe|safety|conduct|behaviou?r|mistreat\w*|abus\w*|anonym\w*|something serious|treats? (people|me|us|others)|treated (me|us|people)|hostile|uncomfortable|inappropriate)\b/i

/**
 * "Report" is an ordinary word at work. None of these are reports: an expense report, a status
 * report, who you report to, how many direct reports a manager has.
 */
export const NOT_A_REPORT =
  /\b(expense|status|time|timesheet|weekly|monthly|quarterly|annual|doctor'?s|medical|bug|error)\s+report\b|\breport(s|ing)?\s+to\b|\bdirect reports?\b|\breport my (hours|time|expenses?)\b|\breporting (line|structure|manager)\b/i

export const PROCESS =
  /(pay ?check|pay ?slip|payroll|my pay|was paid|got paid)[^.?!]{0,40}(wrong|short|missing|incorrect|error|less|not right)|underpaid|not been paid|owed (money|pay)|garnish|\baccommodation\b|\bADA\b|disabilit/i

/** Asking what a document says is a policy question, not a report. */
export const LOOKUP =
  /what does[^?]{0,40}(say|state|cover)|where (can i find|is|do i find)|link to|policy on|the (policy|handbook|code of conduct)|is there a policy|read (the|about)|does the (policy|handbook|code)/i

export type SensitiveKind = 'stop' | 'process'

export function classify(message: string): SensitiveKind | undefined {
  if (LOOKUP.test(message)) return undefined          // asking what a document says
  if (STOP.test(message)) return 'stop'               // a named category
  if (!NOT_A_REPORT.test(message) && REPORT_VERB.test(message) && SENSITIVE_OBJECT.test(message)) return 'stop'
  if (PROCESS.test(message)) return 'process'
  return undefined
}

export const ETHICS_LINE = 'ethics.acme.com, or 1-800-555-0134'
export const EAP = 'the employee assistance program, free and confidential'

export function stopReply(hr: Employee): string {
  return [
    `I am not the right place for this, and I am not going to keep a record of it here.`,
    ``,
    `Acme's ethics line takes reports in confidence: **${ETHICS_LINE}**. Your HR business partner is **${hr.name}**. If you would rather talk to someone outside the company first, there is ${EAP}.`,
    ``,
    `I can connect you to ${hr.name.split(' ')[0]} in this window now. Want me to?`,
  ].join('\n')
}

export function stopTrace(): { tool: string; summary: string }[] {
  return [
    { tool: 'stop_rule', summary: 'Sensitive report. Stopped before retrieval: no search, no ticket, no draft, nothing stored.' },
    { tool: 'handoff', summary: 'Named the ethics line, the HR business partner and the EAP, and offered to connect.' },
  ]
}

export function processReply(hr: Employee): string {
  return [
    `That one has an owner, and it is not me. I can tell you how it works, but I am not going to decide it here.`,
    ``,
    `Pay corrections start with a payroll case: HR opens it, payroll checks the run, and a correction is paid off-cycle rather than waiting for the next one. An accommodation request goes to HR directly, because it involves medical information that should not sit in a help ticket.`,
    ``,
    `Your HR business partner is **${hr.name}**. Say the word and I will connect you here.`,
  ].join('\n')
}

export function processTrace(): { tool: string; summary: string }[] {
  return [
    { tool: 'stop_rule', summary: 'Pay or accommodation question. The process is explained, the case is not decided, and nothing is written.' },
  ]
}

export function connectedReply(hr: Employee, chatId: string): string {
  return `${hr.name} has been asked to join (${chatId}). Type here and they will see it. I have not copied anything you told me into the request; they will ask you directly.`
}

export function declinedReply(): string {
  return `Understood. Nothing has been recorded. The ethics line and the EAP are there whenever you want them.`
}
