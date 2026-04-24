// OSCAL release version discovery from the GitHub tags API.

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

/**
 * Lazily fetches and caches the sorted list of OSCAL release tags.
 * The list is fetched once per process (build).
 */
export class VersionRegistry {
  private static instance: VersionRegistry | null = null;
  private versionsPromise: Promise<string[]> | null = null;

  static shared(): VersionRegistry {
    if (!VersionRegistry.instance) VersionRegistry.instance = new VersionRegistry();
    return VersionRegistry.instance;
  }

  getVersions(): Promise<string[]> {
    if (!this.versionsPromise) this.versionsPromise = this.fetchVersions();
    return this.versionsPromise;
  }

  async getLatest(): Promise<string> {
    const versions = await this.getVersions();
    return versions[versions.length - 1];
  }

  private async fetchVersions(): Promise<string[]> {
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
  }
}
