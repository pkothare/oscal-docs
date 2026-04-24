// Public types rendered into Astro components.

export type DefinitionType = 'assembly' | 'field' | 'flag';

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
  type: DefinitionType;
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
  name?: string;
  formalName?: string;
  description?: string;
  type: DefinitionType;
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

export interface ResolvedModel {
  name: string;
  displayName: string;
  version: string;
  definitions: MetaschemaDefinition[];
  rootDefinition?: MetaschemaDefinition;
}

// Top-level model metaschema files (root models, not shared modules).
export const MODEL_FILES = new Map<string, string>([
  ['catalog', 'oscal_catalog_metaschema.xml'],
  ['profile', 'oscal_profile_metaschema.xml'],
  ['component-definition', 'oscal_component_metaschema.xml'],
  ['system-security-plan', 'oscal_ssp_metaschema.xml'],
  ['assessment-plan', 'oscal_assessment-plan_metaschema.xml'],
  ['assessment-results', 'oscal_assessment-results_metaschema.xml'],
  ['plan-of-action-and-milestones', 'oscal_poam_metaschema.xml'],
]);

export const MODEL_DISPLAY_NAMES = new Map<string, string>([
  ['catalog', 'Catalog'],
  ['profile', 'Profile'],
  ['component-definition', 'Component Definition'],
  ['system-security-plan', 'System Security Plan'],
  ['assessment-plan', 'Assessment Plan'],
  ['assessment-results', 'Assessment Results'],
  ['plan-of-action-and-milestones', 'Plan of Action and Milestones'],
]);
