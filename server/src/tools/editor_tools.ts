import { z } from 'zod';
import { getGodotConnection } from '../utils/godot_connection.js';
import { MCPTool, CommandResult } from '../utils/types.js';

interface ExecuteEditorScriptParams {
  code: string;
}

interface GetDebugOutputParams {
  lines: number;
}

export const editorTools: MCPTool[] = [
  {
    name: 'execute_editor_script',
    description: `Execute GDScript in the Godot editor context. Runs as a @tool script with full access to editor APIs.

## Returning data
Assign a Dictionary or Array to \`result\` to return structured JSON:
  result = {"nodes": [node.name for node in scene.get_children()]}

## Available variables
- \`scene\` — edited scene root (get_tree().edited_scene_root)
- \`_parent\` — the command processor node (in the editor scene tree)
- \`result\` — assign here to return structured data
- print() output is captured in the "output" field

## Key APIs accessible
- \`EditorInterface\` — editor state, open scenes/scripts, play scene, editor settings
- \`EditorInterface.get_selection()\` — selected nodes
- \`EditorInterface.get_resource_filesystem()\` — project files
- \`EditorInterface.get_editor_settings()\` — editor preferences
- \`ProjectSettings\` — project configuration, input map
- \`ClassDB\` — class info, instantiation
- All Node/Resource APIs on the edited scene

## Discovering available APIs
If unsure what methods are available, introspect at runtime:
  var methods = []
  for m in EditorInterface.get_method_list():
    methods.append(m.name)
  result = methods

## Common patterns
- Connect signal: \`node.connect("pressed", callable)\`
- Run game: \`EditorInterface.play_main_scene()\`
- Stop game: \`EditorInterface.stop_playing_scene()\`
- Change editor setting: \`EditorInterface.get_editor_settings().set("setting", value)\`
- Set project setting: \`ProjectSettings.set_setting("key", value)\``,
    parameters: z.object({
      code: z.string()
        .describe('GDScript code to execute in the editor context'),
    }),
    execute: async ({ code }: ExecuteEditorScriptParams): Promise<string> => {
      const godot = getGodotConnection();
      
      try {
        const result = await godot.sendCommand('execute_editor_script', { code });
        return JSON.stringify({
          success: result.success,
          output: result.output || [],
          result: result.result ?? null,
          error: result.error ?? null,
        }, null, 2);
      } catch (error) {
        throw new Error(`Script execution failed: ${(error as Error).message}`);
      }
    },
  },

  {
    name: 'get_debug_output',
    description: 'Get recent debug output and error logs from Godot. Reads the latest log file to capture print() output, warnings, and runtime errors.',
    parameters: z.object({
      lines: z.number().default(50)
        .describe('Number of recent log lines to return (default: 50)'),
    }),
    execute: async ({ lines }: GetDebugOutputParams): Promise<string> => {
      const godot = getGodotConnection();
      
      try {
        const result = await godot.sendCommand<CommandResult>('get_debug_output', { lines });
        
        if (!result.lines || result.lines.length === 0) {
          return 'No log output available.';
        }
        
        const header = `Log file: ${result.log_file}\nShowing last ${result.lines.length} of ${result.total_lines} lines:\n`;
        return header + '\n' + result.lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to get debug output: ${(error as Error).message}`);
      }
    },
  },
];
