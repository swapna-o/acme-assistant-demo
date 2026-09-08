import type { Check, ChatReply } from './types.js'

// ---------- text ----------

export function contains(text: string, label?: string): Check<string> {
  return {
    description: label ?? `contains "${text}"`,
    check: s => {
      const pass = s.toLowerCase().includes(text.toLowerCase())
      return { pass, reason: pass ? 'found' : `"${text}" not in response` }
    },
  }
}

export function notContains(text: string, label?: string): Check<string> {
  return {
    description: label ?? `does not contain "${text}"`,
    check: s => {
      const pass = !s.toLowerCase().includes(text.toLowerCase())
      return { pass, reason: pass ? 'absent' : `"${text}" present but should not be` }
    },
  }
}

export function matches(re: RegExp, label: string): Check<string> {
  return {
    description: label,
    check: s => {
      const pass = re.test(s)
      return { pass, reason: pass ? 'matched' : `/${re.source}/ did not match` }
    },
  }
}

export function containsAny(texts: string[], label: string): Check<string> {
  return {
    description: label,
    check: s => {
      const lower = s.toLowerCase()
      const hit = texts.find(t => lower.includes(t.toLowerCase()))
      return { pass: !!hit, reason: hit ? `found "${hit}"` : `none of: ${texts.join(' | ')}` }
    },
  }
}

// ---------- reply: routing ----------

export function routedToPolicy(): Check<ChatReply> {
  return { description: 'routed to the policy library', check: r => ({ pass: !!r.policy, reason: r.policy ? `policy (${r.policy.engine})` : 'went to the time-off agent' }) }
}

export function routedToAgent(): Check<ChatReply> {
  return { description: 'routed to the time-off agent', check: r => ({ pass: !r.policy, reason: r.policy ? 'went to the policy library' : `agent (${r.mode ?? 'n/a'})` }) }
}

// ---------- reply: agent state ----------

export function hasSuggestions(n = 3): Check<ChatReply> {
  return { description: `offers ${n} date options`, check: r => ({ pass: (r.suggestions?.length ?? 0) === n, reason: `${r.suggestions?.length ?? 0} options` }) }
}

export function topOption(startDate: string, endDate: string): Check<ChatReply> {
  return {
    description: `option 1 is ${startDate} to ${endDate}`,
    check: r => {
      const o = r.suggestions?.[0]
      const pass = !!o && o.startDate === startDate && o.endDate === endDate
      return { pass, reason: o ? `${o.startDate} to ${o.endDate}` : 'no options' }
    },
  }
}

export function allOptionsCoverageOk(): Check<ChatReply> {
  return { description: 'every option keeps coverage above the minimum', check: r => ({ pass: !!r.suggestions && r.suggestions.every(o => o.coverageOk), reason: r.suggestions?.map(o => `${o.startDate}:${o.coverageOk}`).join(' ') ?? 'no options' }) }
}

export function hasPending(): Check<ChatReply> {
  return { description: 'a request is drafted and awaiting confirmation', check: r => ({ pass: !!r.pending, reason: r.pending ? `${r.pending.startDate} to ${r.pending.endDate}, ${r.pending.workDays} days` : 'nothing drafted' }) }
}

export function pendingWorkDays(n: number): Check<ChatReply> {
  return { description: `draft counts ${n} work days`, check: r => ({ pass: r.pending?.workDays === n, reason: `${r.pending?.workDays ?? 'none'}` }) }
}

export function noPending(): Check<ChatReply> {
  return { description: 'nothing was drafted', check: r => ({ pass: !r.pending, reason: r.pending ? 'a draft exists' : 'ok' }) }
}

export function submitted(): Check<ChatReply> {
  return { description: 'request submitted to the HR system', check: r => ({ pass: !!r.submitted, reason: r.submitted ? `${r.submitted.requestId} ${r.submitted.status}` : 'not submitted' }) }
}

export function notSubmitted(): Check<ChatReply> {
  return { description: 'nothing was submitted', check: r => ({ pass: !r.submitted, reason: r.submitted ? `${r.submitted.requestId} was submitted` : 'ok' }) }
}

export function traceHas(tool: string): Check<ChatReply> {
  return { description: `trace includes ${tool}`, check: r => ({ pass: !!r.trace?.some(t => t.tool === tool), reason: r.trace?.map(t => t.tool).join(' > ') ?? 'no trace' }) }
}

// ---------- reply: policy access ----------

export function policySource(title: string): Check<ChatReply> {
  return { description: `answered from "${title}"`, check: r => ({ pass: !!r.policy && !r.policy.abstained && r.policy.sources.includes(title), reason: r.policy ? (r.policy.abstained ? 'abstained' : r.policy.sources.join(', ') || 'no source') : 'not a policy reply' }) }
}

export function policyAbstained(): Check<ChatReply> {
  return { description: 'no accessible source, so abstain', check: r => ({ pass: !!r.policy?.abstained, reason: r.policy ? (r.policy.abstained ? 'abstained' : `answered from ${r.policy.sources.join(', ')}`) : 'not a policy reply' }) }
}

export function shelfIs(titles: string[]): Check<ChatReply> {
  const want = [...titles].sort().join(' | ')
  return {
    description: `searchable shelf is exactly: ${titles.join(', ')}`,
    check: r => {
      const got = (r.policy?.shelf ?? []).filter(d => d.allowed).map(d => d.title).sort().join(' | ')
      return { pass: got === want, reason: got || 'empty shelf' }
    },
  }
}

/** The API never names, counts, or flags a document outside the asker's scope. */
export function noLeak(lockedTitles: string[]): Check<ChatReply> {
  return {
    description: 'no out-of-scope document is named, flagged, or counted',
    check: r => {
      if (!r.policy) return { pass: false, reason: 'not a policy reply' }
      const problems: string[] = []
      if (r.policy.shelf.some(d => !d.allowed)) problems.push('shelf carries locked entries')
      const haystack = [r.content, ...r.policy.trace.map(t => t.detail), ...r.policy.retrieved.map(x => x.title + x.excerpt)].join('\n')
      for (const t of lockedTitles) if (haystack.includes(t)) problems.push(`names "${t}"`)
      if (/locked|of \d+ documents/i.test(haystack)) problems.push('mentions locked/of-N documents')
      return { pass: problems.length === 0, reason: problems.length ? problems.join('; ') : 'clean' }
    },
  }
}

export function sourcesExclude(title: string): Check<ChatReply> {
  return { description: `"${title}" is neither a source nor on the shelf`, check: r => {
    const inSources = !!r.policy?.sources.includes(title) || !!r.policy?.retrieved.some(x => x.title.startsWith(title))
    const onShelf = !!r.policy?.shelf.some(d => d.title === title)
    return { pass: !inSources && !onShelf, reason: inSources ? 'used as a source' : onShelf ? 'on the shelf' : 'excluded' }
  } }
}

// ---------- json ----------

export function json(description: string, fn: (j: any) => boolean | string): Check<any> {
  return {
    description,
    check: j => {
      const r = fn(j)
      return typeof r === 'string' ? { pass: false, reason: r } : { pass: r, reason: r ? 'ok' : 'check returned false' }
    },
  }
}
