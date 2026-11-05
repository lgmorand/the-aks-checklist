export function emptyReview() {
  return { version: 2, completed: [], notApplicable: [], evidence: {}, project: '', owner: '', environment: '' };
}

export function parseReview(value, knownIds) {
  if (!value || value.version !== 2 || !Array.isArray(value.completed) || !Array.isArray(value.notApplicable)) {
    throw new Error('Unsupported review file. Expected AKS Checklist review version 2.');
  }
  for (const key of ['project', 'owner', 'environment']) {
    if (typeof value[key] !== 'string' || value[key].length > (key === 'environment' ? 240 : 160)) {
      throw new Error(`Invalid review ${key}.`);
    }
  }
  if (!value.evidence || typeof value.evidence !== 'object' || Array.isArray(value.evidence)) throw new Error('Invalid review evidence.');
  const isGuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id);
  if (![...value.completed, ...value.notApplicable].every(isGuid)) throw new Error('Invalid review item identifier.');
  const evidence = {};
  for (const [id, text] of Object.entries(value.evidence)) {
    if (!isGuid(id) || typeof text !== 'string' || text.length > 2000) throw new Error('Invalid review evidence entry.');
    if (knownIds.has(id) && text.trim()) evidence[id] = text;
  }
  const notApplicable = [...new Set(value.notApplicable.filter((id) => knownIds.has(id)))];
  return {
    version: 2,
    completed: [...new Set(value.completed.filter((id) => knownIds.has(id) && !notApplicable.includes(id)))],
    notApplicable, evidence, project: value.project, owner: value.owner, environment: value.environment
  };
}

export function completion(total, completed, notApplicable) {
  const applicable = total - notApplicable;
  return { applicable, percent: applicable ? Math.round(completed / applicable * 100) : 0 };
}
