"""
Motor de síntesis vocal (TTS) y procesamiento de voz para YUI.
Soporta generación asíncrona de voz neuronal y fallback local.
"""

from pathlib import Path
from typing import Optional

try:
    import edge_tts
    HAS_EDGE_TTS = True
except ImportError:
    HAS_EDGE_TTS = False


class VoiceEngine:
    """Controlador de síntesis de voz neuronal."""

    def __init__(
        self,
        voice: str = "es-CO-SalomeNeural",
        rate: str = "+0%",
        output_dir: Optional[Path] = None
    ):
        self.voice = voice
        self.rate = rate
        self.output_dir = output_dir or Path("./temp_audio")
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def synthesize_to_file(self, text: str, filename: str = "response.mp3") -> Path:
        """Sintetiza texto en un archivo de audio mediante Edge-TTS si está instalado."""
        target_path = self.output_dir / filename
        if not HAS_EDGE_TTS:
            # Archivo dummy si edge_tts aún no está instalado en el entorno
            target_path.write_text(f"[TTS Fallback - edge-tts no instalado]: {text}", encoding="utf-8")
            return target_path

        communicate = edge_tts.Communicate(text=text, voice=self.voice, rate=self.rate)
        await communicate.save(str(target_path))
        return target_path

    async def list_available_voices(self, language_prefix: str = "es-") -> list[dict]:
        """Consulta el catálogo de voces disponibles para el idioma objetivo."""
        if not HAS_EDGE_TTS:
            return [{"name": self.voice, "gender": "Female", "locale": "es-CO"}]

        voices = await edge_tts.list_voices()
        return [
            {
                "name": v["ShortName"],
                "gender": v["Gender"],
                "locale": v["Locale"]
            }
            for v in voices
            if v["Locale"].startswith(language_prefix)
        ]
