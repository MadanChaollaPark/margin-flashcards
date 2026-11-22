export const CLOZE_DELETION = /\{\{c([1-9]\d*)::([^{}]*)\}\}/gu;

export function renderFront(front: string, revealed: boolean): string {
  return front.replace(CLOZE_DELETION, (_match, _index, content: string) => {
    const [answer, hint] = content.split("::");
    return revealed ? answer : `[${hint || "…"}]`;
  });
}

export function expectedAnswer(card: { type: "basic" | "cloze"; front: string; back: string }): string {
  if (card.type === "basic") return card.back;

  const answers = new Set<string>();
  for (const [, , content] of card.front.matchAll(CLOZE_DELETION)) {
    const answer = content.split("::", 1)[0].trim();
    if (answer) answers.add(answer);
  }
  return answers.size ? [...answers].join("; ") : card.back;
}
