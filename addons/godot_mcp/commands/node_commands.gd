@tool
class_name MCPNodeCommands
extends MCPBaseCommandProcessor

func process_command(client_id: int, command_type: String, params: Dictionary, command_id: String) -> bool:
	match command_type:
		"create_node":
			_create_node(client_id, params, command_id)
			return true
		"delete_node":
			_delete_node(client_id, params, command_id)
			return true
		"update_node_property":
			_update_node_property(client_id, params, command_id)
			return true
		"update_node_transform":
			_update_node_transform(client_id, params, command_id)
			return true
		"get_node_properties":
			_get_node_properties(client_id, params, command_id)
			return true
		"list_nodes":
			_list_nodes(client_id, params, command_id)
			return true
	return false  # Command not handled

func _create_node(client_id: int, params: Dictionary, command_id: String) -> void:
	var parent_path = params.get("parent_path", "/root")
	var node_type = params.get("node_type", "Node")
	var node_name = params.get("node_name", "NewNode")
	
	# Validation
	if not ClassDB.class_exists(node_type):
		return _send_error(client_id, "Invalid node type: %s" % node_type, command_id)
	
	# Get editor plugin and interfaces
	var plugin = Engine.get_meta("GodotMCPPlugin")
	if not plugin:
		return _send_error(client_id, "GodotMCPPlugin not found in Engine metadata", command_id)
	
	var editor_interface = plugin.get_editor_interface()
	var edited_scene_root = editor_interface.get_edited_scene_root()
	
	if not edited_scene_root:
		return _send_error(client_id, "No scene is currently being edited", command_id)
	
	# Get the parent node using the editor node helper
	var parent = _get_editor_node(parent_path)
	if not parent:
		return _send_error(client_id, "Parent node not found: %s" % parent_path, command_id)
	
	# Create the node
	var node
	if ClassDB.can_instantiate(node_type):
		node = ClassDB.instantiate(node_type)
	else:
		return _send_error(client_id, "Cannot instantiate node of type: %s" % node_type, command_id)
	
	if not node:
		return _send_error(client_id, "Failed to create node of type: %s" % node_type, command_id)
	
	# Set the node name
	node.name = node_name
	
	# Add the node to the parent
	parent.add_child(node)
	
	# Set owner for proper serialization
	node.owner = edited_scene_root
	
	# Mark the scene as modified
	_mark_scene_modified()
	
	_send_success(client_id, {
		"node_path": str(edited_scene_root.get_path_to(node))
	}, command_id)

func _delete_node(client_id: int, params: Dictionary, command_id: String) -> void:
	var node_path = params.get("node_path", "")
	
	# Validation
	if node_path.is_empty():
		return _send_error(client_id, "Node path cannot be empty", command_id)
	
	# Get editor plugin and interfaces
	var plugin = Engine.get_meta("GodotMCPPlugin")
	if not plugin:
		return _send_error(client_id, "GodotMCPPlugin not found in Engine metadata", command_id)
	
	var editor_interface = plugin.get_editor_interface()
	var edited_scene_root = editor_interface.get_edited_scene_root()
	
	if not edited_scene_root:
		return _send_error(client_id, "No scene is currently being edited", command_id)
	
	# Get the node using the editor node helper
	var node = _get_editor_node(node_path)
	if not node:
		return _send_error(client_id, "Node not found: %s" % node_path, command_id)
	
	# Cannot delete the root node
	if node == edited_scene_root:
		return _send_error(client_id, "Cannot delete the root node", command_id)
	
	# Get parent for operation
	var parent = node.get_parent()
	if not parent:
		return _send_error(client_id, "Node has no parent: %s" % node_path, command_id)
	
	# Remove the node
	parent.remove_child(node)
	node.queue_free()
	
	# Mark the scene as modified
	_mark_scene_modified()
	
	_send_success(client_id, {
		"deleted_node_path": node_path
	}, command_id)

func _update_node_property(client_id: int, params: Dictionary, command_id: String) -> void:
	var node_path = params.get("node_path", "")
	var property_name = params.get("property", "")
	var property_value = params.get("value")
	
	# Validation
	if node_path.is_empty():
		return _send_error(client_id, "Node path cannot be empty", command_id)
	
	if property_name.is_empty():
		return _send_error(client_id, "Property name cannot be empty", command_id)
	
	if property_value == null:
		return _send_error(client_id, "Property value cannot be null", command_id)
	
	# Get editor plugin and interfaces
	var plugin = Engine.get_meta("GodotMCPPlugin")
	if not plugin:
		return _send_error(client_id, "GodotMCPPlugin not found in Engine metadata", command_id)
	
	# Get the node using the editor node helper
	var node = _get_editor_node(node_path)
	if not node:
		return _send_error(client_id, "Node not found: %s" % node_path, command_id)
	
	# Check if the property exists
	if not property_name in node:
		return _send_error(client_id, "Property %s does not exist on node %s" % [property_name, node_path], command_id)
	
	# Parse property value for Godot types
	var parsed_value = _parse_property_value(property_value)
	
	# Get current property value for undo
	var old_value = node.get(property_name)
	
	# Get undo/redo system
	var undo_redo = _get_undo_redo()
	if not undo_redo:
		# Fallback method if we can't get undo/redo
		node.set(property_name, parsed_value)
		_mark_scene_modified()
	else:
		# Use undo/redo for proper editor integration
		undo_redo.create_action("Update Property: " + property_name)
		undo_redo.add_do_property(node, property_name, parsed_value)
		undo_redo.add_undo_property(node, property_name, old_value)
		undo_redo.commit_action()
	
	# Mark the scene as modified
	_mark_scene_modified()
	
	_send_success(client_id, {
		"node_path": node_path,
		"property": property_name,
		"value": property_value,
		"parsed_value": str(parsed_value)
	}, command_id)

