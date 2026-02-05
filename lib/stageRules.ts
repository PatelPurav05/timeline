export type StageLike = {
  ageStart: number;
  ageEnd: number;
  title: string;
  evidenceCount?: number;
};

export function isValidStageTitle(title: string): boolean {
  return /^\[[0-9]{1,3}-[0-9]{1,3}\]\s-\s.+/.test(title);
}

export function clampStages(stages: StageLike[]): StageLike[] {
  const sorted = [...stages].sort((a, b) => a.ageStart - b.ageStart);
  if (sorted.length <= 7 && sorted.length >= 3) return sorted;
  if (sorted.length > 7) return sorted.slice(0, 7);

  const fallback: StageLike[] = [...sorted];
  while (fallback.length < 3) {
    const last = fallback[fallback.length - 1] ?? {
      ageStart: 30,
      ageEnd: 45,
      title: "[30-45] - Mature Influence",
    };
    fallback.push({
      ageStart: last.ageEnd + 1,
      ageEnd: last.ageEnd + 10,
      title: `[${last.ageEnd + 1}-${last.ageEnd + 10}] - Added Era`,
    });
  }
  return fallback.slice(0, 7);
}

export function mergeLowEvidenceStages(stages: StageLike[], minimumEvidence: number): StageLike[] {
  if (stages.length <= 3) return stages;
  const next = [...stages];

  for (let i = 0; i < next.length; i += 1) {
    const stage = next[i];
    if ((stage.evidenceCount ?? minimumEvidence) >= minimumEvidence) continue;

    const neighborIndex = i > 0 ? i - 1 : i + 1;
    const neighbor = next[neighborIndex];
    if (!neighbor) continue;

    neighbor.ageStart = Math.min(neighbor.ageStart, stage.ageStart);
    neighbor.ageEnd = Math.max(neighbor.ageEnd, stage.ageEnd);
    neighbor.evidenceCount = (neighbor.evidenceCount ?? 0) + (stage.evidenceCount ?? 0);
    next.splice(i, 1);
    i -= 1;
  }

  return next;
}
