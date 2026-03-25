import { z } from 'zod';
import { searchDocs, readDoc } from '../docs/search.js';
import { MCPTool } from '../utils/types.js';

export const docsTools: MCPTool[] = [
  {
    name: 'search_godot_docs',
    description: 'Search the official Godot documentation. Returns matching pages ranked by relevance. Use read_godot_doc to get full content.',
    parameters: z.object({
      query: z.string().describe('Search query (e.g. "CharacterBody2D move_and_slide", "tilemap tutorial")'),
      limit: z.number().optional().describe('Max results to return (default: 10)'),
    }),
    execute: async ({ query, limit }: { query: string; limit?: number }): Promise<string> => {
      try {
        const results = searchDocs(query, limit);
        if (results.length === 0) return 'No results found.';
        return results.map((r, i) => `${i + 1}. [${r.score}] ${r.title}\n   ${r.path}`).join('\n');
      } catch (error) {
        throw new Error(`Search failed: ${(error as Error).message}`);
      }
    },
  },
  {
    name: 'read_godot_doc',
    description: 'Read the full content of a Godot documentation page. Use the path from search_godot_docs results.',
    parameters: z.object({
      path: z.string().describe('Document path from search results (e.g. "classes/class_node2d.rst")'),
    }),
    execute: async ({ path }: { path: string }): Promise<string> => {
      try {
        const result = readDoc(path);
        if (!result) throw new Error(`Document not found: ${path}`);
        return `# ${path} (Godot ${result.version})\n\n${result.content}`;
      } catch (error) {
        throw new Error(`Read failed: ${(error as Error).message}`);
      }
    },
  },
];
