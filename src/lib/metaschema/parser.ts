import { XMLParser } from 'fast-xml-parser';

import {
  ARRAY_ELEMENTS,
  firstPlainText,
  plainText,
  type MsAssembly,
  type MsConstraint,
  type MsField,
  type MsFlag,
  type MsGroupAs,
  type MsModel,
  type MsRefEntry,
  type MsRoot,
} from './raw-types.ts';
import { escapeHtml, ProseTree, renderProseNodes } from './prose.ts';
import type {
  ConstraintDef,
  FieldDef,
  MetaschemaDefinition,
  ModelItem,
  ParsedMetaschema,
} from './types.ts';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ARRAY_ELEMENTS.has(name),
});

// --- Attribute parsing helpers --------------------------------------------

function optInt(v: string | undefined): number | undefined {
  return v === undefined ? undefined : parseInt(v);
}

function parseMaxOccurs(v: string | undefined): number | 'unbounded' | undefined {
  if (v === undefined) return undefined;
  if (v === 'unbounded') return 'unbounded';
  return parseInt(v);
}

function groupAsAttr(
  arr: MsGroupAs[] | undefined,
  key: '@_name' | '@_in-json',
): string | undefined {
  return arr?.[0]?.[key];
}

/**
 * Parses a single metaschema XML document into a {@link ParsedMetaschema}.
 *
 * The parser does two passes:
 *   1. A standard JSON-style parse for structural navigation (arrays, attrs).
 *   2. A `preserveOrder: true` parse to render mixed-content prose with
 *      correct word/element ordering, exposed via a {@link ProseTree}.
 *
 * Inline `define-assembly` / `define-field` elements found inside `<model>`
 * are *promoted* into the top-level definitions list (so each gets its own
 * anchor in the rendered docs) and the corresponding `ModelItem` references
 * them by name.
 */
export class MetaschemaParser {
  private readonly definitions: MetaschemaDefinition[] = [];

  private constructor(
    private readonly root: MsRoot,
    private readonly prose: ProseTree,
  ) {}

  static parse(xml: string): ParsedMetaschema {
    const root = xmlParser.parse(xml) as MsRoot;
    const prose = ProseTree.fromXml(xml);
    return new MetaschemaParser(root, prose).build();
  }

  private build(): ParsedMetaschema {
    const ms = this.root.METASCHEMA;
    const proseMs = this.prose.findRoot('METASCHEMA');

    for (const a of ms['define-assembly'] ?? []) this.addAssembly(a, true);
    for (const f of ms['define-field'] ?? []) this.addField(f);

    return {
      schemaName: plainText(ms['schema-name']),
      schemaVersion: plainText(ms['schema-version']),
      shortName: plainText(ms['short-name']),
      namespace: plainText(ms.namespace),
      remarks: ProseTree.renderChildOptional(proseMs, 'remarks'),
      imports: (ms.import ?? []).map((i) => i['@_href'] ?? ''),
      definitions: this.definitions,
    };
  }

  private addAssembly(a: MsAssembly, isTopLevel: boolean): void {
    const name = a['@_name'] ?? '';
    if (!name) return;
    const orderedDef = this.prose.findDefinition('define-assembly', name);
    this.definitions.push({
      name,
      formalName: firstPlainText(a['formal-name']),
      description: ProseTree.renderChild(orderedDef, 'description'),
      remarks: ProseTree.renderChildOptional(orderedDef, 'remarks'),
      flags: this.parseFlags(a),
      modelItems: this.parseModelItems(a.model),
      constraints: this.parseConstraints(a.constraint),
      isRoot: isTopLevel && a['root-name'] !== undefined,
      rootName: a['root-name'] !== undefined ? plainText(a['root-name']) : undefined,
      type: 'assembly',
    });
  }

  private addField(f: MsField): void {
    const name = f['@_name'] ?? '';
    if (!name) return;
    const orderedDef = this.prose.findDefinition('define-field', name);
    this.definitions.push({
      name,
      formalName: firstPlainText(f['formal-name']),
      description: ProseTree.renderChild(orderedDef, 'description'),
      remarks: ProseTree.renderChildOptional(orderedDef, 'remarks'),
      flags: this.parseFlags(f),
      modelItems: [],
      constraints: this.parseConstraints(f.constraint),
      type: 'field',
    });
  }

