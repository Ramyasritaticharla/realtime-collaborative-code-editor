import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

const BACKEND_URL =
  "https://realtime-collaborative-code-editor-2hr0.onrender.com";

const WS_URL =
  "wss://realtime-collaborative-code-editor-2hr0.onrender.com";

function CodeEditor({ roomId, username, onLeaveRoom }) {
  const [code, setCode] = useState(
    `def hello():
    print("Hello, CodeCollab!")

hello()`
  );

  const [language, setLanguage] = useState("python");
  const [output, setOutput] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);

  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const isRemoteUpdate = useRef(false);

  // ==========================================
  // WEBSOCKET CONNECTION
  // ==========================================

  useEffect(() => {
    if (!roomId || !username) return;

    const socket = new WebSocket(
      `${WS_URL}/ws/${encodeURIComponent(roomId)}`
    );

    socketRef.current = socket;

    socket.onopen = () => {
      console.log("Connected to collaboration server");

      setConnected(true);

      // Send JOIN message to Python backend
      const joinMessage = {
        type: "join",
        username: username,
      };

      console.log("Sending join message:", joinMessage);

      socket.send(JSON.stringify(joinMessage));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        console.log("Received from server:", data);

        // ======================================
        // CODE FROM SERVER
        // ======================================

        if (data.type === "code") {
          if (typeof data.code === "string") {
            isRemoteUpdate.current = true;
            setCode(data.code);
          }

          if (data.language) {
            setLanguage(data.language);
          }

          return;
        }

        // ======================================
        // LANGUAGE FROM SERVER
        // ======================================

        if (data.type === "language") {
          if (data.language) {
            setLanguage(data.language);
          }

          return;
        }

        // ======================================
        // ONLINE USERS FROM SERVER
        // ======================================

        if (data.type === "users") {
          if (Array.isArray(data.users)) {
            console.log("Online users:", data.users);
            setUsers(data.users);
          }

          return;
        }

        // ======================================
        // CHAT MESSAGE
        // ======================================

        if (data.type === "chat") {
          setMessages((previous) => [
            ...previous,
            {
              username: data.username || "User",
              message: data.message || "",
              timestamp:
                data.timestamp || new Date().toISOString(),
            },
          ]);

          return;
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnected(false);
    };

    socket.onclose = (event) => {
      console.log(
        "Disconnected from collaboration server",
        "Code:",
        event.code,
        "Reason:",
        event.reason
      );

      setConnected(false);
    };

    return () => {
      console.log("Closing WebSocket");

      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }

      socketRef.current = null;
    };
  }, [roomId, username]);

  // ==========================================
  // AUTO SCROLL CHAT
  // ==========================================

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  // ==========================================
  // EDITOR CHANGE
  // ==========================================

  const handleEditorChange = (value) => {
    const newCode = value || "";

    setCode(newCode);

    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }

    if (
      socketRef.current &&
      socketRef.current.readyState === WebSocket.OPEN
    ) {
      socketRef.current.send(
        JSON.stringify({
          // IMPORTANT:
          // Python backend expects "code"
          type: "code",
          code: newCode,
          language: language,
        })
      );
    }
  };

  // ==========================================
  // LANGUAGE CHANGE
  // ==========================================

  const handleLanguageChange = (event) => {
    const newLanguage = event.target.value;

    setLanguage(newLanguage);

    if (
      socketRef.current &&
      socketRef.current.readyState === WebSocket.OPEN
    ) {
      socketRef.current.send(
        JSON.stringify({
          // IMPORTANT:
          // Python backend expects "language"
          type: "language",
          language: newLanguage,
        })
      );
    }
  };

  // ==========================================
  // SEND CHAT
  // ==========================================

  const sendChatMessage = () => {
    const message = chatMessage.trim();

    if (!message) return;

    if (
      socketRef.current &&
      socketRef.current.readyState === WebSocket.OPEN
    ) {
      socketRef.current.send(
        JSON.stringify({
          type: "chat",
          username: username,
          message: message,
        })
      );

      setChatMessage("");
    }
  };

  const handleChatKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendChatMessage();
    }
  };

  // ==========================================
  // RUN CODE
  // ==========================================

  const runCode = async () => {
    if (!code.trim()) {
      setOutput("Please enter some code first.");
      return;
    }

    setRunning(true);
    setOutput("Running...");

    try {
      const response = await fetch(`${BACKEND_URL}/run-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          language,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setOutput(
          data.detail ||
            data.error ||
            "Something went wrong while running the code."
        );
        return;
      }

      if (data.output !== undefined) {
        setOutput(
          data.output || "Program finished with no output."
        );
      } else if (data.error) {
        setOutput(data.error);
      } else {
        setOutput("Program finished.");
      }
    } catch (error) {
      console.error("Run code error:", error);

      setOutput(
        "Unable to connect to the backend. Please try again."
      );
    } finally {
      setRunning(false);
    }
  };

  // ==========================================
  // COPY ROOM ID
  // ==========================================

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      alert("Room ID copied!");
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  // ==========================================
  // MONACO
  // ==========================================

  const handleEditorMount = (editor) => {
    // Keep Monaco focused when loaded
    editor.focus();
  };

  // ==========================================
  // UI
  // ==========================================

  return (
    <div className="editor-page">

      {/* TOP BAR */}
      <header className="editor-topbar">

        <div className="brand-section">
          <div className="brand-logo">CC</div>

          <div>
            <h2>CodeCollab</h2>
            <span>Real-Time Collaborative Editor</span>
          </div>
        </div>

        <div className="room-section">

          <div className="room-info">
            <span className="room-label">ROOM</span>

            <strong>{roomId}</strong>

            <button
              className="copy-room-btn"
              onClick={copyRoomId}
              title="Copy Room ID"
            >
              ⧉
            </button>
          </div>

          <div className="connection-status">

            <span
              className={`status-dot ${
                connected ? "online" : "offline"
              }`}
            ></span>

            {connected ? "Connected" : "Connecting..."}
          </div>

          <div className="user-profile">

            <div className="user-avatar">
              {username.charAt(0).toUpperCase()}
            </div>

            <span>{username}</span>
          </div>

          <button
            className="leave-btn"
            onClick={onLeaveRoom}
          >
            Leave
          </button>

        </div>
      </header>

      {/* WORKSPACE */}
      <div className="workspace">

        {/* SIDEBAR */}
        <aside className="sidebar">

          {/* ONLINE USERS */}
          <div className="sidebar-section">

            <div className="section-title">
              <span>ONLINE USERS</span>

              <span className="user-count">
                {users.length}
              </span>
            </div>

            <div className="users-list">

              {users.length === 0 ? (

                <div className="empty-users">
                  Waiting for collaborators...
                </div>

              ) : (

                users.map((user, index) => {

                  const userName =
                    typeof user === "string"
                      ? user
                      : user.username ||
                        user.name ||
                        "User";

                  return (
                    <div
                      className="online-user"
                      key={`${userName}-${index}`}
                    >

                      <div className="small-avatar">
                        {userName
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <span>{userName}</span>

                      {userName === username && (
                        <span className="you-label">
                          You
                        </span>
                      )}

                      <span className="online-dot"></span>

                    </div>
                  );
                })
              )}

            </div>
          </div>

          {/* TEAM CHAT */}
          <div className="sidebar-section chat-section">

            <div className="section-title">
              <span>TEAM CHAT</span>
            </div>

            <div className="chat-messages">

              {messages.length === 0 ? (

                <div className="empty-chat">
                  No messages yet.
                  <br />
                  Start the conversation!
                </div>

              ) : (

                messages.map((msg, index) => (

                  <div
                    className="chat-message"
                    key={index}
                  >

                    <div className="chat-avatar">
                      {(msg.username || "U")
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div className="chat-content">

                      <div className="chat-header">
                        <strong>
                          {msg.username}
                        </strong>
                      </div>

                      <p>{msg.message}</p>

                    </div>

                  </div>
                ))
              )}

              <div ref={chatEndRef}></div>

            </div>

            <div className="chat-input-container">

              <input
                type="text"
                placeholder="Message team..."
                value={chatMessage}
                onChange={(event) =>
                  setChatMessage(event.target.value)
                }
                onKeyDown={handleChatKeyDown}
              />

              <button onClick={sendChatMessage}>
                ➤
              </button>

            </div>

          </div>

        </aside>

        {/* EDITOR */}
        <main className="editor-main">

          {/* TOOLBAR */}
          <div className="editor-toolbar">

            <div className="file-info">
              <span className="file-icon">
                ◉
              </span>

              <span>
                main.
                {language === "python"
                  ? "py"
                  : "js"}
              </span>
            </div>

            <div className="editor-actions">

              <select
                value={language}
                onChange={handleLanguageChange}
                className="language-select"
              >
                <option value="python">
                  Python
                </option>

                <option value="javascript">
                  JavaScript
                </option>
              </select>

              <button
                className="run-button"
                onClick={runCode}
                disabled={running}
              >
                {running
                  ? "Running..."
                  : "▶ Run Code"}
              </button>

            </div>

          </div>

          {/* MONACO */}
          <div className="monaco-container">

            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                fontSize: 15,

                minimap: {
                  enabled: true,
                },

                automaticLayout: true,

                wordWrap: "on",

                tabSize: 4,

                insertSpaces: true,

                smoothScrolling: true,

                cursorBlinking: "smooth",

                padding: {
                  top: 15,
                },
              }}
            />

          </div>

          {/* OUTPUT */}
          <div className="output-panel">

            <div className="output-header">

              <div>
                <span className="output-icon">
                  ▣
                </span>

                <span>OUTPUT</span>
              </div>

              <button
                onClick={() => setOutput("")}
                className="clear-output"
              >
                Clear
              </button>

            </div>

            <div className="output-content">

              {output ? (

                <pre>{output}</pre>

              ) : (

                <div className="empty-output">
                  Run your code to see the output here.
                </div>

              )}

            </div>

          </div>

        </main>

      </div>

    </div>
  );
}

export default CodeEditor;