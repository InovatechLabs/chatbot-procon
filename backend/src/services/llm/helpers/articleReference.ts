/** A descrição do título não faz parte da identidade legal. */
export function normalizeReference(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const match = raw.trim().match(/^art(?:igo)?\.?\s*(\d+)(?:\s*-?\s*([a-z]))?(?:\s+do\s+CDC)?\.?$/i);
  return match ? `Art. ${match[1]}${match[2] ? `-${match[2].toUpperCase()}` : ''}` : null;
}

export function articleReferences(title: string): string[] {
  const heading = title.split(/\s+[-–—]\s+/)[0] ?? '';
  const compound = heading.match(/^art(?:igo)?\.?\s*(\d+)\s+e\s+(\d+)$/i);
  if (compound) return [`Art. ${compound[1]}`, `Art. ${compound[2]}`];
  const reference = normalizeReference(heading);
  return reference ? [reference] : [];
}
