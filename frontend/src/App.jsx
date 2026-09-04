import { useState } from "react";
import CodeEditor from "./components/CodeEditor";

function App() {

    const [roomId, setRoomId] = useState("");
    const [username, setUsername] = useState("");
    const [joined, setJoined] = useState(false);


    const joinRoom = () => {

        if (!username.trim()) {
            alert("Please enter your username");
            return;
        }

        if (!roomId.trim()) {
            alert("Please enter a Room ID");
            return;
        }

        setJoined(true);
    };


    const createRoom = () => {

        if (!username.trim()) {
            alert("Please enter your username");
            return;
        }

        const newRoomId = Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase();

        setRoomId(newRoomId);
        setJoined(true);
    };


    if (joined) {

        return (
            <div className="app">

                <header className="topbar">

                    <div className="brand">
                        <div className="brand-icon">
                            ⚡
                        </div>

                        <div>
                            <h1>CodeCollab</h1>

                            <span>
                                Real-Time Collaborative Editor
                            </span>
                        </div>
                    </div>


                    <div className="room-section">

                        <div className="room-badge">

                            <span>ROOM</span>

                            <strong>
                                {roomId}
                            </strong>

                        </div>


                        <button
                            className="copy-button"
                            onClick={() => {

                                navigator.clipboard.writeText(
                                    roomId
                                );

                                alert(
                                    "Room ID copied!"
                                );

                            }}
                        >
                            📋 Copy Room ID
                        </button>

                    </div>


                    <div className="profile">

                        <div className="profile-avatar">
                            {username
                                .charAt(0)
                                .toUpperCase()}
                        </div>

                        <div>

                            <strong>
                                {username}
                            </strong>

                            <span>
                                Online
                            </span>

                        </div>

                    </div>

                </header>


                <main className="workspace">

                    <CodeEditor
                        roomId={roomId}
                        username={username}
                    />

                </main>

            </div>
        );
    }


    return (

        <div className="landing-page">

            <div className="landing-card">

                <div className="landing-icon">
                    ⚡
                </div>


                <h1>
                    Code<span>Collab</span>
                </h1>


                <p className="landing-subtitle">
                    Real-Time Collaborative Code Editor
                </p>


                <p className="landing-description">
                    Write code together, chat with your
                    team, and run programs in real time.
                </p>


                <div className="form">

                    <label>
                        Your Name
                    </label>

                    <input
                        type="text"
                        placeholder="Enter your username"
                        value={username}
                        onChange={(e) =>
                            setUsername(e.target.value)
                        }
                    />


                    <label>
                        Room ID
                    </label>

                    <input
                        type="text"
                        placeholder="Enter existing room ID"
                        value={roomId}
                        onChange={(e) =>
                            setRoomId(
                                e.target.value.toUpperCase()
                            )
                        }
                    />


                    <button
                        className="primary-button"
                        onClick={joinRoom}
                    >
                        Join Room →
                    </button>


                    <div className="divider">
                        <span>OR</span>
                    </div>


                    <button
                        className="secondary-button"
                        onClick={createRoom}
                    >
                        ✨ Create New Room
                    </button>

                </div>


                <div className="features">

                    <div>
                        <strong>⚡</strong>
                        <span>Real-time</span>
                    </div>

                    <div>
                        <strong>👥</strong>
                        <span>Multi-user</span>
                    </div>

                    <div>
                        <strong>▶</strong>
                        <span>Run Code</span>
                    </div>

                </div>

            </div>

        </div>

    );
}

export default App;