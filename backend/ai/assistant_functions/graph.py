from typing import Dict, Union, Optional, Any, List
from pydantic_ai import RunContext
from helpers.RequestHelper import make_request
import logging
import json
import urllib.parse


def graph_api_request(
    ctx: RunContext,
    endpoint_version: str,
    path: str,
    method: str,
    # LLM provides body and query params as JSON strings
    body_json: Optional[str] = None,
    query_params_json: Optional[str] = None
) -> Union[Dict[str, Any], List[Any]]:
    """
    Acts as a tool interface for the LLM to interact with Microsoft Graph API,
    delegating the actual request execution, header management, and auth handling
    to the make_request helper. The LLM MUST provide body and query parameters
    as VALID JSON formatted strings where applicable.

    Args:
        endpoint_version (str): 'v1.0' or 'beta'.
        path (str): The API endpoint path (e.g., '/users', '/groups/ID/members'). MUST start with '/'.
        method (str): HTTP method ('GET', 'POST', 'PUT', 'PATCH', 'DELETE').
        body_json (Optional[str]): A **valid JSON string** for the request body (for POST, PUT, PATCH).
                                   Keys/strings MUST use double quotes. Example: '{"displayName": "New Group"}'.
        query_params_json (Optional[str]): A **valid JSON string** for query parameters.
                                          Keys/strings MUST use double quotes. Example: '{"$select": "id,displayName"}'.

    Returns:
        Union[Dict[str, Any], List[Any]]:
            - On successful API call (2xx status, excluding 204): The parsed JSON response body (usually a Dict or List).
            - On successful API call with 204 No Content: An empty dictionary `{}`.
            - On any failure (token error, HTTP error, connection error, timeout, JSON decode error):
              A dictionary containing error details (e.g., 'error', 'details', 'status_code').

    Raises:
        ValueError: If body_json or query_params_json contain invalid JSON that cannot be parsed
                    *before* calling make_request.
    """
    if not path.startswith('/'):
        path = '/' + path # Ensure path starts with a slash

    parsed_body: Optional[Any] = None
    parsed_query_params: Optional[Dict[str, str]] = None

    # 1. Parse LLM inputs (JSON strings to Python objects)
    # Headers are no longer parsed here

    try:
        if body_json:
            parsed_body = json.loads(body_json)
    except json.JSONDecodeError as e:
        logging.error(f"Failed to parse body_json provided by LLM: {body_json}")
        raise ValueError(f"Invalid JSON format in body_json: {e}") from e

    try:
        if query_params_json:
            parsed_query_params = json.loads(query_params_json)
            if not isinstance(parsed_query_params, dict):
                 raise ValueError("query_params_json must decode to a JSON object (dictionary).")
    except json.JSONDecodeError as e:
        logging.error(f"Failed to parse query_params_json provided by LLM: {query_params_json}")
        raise ValueError(f"Invalid JSON format in query_params_json: {e}") from e

    # 2. Construct the full URL
    base_url = f'https://graph.microsoft.com/{endpoint_version}'
    full_url = f"{base_url}{path}"

    # 3. Add query parameters to the URL if they exist
    if parsed_query_params:
        # Filter out None values, urlencode handles basic types like str, int, float, bool
        filtered_params = {k: v for k, v in parsed_query_params.items() if v is not None}
        if filtered_params:
             query_string = urllib.parse.urlencode(filtered_params)
             full_url += f"?{query_string}"

    # 4. Call the make_request helper
    #    - Pass method, full_url
    #    - Pass headers=None (relying on make_request to add Auth, Content-Type, etc.)
    #    - Pass parsed_body as json_data
    logging.debug(f"graph_api_request: Calling make_request for {method} {full_url}")
    response_data, error_data = make_request(
        method=method.upper(),
        url=full_url,
        headers=None,  # Rely on make_request's header logic
        json_data=parsed_body
    )

    # 5. Return the result from make_request
    if error_data:
        logging.warning(f"graph_api_request: make_request failed for {method} {path}: {error_data.get('error')}")
        return error_data
    else:
        logging.debug(f"graph_api_request: make_request successful for {method} {path}.")
        # make_request returns parsed JSON or {} for 204, which matches our return type hint
        return response_data if response_data is not None else {}
    