  private parseFlags(node: { 'define-flag'?: MsFlag[] }): FieldDef[] {
    const defs = node['define-flag'];
    if (!defs) return [];
    return defs.map((f) => {
      const name = f['@_name'] ?? '';
      const ordered = this.prose.findDefinition('define-flag', name);
      return {
        name,
        formalName: firstPlainText(f['formal-name']),
        description: ProseTree.renderChild(ordered, 'description'),
        asType: f['@_as-type'],
        required: f['@_required'] === 'yes',
        remarks: ProseTree.renderChildOptional(ordered, 'remarks'),
      };
    });
  }

  private parseModelItems(models: MsModel[] | undefined): ModelItem[] {
    if (!models || models.length === 0) return [];
    const model = models[0];
    const items: ModelItem[] = [];

    for (const e of model.assembly ?? []) items.push(parseRefEntry(e, 'assembly'));
    for (const e of model.field ?? []) items.push(parseRefEntry(e, 'field'));
    for (const e of model['define-assembly'] ?? []) items.push(this.parseInlineAssembly(e));
    for (const e of model['define-field'] ?? []) items.push(this.parseInlineField(e));
    for (const choice of model.choice ?? []) {
      items.push(...this.parseModelItems([choice]));
    }
    return items;
  }

  private parseInlineAssembly(entry: MsAssembly): ModelItem {
    this.addAssembly(entry, false);
    return inlineRef(entry['@_name'] ?? '', 'assembly', entry);
  }

  private parseInlineField(entry: MsField): ModelItem {
    this.addField(entry);
    return inlineRef(entry['@_name'] ?? '', 'field', entry);
  }

  private parseConstraints(constraints: MsConstraint[] | undefined): ConstraintDef[] {
    if (!constraints) return [];
    const out: ConstraintDef[] = [];

    for (const c of constraints) {
      for (const a of c['allowed-values'] ?? []) {
        const values = (a.enum ?? []).map((e) => {
          const value = e['@_value'] ?? '';
          const orderedEnum = this.prose.findEnum(value);
          const description = orderedEnum
            ? renderProseNodes(orderedEnum.children).trim()
            : escapeHtml((e['#text'] ?? '').trim());
          return { value, description };
        });
        out.push({
          type: 'allowed-values',
          id: a['@_id'],
          target: a['@_target'],
          values,
        });
      }
      for (const i of c.index ?? []) {
        out.push({
          type: 'index',
          id: i['@_id'],
          target: i['@_target'],
          description: `Index "${i['@_name']}" on ${i['@_target']}`,
        });
      }
      for (const e of c.expect ?? []) {
        out.push({
          type: 'expect',
          id: e['@_id'],
          target: e['@_target'],
          description: `Test: ${e['@_test']}`,
        });
      }
    }

    return out;
  }
}

function parseRefEntry(entry: MsRefEntry, type: 'assembly' | 'field'): ModelItem {
  return {
    ref: entry['@_ref'],
    type,
    minOccurs: optInt(entry['@_min-occurs']),
    maxOccurs: parseMaxOccurs(entry['@_max-occurs']),
    groupAs: groupAsAttr(entry['group-as'], '@_name'),
    inJson: groupAsAttr(entry['group-as'], '@_in-json'),
    // Item-level remarks aren't keyed in the prose index (they're positional
    // within a model), so render plain text only — a lossy shortcut used only
    // for items.
    remarks: itemRemarks(entry.remarks),
  };
}

function itemRemarks(remarks: MsRefEntry['remarks'] | undefined): string | undefined {
  if (!remarks || remarks.length === 0) return undefined;
  const text = remarks[0]['#text']?.trim();
  return text ? escapeHtml(text) : undefined;
}

function inlineRef(
  name: string,
  type: 'assembly' | 'field',
  entry: MsAssembly | MsField,
): ModelItem {
  return {
    ref: name,
    type,
    minOccurs: optInt(entry['@_min-occurs']),
    maxOccurs: parseMaxOccurs(entry['@_max-occurs']),
    groupAs: groupAsAttr(entry['group-as'], '@_name'),
    inJson: groupAsAttr(entry['group-as'], '@_in-json'),
  };
}
