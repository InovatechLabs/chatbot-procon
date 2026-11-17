interface Edge { stepId: string; nextStepId: string | null; text: string }
interface NavigationLog { stepId: string | null; messageText: string }

/** Reconstrói os ancestrais efetivamente selecionados, inclusive submenus compartilhados. */
export function buildMenuPath(clicked: Edge, newestFirst: NavigationLog[], edges: Edge[]): string {
  const path = [clicked.text];
  let destination = clicked.stepId;
  const visited = new Set([destination]);
  for (const log of newestFirst) {
    if (path.length >= 4) break;
    const previous = edges.find(edge => edge.stepId === log.stepId && edge.nextStepId === destination
      && edge.text === log.messageText && !/^(voltar|menu principal)/i.test(edge.text));
    if (!previous || visited.has(previous.stepId)) continue;
    path.unshift(previous.text);
    destination = previous.stepId;
    visited.add(destination);
  }
  return path.join(' > ');
}
