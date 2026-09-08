import type { ChatMessage } from '../shared/types.js'

export type Persona = 'alex' | 'priya' | 'marcus' | 'sarah' | 'ananya' | 'jordan' | 'rohan' | 'bob'

export const PERSONA_EMAIL: Record<Persona, string> = {
  alex: 'alex.chen@acme.com',
  priya: 'priya.sharma@acme.com',
  marcus: 'marcus.johnson@acme.com',
  sarah: 'sarah.kim@acme.com',
  ananya: 'ananya.iyer@acme.com',
  jordan: 'jordan.park@acme.com',
  rohan: 'rohan.mehta@acme.com',
  bob: 'bob.rivera@acme.com',
}

export type Category = 'routing' | 'access' | 'library' | 'agent' | 'leave' | 'safety' | 'flow' | 'manager' | 'hr'
export const CATEGORIES: Category[] = ['routing', 'access', 'library', 'agent', 'leave', 'safety', 'flow', 'manager', 'hr']

export interface Check<T> {
  description: string
  check: (value: T) => { pass: boolean; reason: string }
}

export type ChatReply = ChatMessage

export type Step =
  | { kind: 'chat'; as: Persona; message: string; text?: Check<string>[]; reply?: Check<ChatReply>[] }
  | { kind: 'http'; as?: Persona; method: 'GET' | 'POST'; path: string; body?: unknown; status?: number; json?: Check<any>[] }
  | { kind: 'wait'; ms: number }

export interface EvalCase {
  id: string
  name: string
  category: Category
  /** Needs the Python policy RAG on :8930; skipped (not failed) when it is down. */
  requires?: 'rag'
  steps: Step[]
}

export interface StepResult {
  label: string
  output: string
  assertions: { description: string; pass: boolean; reason: string }[]
}

export interface CaseResult {
  caseId: string
  caseName: string
  category: Category
  status: 'passed' | 'failed' | 'skipped' | 'error'
  steps: StepResult[]
  totalAssertions: number
  passedAssertions: number
  durationMs: number
  error?: string
}

export interface EvalReport {
  timestamp: string
  api: string
  ragUp: boolean
  totalCases: number
  passedCases: number
  failedCases: number
  skippedCases: number
  totalAssertions: number
  passedAssertions: number
  byCategory: Record<string, { total: number; passed: number; failed: number; skipped: number }>
  cases: CaseResult[]
  score: number
}
