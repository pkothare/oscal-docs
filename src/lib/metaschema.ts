import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/usnistgov/OSCAL';
const GITHUB_API_BASE = 'https://api.github.com/repos/usnistgov/OSCAL';

type ParsedVersion = [number, number, number, string]; // [major, minor, patch, prerelease]

function compareSemver(a: ParsedVersion, b: ParsedVersion): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
  }
  // A version without a prerelease outranks one with a prerelease (per semver).
  if (a[3] === '' && b[3] !== '') return 1;
  if (a[3] !== '' && b[3] === '') return -1;
  if (a[3] < b[3]) return -1;
  if (a[3] > b[3]) return 1;
  return 0;
}

function parseSemverTag(tag: string): ParsedVersion | null {
  const m = /^v(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(tag);
  if (!m) return null;
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), m[4] ?? ''];
}

let versionsPromise: Promise<string[]> | null = null;

// Dynamically fetch OSCAL release tags from GitHub at build time.
export function getOscalVersions(): Promise<string[]> {
  if (versionsPromise) return versionsPromise;
  versionsPromise = (async () => {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;

    const tags: { name: string }[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(`${GITHUB_API_BASE}/tags?per_page=100&page=${page}`, { headers });
      if (!res.ok) throw new Error(`Failed to fetch OSCAL tags: ${res.status} ${res.statusText}`);
      const batch = (await res.json()) as { name: string }[];
      tags.push(...batch);
      if (batch.length < 100) break;
    }

    const versions = tags
      .map((t) => ({ tag: t.name, parsed: parseSemverTag(t.name) }))
      .filter((x): x is { tag: string; parsed: ParsedVersion } => x.parsed !== null)
      .sort((a, b) => compareSemver(a.parsed, b.parsed))
      .map((x) => x.tag);

    if (versions.length === 0) throw new Error('No OSCAL release tags found');
    return versions;
  })();
  return versionsPromise;
}

export async function getLatestVersion(): Promise<string> {
  const versions = await getOscalVersions();
  return versions[versions.length - 1];
}

// Top-level model metaschema files (these are the root models, not shared modules)
export const MODEL_FILES: Record<string, string> = {
  catalog: 'oscal_catalog_metaschema.xml',
  profile: 'oscal_profile_metaschema.xml',
  'component-definition': 'oscal_component_metaschema.xml',
  'system-security-plan': 'oscal_ssp_metaschema.xml',
  'assessment-plan': 'oscal_assessment-plan_metaschema.xml',
  'assessment-results': 'oscal_assessment-results_metaschema.xml',
  'plan-of-action-and-milestones': 'oscal_poam_metaschema.xml',
};

export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  catalog: 'Catalog',
  profile: 'Profile',
  'component-definition': 'Component Definition',
  'system-security-plan': 'System Security Plan',
  'assessment-plan': 'Assessment Plan',
  'assessment-results': 'Assessment Results',
  'plan-of-action-and-milestones': 'Plan of Action and Milestones',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) =>
    [
      'import',
      'define-assembly',
      'define-field',
      'define-flag',
      'assembly',
      'field',
      'flag',
      'enum',
      'allowed-values',
      'index',
      'index-has-key',
      'expect',
      'matches',
      'is-unique',
      'has-cardinality',
      'key-field',
      'prop',
      'remarks',
      'constraint',
      'model',
      'choice',
      'group-as',
      'formal-name',
      'description',
    ].includes(name),
});

export interface MetaschemaDefinition {
  name: string;
  formalName: string;
  description: string;
  remarks?: string;
  flags: FieldDef[];
  modelItems: ModelItem[];
  constraints: ConstraintDef[];
  isRoot?: boolean;
  rootName?: string;
  type: 'assembly' | 'field' | 'flag';
}

export interface FieldDef {
  name: string;
  formalName: string;
  description: string;
  asType?: string;
  required?: boolean;
  remarks?: string;
}

