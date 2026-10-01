"""
Punto de entrada principal para el asistente YUI mediante Typer.
"""

import asyncio
import typer
from rich.console import Console

from yui.core.orchestrator import YUIOrchestrator
from yui.interfaces.cli import display_status_table, print_banner, start_interactive_session

app = typer.Typer(
    name="yui",
    help="YUI: Asistente autónomo de sistema operativo guiado por agentes."
)
console = Console()


@app.command()
def chat():
    """Inicia la sesión conversacional interactiva con YUI."""
    asyncio.run(start_interactive_session())


@app.command()
def status():
    """Consulta el estado técnico y las métricas de telemetría de Windows."""
    print_banner()
    orchestrator = YUIOrchestrator()
    status_data = orchestrator.get_status()
    display_status_table(status_data)


@app.command()
def ask(prompt: str = typer.Argument(..., help="Instrucción directa a procesar")):
    """Ejecuta una instrucción única directamente desde la consola."""
    orchestrator = YUIOrchestrator()
    response = asyncio.run(orchestrator.process_user_intent(prompt))
    console.print(f"[bold cyan]YUI:[/bold cyan] {response}")


if __name__ == "__main__":
    app()
