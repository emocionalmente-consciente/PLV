// Parses report text into plain nodes, for rendering as React elements. Only the tags a pack may hold
// are kept, and nothing is ever inserted as raw HTML, so a tampered pack can't run scripts.

export type HtmlNode =
  | string
  | { tag: 'p' | 'strong' | 'em' | 'u'; align: string | null; children: HtmlNode[] }
  | { tag: 'img'; src: string };

type ContainerTag = 'p' | 'strong' | 'em' | 'u';

const CONTAINERS = new Set<string>(['p', 'strong', 'em', 'u']);
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

const decode = (text: string): string => text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity);

function alignOf(attributes: string): string | null {
  return /style="text-align:(left|right|center|justify)"/.exec(attributes)?.[1] ?? null;
}

export function parseReportHtml(html: string): HtmlNode[] {
  const root: HtmlNode[] = [];
  const stack: { tag: ContainerTag; children: HtmlNode[] }[] = [];
  const current = (): HtmlNode[] => stack[stack.length - 1]?.children ?? root;
  const addText = (text: string): void => {
    if (text !== '') current().push(decode(text));
  };

  let position = 0;
  for (const match of html.matchAll(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g)) {
    addText(html.slice(position, match.index));
    position = match.index + match[0].length;
    const closing = match[1] === '/';
    const tag = (match[2] ?? '').toLowerCase();
    const attributes = match[3] ?? '';

    if (tag === 'img' && !closing) {
      const src = /src="([^"]+)"/.exec(attributes)?.[1];
      if (src) current().push({ tag: 'img', src });
    } else if (CONTAINERS.has(tag)) {
      if (closing) {
        const open = stack.map((entry) => entry.tag as string).lastIndexOf(tag);
        if (open >= 0) stack.length = open;
      } else {
        const node = { tag: tag as ContainerTag, align: tag === 'p' ? alignOf(attributes) : null, children: [] as HtmlNode[] };
        current().push(node);
        stack.push(node);
      }
    }
  }
  addText(html.slice(position));
  return root;
}
