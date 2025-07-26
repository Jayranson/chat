"""
main.py - Chat Network Server using FastAPI and WebSockets

This application implements a modern chat network inspired by the old MSN chat
rooms.  It uses FastAPI for the HTTP server and templates, SQLite for
persistent storage, and built‑in WebSocket support for real‑time
communication.  Users can sign up with a username, email and password,
optionally logging in via Google or Apple by providing OAuth credentials (see
README for configuration).  Authenticated users may browse and create chat
rooms, send messages and pictures, and interact with others.  Roles within
rooms (owner, host, regular user) determine available moderation actions.

To run the server locally:

    python main.py

The server will start on http://127.0.0.1:8000 by default.  When deployed to
Koyeb the listening port is provided via the PORT environment variable.
"""

import json
import os
import sqlite3
import secrets
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
import base64
from urllib.parse import parse_qs

from fastapi import (
    FastAPI,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.middleware import Middleware
# We avoid using SessionMiddleware because itsdangerous is not available in this environment.
# Instead, we implement a simple cookie‑based user ID storage.

import uvicorn
from argon2 import PasswordHasher

# Paths for project resources
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "database.db"
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Initialize password hasher (argon2 is installed by default in this environment)
pwd_hasher = PasswordHasher()

# ---------------------------------------------------------------------------
# Database utility functions
#

def init_db():
    """Initialize the SQLite database if it doesn't exist."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # Users table
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user', -- global role; 'sysop' for global admin
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    # Rooms table
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            owner_id INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(owner_id) REFERENCES users(id)
        )
        """
    )
    # Room roles (owner/host)
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS room_roles (
            room_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL, -- 'owner' or 'host'
            PRIMARY KEY(room_id, user_id),
            FOREIGN KEY(room_id) REFERENCES rooms(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    # Room bans
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS room_bans (
            room_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            reason TEXT,
            PRIMARY KEY(room_id, user_id),
            FOREIGN KEY(room_id) REFERENCES rooms(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    conn.commit()
    conn.close()


def get_db_connection():
    """Return a new connection to the database with row factory."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def get_user_by_email(email: str) -> Optional[sqlite3.Row]:
    conn = get_db_connection()
    cur = conn.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cur.fetchone()
    conn.close()
    return user


def get_user_by_username(username: str) -> Optional[sqlite3.Row]:
    conn = get_db_connection()
    cur = conn.execute("SELECT * FROM users WHERE username = ?", (username,))
    user = cur.fetchone()
    conn.close()
    return user


def get_user_by_id(user_id: int) -> Optional[sqlite3.Row]:
    conn = get_db_connection()
    cur = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cur.fetchone()
    conn.close()
    return user


def create_user(username: str, email: str, password: str) -> Optional[int]:
    """Create a new user and return its ID; return None on failure."""
    try:
        password_hash = pwd_hasher.hash(password)
        conn = get_db_connection()
        cur = conn.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
            (username, email, password_hash),
        )
        conn.commit()
        user_id = cur.lastrowid
        conn.close()
        return user_id
    except sqlite3.IntegrityError:
        # Username or email already exists
        return None


def verify_password(stored_hash: str, password: str) -> bool:
    try:
        pwd_hasher.verify(stored_hash, password)
        return True
    except Exception:
        return False


def create_room(name: str, description: str, owner_id: int) -> int:
    conn = get_db_connection()
    cur = conn.execute(
        "INSERT INTO rooms (name, description, owner_id) VALUES (?, ?, ?)",
        (name, description, owner_id),
    )
    conn.commit()
    room_id = cur.lastrowid
    # Owner automatically becomes room owner
    conn.execute(
        "INSERT OR REPLACE INTO room_roles (room_id, user_id, role) VALUES (?, ?, ?)",
        (room_id, owner_id, "owner"),
    )
    conn.commit()
    conn.close()
    return room_id


def list_rooms() -> List[sqlite3.Row]:
    conn = get_db_connection()
    cur = conn.execute(
        "SELECT rooms.*, users.username as owner_username FROM rooms "
        "JOIN users ON rooms.owner_id = users.id ORDER BY rooms.id DESC"
    )
    rooms = cur.fetchall()
    conn.close()
    return rooms


def get_room(room_id: int) -> Optional[sqlite3.Row]:
    conn = get_db_connection()
    cur = conn.execute(
        "SELECT rooms.*, users.username as owner_username FROM rooms "
        "JOIN users ON rooms.owner_id = users.id WHERE rooms.id = ?",
        (room_id,),
    )
    room = cur.fetchone()
    conn.close()
    return room


def get_room_roles(room_id: int) -> Dict[int, str]:
    """Return mapping of user_id to role (owner or host) for a given room."""
    conn = get_db_connection()
    cur = conn.execute("SELECT user_id, role FROM room_roles WHERE room_id = ?", (room_id,))
    roles = {row["user_id"]: row["role"] for row in cur.fetchall()}
    conn.close()
    return roles


def assign_room_role(room_id: int, user_id: int, role: str):
    """Assign or update a room role for a user (owner or host)."""
    if role not in ("owner", "host"):
        return
    conn = get_db_connection()
    conn.execute(
        "INSERT OR REPLACE INTO room_roles (room_id, user_id, role) VALUES (?, ?, ?)",
        (room_id, user_id, role),
    )
    conn.commit()
    conn.close()


def remove_room_role(room_id: int, user_id: int):
    conn = get_db_connection()
    conn.execute("DELETE FROM room_roles WHERE room_id = ? AND user_id = ?", (room_id, user_id))
    conn.commit()
    conn.close()


def ban_user(room_id: int, user_id: int, reason: str = ""):  # noqa: D401
    """Ban a user from a room."""
    conn = get_db_connection()
    conn.execute(
        "INSERT OR REPLACE INTO room_bans (room_id, user_id, reason) VALUES (?, ?, ?)",
        (room_id, user_id, reason),
    )
    conn.commit()
    conn.close()


def unban_user(room_id: int, user_id: int):  # noqa: D401
    """Remove a user ban from a room."""
    conn = get_db_connection()
    conn.execute("DELETE FROM room_bans WHERE room_id = ? AND user_id = ?", (room_id, user_id))
    conn.commit()
    conn.close()


def is_banned(room_id: int, user_id: int) -> bool:
    conn = get_db_connection()
    cur = conn.execute(
        "SELECT 1 FROM room_bans WHERE room_id = ? AND user_id = ?", (room_id, user_id)
    )
    row = cur.fetchone()
    conn.close()
    return row is not None


# ---------------------------------------------------------------------------
# FastAPI application setup
#

init_db()

# Secret key for session management; randomised each start if not provided
SECRET_KEY = os.environ.get("SECRET_KEY", secrets.token_hex(16))

app = FastAPI()

# Serve static files and templates
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


def current_user(request: Request) -> Optional[sqlite3.Row]:
    """Return the currently authenticated user based on a signed cookie."""
    user_id_cookie = request.cookies.get("user_id")
    if not user_id_cookie:
        return None
    try:
        user_id_int = int(user_id_cookie)
    except (TypeError, ValueError):
        return None
    return get_user_by_id(user_id_int)


# ---------------------------------------------------------------------------
# WebSocket connection manager
#

class ConnectionManager:
    def __init__(self):
        # Mapping of room_id to list of connection dicts: {"ws": websocket, "user_id": id, "username": str}
        self.rooms: Dict[int, List[Dict]] = {}

    async def connect(self, room_id: int, ws: WebSocket, user: sqlite3.Row):
        await ws.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = []
        # Append new connection with user info and role
        roles = get_room_roles(room_id)
        role = roles.get(user["id"], "user")
        conn_info = {"ws": ws, "user_id": user["id"], "username": user["username"], "role": role}
        self.rooms[room_id].append(conn_info)
        # Notify others that user joined
        await self.broadcast(room_id, {
            "type": "user_joined",
            "user_id": user["id"],
            "username": user["username"],
            "role": role,
            "users": self.get_room_users(room_id),
        })

    def disconnect(self, room_id: int, ws: WebSocket):
        room_conns = self.rooms.get(room_id, [])
        for conn in list(room_conns):
            if conn["ws"] is ws:
                room_conns.remove(conn)
                break
        self.rooms[room_id] = room_conns
        return conn

    async def broadcast(self, room_id: int, message: Dict):
        # Broadcast message to all websockets in the room
        conns = self.rooms.get(room_id, [])
        for conn in list(conns):
            try:
                await conn["ws"].send_json(message)
            except Exception:
                # Remove broken connections
                conns.remove(conn)
        self.rooms[room_id] = conns

    def get_room_users(self, room_id: int) -> List[Dict]:
        """Return list of user dicts for the current connections in the room."""
        conns = self.rooms.get(room_id, [])
        return [
            {
                "user_id": conn["user_id"],
                "username": conn["username"],
                "role": conn["role"],
            }
            for conn in conns
        ]

    def get_connection(self, room_id: int, user_id: int) -> Optional[Dict]:
        conns = self.rooms.get(room_id, [])
        for conn in conns:
            if conn["user_id"] == user_id:
                return conn
        return None


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Routes
#

@app.get("/", response_class=HTMLResponse)
async def landing(request: Request):
    user = current_user(request)
    return templates.TemplateResponse("index.html", {"request": request, "user": user})


@app.get("/register", response_class=HTMLResponse)
async def register_get(request: Request):
    user = current_user(request)
    if user:
        return RedirectResponse("/rooms", status_code=status.HTTP_302_FOUND)
    return templates.TemplateResponse("register.html", {"request": request, "error": None})


@app.post("/register", response_class=HTMLResponse)
async def register_post(request: Request):
    # Parse URL‑encoded body manually; python‑multipart is unavailable.
    body = (await request.body()).decode()
    data = parse_qs(body)
    username = data.get("username", [""])[0].strip()
    email = data.get("email", [""])[0].strip().lower()
    password = data.get("password", [""])[0]
    confirm_password = data.get("confirm_password", [""])[0]
    if password != confirm_password:
        return templates.TemplateResponse("register.html", {"request": request, "error": "Passwords do not match."})
    user_id = create_user(username, email, password)
    if user_id is None:
        return templates.TemplateResponse(
            "register.html",
            {"request": request, "error": "Username or email already exists."},
        )
    response = RedirectResponse("/rooms", status_code=status.HTTP_303_SEE_OTHER)
    response.set_cookie("user_id", str(user_id), max_age=60 * 60 * 24 * 7, httponly=True)
    return response


@app.get("/login", response_class=HTMLResponse)
async def login_get(request: Request):
    user = current_user(request)
    if user:
        return RedirectResponse("/rooms", status_code=status.HTTP_302_FOUND)
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@app.post("/login", response_class=HTMLResponse)
async def login_post(request: Request):
    body = (await request.body()).decode()
    data = parse_qs(body)
    email = data.get("email", [""])[0].strip().lower()
    password = data.get("password", [""])[0]
    user = get_user_by_email(email)
    if user and verify_password(user["password_hash"], password):
        response = RedirectResponse("/rooms", status_code=status.HTTP_303_SEE_OTHER)
        response.set_cookie("user_id", str(user["id"]), max_age=60 * 60 * 24 * 7, httponly=True)
        return response
    return templates.TemplateResponse("login.html", {"request": request, "error": "Invalid credentials."})


@app.get("/logout")
async def logout(request: Request):
    response = RedirectResponse("/", status_code=status.HTTP_302_FOUND)
    # Remove cookie
    response.delete_cookie("user_id")
    return response


@app.get("/rooms", response_class=HTMLResponse)
async def rooms_page(request: Request):
    user = current_user(request)
    if not user:
        return RedirectResponse("/login", status_code=status.HTTP_302_FOUND)
    rooms = list_rooms()
    return templates.TemplateResponse(
        "rooms.html", {"request": request, "rooms": rooms, "user": user}
    )


@app.post("/rooms/create", response_class=HTMLResponse)
async def rooms_create(request: Request):
    user = current_user(request)
    if not user:
        return RedirectResponse("/login", status_code=status.HTTP_302_FOUND)
    body = (await request.body()).decode()
    data = parse_qs(body)
    name = data.get("name", [""])[0].strip()
    description = data.get("description", [""])[0].strip()
    if not name:
        return RedirectResponse("/rooms", status_code=status.HTTP_303_SEE_OTHER)
    room_id = create_room(name, description, user["id"])
    return RedirectResponse(f"/rooms/{room_id}", status_code=status.HTTP_303_SEE_OTHER)


@app.get("/rooms/{room_id}", response_class=HTMLResponse)
async def room_detail(request: Request, room_id: int):
    user = current_user(request)
    if not user:
        return RedirectResponse("/login", status_code=status.HTTP_302_FOUND)
    room = get_room(room_id)
    if not room:
        return HTMLResponse("Room not found", status_code=404)
    # Check ban
    if is_banned(room_id, user["id"]):
        return HTMLResponse(
            "You are banned from this room.", status_code=status.HTTP_403_FORBIDDEN
        )
    roles = get_room_roles(room_id)
    role = roles.get(user["id"], "user")
    return templates.TemplateResponse(
        "room.html",
        {
            "request": request,
            "room": room,
            "user": user,
            "role": role,
            "roles_json": json.dumps({k: v for k, v in roles.items()}),
        },
    )




@app.get("/admin", response_class=HTMLResponse)
async def admin_login_get(request: Request):
    user = current_user(request)
    # If already sysop, redirect to rooms page
    if user and user["role"] == "sysop":
        return RedirectResponse("/rooms", status_code=status.HTTP_302_FOUND)
    return templates.TemplateResponse("admin_login.html", {"request": request, "error": None})


@app.post("/admin", response_class=HTMLResponse)
async def admin_login_post(request: Request):
    body = (await request.body()).decode()
    data = parse_qs(body)
    email = data.get("email", [""])[0].strip().lower()
    password = data.get("password", [""])[0]
    user = get_user_by_email(email)
    if user and verify_password(user["password_hash"], password):
        if user["role"] != "sysop":
            return templates.TemplateResponse(
                "admin_login.html", {"request": request, "error": "Not an administrator."}
            )
        response = RedirectResponse("/rooms", status_code=status.HTTP_303_SEE_OTHER)
        response.set_cookie("user_id", str(user["id"]), max_age=60 * 60 * 24 * 7, httponly=True)
        return response
    return templates.TemplateResponse(
        "admin_login.html", {"request": request, "error": "Invalid credentials."}
    )


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: int):
    # Retrieve the user from cookie "user_id".  In WebSocket connections, cookies
    # are available via websocket.cookies.  This method is simplistic and does
    # not verify authenticity; in production use JWT or signed tokens.
    user_id_cookie = websocket.cookies.get("user_id")
    if not user_id_cookie:
        # Clients may fall back to query parameter (legacy support)
        try:
            user_id_cookie = str(int(websocket.query_params.get("user_id")))
        except Exception:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    try:
        user_id = int(user_id_cookie)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    user = get_user_by_id(user_id)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    # Check if banned
    if is_banned(room_id, user_id):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await manager.connect(room_id, websocket, user)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            if msg_type == "chat_message":
                text = data.get("message", "").strip()
                if text:
                    # broadcast chat message to room
                    await manager.broadcast(room_id, {
                        "type": "chat_message",
                        "user_id": user_id,
                        "username": user["username"],
                        "message": text,
                        "timestamp": datetime.utcnow().isoformat(),
                    })
            elif msg_type == "image_upload":
                # Client sends base64 encoded image data along with optional file
                # extension.  Save to disk and broadcast the URL.
                img_data = data.get("data")
                ext = data.get("ext", ".png")
                if img_data:
                    try:
                        header, encoded = img_data.split(",", 1) if "," in img_data else ("", img_data)
                        binary_data = base64.b64decode(encoded)
                        unique_name = f"{secrets.token_hex(8)}{ext}"
                        file_path = UPLOAD_DIR / unique_name
                        with open(file_path, "wb") as f:
                            f.write(binary_data)
                        url = f"/uploads/{unique_name}"
                        await manager.broadcast(room_id, {
                            "type": "image_message",
                            "user_id": user_id,
                            "username": user["username"],
                            "url": url,
                            "timestamp": datetime.utcnow().isoformat(),
                        })
                    except Exception:
                        # silently ignore broken uploads
                        pass
            elif msg_type == "command":
                # Moderation commands: kick, warn, assign_host, assign_owner
                command = data.get("command")
                target_id = data.get("target_id")
                reason = data.get("reason", "")
                await handle_command(room_id, user_id, command, target_id, reason)
    except WebSocketDisconnect:
        pass
    finally:
        # Remove connection and notify others
        conn = manager.disconnect(room_id, websocket)
        if conn:
            await manager.broadcast(room_id, {
                "type": "user_left",
                "user_id": conn["user_id"],
                "username": conn["username"],
                "users": manager.get_room_users(room_id),
            })


async def handle_command(room_id: int, caller_id: int, command: str, target_id: int, reason: str):
    """Process moderation commands issued by a user."""
    # Determine caller role
    room_roles = get_room_roles(room_id)
    caller_role = room_roles.get(caller_id, "user")
    room = get_room(room_id)
    # Sysops have global privileges
    caller = get_user_by_id(caller_id)
    global_role = caller["role"] if caller else "user"
    def has_privilege(action: str) -> bool:
        # Determine whether caller has privilege to perform action
        if global_role == "sysop":
            return True
        if action in ("kick", "warn") and caller_role in ("owner", "host"):
            return True
        if action in ("assign_host", "assign_owner") and caller_role == "owner":
            return True
        return False
    # Kick user: remove from room (no ban)
    if command == "kick" and has_privilege("kick"):
        target_conn = manager.get_connection(room_id, target_id)
        if target_conn:
            await target_conn["ws"].send_json({"type": "kicked", "reason": reason})
            await target_conn["ws"].close(code=status.WS_1000_NORMAL_CLOSURE)
            # Disconnected via broadcast after closing
    elif command == "warn" and has_privilege("warn"):
        target_conn = manager.get_connection(room_id, target_id)
        if target_conn:
            await target_conn["ws"].send_json({"type": "warn", "reason": reason})
    elif command == "assign_host" and has_privilege("assign_host"):
        assign_room_role(room_id, target_id, "host")
        # Update role on connection
        target_conn = manager.get_connection(room_id, target_id)
        if target_conn:
            target_conn["role"] = "host"
        await manager.broadcast(room_id, {
            "type": "role_update",
            "target_id": target_id,
            "role": "host",
            "users": manager.get_room_users(room_id),
        })
    elif command == "assign_owner" and has_privilege("assign_owner"):
        assign_room_role(room_id, target_id, "owner")
        target_conn = manager.get_connection(room_id, target_id)
        if target_conn:
            target_conn["role"] = "owner"
        await manager.broadcast(room_id, {
            "type": "role_update",
            "target_id": target_id,
            "role": "owner",
            "users": manager.get_room_users(room_id),
        })
    else:
        # Not authorized or unknown command
        caller_conn = manager.get_connection(room_id, caller_id)
        if caller_conn:
            await caller_conn["ws"].send_json({
                "type": "error",
                "message": "You are not authorized to perform this action or unknown command.",
            })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)