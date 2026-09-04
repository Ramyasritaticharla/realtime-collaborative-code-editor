from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from dotenv import load_dotenv

from urllib.parse import unquote
import json
import subprocess
import sys
import tempfile
import os


# ==========================================
# LOAD ENVIRONMENT VARIABLES
# ==========================================

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")


# ==========================================
# MONGODB CONNECTION
# ==========================================

if not MONGODB_URI:
    print("WARNING: MONGODB_URI is not configured.")
    client = None
    db = None
    rooms_collection = None
else:
    try:
        client = MongoClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=10000,
            connectTimeoutMS=10000,
            socketTimeoutMS=10000,
        )

        db = client["collaborative_editor"]
        rooms_collection = db["rooms"]

        print("MongoDB client initialized.")

    except Exception as error:
        print(f"MongoDB initialization error: {error}")
        client = None
        db = None
        rooms_collection = None


# ==========================================
# FASTAPI APPLICATION
# ==========================================

app = FastAPI()


# ==========================================
# CORS
# ==========================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://realtime-collaborative-code-editor-1.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# REAL-TIME DATA
# ==========================================

rooms = {}

user_names = {}


# ==========================================
# HOME
# ==========================================

@app.get("/")
def home():

    database_status = "MongoDB configured" if MONGODB_URI else "MongoDB not configured"

    return {
        "message": "Collaborative Code Editor Python Backend is running",
        "database": database_status,
    }


# ==========================================
# DATABASE TEST
# ==========================================

@app.get("/database-test")
def database_test():

    if client is None:
        return {
            "success": False,
            "message": "MongoDB client is not configured."
        }

    try:

        client.admin.command("ping")

        return {
            "success": True,
            "message": "MongoDB connection is working!"
        }

    except Exception as error:

        return {
            "success": False,
            "message": str(error)
        }


# ==========================================
# RUN CODE
# ==========================================

@app.post("/run-code")
async def run_code(data: dict):

    code = data.get("code", "")

    language = data.get(
        "language",
        "python"
    ).lower()

    if not code.strip():

        return {
            "success": False,
            "output": "No code provided."
        }

    if language not in [
        "python",
        "javascript"
    ]:

        return {
            "success": False,
            "output": "This language is not supported yet."
        }

    file_path = None

    try:

        # ======================================
        # PYTHON
        # ======================================

        if language == "python":

            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".py",
                delete=False,
                encoding="utf-8"
            ) as temp_file:

                temp_file.write(code)

                file_path = temp_file.name

            command = [
                sys.executable,
                file_path
            ]

        # ======================================
        # JAVASCRIPT
        # ======================================

        else:

            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".js",
                delete=False,
                encoding="utf-8"
            ) as temp_file:

                temp_file.write(code)

                file_path = temp_file.name

            command = [
                "node",
                file_path
            ]

        # ======================================
        # EXECUTE CODE
        # ======================================

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=5
        )

        output = result.stdout

        if result.stderr:
            output += result.stderr

        return {
            "success": result.returncode == 0,
            "output": output
        }

    except subprocess.TimeoutExpired:

        return {
            "success": False,
            "output": (
                "Execution timed out. "
                "Code must finish within 5 seconds."
            )
        }

    except FileNotFoundError:

        return {
            "success": False,
            "output": (
                "Required programming language "
                "runtime was not found."
            )
        }

    except Exception as error:

        return {
            "success": False,
            "output": str(error)
        }

    finally:

        if file_path and os.path.exists(file_path):

            os.remove(file_path)


# ==========================================
# SAVE ROOM TO MONGODB
# ==========================================

def save_room(
    room_id,
    code,
    language
):

    if rooms_collection is None:
        print("MongoDB unavailable. Room was not saved.")
        return False

    try:

        rooms_collection.update_one(
            {
                "room_id": room_id
            },
            {
                "$set": {
                    "room_id": room_id,
                    "code": code,
                    "language": language
                }
            },
            upsert=True
        )

        return True

    except Exception as error:

        print(f"MongoDB save error: {error}")

        return False


