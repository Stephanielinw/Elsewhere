export const BUBBLE_CSS_LIMIT = 12000;

export function safeBubbleCSS(raw?: string): string {
  const input = String(raw || '').slice(0, BUBBLE_CSS_LIMIT).replace(/\/\*[\s\S]*?\*\//g, '');
  // Escapes can disguise resource functions or positioning declarations.
  if (/\\|@import|@font-face|@keyframes|url\s*\(|image-set\s*\(|src\s*\(|expression\s*\(|<\/|\bbehavior\s*:/i.test(input)) return '';
  const output: string[] = [];
  const blocks = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = blocks.exec(input)) !== null) {
    const selector = match[1].trim();
    if (!/^(\.message\.(mine|theirs)\s+\.bubble)(::(before|after))?$/.test(selector)) continue;
    const body = match[2];
    if (/position\s*:\s*(fixed|absolute)|z-index\s*:|content\s*:/i.test(body)) continue;
    output.push(`.chat-view ${selector}{${body}}`);
  }
  return output.join('\n');
}
