from dataclasses import dataclass
import os
from pathlib import Path
from typing import Literal

try:
    from pydantic import Field
    from pydantic_settings import BaseSettings, SettingsConfigDict
    HAS_PYDANTIC = True
except ImportError:
    HAS_PYDANTIC = False


if HAS_PYDANTIC:
    class Settings(BaseSettings):
        """Configuración central de YUI validada por Pydantic."""
        yui_env: Literal["development", "production", "headless"] = Field(
            default="development", description="Modo de ejecución del asistente"
        )
        yui_log_level: str = Field(default="INFO", description="Nivel de logging")

        gemini_api_key: str = Field(default="", description="Clave API de Google Gemini")
        openai_api_key: str = Field(default="", description="Clave API de OpenAI")
        anthropic_api_key: str = Field(default="", description="Clave API de Anthropic")

        wake_word: str = Field(default="Hey Yui", description="Palabra clave de activación")
        wake_word_sensitivity: float = Field(default=0.6, ge=0.0, le=1.0)
        stt_model: str = Field(default="base", description="Modelo de reconocimiento Faster-Whisper")
        tts_voice: str = Field(default="es-CO-SalomeNeural", description="Voz neuronal de Edge-TTS")
        tts_rate: str = Field(default="+0%", description="Velocidad de síntesis")

        data_dir: Path = Field(default=Path("./data"), description="Directorio de datos persistentes")
        vector_db_path: Path = Field(default=Path("./data/vectors"), description="Ruta de LanceDB")
        sqlite_path: Path = Field(default=Path("./data/yui_state.db"), description="Ruta de SQLite")

        require_confirmation_for_destructive_commands: bool = Field(
            default=True, description="Requiere confirmación explícita para comandos de riesgo"
        )
        max_command_timeout_seconds: int = Field(
            default=30, ge=1, le=300, description="Tiempo máximo de ejecución para subprocesos"
        )

        model_config = SettingsConfigDict(
            env_file=".env",
            env_file_encoding="utf-8",
            extra="ignore"
        )

    settings = Settings()
else:
    @dataclass
    class FallbackSettings:
        """Configuración ligera basada en variables de entorno estándar."""
        yui_env: str = os.getenv("YUI_ENV", "development")
        yui_log_level: str = os.getenv("YUI_LOG_LEVEL", "INFO")

        gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
        openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
        anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")

        wake_word: str = os.getenv("YUI_WAKE_WORD", "Hey Yui")
        wake_word_sensitivity: float = float(os.getenv("YUI_WAKE_WORD_SENSITIVITY", "0.6"))
        stt_model: str = os.getenv("YUI_STT_MODEL", "base")
        tts_voice: str = os.getenv("YUI_TTS_VOICE", "es-CO-SalomeNeural")
        tts_rate: str = os.getenv("YUI_TTS_RATE", "+0%")

        data_dir: Path = Path(os.getenv("YUI_DATA_DIR", "./data"))
        vector_db_path: Path = Path(os.getenv("YUI_VECTOR_DB_PATH", "./data/vectors"))
        sqlite_path: Path = Path(os.getenv("YUI_SQLITE_PATH", "./data/yui_state.db"))

        require_confirmation_for_destructive_commands: bool = (
            os.getenv("YUI_REQUIRE_CONFIRMATION_FOR_DESTRUCTIVE_COMMANDS", "true").lower() == "true"
        )
        max_command_timeout_seconds: int = int(os.getenv("YUI_MAX_COMMAND_TIMEOUT_SECONDS", "30"))

    Settings = FallbackSettings  # type: ignore
    settings = FallbackSettings()  # type: ignore