func _get_node_properties(client_id: int, params: Dictionary, command_id: String) -> void:
	var node_path = params.get("node_path", "")
	
	# Validation
	if node_path.is_empty():
		return _send_error(client_id, "Node path cannot be empty", command_id)
	
	# Get the node using the editor node helper
	var node = _get_editor_node(node_path)
	if not node:
		return _send_error(client_id, "Node not found: %s" % node_path, command_id)
	
	# Get all properties
	var properties = {}
	var property_list = node.get_property_list()
	
	for prop in property_list:
		var name = prop["name"]
		if not name.begins_with("_"):  # Skip internal properties
			properties[name] = node.get(name)
	
	_send_success(client_id, {
		"node_path": node_path,
		"properties": properties
	}, command_id)

func _list_nodes(client_id: int, params: Dictionary, command_id: String) -> void:
	var parent_path = params.get("parent_path", "/root")
	
	var parent = _get_editor_node(parent_path)
	if not parent:
		return _send_error(client_id, "Parent node not found: %s" % parent_path, command_id)
	
	var plugin = Engine.get_meta("GodotMCPPlugin")
	var scene_root = plugin.get_editor_interface().get_edited_scene_root() if plugin else null
	if not scene_root:
		return _send_error(client_id, "No scene is currently being edited", command_id)
	
	var children = []
	for child in parent.get_children():
		children.append({
			"name": child.name,
			"type": child.get_class(),
			"path": str(scene_root.get_path_to(child))
		})
	
	_send_success(client_id, {
		"parent_path": parent_path,
		"children": children
	}, command_id)

func _update_node_transform(client_id: int, params: Dictionary, command_id: String) -> void:
	var node_path = params.get("node_path", "")
	if node_path.is_empty():
		return _send_error(client_id, "Node path cannot be empty", command_id)
	
	var node = _get_editor_node(node_path)
	if not node:
		return _send_error(client_id, "Node not found: %s" % node_path, command_id)
	
	if not (node is Node2D or node is Node3D):
		return _send_error(client_id, "Node is not Node2D or Node3D: %s (%s)" % [node_path, node.get_class()], command_id)
	
	var undo_redo = _get_undo_redo()
	var updated := []
	
	if undo_redo:
		undo_redo.create_action("Update Transform: " + node_path)
	
	if params.has("position"):
		var pos = params["position"]
		if not pos is Array:
			return _send_error(client_id, "position must be an array", command_id)
		var expected = 2 if node is Node2D else 3
		if pos.size() != expected:
			return _send_error(client_id, "position requires %d elements for %s" % [expected, node.get_class()], command_id)
		var new_pos = Vector2(pos[0], pos[1]) if node is Node2D else Vector3(pos[0], pos[1], pos[2])
		if undo_redo:
			undo_redo.add_do_property(node, "position", new_pos)
			undo_redo.add_undo_property(node, "position", node.position)
		else:
			node.position = new_pos
		updated.append("position")
	
	if params.has("rotation"):
		var rot = params["rotation"]
		var new_rot
		if node is Node2D:
			new_rot = float(rot)
		elif rot is Array:
			if rot.size() != 3:
				return _send_error(client_id, "rotation requires 3 elements for Node3D", command_id)
			new_rot = Vector3(rot[0], rot[1], rot[2])
		else:
			new_rot = Vector3(float(rot), 0, 0)
		if undo_redo:
			undo_redo.add_do_property(node, "rotation", new_rot)
			undo_redo.add_undo_property(node, "rotation", node.rotation)
		else:
			node.rotation = new_rot
		updated.append("rotation")
	
	if params.has("scale"):
		var scl = params["scale"]
		if not scl is Array:
			return _send_error(client_id, "scale must be an array", command_id)
		var expected = 2 if node is Node2D else 3
		if scl.size() != expected:
			return _send_error(client_id, "scale requires %d elements for %s" % [expected, node.get_class()], command_id)
		var new_scl = Vector2(scl[0], scl[1]) if node is Node2D else Vector3(scl[0], scl[1], scl[2])
		if undo_redo:
			undo_redo.add_do_property(node, "scale", new_scl)
			undo_redo.add_undo_property(node, "scale", node.scale)
		else:
			node.scale = new_scl
		updated.append("scale")
	
	if updated.is_empty():
		return _send_error(client_id, "No transform properties provided", command_id)
	
	if undo_redo:
		undo_redo.commit_action()
	
	_mark_scene_modified()
	_send_success(client_id, {
		"node_path": node_path,
		"updated": updated
	}, command_id)
