// Marketing Admin — Round 13 pure deterministic learning/planner helpers.
// No network, persistence, AI, scheduling or publishing.

export const LEARNING_MIN = Object.freeze({ publications: 3, touchpoints: 5 });

export function evidenceState({ publications = 0, touchpoints = 0 } = {}) {
  const sufficient = publications >= LEARNING_MIN.publications && touchpoints >= LEARNING_MIN.touchpoints;
  return {
    status: sufficient ? 'observational' : 'insufficient_data',
    sufficient,
    rankingEnabled: false,
    autoAction: false,
    aiUsed: false,
  };
}

export function creativeFingerprint(item = {}) {
  return [item.productId || '', item.hook || '', item.format || '', item.channel || '']
    .map((v) => String(v).trim().toLowerCase())
    .join('|');
}

export function filterRecentRepetition(candidates = [], recent = []) {
  const used = new Set(recent.map(creativeFingerprint));
  return candidates.filter((candidate) => !used.has(creativeFingerprint(candidate)));
}

export function buildCreativeMemory(items = []) {
  const memory = new Map();
  for (const item of items) {
    const key = creativeFingerprint(item);
    if (!key.replaceAll('|', '')) continue;
    const current = memory.get(key) || { fingerprint: key, occurrences: 0 };
    current.occurrences += 1;
    current.lastSeenAt = item.occurredAt || item.createdAt || null;
    memory.set(key, current);
  }
  return [...memory.values()].sort((a, b) => b.occurrences - a.occurrences || a.fingerprint.localeCompare(b.fingerprint));
}

export function dailyPlanV2({ candidates = [], recent = [], evidence = {}, limits = {} } = {}) {
  const state = evidenceState(evidence);
  const maxCandidates = Math.max(0, Math.min(Number(limits.maxCandidates ?? 3), 10));
  const maxCostCents = Math.max(0, Number(limits.maxCostCents ?? 0));
  const available = filterRecentRepetition(candidates, recent).slice(0, maxCandidates);
  const noAction = available.length === 0;
  return {
    mode: 'dry_run',
    decision: noAction ? 'NO_ACTION' : 'SUGGEST',
    candidates: available,
    evidence: state,
    limits: { maxCandidates, maxCostCents },
    draftGate: { enabled: false, humanRequired: true },
    wouldCreateDraft: false,
    wouldSchedule: false,
    wouldPublish: false,
    aiUsed: false,
    externalSideEffect: false,
  };
}
