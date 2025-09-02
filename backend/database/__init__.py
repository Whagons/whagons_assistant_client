"""Database models package.

This package must not be mounted over by data volumes.
Ensure runtime volumes mount to a different path (e.g. /app/database) to avoid
shadowing this package.
"""