def graph_api_request_no_ctx(
    endpoint_version: str,
    path: str,
    method: str,
    # LLM provides body and query params as JSON strings
    body_json: Optional[str] = None,
    query_params_json: Optional[str] = None
) -> Union[Dict[str, Any], List[Any]]:
    """
    Acts as a tool interface for the LLM to interact with Microsoft Graph API,
    delegating the actual request execution, header management, and auth handling
    to the make_request helper. The LLM MUST provide body and query parameters
    as VALID JSON formatted strings where applicable.

    Args:
        endpoint_version (str): 'v1.0' or 'beta'.
        path (str): The API endpoint path (e.g., '/users', '/groups/ID/members'). MUST start with '/'.
        method (str): HTTP method ('GET', 'POST', 'PUT', 'PATCH', 'DELETE').
        body_json (Optional[str]): A **valid JSON string** for the request body (for POST, PUT, PATCH).
                                   Keys/strings MUST use double quotes. Example: '{"displayName": "New Group"}'.
        query_params_json (Optional[str]): A **valid JSON string** for query parameters.
                                          Keys/strings MUST use double quotes. Example: '{"$select": "id,displayName"}'.

    Returns:
        Union[Dict[str, Any], List[Any]]:
            - On successful API call (2xx status, excluding 204): The parsed JSON response body (usually a Dict or List).
            - On successful API call with 204 No Content: An empty dictionary `{}`.
            - On any failure (token error, HTTP error, connection error, timeout, JSON decode error):
              A dictionary containing error details (e.g., 'error', 'details', 'status_code').

    Raises:
        ValueError: If body_json or query_params_json contain invalid JSON that cannot be parsed
                    *before* calling make_request.
    """
    if not path.startswith('/'):
        path = '/' + path # Ensure path starts with a slash

    parsed_body: Optional[Any] = None
    parsed_query_params: Optional[Dict[str, str]] = None

    # 1. Parse LLM inputs (JSON strings to Python objects)
    # Headers are no longer parsed here

    try:
        if body_json:
            parsed_body = json.loads(body_json)
    except json.JSONDecodeError as e:
        logging.error(f"Failed to parse body_json provided by LLM: {body_json}")
        raise ValueError(f"Invalid JSON format in body_json: {e}") from e

    try:
        if query_params_json:
            parsed_query_params = json.loads(query_params_json)
            if not isinstance(parsed_query_params, dict):
                 raise ValueError("query_params_json must decode to a JSON object (dictionary).")
    except json.JSONDecodeError as e:
        logging.error(f"Failed to parse query_params_json provided by LLM: {query_params_json}")
        raise ValueError(f"Invalid JSON format in query_params_json: {e}") from e

    # 2. Construct the full URL
    base_url = f'https://graph.microsoft.com/{endpoint_version}'
    full_url = f"{base_url}{path}"

    # 3. Add query parameters to the URL if they exist
    if parsed_query_params:
        # Filter out None values, urlencode handles basic types like str, int, float, bool
        filtered_params = {k: v for k, v in parsed_query_params.items() if v is not None}
        if filtered_params:
             query_string = urllib.parse.urlencode(filtered_params)
             full_url += f"?{query_string}"

    # 4. Call the make_request helper
    #    - Pass method, full_url
    #    - Pass headers=None (relying on make_request to add Auth, Content-Type, etc.)
    #    - Pass parsed_body as json_data
    logging.debug(f"graph_api_request: Calling make_request for {method} {full_url}")
    response_data, error_data = make_request(
        method=method.upper(),
        url=full_url,
        headers=None,  # Rely on make_request's header logic
        json_data=parsed_body
    )

    # 5. Return the result from make_request
    if error_data:
        logging.warning(f"graph_api_request: make_request failed for {method} {path}: {error_data.get('error')}")
        return error_data
    else:
        logging.debug(f"graph_api_request: make_request successful for {method} {path}.")
        # make_request returns parsed JSON or {} for 204, which matches our return type hint
        return response_data if response_data is not None else {}
