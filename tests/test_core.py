import asyncio
import os
import tempfile
import unittest
from pathlib import Path

from yui.system.security import RiskLevel, evaluate_command_risk
from yui.memory.store import MemoryStore
from yui.core.orchestrator import YUIOrchestrator


class TestYUISecurity(unittest.TestCase):
    """Pruebas unitarias para el subsistema de análisis de riesgo."""

    def test_command_risk_evaluation(self):
        critical_cmd = "format C: /y"
        assessment = evaluate_command_risk(critical_cmd)
        self.assertEqual(assessment.level, RiskLevel.CRITICAL)
        self.assertTrue(assessment.requires_confirmation)

        moderate_cmd = "Stop-Process -Name notepad"
        assessment_mod = evaluate_command_risk(moderate_cmd)
        self.assertEqual(assessment_mod.level, RiskLevel.MODERATE)
        self.assertTrue(assessment_mod.requires_confirmation)

        safe_cmd = "Get-Process | Select-Object -First 5"
        assessment_safe = evaluate_command_risk(safe_cmd)
        self.assertEqual(assessment_safe.level, RiskLevel.SAFE)
        self.assertFalse(assessment_safe.requires_confirmation)


class TestYUIMemory(unittest.TestCase):
    """Pruebas para el almacén persistente SQLite."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_memory.db"
        self.store = MemoryStore(db_path=self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_memory_store_persists(self):
        row_id = self.store.log_interaction("user", "Hola Yui")
        self.assertGreater(row_id, 0)

        history = self.store.get_recent_history(limit=5)
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["content"], "Hola Yui")
        self.assertEqual(history[0]["role"], "user")

        self.store.set_preference("voice_speed", "normal")
        self.assertEqual(self.store.get_preference("voice_speed"), "normal")


class TestYUIOrchestrator(unittest.IsolatedAsyncioTestCase):
    """Pruebas asíncronas para el orquestador principal."""

    async def test_orchestrator_status_and_intent(self):
        orchestrator = YUIOrchestrator()
        status = orchestrator.get_status()

        self.assertIn("version", status)
        self.assertIn("system_metrics", status)
        self.assertGreaterEqual(status["system_metrics"]["disk_free_gb"], 0.0)

        response = await orchestrator.process_user_intent("dime el estado del sistema")
        self.assertIn("Estado del sistema", response)


if __name__ == "__main__":
    unittest.main()