# ==========================================
# GET ROOM FROM MONGODB
# ==========================================

def get_room(room_id):

    if rooms_collection is None:
        return None

    try:

        return rooms_collection.find_one(
            {
                "room_id": room_id
            }
        )

    except Exception as error:

        print(f"MongoDB read error: {error}")

        return None


# ==========================================
# SAFE SEND
# ==========================================

async def safe_send(
    websocket,
    message
):

    try:

        await websocket.send_text(message)

        return True

    except Exception as error:

        print(f"Send error: {error}")

        return False


# ==========================================
# BROADCAST ONLINE USERS
# ==========================================

async def broadcast_users(room_id):

    if room_id not in rooms:
        return

    users = []

    for websocket in rooms[room_id]:

        if websocket in user_names:

            users.append(
                user_names[websocket]
            )

    message = json.dumps({
        "type": "users",
        "users": users
    })

    disconnected = []

    for websocket in rooms[room_id]:

        success = await safe_send(
            websocket,
            message
        )

        if not success:

            disconnected.append(
                websocket
            )

    for websocket in disconnected:

        if websocket in rooms[room_id]:

            rooms[room_id].remove(
                websocket
            )

        if websocket in user_names:

            del user_names[websocket]


# ==========================================
# BROADCAST CHAT
# ==========================================

async def broadcast_chat(
    room_id,
    username,
    message
):

    if room_id not in rooms:
        return

    chat_data = json.dumps({
        "type": "chat",
        "username": username,
        "message": message
    })

    disconnected = []

    for websocket in rooms[room_id]:

        success = await safe_send(
            websocket,
            chat_data
        )

        if not success:

            disconnected.append(
                websocket
            )

    for websocket in disconnected:

        if websocket in rooms[room_id]:

            rooms[room_id].remove(
                websocket
            )

        if websocket in user_names:

            del user_names[websocket]


# ==========================================
# BROADCAST CODE
# ==========================================

async def broadcast_code(
    room_id,
    sender,
    code,
    language
):

    if room_id not in rooms:
        return

    code_data = json.dumps({
        "type": "code",
        "code": code,
        "language": language
    })

    disconnected = []

    for websocket in rooms[room_id]:

        if websocket == sender:
            continue

        success = await safe_send(
            websocket,
            code_data
        )

        if not success:

            disconnected.append(
                websocket
            )

    for websocket in disconnected:

        if websocket in rooms[room_id]:

            rooms[room_id].remove(
                websocket
            )

        if websocket in user_names:

            del user_names[websocket]


# ==========================================
# BROADCAST LANGUAGE
# ==========================================

async def broadcast_language(
    room_id,
    sender,
    language
):

    if room_id not in rooms:
        return

    language_data = json.dumps({
        "type": "language",
        "language": language
    })

    disconnected = []

    for websocket in rooms[room_id]:

        if websocket == sender:
            continue

        success = await safe_send(
            websocket,
            language_data
        )

        if not success:

            disconnected.append(
                websocket
            )

    for websocket in disconnected:

        if websocket in rooms[room_id]:

            rooms[room_id].remove(
                websocket
            )

        if websocket in user_names:

            del user_names[websocket]


