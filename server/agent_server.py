#!/usr/bin/env python3
"""
YUI Agent Backend Server
Permite la ejecución segura de herramientas locales del sistema Linux autorizadas
por el usuario a través de la tarjeta de aprobación Human-in-the-Loop en el Notch.
"""

import http.server
import json
import subprocess
import os

PORT = 8765

ALLOWED_COMMAND_PREFIXES = [
    "uname", "free", "uptime", "ls", "df", "cat", "echo", "pwd",
    "git status", "git log", "sensors", "whoami", "date", "ps"
]

class YUIRequestHandler(http.server.BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self._send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "running", "agent": "YUI"}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/exec":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode())
                command = data.get("command", "").strip()

                if not command:
                    raise ValueError("Comando vacío")

                # Seguridad: comprobación básica contra comandos destructivos
                is_safe = any(command.startswith(prefix) for prefix in ALLOWED_COMMAND_PREFIXES)
                if "rm -rf" in command or ":(){ :|:& };:" in command:
                    self.send_response(403)
                    self._send_cors_headers()
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "error": "Comando bloqueado por políticas de seguridad del sistema."
                    }).encode())
                    return

                # Ejecutar comando con timeout de 5 segundos
                process = subprocess.run(
                    command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=5
                )

                response_payload = {
                    "command": command,
                    "exit_code": process.returncode,
                    "stdout": process.stdout,
                    "stderr": process.stderr
                }

                self.send_response(200)
                self._send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_payload).encode())

            except subprocess.TimeoutExpired:
                self.send_response(504)
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Tiempo de ejecución excedido (timeout 5s)"}).encode())
            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

def run():
    server_address = ('', PORT)
    httpd = http.server.HTTPServer(server_address, YUIRequestHandler)
    print(f"🚀 YUI Agent Server corriendo en http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()

if __name__ == '__main__':
    run()
