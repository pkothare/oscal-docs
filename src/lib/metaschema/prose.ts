// Metaschema description/remarks/enum elements contain mixed-content
// "markdown" markup (<p>, <code>, <a>, <strong>/<em>, <ul>/<ol>/<li>, <q>,
// <sub>/<sup>, <br>, <img>, <insert>, <h1>..<h6>, <pre>). The default
// JSON-style parse drops text-vs-element ordering, so we parse the source
// XML a second time with `preserveOrder: true` and convert the result into a
// strongly-typed tree we can walk safely.

import { XMLParser } from 'fast-xml-parser';

export interface ProseElement {
  type: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: ProseNode[];
}

export interface ProseText {
  type: 'text';
  text: string;
}

export type ProseNode = ProseElement | ProseText;

// fast-xml-parser preserveOrder shape: each element node is an object with
// exactly one tag-name key (whose value is an ordered array of child nodes)
// plus an optional ':@' attributes object. Text nodes are { '#text': str }.
// This is the *one* boundary where we have to introspect dynamic keys.
type RawProseNode = { ':@'?: Record<string, string> } & Record<string, unknown>;

const proseParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  textNodeName: '#text',
});

function rawTagOf(raw: RawProseNode): string | undefined {
  for (const key in raw) {
    if (key !== ':@' && key !== '#text') return key;
  }
  return undefined;
}

function toProseNode(raw: RawProseNode): ProseNode | null {
  const text = raw['#text'];
  if (typeof text === 'string') {
    return { type: 'text', text };
  }
  const tag = rawTagOf(raw);
  if (!tag) return null;
  const rawChildren = raw[tag];
  const children: ProseNode[] = [];
  if (Array.isArray(rawChildren)) {
    for (const child of rawChildren as RawProseNode[]) {
      const node = toProseNode(child);
      if (node) children.push(node);
    }
  }
  return { type: 'element', tag, attrs: raw[':@'] ?? {}, children };
}

// --- HTML rendering --------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Tags allowed in OSCAL markdown-multiline content. Unknown tags are rendered
// as their inner text only (no surrounding tag) so we never emit unsafe HTML.
const INLINE_TAGS = new Set(['code', 'em', 'i', 'strong', 'b', 'q', 'sub', 'sup']);
const BLOCK_TAGS = new Set([
  'p',
  'ul',
  'ol',
  'li',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
]);

export function renderProseNodes(nodes: ProseNode[]): string {
  let html = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      html += escapeHtml(node.text);
      continue;
    }
    const inner = renderProseNodes(node.children);
    switch (node.tag) {
      case 'a': {
        const href = node.attrs['@_href'];
        const hrefAttr = href ? ` href="${escapeHtml(href)}"` : '';
        html += `<a${hrefAttr} target="_blank" rel="noopener">${inner}</a>`;
        break;
      }
      case 'img': {
        const src = node.attrs['@_src'];
        const alt = node.attrs['@_alt'];
        const srcAttr = src ? ` src="${escapeHtml(src)}"` : '';
        const altAttr = alt ? ` alt="${escapeHtml(alt)}"` : '';
        html += `<img${srcAttr}${altAttr} />`;
        break;
      }
      case 'br':
        html += '<br />';
        break;
      case 'insert': {
        const idRef = node.attrs['@_id-ref'] || node.attrs['@_param-id'] || '';
        html += `<code class="insert">{{ insert: ${escapeHtml(idRef)} }}</code>`;
        break;
      }
      default:
        if (INLINE_TAGS.has(node.tag) || BLOCK_TAGS.has(node.tag)) {
          html += `<${node.tag}>${inner}</${node.tag}>`;
        } else {
          html += inner;
        }
    }
  }
  return html;
}

// --- Tree wrapper ----------------------------------------------------------

export type DefineKind = 'define-assembly' | 'define-field' | 'define-flag';

/**
 * A parsed prose tree, with a name-keyed index of definitions and enums for
 * looking up the ordered version of any node we want to render as HTML.
 */
export class ProseTree {
  private readonly index: Map<string, ProseElement>;

  private constructor(
    private readonly roots: ProseNode[],
    index: Map<string, ProseElement>,
  ) {
    this.index = index;
  }

  static fromXml(xml: string): ProseTree {
    const raw = proseParser.parse(xml) as RawProseNode[];
    const roots: ProseNode[] = [];
    for (const r of raw) {
      const node = toProseNode(r);
      if (node) roots.push(node);
    }
    return new ProseTree(roots, ProseTree.buildIndex(roots));
  }

  private static buildIndex(roots: ProseNode[]): Map<string, ProseElement> {
    const idx = new Map<string, ProseElement>();
    function visit(nodes: ProseNode[]) {
      for (const node of nodes) {
        if (node.type !== 'element') continue;
        const name = node.attrs['@_name'];
        if (
          name &&
          (node.tag === 'define-assembly' ||
            node.tag === 'define-field' ||
            node.tag === 'define-flag')
        ) {
          idx.set(`${node.tag}:${name}`, node);
        }
        const value = node.attrs['@_value'];
        if (value && node.tag === 'enum') {
          idx.set(`enum:${value}`, node);
        }
        visit(node.children);
      }
    }
    visit(roots);
    return idx;
  }

  /** Find a top-level element by tag name (e.g. METASCHEMA). */
  findRoot(tag: string): ProseElement | undefined {
    for (const r of this.roots) {
      if (r.type === 'element' && r.tag === tag) return r;
    }
    return undefined;
  }

  /** Look up the ordered version of a named definition. */
  findDefinition(kind: DefineKind, name: string | undefined): ProseElement | undefined {
    return name ? this.index.get(`${kind}:${name}`) : undefined;
  }

  /** Look up the ordered version of an `<enum value="...">` element. */
  findEnum(value: string | undefined): ProseElement | undefined {
    return value ? this.index.get(`enum:${value}`) : undefined;
  }

  /** Render the immediate child element with the given tag, as HTML. */
  static renderChild(parent: ProseElement | undefined, tag: string): string {
    if (!parent) return '';
    for (const c of parent.children) {
      if (c.type === 'element' && c.tag === tag) {
        return renderProseNodes(c.children).trim();
      }
    }
    return '';
  }

  /** Like {@link renderChild} but returns undefined if empty. */
  static renderChildOptional(parent: ProseElement | undefined, tag: string): string | undefined {
    const html = ProseTree.renderChild(parent, tag);
    return html || undefined;
  }
}

// Exported for the constraint parser, which renders an enum's *direct* children.
export { escapeHtml };
