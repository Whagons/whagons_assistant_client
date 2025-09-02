import ast


def extract_and_format_memory_data(memory_data_string: str) -> str:
    """
    Extracts memories from 'results' and relationships from 'relations'
    within a string containing a Python literal representation of a dictionary.
    Formats both into a single readable string.

    Args:
        memory_data_string: A string representation of a Python dictionary
                             containing 'results' and optionally 'relations' keys.
                             (e.g., "{'results': [...], 'relations': [...]}").
                             Must be parsable by ast.literal_eval.

    Returns:
        A string containing the extracted memories and relationships,
        separated by sections, or an error message string if processing fails.
    """
    output_lines = []
    try:
        # Ensure input is a string before parsing
        if not isinstance(memory_data_string, str):
            # If it's already a dict (common mistake), try converting it back
            # to a string representation for ast.literal_eval, although
            # it's better to fix the calling code.
            # Or raise an error:
            raise TypeError(f"Input must be a string, but got {type(memory_data_string)}. Pass the string representation.")

        data = ast.literal_eval(memory_data_string)

        # Basic validation after parsing
        if not isinstance(data, dict):
            raise TypeError("Parsed data is not a dictionary.")

        # --- Extract Memories ---
        output_lines.append("--- Memories ---")
        memories = []
        results_list = data.get('results', []) # Use .get for safety
        if isinstance(results_list, list):
            for item in results_list:
                if isinstance(item, dict) and 'memory' in item:
                    memories.append(str(item['memory'])) # Ensure it's a string
                else:
                    print(f"Warning: Skipping memory item due to missing 'memory' key or wrong type: {item}")
        else:
             print(f"Warning: 'results' key found but value is not a list: {results_list}")

        if memories:
            output_lines.append("\n".join(memories))
        else:
            output_lines.append("No memories found.")

        # --- Extract Relationships ---
        output_lines.append("\n--- Relationships ---") # Add separator
        relationships = []
        relations_list = data.get('relations', []) # Use .get for safety
        if isinstance(relations_list, list):
             for item in relations_list:
                 if isinstance(item, dict) and all(k in item for k in ['source', 'relationship', 'destination']):
                     src = item['source']
                     rel = item['relationship']
                     dest = item['destination']
                     relationships.append(f"{src} --[{rel}]--> {dest}")
                 else:
                    print(f"Warning: Skipping relation item due to missing keys or wrong type: {item}")
        else:
            print(f"Warning: 'relations' key found but value is not a list: {relations_list}")

        if relationships:
            output_lines.append("\n".join(relationships))
        else:
            output_lines.append("No relationships found.")

        return "\n".join(output_lines)

    except (ValueError, SyntaxError) as e:
        # These errors come from ast.literal_eval if the string is malformed
        error_msg = f"Error parsing memory data string (invalid format): {e}"
        print(error_msg)
        # print("Problematic input string:", memory_data_string) # Uncomment for debugging
        return error_msg
    except (KeyError, TypeError) as e:
        # These errors occur if the structure after parsing is not as expected
        # or if the input wasn't a string as expected by ast.literal_eval
        error_msg = f"Error processing memory data (unexpected structure or wrong input type): {e}"
        print(error_msg)
        return error_msg
    except Exception as e:
        # Catch any other unexpected errors
        error_msg = f"An unexpected error occurred: {e}"
        print(error_msg)
        return error_msg
