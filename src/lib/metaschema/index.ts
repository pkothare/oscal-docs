// Public surface of the metaschema library. Wraps the underlying classes
// in the function API the Astro components and config already use.

import { MetaschemaLoader } from './loader.ts';
import { MetaschemaParser } from './parser.ts';
import { VersionRegistry } from './versions.ts';
import type { ParsedMetaschema, ResolvedModel } from './types.ts';

export type {
  ConstraintDef,
  DefinitionType,
  FieldDef,
  MetaschemaDefinition,
  ModelItem,
  ParsedMetaschema,
  ResolvedModel,
} from './types.ts';
export { MODEL_DISPLAY_NAMES, MODEL_FILES } from './types.ts';

export function getOscalVersions(): Promise<string[]> {
  return VersionRegistry.shared().getVersions();
}

export function getLatestVersion(): Promise<string> {
  return VersionRegistry.shared().getLatest();
}

export function parseMetaschemaXml(xml: string): ParsedMetaschema {
  return MetaschemaParser.parse(xml);
}

export function fetchMetaschema(version: string, filename: string): Promise<ParsedMetaschema> {
  return MetaschemaLoader.shared().fetchMetaschema(version, filename);
}

export function resolveModel(modelSlug: string, version: string): Promise<ResolvedModel> {
  return MetaschemaLoader.shared().resolveModel(modelSlug, version);
}
