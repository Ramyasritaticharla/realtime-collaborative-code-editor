from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from dotenv import load_dotenv

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

client = MongoClient(MONGODB_URI)

db = client["collaborative_editor"]

rooms_collection = db["rooms"]


# ==========================================
# FASTAPI APPLICATION
# ==========================================

app = FastAPI()


# ==========================================
# CORS
# ==========================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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

    return {
        "message": "Collaborative Code Editor Python Backend is running",
        "database": "MongoDB connected"
    }


# ==========================================
# DATABASE TEST
# ==========================================

@app.get("/database-test")
def database_test():

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


# ==========================================
# GET ROOM FROM MONGODB
# ==========================================

def get_room(room_id):

    return rooms_collection.find_one(
        {
            "room_id": room_id
        }
    )


# ==========================================
# SAFE SEND
# ==========================================

async def safe_send(
    websocket,
    message
):

    try:

        await websocket.send_text(
            message
        )

        return True

    except Exception:

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

    # --------------------------------------
    # Create room
    # --------------------------------------

    if room_id not in rooms:

        rooms[room_id] = []

    # --------------------------------------
    # Add connection
    # --------------------------------------

    rooms[room_id].append(
        websocket
    )

    try:

        while True:

            message = await websocket.receive_text()

            # ----------------------------------
            # Parse JSON
            # ----------------------------------

            try:

                data = json.loads(
                    message
                )

            except json.JSONDecodeError:

                print(
                    "Invalid JSON received"
                )

                continue

            message_type = data.get(
                "type"
            )

            # ==================================
            # JOIN ROOM
            # ==================================

            if message_type == "join":

                username = data.get(
                    "username",
                    "Anonymous"
                )

                username = username.strip()

                if not username:

                    username = "Anonymous"

                user_names[websocket] = username

                print(
                    f"{username} joined room {room_id}"
                )

                # ----------------------------------
                # Load saved room
                # ----------------------------------

                saved_room = get_room(
                    room_id
                )

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

                # ----------------------------------
                # Update users
                # ----------------------------------

                await broadcast_users(
                    room_id
                )

            # ==================================
            # CODE CHANGE
            # ==================================

            elif message_type == "code":

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

            elif message_type == "language":

                language = data.get(
                    "language",
                    "python"
                )

                # Get existing room

                saved_room = get_room(
                    room_id
                )

                existing_code = ""

                if saved_room:

                    existing_code = saved_room.get(
                        "code",
                        ""
                    )

                # Save language

                save_room(

                    room_id,

                    existing_code,

                    language

                )

                # Tell other users

                await broadcast_language(

                    room_id,

                    websocket,

                    language

                )

            # ==================================
            # CHAT MESSAGE
            # ==================================

            elif message_type == "chat":

                username = user_names.get(
                    websocket,
                    "Anonymous"
                )

                chat_message = data.get(
                    "message",
                    ""
                )

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

        username = user_names.get(
            websocket,
            "User"
        )

        print(
            f"{username} disconnected"
        )

    except Exception as error:

        print(
            f"WebSocket error: {error}"
        )

    finally:

        # --------------------------------------
        # Remove WebSocket
        # --------------------------------------

        if room_id in rooms:

            if websocket in rooms[room_id]:

                rooms[room_id].remove(
                    websocket
                )

        # --------------------------------------
        # Remove username
        # --------------------------------------

        if websocket in user_names:

            del user_names[
                websocket
            ]

        # --------------------------------------
        # Update remaining users
        # --------------------------------------

        if (
            room_id in rooms
            and len(rooms[room_id]) > 0
        ):

            await broadcast_users(
                room_id
            )

        # --------------------------------------
        # Delete empty room from memory
        # --------------------------------------

        if room_id in rooms:

            if len(rooms[room_id]) == 0:

                del rooms[room_id]

                print(
                    f"Room {room_id} is now empty"
                )