export interface ModelItem {
  ref?: string;
  name?: string; // for inline definitions
  formalName?: string;
  description?: string;
  type: 'assembly' | 'field' | 'flag';
  minOccurs?: number;
  maxOccurs?: number | 'unbounded';
  groupAs?: string;
  inJson?: string;
  remarks?: string;
}

export interface ConstraintDef {
  type: string;
  id?: string;
  target?: string;
  description?: string;
  values?: { value: string; description: string }[];
}

export interface ParsedMetaschema {
  schemaName: string;
  schemaVersion: string;
  shortName: string;
  namespace: string;
  remarks?: string;
  imports: string[];
  definitions: MetaschemaDefinition[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node['#text']) return node['#text'];
  // Handle markup with nested elements like <code>, <a>, etc.
  if (typeof node === 'object') {
    let text = '';
    for (const key of Object.keys(node)) {
      if (key === '#text') {
        text += node[key];
      } else if (key.startsWith('@_')) {
        continue;
      } else {
        const child = node[key];
        if (Array.isArray(child)) {
          text += child.map(extractText).join('');
        } else {
          text += extractText(child);
        }
      }
    }
    return text;
  }
  return String(node);
}

// --- Prose (markdown-multiline) extraction ---------------------------------
//
// Metaschema description/remarks elements contain mixed-content "markdown"
// markup (<p>, <code>, <a>, <strong>/<em>, <ul>/<ol>/<li>, <q>, <sub>/<sup>,
// <br>, <img>, <insert>, <h1>..<h6>, <pre>). The default JSON-style parse
// drops text-vs-element ordering, so we re-serialize a single subtree back
// to XML and re-parse it with `preserveOrder: true` to keep the original
// word order, then convert to safe HTML.

const proseBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  format: false,
  suppressEmptyNode: false,
});

const proseParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  textNodeName: '#text',
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

// Tags allowed in OSCAL markdown-multiline content. Anything else is rendered
// as its inner text only (no surrounding tag) so we never emit unsafe HTML.
const INLINE_TAGS = new Set([
  'code',
  'em',
  'i',
  'strong',
  'b',
  'q',
  'sub',
  'sup',
  'br',
  'img',
  'insert',
]);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderOrderedNodes(nodes: any[]): string {
  if (!Array.isArray(nodes)) return '';
  let html = '';
  for (const node of nodes) {
    if (node == null || typeof node !== 'object') continue;
    // preserveOrder text nodes look like { '#text': 'value' }
    if ('#text' in node) {
      const t = node['#text'];
      if (typeof t === 'string') html += escapeHtml(t);
      continue;
    }
    const tag = Object.keys(node).find((k) => k !== ':@');
    if (!tag) continue;
    const children = node[tag];
    const attrs = (node[':@'] || {}) as Record<string, string>;
    const inner = Array.isArray(children) ? renderOrderedNodes(children) : '';

    if (tag === 'a') {
      const href = attrs['@_href'] ? ` href="${escapeAttr(attrs['@_href'])}"` : '';
      html += `<a${href} target="_blank" rel="noopener">${inner}</a>`;
    } else if (tag === 'img') {
      const src = attrs['@_src'] ? ` src="${escapeAttr(attrs['@_src'])}"` : '';
      const alt = attrs['@_alt'] ? ` alt="${escapeAttr(attrs['@_alt'])}"` : '';
      html += `<img${src}${alt} />`;
    } else if (tag === 'br') {
      html += '<br />';
    } else if (tag === 'insert') {
      // <insert type="param" id-ref="x" /> — render as a placeholder token.
      const idRef = attrs['@_id-ref'] || attrs['@_param-id'] || '';
      html += `<code class="insert">{{ insert: ${escapeHtml(idRef)} }}</code>`;
    } else if (INLINE_TAGS.has(tag) || BLOCK_TAGS.has(tag)) {
      html += `<${tag}>${inner}</${tag}>`;
    } else {
      // Unknown tag — render only its content.
      html += inner;
    }
  }
  return html;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractHtml(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return escapeHtml(node).trim();
  // Re-serialize the parsed-object subtree to XML, then re-parse preserving
  // child order so we can faithfully render the prose markup. This only
  // succeeds when the *original* parse retained interleaving — for our main
  // (non-preserveOrder) parser, child element order is already lost. Use
  // `extractHtmlOrdered` for that case.
  let xml: string;
  try {
    xml = proseBuilder.build({ __wrapper__: node });
  } catch {
    return escapeHtml(extractText(node)).trim();
  }
  let ordered: unknown;
  try {
    ordered = proseParser.parse(xml);
  } catch {
    return escapeHtml(extractText(node)).trim();
  }
  if (!Array.isArray(ordered) || ordered.length === 0) return '';
  const wrapper = (ordered[0] as Record<string, unknown>)['__wrapper__'];
  if (!Array.isArray(wrapper)) return '';
  return renderOrderedNodes(wrapper).trim();
}

// --- Ordered-tree (preserveOrder) helpers ---------------------------------
//
// To render prose with correct word/element ordering, we parse the XML a
// second time with `preserveOrder: true` and walk that tree directly.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderedNode = Record<string, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOrderedChildArray(parent: OrderedNode | undefined, tag: string): any[] | undefined {
  if (!parent) return undefined;
  const children = (parent as OrderedNode)['__children__'] as OrderedNode[] | undefined;
  if (!Array.isArray(children)) return undefined;
  for (const c of children) {
    if (c && typeof c === 'object' && tag in c && tag !== ':@' && tag !== '__children__') {
      return c[tag];
    }
  }
  return undefined;
}

