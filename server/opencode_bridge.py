#!/usr/bin/env python3
"""
YUI <-> OpenCode Integration Bridge Server
Provides non-blocking WebSocket and HTTP endpoints to run OpenCode tasks,
stream agentic thoughts, tool invocations, and session management.
"""

import os
import sys
import json
import base64
import asyncio
import logging
import urllib.request
import urllib.error
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("opencode_bridge")

OPENCODE_BIN = os.environ.get("OPENCODE_BIN", "/usr/bin/opencode")
OPENCODE_SERVICE_STATE = os.path.expanduser("~/.local/state/opencode/service.json")
DEFAULT_MODEL = os.environ.get("OPENCODE_MODEL", "opencode/muse-spark-1.3-contributor-free")
ALLOWED_COMMAND_PREFIXES = [
    "uname", "free", "uptime", "ls", "df", "cat", "echo", "pwd",
    "git status", "git log", "sensors", "whoami", "date", "ps", "opencode"
]

app = FastAPI(
    title="YUI OpenCode Bridge Server",
    description="High-performance async bridge connecting YUI Companion to OpenCode",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_opencode_service_auth() -> Optional[Dict[str, str]]:
    """Reads OpenCode service URL and credentials if the background service is running."""
    if not os.path.exists(OPENCODE_SERVICE_STATE):
        return None
    try:
        with open(OPENCODE_SERVICE_STATE, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            url = cfg.get("url")
            password = cfg.get("password")
            if url and password:
                auth = base64.b64encode(f"opencode:{password}".encode()).decode()
                return {"url": url, "auth": auth}
    except Exception as e:
        logger.warning(f"Could not load OpenCode service state: {e}")
    return None


@app.get("/health")
async def health_check():
    """Health check endpoint indicating YUI and OpenCode integration status."""
    service_info = get_opencode_service_auth()
    opencode_available = os.path.exists(OPENCODE_BIN) and os.access(OPENCODE_BIN, os.X_OK)

    return {
        "status": "running",
        "agent": "YUI",
        "bridge": "opencode",
        "opencode_available": opencode_available,
        "opencode_path": OPENCODE_BIN,
        "service_connected": service_info is not None,
        "service_url": service_info["url"] if service_info else None,
        "default_model": DEFAULT_MODEL
    }


@app.post("/exec")
async def execute_shell(request: Request):
    """Legacy/compatibility endpoint for YUI command execution."""
    data = await request.json()
    command = data.get("command", "").strip()

    if not command:
        raise HTTPException(status_code=400, detail="Comando vacío")

    if "rm -rf" in command or ":(){ :|:& };:" in command:
        raise HTTPException(status_code=403, detail="Comando bloqueado por políticas de seguridad.")

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10.0)
        return {
            "command": command,
            "exit_code": proc.returncode,
            "stdout": stdout.decode(errors="replace"),
            "stderr": stderr.decode(errors="replace")
        }
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Tiempo de ejecución excedido (timeout 10s)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/opencode/sessions")
async def list_sessions():
    """Returns active and recent OpenCode sessions."""
    # First attempt: Direct REST query to OpenCode background service
    service_info = get_opencode_service_auth()
    if service_info:
        try:
            url = f"{service_info['url']}/api/session"
            req = urllib.request.Request(url, headers={"Authorization": f"Basic {service_info['auth']}"})
            loop = asyncio.get_event_loop()
            resp_data = await loop.run_in_executor(None, lambda: urllib.request.urlopen(req, timeout=3).read().decode())
            parsed = json.loads(resp_data)
            sessions = parsed.get("data", [])
            return {"source": "service", "sessions": sessions}
        except Exception as e:
            logger.warning(f"REST query to service failed, falling back to CLI: {e}")

    # Fallback: Run opencode session list --format json
    try:
        proc = await asyncio.create_subprocess_exec(
            OPENCODE_BIN, "session", "list", "--format", "json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode == 0:
            parsed = json.loads(stdout.decode(errors="replace") or "[]")
            return {"source": "cli", "sessions": parsed}
    except Exception as e:
        logger.error(f"Error fetching sessions via CLI: {e}")

    return {"source": "none", "sessions": []}


@app.post("/opencode/sessions")
async def create_session(request: Request):
    """Creates a new session in OpenCode."""
    body = await request.json()
    title = body.get("title", "YUI Session")
    
    service_info = get_opencode_service_auth()
    if service_info:
        try:
            url = f"{service_info['url']}/api/session"
            payload = json.dumps({"title": title}).encode()
            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    "Authorization": f"Basic {service_info['auth']}",
                    "Content-Type": "application/json"
                },
                method="POST"
            )
            loop = asyncio.get_event_loop()
            resp_data = await loop.run_in_executor(None, lambda: urllib.request.urlopen(req, timeout=4).read().decode())
            return json.loads(resp_data)
        except Exception as e:
            logger.warning(f"Failed to create session via service API: {e}")

    return {"status": "created", "title": title}


