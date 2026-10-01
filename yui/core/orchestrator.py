"""
Orquestador cognitivo principal de YUI.
Gestiona el ciclo de percepción, toma de decisiones y ejecución delegada.
"""

from typing import Any, Dict
from yui.audio.speech import VoiceEngine
from yui.config import Settings, settings
from yui.memory.store import MemoryStore
from yui.system.windows import WindowsSystemManager


class YUIOrchestrator:
    """Coordinador central de subsistemas y agentes especializados."""

    def __init__(self, app_settings: Settings = settings):
        self.settings = app_settings
        self.system = WindowsSystemManager(
            timeout_seconds=self.settings.max_command_timeout_seconds
        )
        self.memory = MemoryStore(db_path=self.settings.sqlite_path)
        self.voice = VoiceEngine(
            voice=self.settings.tts_voice,
            rate=self.settings.tts_rate,
            output_dir=self.settings.data_dir / "audio_cache"
        )

    def get_status(self) -> Dict[str, Any]:
        """Recupera el estado operacional integral de YUI y del equipo host."""
        metrics = self.system.get_metrics()
        history = self.memory.get_recent_history(limit=5)
        top_apps = self.system.list_running_apps(limit=5)

        return {
            "version": "0.1.0",
            "environment": self.settings.yui_env,
            "system_metrics": {
                "cpu_percent": metrics.cpu_percent,
                "memory_used_gb": metrics.memory_used_gb,
                "memory_total_gb": metrics.memory_total_gb,
                "memory_percent": metrics.memory_percent,
                "disk_free_gb": metrics.disk_free_gb,
                "battery_percent": metrics.battery_percent
            },
            "active_tasks_count": len(top_apps),
            "recent_turns_count": len(history)
        }

    async def process_user_intent(self, text: str) -> str:
        """
        Procesa una directriz del usuario.
        Registra la interacción en memoria y despacha al subsistema correspondiente.
        """
        cleaned = text.strip()
        self.memory.log_interaction(role="user", content=cleaned)

        # Manejo determinista de intenciones directas de telemetría de sistema
        lower = cleaned.lower()
        if "estado" in lower or "rendimiento" in lower or "metricas" in lower:
            metrics = self.system.get_metrics()
            response = (
                f"Estado del sistema: CPU al {metrics.cpu_percent}%, "
                f"Memoria RAM al {metrics.memory_percent}% ({metrics.memory_used_gb} GB usados de {metrics.memory_total_gb} GB), "
                f"Almacenamiento libre: {metrics.disk_free_gb} GB."
            )
            self.memory.log_interaction(role="assistant", content=response)
            return response

        # En caso de requerir razonamiento heurístico, se despacha la consulta
        response = f"Instrucción recibida: '{cleaned}'. Núcleo YUI activo y en espera de agentes subordinados."
        self.memory.log_interaction(role="assistant", content=response)
        return response