function renderProse(parent: OrderedNode | undefined, tag: string): string {
  const kids = getOrderedChildArray(parent, tag);
  if (!kids) return '';
  return renderOrderedNodes(kids).trim();
}

function renderProseOptional(parent: OrderedNode | undefined, tag: string): string | undefined {
  const kids = getOrderedChildArray(parent, tag);
  if (!kids) return undefined;
  const html = renderOrderedNodes(kids).trim();
  return html || undefined;
}

// Build an index: tag+name → ordered node, walking the entire ordered tree.
// Used to look up the preserveOrder version of any named definition (top-level
// or inline `define-assembly` / `define-field` / `define-flag`) and any
// allowed-values <enum value="..."> element.
function buildOrderedIndex(orderedRoot: unknown): Map<string, OrderedNode> {
  const idx = new Map<string, OrderedNode>();
  if (!Array.isArray(orderedRoot)) return idx;

  function visit(nodes: unknown[]) {
    for (const n of nodes) {
      if (!n || typeof n !== 'object') continue;
      const obj = n as OrderedNode;
      const attrs = (obj[':@'] || {}) as Record<string, string>;
      const tag = Object.keys(obj).find((k) => k !== ':@');
      if (!tag) continue;
      const children = obj[tag];
      // Stash a normalized children pointer for getOrderedChildArray.
      obj['__children__'] = children;

      if (
        (tag === 'define-assembly' || tag === 'define-field' || tag === 'define-flag') &&
        attrs['@_name']
      ) {
        idx.set(`${tag}:${attrs['@_name']}`, obj);
      }
      if (tag === 'enum' && attrs['@_value']) {
        idx.set(`enum:${attrs['@_value']}`, obj);
      }

      if (Array.isArray(children)) visit(children);
    }
  }
  visit(orderedRoot as unknown[]);
  return idx;
}