def build_opencode_args(
    prompt: str,
    file_path: Optional[str] = None,
    session_id: Optional[str] = None,
    auto_approve: bool = True,
    model: Optional[str] = None
) -> List[str]:
    """Builds argument array for opencode run command."""
    args = [OPENCODE_BIN, "run", "--format", "json", "--thinking"]
    if auto_approve:
        args.append("--auto")
    if session_id:
        args.extend(["--session", session_id])
    if file_path and os.path.exists(file_path):
        args.extend(["--file", file_path])
    
    selected_model = model or DEFAULT_MODEL
    if selected_model:
        args.extend(["-m", selected_model])
    
    args.append(prompt)
    return args


@app.post("/opencode/run")
async def run_opencode_http(request: Request, stream: bool = Query(False)):
    """
    HTTP endpoint to execute OpenCode task.
    If stream=true or Accept: text/event-stream, streams events via SSE.
    Otherwise, waits and returns comprehensive JSON summary.
    """
    body = await request.json()
    prompt = body.get("prompt")
    if not prompt:
        raise HTTPException(status_code=400, detail="Missing 'prompt' parameter")

    file_path = body.get("file")
    session_id = body.get("session_id")
    auto_approve = body.get("auto_approve", True)
    model = body.get("model")

    accept_header = request.headers.get("accept", "")
    wants_stream = stream or "text/event-stream" in accept_header

    cmd_args = build_opencode_args(prompt, file_path, session_id, auto_approve, model)

    if wants_stream:
        async def event_generator():
            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd_args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                
                yield f"data: {json.dumps({'type': 'init', 'prompt': prompt, 'model': model or DEFAULT_MODEL})}\n\n"

                while True:
                    line = await proc.stdout.readline()
                    if not line:
                        break
                    raw_str = line.decode(errors="replace").strip()
                    if not raw_str:
                        continue
                    try:
                        parsed = json.loads(raw_str)
                        yield f"data: {json.dumps(parsed)}\n\n"
                    except Exception:
                        yield f"data: {json.dumps({'type': 'raw', 'content': raw_str})}\n\n"

                await proc.wait()
                yield f"data: {json.dumps({'type': 'done', 'exit_code': proc.returncode})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")

    # Non-streaming batch response
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        captured_session_id = session_id
        text_parts: List[str] = []
        reasoning_parts: List[str] = []
        tools_executed: List[Dict[str, Any]] = []

        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            raw_str = line.decode(errors="replace").strip()
            if not raw_str:
                continue
            try:
                evt = json.loads(raw_str)
                evt_type = evt.get("type")
                if "sessionID" in evt and not captured_session_id:
                    captured_session_id = evt["sessionID"]

                if evt_type == "text":
                    part_text = evt.get("part", {}).get("text", "")
                    if part_text:
                        text_parts.append(part_text)
                elif evt_type == "reasoning":
                    r_text = evt.get("part", {}).get("text", "")
                    if r_text:
                        reasoning_parts.append(r_text)
                elif evt_type == "tool_use":
                    part = evt.get("part", {})
                    tools_executed.append({
                        "tool": part.get("tool"),
                        "input": part.get("state", {}).get("input"),
                        "output": part.get("state", {}).get("output"),
                        "status": part.get("state", {}).get("status")
                    })
            except Exception:
                pass

        await proc.wait()
        stderr_bytes = await proc.stderr.read()

        return {
            "success": proc.returncode == 0,
            "session_id": captured_session_id,
            "text": "".join(text_parts).strip(),
            "reasoning": "\n".join(reasoning_parts).strip(),
            "tools_executed": tools_executed,
            "exit_code": proc.returncode,
            "stderr": stderr_bytes.decode(errors="replace")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/opencode/run")
@app.websocket("/opencode/ws")
async def websocket_opencode_run(websocket: WebSocket):
    """
    Real-time bi-directional WebSocket connection for OpenCode execution.
    Streams thoughts, steps, tool invocations, and live response tokens.
    """
    await websocket.accept()
    logger.info("Client connected to OpenCode WebSocket")
    current_proc: Optional[asyncio.subprocess.Process] = None

    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                msg = json.loads(data_text)
            except Exception:
                await websocket.send_json({"type": "error", "message": "Invalid JSON format"})
                continue

            action = msg.get("action", "run")
            if action == "cancel" and current_proc:
                logger.info("Canceling running OpenCode process")
                try:
                    current_proc.terminate()
                    await websocket.send_json({"type": "cancelled"})
                except Exception as e:
                    logger.error(f"Error terminating process: {e}")
                continue

            prompt = msg.get("prompt")
            if not prompt:
                await websocket.send_json({"type": "error", "message": "Field 'prompt' is required"})
                continue

            file_path = msg.get("file")
            session_id = msg.get("session_id")
            auto_approve = msg.get("auto_approve", True)
            model = msg.get("model")

            cmd_args = build_opencode_args(prompt, file_path, session_id, auto_approve, model)
            logger.info(f"Spawning OpenCode: {' '.join(cmd_args)}")

            await websocket.send_json({
                "type": "started",
                "prompt": prompt,
                "model": model or DEFAULT_MODEL,
                "file": file_path
            })

            try:
                current_proc = await asyncio.create_subprocess_exec(
                    *cmd_args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )

                captured_session_id = session_id
                full_text = []
                tools_used = []

                while True:
                    line = await current_proc.stdout.readline()
                    if not line:
                        break
                    raw_str = line.decode(errors="replace").strip()
                    if not raw_str:
                        continue
                    try:
                        evt = json.loads(raw_str)
                        evt_type = evt.get("type")
                        if "sessionID" in evt and not captured_session_id:
                            captured_session_id = evt["sessionID"]

                        if evt_type == "text":
                            t = evt.get("part", {}).get("text", "")
                            if t:
                                full_text.append(t)
                        elif evt_type == "tool_use":
                            tools_used.append(evt.get("part", {}))

                        # Forward exact event to client
                        await websocket.send_json(evt)
                    except Exception:
                        await websocket.send_json({"type": "raw_chunk", "content": raw_str})

                await current_proc.wait()
                exit_code = current_proc.returncode

                await websocket.send_json({
                    "type": "done",
                    "session_id": captured_session_id,
                    "text": "".join(full_text).strip(),
                    "tools_count": len(tools_used),
                    "exit_code": exit_code
                })

            except Exception as e:
                logger.error(f"Error during OpenCode execution: {e}")
                await websocket.send_json({"type": "error", "message": str(e)})
            finally:
                current_proc = None

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
        if current_proc and current_proc.returncode is None:
            try:
                current_proc.terminate()
            except Exception:
                pass


def main():
    port = int(os.environ.get("OPENCODE_BRIDGE_PORT", 8765))
    host = os.environ.get("OPENCODE_BRIDGE_HOST", "0.0.0.0")
    print(f"🚀 Iniciando YUI OpenCode Bridge Server en http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
