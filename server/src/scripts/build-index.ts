#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { tmpdir } from 'os';
import MiniSearch from 'minisearch';

const REPO_URL = 'https://github.com/godotengine/godot-docs.git';
const HEADING_RE = /^[=\-~^"`#*+:.]{2,}$/;

function walkRst(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkRst(full));
    } else if (entry.endsWith('.rst')) {
      results.push(full);
    }
  }
  return results;
}

function extractTitle(content: string): string {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    const next = lines[i + 1]?.trim() ?? '';
    if (line.length > 0 && HEADING_RE.test(next) && next.length >= line.length) {
      return line;
    }
    // overlined heading
    if (HEADING_RE.test(line) && i + 2 < lines.length) {
      const title = lines[i + 1]?.trim() ?? '';
      const under = lines[i + 2]?.trim() ?? '';
      if (title.length > 0 && HEADING_RE.test(under) && line[0] === under[0]) {
        return title;
      }
    }
  }
  return '';
}

function main() {
  const args = process.argv.slice(2);
  let version = 'stable';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' && args[i + 1]) version = args[i + 1];
  }

  const tmpDir = join(tmpdir(), `godot-docs-${Date.now()}`);
  const dataDir = join(import.meta.dirname, '..', '..', 'data');

  console.log(`Cloning godot-docs (branch: ${version})...`);
  execSync(`git clone --depth 1 --branch ${version} ${REPO_URL} ${tmpDir}`, { stdio: 'inherit' });

  console.log('Parsing RST files...');
  const rstFiles = walkRst(tmpDir);
  console.log(`Found ${rstFiles.length} RST files`);

  interface Doc { id: number; path: string; title: string; content: string }
  const documents: Doc[] = [];
  let id = 0;

  for (const file of rstFiles) {
    const relPath = relative(tmpDir, file);
    // skip changelog, release notes, etc.
    if (relPath.startsWith('community/') || relPath.startsWith('about/')) continue;

    const content = readFileSync(file, 'utf-8');
    const title = extractTitle(content) || relPath;
    documents.push({ id: id++, path: relPath, title, content });
  }

  console.log(`Indexed ${documents.length} documents`);

  console.log('Building search index...');
  const miniSearch = new MiniSearch<Doc>({
    fields: ['title', 'content'],
    storeFields: ['path', 'title'],
    searchOptions: { boost: { title: 3 }, fuzzy: 0.2, prefix: true },
  });
  miniSearch.addAll(documents);

  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const outPath = join(dataDir, `godot-docs-${version}.json`);

  // Store index + documents separately for size efficiency
  // documents store only path→content mapping for read_godot_doc
  const docStore: Record<string, string> = {};
  for (const doc of documents) {
    docStore[doc.path] = doc.content;
  }

  writeFileSync(outPath, JSON.stringify({
    version,
    documentCount: documents.length,
    index: miniSearch.toJSON(),
    documents: docStore,
  }));

  const sizeMB = (statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`Saved index to ${outPath} (${sizeMB} MB)`);

  console.log('Cleaning up...');
  rmSync(tmpDir, { recursive: true, force: true });
  console.log('Done!');
}

main();