function getOrderedDef(
  idx: Map<string, OrderedNode>,
  kind: 'define-assembly' | 'define-field' | 'define-flag',
  name: string | undefined,
): OrderedNode | undefined {
  if (!name) return undefined;
  return idx.get(`${kind}:${name}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFlags(node: any, idx: Map<string, OrderedNode>): FieldDef[] {
  const flags: FieldDef[] = [];
  const definedFlags = node['define-flag'];
  if (definedFlags) {
    const flagArr = Array.isArray(definedFlags) ? definedFlags : [definedFlags];
    for (const f of flagArr) {
      const name = f['@_name'] || '';
      const ordered = getOrderedDef(idx, 'define-flag', name);
      flags.push({
        name,
        formalName: extractText(f['formal-name']?.[0] || f['formal-name']),
        description: renderProse(ordered, 'description'),
        asType: f['@_as-type'],
        required: f['@_required'] === 'yes',
        remarks: renderProseOptional(ordered, 'remarks'),
      });
    }
  }
  return flags;
}

function parseModelItems(
  modelNode: any,
  idx: Map<string, OrderedNode>,
  collected?: MetaschemaDefinition[],
): ModelItem[] {
  if (!modelNode) return [];
  const model = Array.isArray(modelNode) ? modelNode[0] : modelNode;
  if (!model) return [];
  const items: ModelItem[] = [];

  for (const key of ['assembly', 'field']) {
    const entries = model[key];
    if (entries) {
      const arr = Array.isArray(entries) ? entries : [entries];
      for (const entry of arr) {
        const groupAs = entry['group-as'];
        const ref = entry['@_ref'];
        // Item-level remarks: re-serialize this entry's remarks node so we
        // still get correct ordering. Item remarks aren't keyed in the global
        // index, so we fall back to in-place re-parse via extractHtml.
        items.push({
          ref,
          type: key as 'assembly' | 'field',
          minOccurs: entry['@_min-occurs'] ? parseInt(entry['@_min-occurs']) : undefined,
          maxOccurs:
            entry['@_max-occurs'] === 'unbounded'
              ? 'unbounded'
              : entry['@_max-occurs']
                ? parseInt(entry['@_max-occurs'])
                : undefined,
          groupAs: groupAs ? (Array.isArray(groupAs) ? groupAs[0] : groupAs)['@_name'] : undefined,
          inJson: groupAs
            ? (Array.isArray(groupAs) ? groupAs[0] : groupAs)['@_in-json']
            : undefined,
          remarks: entry['remarks']
            ? extractHtml(entry['remarks'][0] || entry['remarks']) || undefined
            : undefined,
        });
      }
    }
  }

  // Handle inline define-assembly and define-field inside model.
  // Promote them to top-level definitions (so they get their own anchor section)
  // and reference them from the model item via `ref`.
  for (const key of ['define-assembly', 'define-field']) {
    const entries = model[key];
    if (entries) {
      const arr = Array.isArray(entries) ? entries : [entries];
      for (const entry of arr) {
        const groupAs = entry['group-as'];
        const name = entry['@_name'] || '';
        const itemType: 'assembly' | 'field' = key === 'define-assembly' ? 'assembly' : 'field';
        const orderedDef = getOrderedDef(idx, key as 'define-assembly' | 'define-field', name);

        if (collected && name) {
          collected.push({
            name,
            formalName: extractText(entry['formal-name']?.[0] || entry['formal-name']),
            description: renderProse(orderedDef, 'description'),
            remarks: renderProseOptional(orderedDef, 'remarks'),
            flags: parseFlags(entry, idx),
            modelItems:
              itemType === 'assembly' ? parseModelItems(entry['model'], idx, collected) : [],
            constraints: parseConstraints(entry['constraint'], idx),
            type: itemType,
          });
        }

        items.push({
          ref: name,
          type: itemType,
          minOccurs: entry['@_min-occurs'] ? parseInt(entry['@_min-occurs']) : undefined,
          maxOccurs:
            entry['@_max-occurs'] === 'unbounded'
              ? 'unbounded'
              : entry['@_max-occurs']
                ? parseInt(entry['@_max-occurs'])
                : undefined,
          groupAs: groupAs ? (Array.isArray(groupAs) ? groupAs[0] : groupAs)['@_name'] : undefined,
          inJson: groupAs
            ? (Array.isArray(groupAs) ? groupAs[0] : groupAs)['@_in-json']
            : undefined,
        });
      }
    }
  }

  // Handle choice elements
  const choices = model['choice'];
  if (choices) {
    const choiceArr = Array.isArray(choices) ? choices : [choices];
    for (const choice of choiceArr) {
      items.push(...parseModelItems(choice, idx, collected));
    }
  }

  return items;
}

function parseConstraints(constraintNode: any, idx: Map<string, OrderedNode>): ConstraintDef[] {
  if (!constraintNode) return [];
  const constraints: ConstraintDef[] = [];
  const cArr = Array.isArray(constraintNode) ? constraintNode : [constraintNode];

  for (const c of cArr) {
    // allowed-values
    const av = c['allowed-values'];
    if (av) {
      const avArr = Array.isArray(av) ? av : [av];
      for (const a of avArr) {
        const enums = a['enum'];
        const values: { value: string; description: string }[] = [];
        if (enums) {
          const enumArr = Array.isArray(enums) ? enums : [enums];
          for (const e of enumArr) {
            const value = e['@_value'] || '';
            const orderedEnum = idx.get(`enum:${value}`);
            // Enum content is mixed text directly inside <enum>, so render the
            // ordered children of the enum node itself.
            const html = orderedEnum
              ? renderOrderedNodes(
                  (orderedEnum['__children__'] as OrderedNode[] | undefined) || [],
                ).trim()
              : extractHtml(e);
            values.push({ value, description: html });
          }
        }
        constraints.push({
          type: 'allowed-values',
          id: a['@_id'],
          target: a['@_target'],
          values,
        });
      }
    }

    // index
    const cIndex = c['index'];
    if (cIndex) {
      const idxArr = Array.isArray(cIndex) ? cIndex : [cIndex];
      for (const i of idxArr) {
        constraints.push({
          type: 'index',
          id: i['@_id'],
          target: i['@_target'],
          description: `Index "${i['@_name']}" on ${i['@_target']}`,
        });
      }
    }

    // expect
    const exp = c['expect'];
    if (exp) {
      const expArr = Array.isArray(exp) ? exp : [exp];
      for (const e of expArr) {
        constraints.push({
          type: 'expect',
          id: e['@_id'],
          target: e['@_target'],
          description: `Test: ${e['@_test']}`,
        });
      }
    }
  }

  return constraints;
}

export function parseMetaschemaXml(xml: string): ParsedMetaschema {
  const result = parser.parse(xml);
  const ms = result['METASCHEMA'];

  // Second pass: preserveOrder for prose extraction.
  const orderedRoot = proseParser.parse(xml) as unknown[];
  const idx = buildOrderedIndex(orderedRoot);

  const definitions: MetaschemaDefinition[] = [];

  // Parse define-assembly
  const assemblies = ms['define-assembly'];
  if (assemblies) {
    const arr = Array.isArray(assemblies) ? assemblies : [assemblies];
    for (const a of arr) {
      const name = a['@_name'] || '';
      const orderedDef = getOrderedDef(idx, 'define-assembly', name);
      definitions.push({
        name,
        formalName: extractText(a['formal-name']?.[0] || a['formal-name']),
        description: renderProse(orderedDef, 'description'),
        remarks: renderProseOptional(orderedDef, 'remarks'),
        flags: parseFlags(a, idx),
        modelItems: parseModelItems(a['model'], idx, definitions),
        constraints: parseConstraints(a['constraint'], idx),
        isRoot: !!a['root-name'],
        rootName: a['root-name'] ? extractText(a['root-name']) : undefined,
        type: 'assembly',
      });
    }
  }

  // Parse define-field
  const fields = ms['define-field'];
  if (fields) {
    const arr = Array.isArray(fields) ? fields : [fields];
    for (const f of arr) {
      const name = f['@_name'] || '';
      const orderedDef = getOrderedDef(idx, 'define-field', name);
      definitions.push({
        name,
        formalName: extractText(f['formal-name']?.[0] || f['formal-name']),
        description: renderProse(orderedDef, 'description'),
        remarks: renderProseOptional(orderedDef, 'remarks'),
        flags: parseFlags(f, idx),
        modelItems: [],
        constraints: parseConstraints(f['constraint'], idx),
        type: 'field',
      });
    }
  }

  // Parse imports
  const imports: string[] = [];
  const imp = ms['import'];
  if (imp) {
    const impArr = Array.isArray(imp) ? imp : [imp];
    for (const i of impArr) {
      imports.push(i['@_href'] || '');
    }
  }

  return {
    schemaName: extractText(ms['schema-name']),
    schemaVersion: extractText(ms['schema-version']),
    shortName: extractText(ms['short-name']),
    namespace: extractText(ms['namespace']),
    remarks: ms['remarks']
      ? extractHtml(ms['remarks'][0] || ms['remarks']) || undefined
      : undefined,
    imports,
    definitions,
  };
}

// Cache for fetched metaschemas
const cache = new Map<string, ParsedMetaschema>();
const entityCache = new Map<string, string>();

async function fetchEntity(baseUrl: string, relPath: string): Promise<string> {
  const url = new URL(relPath, baseUrl).toString();
  if (entityCache.has(url)) return entityCache.get(url)!;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch entity ${url}: ${res.statusText}`);
  const text = await res.text();
  entityCache.set(url, text);
  return text;
}

