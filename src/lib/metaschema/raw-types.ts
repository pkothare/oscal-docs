// Internal types mirroring the fast-xml-parser shape (non-preserveOrder pass).
//
// Elements that carry mixed prose content (description, remarks, enum bodies)
// are typed as RawText here for *structural* navigation only — the actual
// rendered HTML comes from the preserveOrder pass in `prose.ts`.

export interface RawText {
  '#text'?: string;
}

// Some elements (`formal-name`, `description`, ...) parse to either a string
// or a wrapped object depending on their content shape.
export type PlainText = string | RawText;

export interface MsImport {
  '@_href'?: string;
}

export interface MsGroupAs {
  '@_name'?: string;
  '@_in-json'?: string;
}

export interface MsRefEntry {
  '@_ref'?: string;
  '@_min-occurs'?: string;
  '@_max-occurs'?: string;
  'group-as'?: MsGroupAs[];
  remarks?: RawText[];
}

export interface MsFlag {
  '@_name'?: string;
  '@_as-type'?: string;
  '@_required'?: string;
  'formal-name'?: PlainText[];
  description?: PlainText[];
  remarks?: RawText[];
}

export interface MsField {
  '@_name'?: string;
  '@_as-type'?: string;
  // Present only when this define-field is inline inside a <model>:
  '@_min-occurs'?: string;
  '@_max-occurs'?: string;
  'group-as'?: MsGroupAs[];
  'formal-name'?: PlainText[];
  description?: PlainText[];
  remarks?: RawText[];
  'define-flag'?: MsFlag[];
  constraint?: MsConstraint[];
}

export interface MsAssembly {
  '@_name'?: string;
  // Present only when this define-assembly is inline inside a <model>:
  '@_min-occurs'?: string;
  '@_max-occurs'?: string;
  'group-as'?: MsGroupAs[];
  'root-name'?: PlainText;
  'formal-name'?: PlainText[];
  description?: PlainText[];
  remarks?: RawText[];
  'define-flag'?: MsFlag[];
  model?: MsModel[];
  constraint?: MsConstraint[];
}

export interface MsModel {
  assembly?: MsRefEntry[];
  field?: MsRefEntry[];
  'define-assembly'?: MsAssembly[];
  'define-field'?: MsField[];
  choice?: MsModel[];
}

export interface MsAllowedValues {
  '@_id'?: string;
  '@_target'?: string;
  enum?: MsEnum[];
}

export interface MsEnum {
  '@_value'?: string;
  '#text'?: string;
}

export interface MsIndex {
  '@_id'?: string;
  '@_name'?: string;
  '@_target'?: string;
}

export interface MsExpect {
  '@_id'?: string;
  '@_target'?: string;
  '@_test'?: string;
}

export interface MsConstraint {
  'allowed-values'?: MsAllowedValues[];
  index?: MsIndex[];
  expect?: MsExpect[];
}

export interface MsMetaschema {
  'schema-name'?: PlainText;
  'schema-version'?: PlainText;
  'short-name'?: PlainText;
  namespace?: PlainText;
  remarks?: RawText[];
  import?: MsImport[];
  'define-assembly'?: MsAssembly[];
  'define-field'?: MsField[];
}

export interface MsRoot {
  METASCHEMA: MsMetaschema;
}

// Element names that always parse to an array (regardless of how many
// instances appear in the source). Keeping them in `isArray` avoids branching
// on "single vs array" everywhere downstream.
export const ARRAY_ELEMENTS = new Set([
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
]);

// Plain-text extraction helpers (for fields like formal-name, schema-name).
export function plainText(value: PlainText | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return value['#text'] ?? '';
}

export function firstPlainText(arr: PlainText[] | undefined): string {
  return arr === undefined || arr.length === 0 ? '' : plainText(arr[0]);
}
