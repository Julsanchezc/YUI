"""
Gestor de operaciones sobre el sistema operativo Windows para YUI.
Proporciona telemetría de hardware, ejecución de PowerShell y control de procesos.
"""

import asyncio
from dataclasses import dataclass
import os
import shutil
from typing import Any, Dict, List, Optional

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

from yui.system.security import RiskLevel, evaluate_command_risk


@dataclass
class SystemMetrics:
    cpu_percent: float
    memory_total_gb: float
    memory_used_gb: float
    memory_percent: float
    disk_total_gb: float
    disk_free_gb: float
    battery_percent: Optional[float]


class WindowsSystemManager:
    """Controlador central de operaciones sobre Windows."""

    def __init__(self, timeout_seconds: int = 30):
        self.timeout_seconds = timeout_seconds

    def get_metrics(self) -> SystemMetrics:
        """Obtiene métricas de telemetría de hardware en tiempo real."""
        if HAS_PSUTIL:
            cpu = psutil.cpu_percent(interval=0.1)
            mem = psutil.virtual_memory()
            disk = psutil.disk_usage(os.getenv("SystemDrive", "C:"))
            battery = psutil.sensors_battery()

            return SystemMetrics(
                cpu_percent=cpu,
                memory_total_gb=round(mem.total / (1024**3), 2),
                memory_used_gb=round(mem.used / (1024**3), 2),
                memory_percent=mem.percent,
                disk_total_gb=round(disk.total / (1024**3), 2),
                disk_free_gb=round(disk.free / (1024**3), 2),
                battery_percent=battery.percent if battery else None
            )

        # Fallback con shutil y módulos estándar
        total, used, free = shutil.disk_usage(os.getenv("SystemDrive", "C:"))
        return SystemMetrics(
            cpu_percent=0.0,
            memory_total_gb=0.0,
            memory_used_gb=0.0,
            memory_percent=0.0,
            disk_total_gb=round(total / (1024**3), 2),
            disk_free_gb=round(free / (1024**3), 2),
            battery_percent=None
        )

    def list_running_apps(self, limit: int = 15) -> List[Dict[str, Any]]:
        """Lista las aplicaciones activas con mayor consumo de memoria."""
        if not HAS_PSUTIL:
            return []

        processes = []
        for proc in psutil.process_iter(["pid", "name", "memory_info"]):
            try:
                info = proc.info
                mem_mb = round(info["memory_info"].rss / (1024 * 1024), 1)
                processes.append({
                    "pid": info["pid"],
                    "name": info["name"],
                    "memory_mb": mem_mb
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        processes.sort(key=lambda x: x["memory_mb"], reverse=True)
        return processes[:limit]

    async def execute_powershell(
        self, script: str, force_unconfirmed: bool = False
    ) -> Dict[str, Any]:
        """Ejecuta un script en PowerShell validando previamente los riesgos."""
        assessment = evaluate_command_risk(script)

        if assessment.requires_confirmation and not force_unconfirmed:
            return {
                "success": False,
                "blocked": True,
                "assessment": assessment,
                "output": f"Ejecución pausada. Requiere confirmación humana explícita: {assessment.reason}"
            }

        try:
            process = await asyncio.create_subprocess_exec(
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy", "Bypass",
                "-Command", script,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=self.timeout_seconds
            )
            return {
                "success": process.returncode == 0,
                "returncode": process.returncode,
                "stdout": stdout.decode("utf-8", errors="replace").strip(),
                "stderr": stderr.decode("utf-8", errors="replace").strip()
            }
        except asyncio.TimeoutError:
            return {
                "success": False,
                "error": f"El proceso excedió el tiempo límite permitido ({self.timeout_seconds}s)"
            }
        except Exception as ex:
            return {
                "success": False,
                "error": str(ex)
            }
