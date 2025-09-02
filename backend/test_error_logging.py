#!/usr/bin/env python3
"""
Test script for the enhanced error logging system.
Run this to verify that error logging is working correctly.
"""

import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(__file__))

from error_logger.error_logger import error_logger



def test_basic_error_logging():
    """Test basic error logging functionality."""
    print("Testing basic error logging...")

    # Test session error logging
    error_logger.log_session_error(
        function_name="test_function",
        error_text="This is a test error",
        conversation_id="test_conversation_123",
        user_id="test_user_456",
        parameters={"test_param": "test_value"},
        severity="warning"
    )

    # Test websocket error logging
    error_logger.log_websocket_error(
        function_name="test_websocket",
        error_text="WebSocket connection failed",
        conversation_id="test_conversation_123",
        parameters={"connection_attempt": 1},
        severity="error"
    )

    # Test database error logging
    error_logger.log_database_error(
        function_name="test_database",
        error_text="Database connection timeout",
        conversation_id="test_conversation_123",
        user_id="test_user_456",
        parameters={"query": "SELECT * FROM test_table"},
        severity="error"
    )

    print("Basic error logging tests completed.")


def test_session_events():
    """Test session event logging."""
    print("Testing session event logging...")

    # Test session events - removed due to session_error_handler being deleted

    print("Session event logging tests completed.")


def test_error_printing():
    """Test that errors are printed to console."""
    print("Testing error printing to console...")

    # This should print to stderr
    error_logger.log_session_error(
        function_name="console_test",
        error_text="This error should appear in console output",
        conversation_id="console_test_123",
        severity="warning"
    )

    print("Error printing test completed.")


def test_error_retrieval():
    """Test error retrieval from database."""
    print("Testing error retrieval...")

    # Print recent errors
    print("\nRecent errors from database:")
    error_logger.print_recent_errors(limit=5, show_stack_trace=False)

    # Search for specific errors
    print("\nSearching for session errors:")
    session_errors = error_logger.search_errors(
        error_category="session",
        limit=3
    )

    print(f"Found {len(session_errors)} session errors")

    print("Error retrieval tests completed.")


def main():
    """Run all tests."""
    print("=== Error Logging System Test ===\n")

    try:
        test_basic_error_logging()
        print()

        test_session_events()
        print()

        test_error_printing()
        print()

        test_error_retrieval()
        print()

        print("=== All tests completed successfully! ===")
        print("\nTo see more detailed error output, check:")
        print("1. Console output (stderr) for immediate error messages")
        print("2. Database file: backend/error_logger/error_logs.db")
        print("3. Run: python -c 'from backend.error_logger.error_logger import error_logger; error_logger.print_recent_errors()'")

    except Exception as e:
        print(f"Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
