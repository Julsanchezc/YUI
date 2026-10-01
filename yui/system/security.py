"""
Módulo de seguridad y análisis de riesgo en comandos para YUI.
Previene la ejecución no supervisada de operaciones destructivas en Windows.
"""

from dataclasses import dataclass
from enum import Enum
import re
from typing import List


class RiskLevel(str, Enum):
    SAFE = "safe"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class RiskAssessment:
    level: RiskLevel
    reason: str
    requires_confirmation: bool


CRITICAL_PATTERNS = [
    (r"format\s+[a-z]:", "Comando de formateo de unidad de disco"),
    (r"rmdir\s+/[sS]", "Eliminación recursiva de directorios mediante CMD"),
    (r"Remove-Item.*(-Recurse|-r).*(C:\\|System32)", "Eliminación recursiva en partición raíz o sistema"),
    (r"del\s+/[fF]\s+/[sS]\s+/[qQ]", "Borrado masivo no interactivo"),
    (r"reg\s+delete.*(HKLM|HKCU)\\SYSTEM", "Alteración crítica del Registro de Windows"),
    (r"Stop-Computer", "Apagado forzoso no solicitado"),
    (r"bcdedit", "Modificación del arranque de Windows")
]

MODERATE_PATTERNS = [
    (r"Stop-Process|taskkill", "Finalización de procesos activos"),
    (r"Set-Service|sc\s+config", "Modificación de servicios de Windows"),
    (r"Remove-Item|del\b", "Eliminación de archivos estándar")
]


def evaluate_command_risk(command: str) -> RiskAssessment:
    """Evalúa el nivel de riesgo de una instrucción de shell antes de ejecutarla."""
    cleaned = command.strip()

    for pattern, description in CRITICAL_PATTERNS:
        if re.search(pattern, cleaned, re.IGNORECASE):
            return RiskAssessment(
                level=RiskLevel.CRITICAL,
                reason=f"Comando catalogado como crítico: {description}",
                requires_confirmation=True
            )

    for pattern, description in MODERATE_PATTERNS:
        if re.search(pattern, cleaned, re.IGNORECASE):
            return RiskAssessment(
                level=RiskLevel.MODERATE,
                reason=f"Comando de riesgo moderado: {description}",
                requires_confirmation=True
            )

    return RiskAssessment(
        level=RiskLevel.SAFE,
        reason="Comando dentro de los parámetros seguros ordinarios",
        requires_confirmation=False
    )
