# Godot MCP (Model Context Protocol)

> Fork of [ee0pdt/Godot-MCP](https://github.com/ee0pdt/Godot-MCP) with enhanced features.

AI assistants can interact with your Godot projects through the Model Context Protocol (MCP) — creating nodes, editing scripts, manipulating scenes, and searching Godot documentation.

## Architecture

```
AI Assistant (Claude, Kiro, etc.)
    ↕ stdio (MCP)
Godot-MCP Server (FastMCP / TypeScript)
    ├── Editor tools → WebSocket → Godot Editor Plugin
    └── Doc search  → Local BM25 index (no Godot connection needed)
```

## Setup

### 1. MCP Server

```bash
git clone https://github.com/ukaji3/Godot-MCP.git
cd Godot-MCP/server
npm install
npm run build
```

### 2. Documentation Index (optional)

```bash
npm run build-index -- --version stable
```

Shallow-clones [godot-docs](https://github.com/godotengine/godot-docs), builds a BM25 search index (~37 MB), then deletes the clone. Only needed once.

### 3. MCP Client Configuration

Add to your MCP client config (Claude Desktop, Kiro CLI, etc.):

```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "node",
      "args": ["<PATH_TO_REPO>/server/dist/index.js"]
    }
  }
}
```

### 4. Godot Plugin

To use editor tools, the plugin must be running in Godot:

1. Copy `addons/godot_mcp` to your project's `addons/` directory
2. Project > Project Settings > Plugins > Enable "Godot MCP"

The plugin starts a WebSocket server that the MCP server connects to.

## Available Tools

### Node Commands

| Tool | Description |
|------|-------------|
| `create_node` | Create a new node in the scene |
| `delete_node` | Delete a node |
| `update_node_property` | Update a single node property |
| `update_node_transform` | Batch update position/rotation/scale (Node2D & Node3D) |
| `get_node_properties` | Get all properties of a node |
| `list_nodes` | List child nodes of a given path |

### Scene Commands

| Tool | Description |
|------|-------------|
| `get_current_scene` | Get info about the currently open scene |
| `get_full_scene_tree` | Get the full hierarchical scene tree with types, paths, and scripts |
| `create_scene` | Create a new scene |
| `open_scene` | Open a scene in the editor |
| `save_scene` | Save the current scene |
| `get_project_info` | Get project metadata |
| `create_resource` | Create a new resource |

### Script Commands

| Tool | Description |
|------|-------------|
| `create_script` | Create a new GDScript file |
| `edit_script` | Modify an existing script |
| `get_script` | Read a script's content |
| `create_script_template` | Generate a script from a template |

### Editor Commands

| Tool | Description |
|------|-------------|
| `execute_editor_script` | Run arbitrary GDScript in the editor |
| `get_debug_output` | Read the latest Godot log file |

### Documentation Commands (no Godot connection required)

| Tool | Description |
|------|-------------|
| `search_godot_docs` | BM25 full-text search across Godot documentation |
| `read_godot_doc` | Read the full content of a documentation page |

### Resources

| URI | Description |
|-----|-------------|
| `godot://scene/list` | List of project scenes |
| `godot://scene/structure` | Current scene structure |
| `godot://script/{path}` | Script content |
| `godot://script/list` | List of project scripts |
| `godot://script/metadata/{path}` | Script metadata |
| `godot://project/structure` | Project file structure |
| `godot://project/settings` | Project settings |
| `godot://project/resources` | Project resources |
| `godot://editor/state` | Editor state |
| `godot://editor/selected_node` | Currently selected node |
| `godot://editor/current_script` | Currently open script |

## Changes from Upstream

- **FastMCP v3** — Updated from v1, removed deprecated `websocket` package
- **Debug output cleanup** — `print()` calls replaced with `printerr()`/`_log()` to prevent JSON corruption on stdio
- **`get_debug_output`** — Read Godot log files through MCP
- **`get_full_scene_tree`** — Recursive scene tree with scene-relative paths (no editor-internal paths)
- **`update_node_transform`** — Batch position/rotation/scale updates for Node2D/Node3D
- **Enhanced node resolution** — Fallback search chain: exact path → name match → recursive search
- **`search_godot_docs` / `read_godot_doc`** — Offline Godot documentation search via BM25 index
- **`res://` resource loading** — `_parse_property_value` correctly loads resources from `res://` paths

## Troubleshooting

- **Plugin not connecting**: Ensure the Godot MCP plugin is enabled in Project Settings > Plugins
- **No documentation results**: Run `npm run build-index -- --version stable` in the `server/` directory
- **JSON parse errors in MCP**: Check that `log_detailed` is `false` in `mcp_server.gd` (default)

## License

MIT — see [LICENSE](LICENSE).
