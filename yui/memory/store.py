"""
Gestor de memoria relacional y registro episódico para YUI.
Garantiza persistencia en SQLite para auditoría, preferencias y estado conversacional.
"""

from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
import sqlite3
from typing import Any, Dict, Generator, List, Optional


class MemoryStore:
    """Almacén relacional de eventos y contexto histórico."""

    def __init__(self, db_path: Path = Path("./data/yui_state.db")):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Context manager que garantiza commit y cierre explícito de la conexión."""
        conn = sqlite3.connect(self.db_path)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self) -> None:
        """Inicializa las tablas base si no existen."""
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS conversation_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata_json TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_preferences (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS command_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    command TEXT NOT NULL,
                    risk_level TEXT NOT NULL,
                    executed INTEGER NOT NULL,
                    exit_code INTEGER
                )
            """)

    def log_interaction(self, role: str, content: str, metadata: Optional[str] = None) -> int:
        """Registra un turno conversacional en la bitácora."""
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO conversation_logs (timestamp, role, content, metadata_json) VALUES (?, ?, ?, ?)",
                (datetime.now().isoformat(), role, content, metadata or "{}")
            )
            return cursor.lastrowid or 0

    def get_recent_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Recupera los últimos turnos de conversación."""
        with self._connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT timestamp, role, content FROM conversation_logs ORDER BY id DESC LIMIT ?",
                (limit,)
            )
            rows = cursor.fetchall()
            return [dict(row) for row in reversed(rows)]

    def set_preference(self, key: str, value: str) -> None:
        """Guarda o actualiza una preferencia de usuario."""
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO user_preferences (key, value, updated_at) VALUES (?, ?, ?)",
                (key, value, datetime.now().isoformat())
            )

    def get_preference(self, key: str) -> Optional[str]:
        """Obtiene una preferencia de usuario almacenada."""
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM user_preferences WHERE key = ?", (key,))
            row = cursor.fetchone()
            return row[0] if row else None
