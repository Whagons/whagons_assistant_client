from sqlalchemy import text
from db.models import engine


def main() -> None:
    """Set all NULL/empty conversation.model values to 'kimi'."""
    with engine.begin() as conn:
        result = conn.execute(
            text(
                """
                UPDATE conversation
                SET model = :model
                WHERE model IS NULL OR model = ''
                """
            ),
            {"model": "kimi"},
        )
        try:
            # Some DBs require explicit commit; engine.begin() should commit on exit
            conn.commit()
        except Exception:
            pass
        print(f"Rows updated: {getattr(result, 'rowcount', 'unknown')}")


if __name__ == "__main__":
    main()


