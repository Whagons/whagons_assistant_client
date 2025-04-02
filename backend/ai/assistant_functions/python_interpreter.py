# add a python interpreter tool

import sys
from io import StringIO
import threading
import queue
from typing import Optional, Dict, Any, Tuple

from pydantic_ai.tools import RunContext

def python_interpreter(
    ctx: RunContext, code: str
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """
    Executes Python code in the current environment.
    You can execute graph functions by appending _no_ctx to the function name.
    Currently available no_ctx functions are from user_functions and channel_functions.
    
    To use no_ctx functions, import them directly from their respective modules.
    Do no user default_api or anything like that simply import the function and use it.

    Example imports:
        from ai.assistant_functions.graph import graph_api_request_no_ctx
    
    Example usage:
        # List users
        users, error = graph_api_request_no_ctx(method='GET', path='/users', query_params={'$select': 'id'})
        
        # List channels
        channels, error = graph_api_request_no_ctx(method='GET', path='/teams/{{team-id}}/channels', query_params={'$select': 'id,displayName'})
    
    Args:
        code (str): The Python code to execute.

    Returns:
        tuple: A tuple containing:
            - The output of the Python code.
            - An error dictionary if an error occurred, or None if successful.
    """
    # Create a queue to store the result
    result_queue = queue.Queue()
    
    def run_code():
        try:
            # Capture stdout and stderr
            old_stdout = sys.stdout
            old_stderr = sys.stderr
            stdout_capture = StringIO()
            stderr_capture = StringIO()
            sys.stdout = stdout_capture
            sys.stderr = stderr_capture

            # Execute the code
            exec(code, globals(), locals())

            # Restore stdout and stderr
            sys.stdout = old_stdout
            sys.stderr = old_stderr

            # Get the captured output
            output = stdout_capture.getvalue()
            error_output = stderr_capture.getvalue()

            if error_output:
                result_queue.put((None, {
                    "error": "Code execution produced errors",
                    "details": error_output
                }))
            else:
                result_queue.put((output, None))

        except Exception as e:
            # Restore stdout and stderr in case of exception
            sys.stdout = old_stdout
            sys.stderr = old_stderr
            result_queue.put((None, {
                "error": "Execution error",
                "details": str(e)
            }))

    # Create and start the thread
    thread = threading.Thread(target=run_code)
    thread.daemon = True
    thread.start()

    try:
        # Wait for the result with timeout
        output, error = result_queue.get(timeout=30)
        return output, error

    except queue.Empty:
        # If the thread is still running, we need to stop it
        if thread.is_alive():
            # Note: This is a best-effort attempt to stop the thread
            # Python threads cannot be forcefully terminated
            pass
        return None, {
            "error": "Execution timeout",
            "details": "Code execution exceeded 30 second timeout"
        }

if __name__ == "__main__":
    print(
        python_interpreter(None, "print(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))")
    )