# ==========================================
# WEBSOCKET
# ==========================================

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str
):

    await websocket.accept()

    print(
        f"WebSocket connected to room: {room_id}"
    )

    # ======================================
    # GET USERNAME FROM QUERY PARAMETER
    # ======================================

    username = websocket.query_params.get(
        "username",
        "Anonymous"
    )

    username = unquote(username).strip()

    if not username:
        username = "Anonymous"

    # ======================================
    # CREATE ROOM
    # ======================================

    if room_id not in rooms:

        rooms[room_id] = []

    # ======================================
    # ADD CONNECTION
    # ======================================

    rooms[room_id].append(websocket)

    user_names[websocket] = username

    print(
        f"{username} joined room {room_id}"
    )

    # ======================================
    # SEND SAVED ROOM
    # ======================================

    try:

        saved_room = get_room(room_id)

        if saved_room:

            await safe_send(
                websocket,
                json.dumps({
                    "type": "code",
                    "code": saved_room.get(
                        "code",
                        ""
                    ),
                    "language": saved_room.get(
                        "language",
                        "python"
                    )
                })
            )

        # ==================================
        # SEND ONLINE USERS
        # ==================================

        await broadcast_users(room_id)

        # ==================================
        # WAIT FOR MESSAGES
        # ==================================

        while True:

            message = await websocket.receive_text()

            print(
                f"Message from {username}: {message}"
            )

            try:

                data = json.loads(message)

            except json.JSONDecodeError:

                print(
                    "Invalid JSON received"
                )

                continue

            message_type = data.get("type")

            # ==================================
            # JOIN
            # ==================================

            if message_type == "join":

                # Support old frontend too.
                new_username = data.get(
                    "username",
                    username
                )

                new_username = (
                    new_username.strip()
                    if isinstance(
                        new_username,
                        str
                    )
                    else username
                )

                if new_username:

                    user_names[websocket] = new_username
                    username = new_username

                print(
                    f"{username} confirmed in room {room_id}"
                )

                await broadcast_users(room_id)

            # ==================================
            # CODE CHANGE
            # ==================================

            elif message_type in [
                "code",
                "code_update"
            ]:

                code = data.get(
                    "code",
                    ""
                )

                language = data.get(
                    "language",
                    "python"
                )

                # Save to MongoDB
                save_room(
                    room_id,
                    code,
                    language
                )

                # Send to other users
                await broadcast_code(
                    room_id,
                    websocket,
                    code,
                    language
                )

            # ==================================
            # LANGUAGE CHANGE
            # ==================================

            elif message_type in [
                "language",
                "language_update"
            ]:

                language = data.get(
                    "language",
                    "python"
                )

                saved_room = get_room(
                    room_id
                )

                existing_code = ""

                if saved_room:

                    existing_code = saved_room.get(
                        "code",
                        ""
                    )

                save_room(
                    room_id,
                    existing_code,
                    language
                )

                await broadcast_language(
                    room_id,
                    websocket,
                    language
                )

            # ==================================
            # CHAT
            # ==================================

            elif message_type == "chat":

                chat_message = data.get(
                    "message",
                    ""
                )

                if not isinstance(
                    chat_message,
                    str
                ):
                    continue

                chat_message = (
                    chat_message.strip()
                )

                if chat_message:

                    print(
                        f"[CHAT] {username}: "
                        f"{chat_message}"
                    )

                    await broadcast_chat(
                        room_id,
                        username,
                        chat_message
                    )

    # ==========================================
    # DISCONNECT
    # ==========================================

    except WebSocketDisconnect:

        print(
            f"{username} disconnected"
        )

    except Exception as error:

        print(
            f"WebSocket error for "
            f"{username}: {error}"
        )

    finally:

        # ======================================
        # REMOVE WEBSOCKET
        # ======================================

        if room_id in rooms:

            if websocket in rooms[room_id]:

                rooms[room_id].remove(
                    websocket
                )

        # ======================================
        # REMOVE USERNAME
        # ======================================

        if websocket in user_names:

            del user_names[
                websocket
            ]

        # ======================================
        # UPDATE USERS
        # ======================================

        if (
            room_id in rooms
            and len(rooms[room_id]) > 0
        ):

            await broadcast_users(
                room_id
            )

        # ======================================
        # DELETE EMPTY ROOM
        # ======================================

        if room_id in rooms:

            if len(rooms[room_id]) == 0:

                del rooms[room_id]

                print(
                    f"Room {room_id} is now empty"
                )