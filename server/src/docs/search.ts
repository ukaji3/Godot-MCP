import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import MiniSearch from 'minisearch';

interface IndexData {
  version: string;
  documentCount: number;
  index: any;
  documents: Record<string, string>;
}

let loaded: { search: MiniSearch; docs: Record<string, string>; version: string } | null = null;

function getDataDir(): string {
  return join(import.meta.dirname, '..', '..', 'data');
}

function findLatestIndex(): string | null {
  const dataDir = getDataDir();
  if (!existsSync(dataDir)) return null;
  const files = readdirSync(dataDir).filter(f => f.startsWith('godot-docs-') && f.endsWith('.json'));
  if (files.length === 0) return null;
  // prefer "stable", otherwise pick first
  const stable = files.find(f => f.includes('stable'));
  return join(dataDir, stable ?? files[0]);
}

function ensureLoaded(): void {
  if (loaded) return;
  const indexPath = findLatestIndex();
  if (!indexPath) throw new Error('No documentation index found. Run: npm run build-index');
  const data: IndexData = JSON.parse(readFileSync(indexPath, 'utf-8'));
  const search = MiniSearch.loadJSON<{ path: string; title: string }>(JSON.stringify(data.index), {
    fields: ['title', 'content'],
    storeFields: ['path', 'title'],
  });
  loaded = { search, docs: data.documents, version: data.version };
}

export function searchDocs(query: string, limit = 10): { path: string; title: string; score: number }[] {
  ensureLoaded();
  return loaded!.search.search(query).slice(0, limit).map(r => ({
    path: r.path,
    title: r.title,
    score: Math.round(r.score * 100) / 100,
  }));
}

export function readDoc(path: string): { content: string; version: string } | null {
  ensureLoaded();
  const content = loaded!.docs[path];
  if (!content) return null;
  return { content, version: loaded!.version };
}

export function getIndexVersion(): string | null {
  try { ensureLoaded(); return loaded!.version; } catch { return null; }
}
