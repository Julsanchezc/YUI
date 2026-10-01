"""
Interfaz de consola enriquecida (CLI/TUI) para YUI usando Rich.
"""

import asyncio
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from yui.core.orchestrator import YUIOrchestrator

console = Console()


def print_banner() -> None:
    """Muestra el encabezado visual de YUI."""
    content = (
        "[bold cyan]YUI Assistant[/bold cyan] — [italic white]Next-Gen OS Intelligent Companion[/italic white]\n"
        "[dim]Multi-Agent First | Local Control | Windows Automation[/dim]"
    )
    console.print(Panel(content, border_style="cyan", expand=False))


def display_status_table(status: dict) -> None:
    """Despliega una tabla con las métricas del sistema."""
    metrics = status["system_metrics"]

    table = Table(title="Telemetría de Sistema Host", border_style="dim")
    table.add_column("Métrica", style="bold")
    table.add_column("Valor Actual", style="green")

    table.add_row("Uso de CPU", f"{metrics['cpu_percent']}%")
    table.add_row("Memoria RAM", f"{metrics['memory_percent']}% ({metrics['memory_used_gb']}/{metrics['memory_total_gb']} GB)")
    table.add_row("Disco Libre", f"{metrics['disk_free_gb']} GB")
    if metrics["battery_percent"] is not None:
        table.add_row("Batería", f"{metrics['battery_percent']}%")

    console.print(table)


async def start_interactive_session() -> None:
    """Inicia una sesión interactiva en la terminal."""
    print_banner()
    orchestrator = YUIOrchestrator()
    status = orchestrator.get_status()
    display_status_table(status)

    console.print("\n[yellow]Escribe tu instrucción o 'salir' para terminar.[/yellow]\n")

    while True:
        try:
            user_input = console.input("[bold green]Usuario > [/bold green]").strip()
            if not user_input:
                continue
            if user_input.lower() in ("salir", "exit", "quit"):
                console.print("[cyan]Cerrando sesión de YUI. Hasta pronto.[/cyan]")
                break

            response = await orchestrator.process_user_intent(user_input)
            console.print(f"[bold cyan]YUI > [/bold cyan]{response}\n")

        except (KeyboardInterrupt, EOFError):
            console.print("\n[cyan]Sesión interrumpida por el usuario.[/cyan]")
            break
