export function renderFront(front: string, revealed: boolean): string {
  return front.replace(/\{\{c1::([^{}]+)\}\}/gu, (_match, content: string) => {
    const [answer, hint] = content.split("::");
    return revealed ? answer : `[${hint || "…"}]`;
  });
}