// Resolve <!DOCTYPE ...> external entities so fast-xml-parser can read the document.
async function resolveExternalEntities(xml: string, baseUrl: string): Promise<string> {
  const doctypeMatch = xml.match(/<!DOCTYPE[^[]*\[([\s\S]*?)\]\s*>/);
  if (!doctypeMatch) return xml;
  const decls = doctypeMatch[1];
  const entityRe = /<!ENTITY\s+([\w-]+)\s+SYSTEM\s+"([^"]+)"\s*>/g;
  const entities: { name: string; content: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = entityRe.exec(decls)) !== null) {
    const content = await fetchEntity(baseUrl, m[2]);
    entities.push({ name: m[1], content });
  }
  // Strip the DOCTYPE.
  let out = xml.replace(doctypeMatch[0], '');
  // Substitute &name; references in body.
  for (const ent of entities) {
    out = out.split(`&${ent.name};`).join(ent.content);
  }
  return out;
}

export async function fetchMetaschema(
  version: string,
  filename: string,
): Promise<ParsedMetaschema> {
  // Map version tags to branch/tag names in git
  const branch = version === 'develop' ? 'develop' : version;
  const key = `${branch}/${filename}`;
  if (cache.has(key)) return cache.get(key)!;

  const url = `${GITHUB_RAW_BASE}/${branch}/src/metaschema/${filename}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  const rawXml = await response.text();
  const xml = await resolveExternalEntities(rawXml, url);
  const parsed = parseMetaschemaXml(xml);
  cache.set(key, parsed);
  return parsed;
}

export interface ResolvedModel {
  name: string;
  displayName: string;
  version: string;
  definitions: MetaschemaDefinition[];
  rootDefinition?: MetaschemaDefinition;
}

// Recursively fetch and merge all imported metaschemas
async function fetchAllImports(
  version: string,
  filename: string,
  visited: Set<string>,
): Promise<MetaschemaDefinition[]> {
  if (visited.has(filename)) return [];
  visited.add(filename);

  const parsed = await fetchMetaschema(version, filename);
  let allDefs = [...parsed.definitions];

  for (const imp of parsed.imports) {
    const importedDefs = await fetchAllImports(version, imp, visited);
    allDefs = allDefs.concat(importedDefs);
  }

  return allDefs;
}

export async function resolveModel(modelSlug: string, version: string): Promise<ResolvedModel> {
  const filename = MODEL_FILES[modelSlug];
  if (!filename) throw new Error(`Unknown model: ${modelSlug}`);

  const visited = new Set<string>();
  const definitions = await fetchAllImports(version, filename, visited);

  // Deduplicate by name
  const deduped = new Map<string, MetaschemaDefinition>();
  for (const def of definitions) {
    if (!deduped.has(def.name)) {
      deduped.set(def.name, def);
    }
  }

  const allDefs = Array.from(deduped.values());
  const rootDef = allDefs.find((d) => d.isRoot);

  return {
    name: modelSlug,
    displayName: MODEL_DISPLAY_NAMES[modelSlug],
    version,
    definitions: allDefs,
    rootDefinition: rootDef,
  };
}
