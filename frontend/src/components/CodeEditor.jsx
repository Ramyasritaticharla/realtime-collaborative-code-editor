import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";


function CodeEditor({ roomId, username }) {

    const [code, setCode] = useState(
        "# Start coding here...\n\nprint('Hello World!')"
    );

    const [language, setLanguage] = useState(
        "python"
    );

    const [users, setUsers] = useState([]);

    const [messages, setMessages] = useState([]);

    const [message, setMessage] = useState("");

    const [output, setOutput] = useState("");

    const [isRunning, setIsRunning] = useState(false);

    const socketRef = useRef(null);


    // ==========================================
    // WEBSOCKET
    // ==========================================

    useEffect(() => {

        if (!roomId) {
            return;
        }


        const socket = new WebSocket(
            `ws://localhost:5000/ws/${roomId}`
        );


        socketRef.current = socket;


        socket.onopen = () => {

            console.log(
                "Connected to Python WebSocket"
            );

            socket.send(
                JSON.stringify({
                    type: "join",
                    username: username
                })
            );
        };


        socket.onmessage = (event) => {

            try {

                const data =
                    JSON.parse(event.data);


                if (data.type === "code") {

                    setCode(data.code);

                    if (data.language) {

                        setLanguage(
                            data.language
                        );
                    }
                }


                else if (
                    data.type === "language"
                ) {

                    setLanguage(
                        data.language
                    );
                }


                else if (
                    data.type === "users"
                ) {

                    setUsers(data.users);
                }


                else if (
                    data.type === "chat"
                ) {

                    setMessages(
                        previous => [

                            ...previous,

                            {
                                username:
                                    data.username,

                                message:
                                    data.message
                            }

                        ]
                    );
                }

            }

            catch (error) {

                console.error(
                    "Message parsing error:",
                    error
                );
            }
        };


        socket.onerror = (error) => {

            console.error(
                "WebSocket error:",
                error
            );
        };


        socket.onclose = () => {

            console.log(
                "Disconnected from Python WebSocket"
            );
        };


        return () => {

            socket.close();

        };

    }, [roomId, username]);


    // ==========================================
    // CODE CHANGE
    // ==========================================

    const handleEditorChange = (value) => {

        const newCode = value || "";

        setCode(newCode);


        if (
            socketRef.current &&
            socketRef.current.readyState ===
            WebSocket.OPEN
        ) {

            socketRef.current.send(
                JSON.stringify({

                    type: "code",

                    code: newCode,

                    language: language

                })
            );
        }
    };


    // ==========================================
    // LANGUAGE CHANGE
    // ==========================================

    const handleLanguageChange = (event) => {

        const newLanguage =
            event.target.value;


        setLanguage(newLanguage);


        let newCode = code;


        if (newLanguage === "python") {

            newCode =
                "# Write Python code here\n\nprint('Hello World!')";

        }

        else if (
            newLanguage === "javascript"
        ) {

            newCode =
                "// Write JavaScript code here\n\nconsole.log('Hello World!');";

        }


        setCode(newCode);


        if (
            socketRef.current &&
            socketRef.current.readyState ===
            WebSocket.OPEN
        ) {

            socketRef.current.send(
                JSON.stringify({

                    type: "language",

                    language:
                        newLanguage

                })
            );


            socketRef.current.send(
                JSON.stringify({

                    type: "code",

                    code: newCode,

                    language:
                        newLanguage

                })
            );
        }
    };


    // ==========================================
    // RUN CODE
    // ==========================================

    const runCode = async () => {

        setIsRunning(true);

        setOutput(
            "Running your code..."
        );


        try {

            const response =
                await fetch(
                    "http://localhost:5000/run-code",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({

                            code: code,

                            language:
                                language

                        })
                    }
                );


            const data =
                await response.json();


            if (data.success) {

                setOutput(
                    data.output ||
                    "Code executed successfully."
                );

            }

            else {

                setOutput(
                    data.output ||
                    "An error occurred."
                );
            }

        }

        catch (error) {

            console.error(
                "Run code error:",
                error
            );


            setOutput(
                "Could not connect to the backend."
            );

        }

        finally {

            setIsRunning(false);

        }
    };


    // ==========================================
    // SEND CHAT
    // ==========================================

    const sendMessage = () => {

        const trimmed =
            message.trim();


        if (!trimmed) {
            return;
        }


        if (
            socketRef.current &&
            socketRef.current.readyState ===
            WebSocket.OPEN
        ) {

            socketRef.current.send(
                JSON.stringify({

                    type: "chat",

                    message: trimmed

                })
            );


            setMessage("");

        }

    };


    const handleKeyDown = (event) => {

        if (event.key === "Enter") {

            event.preventDefault();

            sendMessage();

        }
    };


    return (

        <div className="editor-layout">


            {/* ==================================
                SIDEBAR
            ================================== */}

            <aside className="sidebar">


                {/* USERS */}

                <div className="sidebar-section">

                    <div className="section-title">

                        <span>
                            👥 Online Users
                        </span>

                        <span className="user-count">
                            {users.length}
                        </span>

                    </div>


                    <div className="user-list">

                        {users.map(
                            (user, index) => (

                                <div
                                    key={index}
                                    className="online-user"
                                >

                                    <span className="online-dot">
                                    </span>

                                    <span>
                                        {user}
                                    </span>

                                </div>

                            )
                        )}

                    </div>

                </div>


                {/* CHAT */}

                <div className="sidebar-section chat-section">

                    <div className="section-title">

                        <span>
                            💬 Team Chat
                        </span>

                    </div>


                    <div className="messages">

                        {messages.length === 0 ? (

                            <div className="no-messages">

                                No messages yet.
                                <br />

                                <small>
                                    Start a conversation!
                                </small>

                            </div>

                        ) : (

                            messages.map(
                                (item, index) => (

                                    <div
                                        key={index}
                                        className="chat-message"
                                    >

                                        <strong>
                                            {item.username}
                                        </strong>

                                        <p>
                                            {item.message}
                                        </p>

                                    </div>

                                )
                            )

                        )}

                    </div>


                    <div className="chat-input-wrapper">

                        <input
                            type="text"
                            placeholder="Message team..."
                            value={message}
                            onChange={(e) =>
                                setMessage(
                                    e.target.value
                                )
                            }
                            onKeyDown={
                                handleKeyDown
                            }
                        />


                        <button
                            onClick={sendMessage}
                        >
                            ➤
                        </button>

                    </div>

                </div>

            </aside>


            {/* ==================================
                MAIN EDITOR
            ================================== */}

            <section className="editor-section">


                {/* EDITOR TOOLBAR */}

                <div className="editor-toolbar">


                    <div className="language-wrapper">

                        <span>
                            Language
                        </span>


                        <select
                            value={language}
                            onChange={
                                handleLanguageChange
                            }
                        >

                            <option value="python">
                                🐍 Python
                            </option>

                            <option value="javascript">
                                🟨 JavaScript
                            </option>

                        </select>

                    </div>


                    <button
                        className="run-button"
                        onClick={runCode}
                        disabled={isRunning}
                    >

                        {isRunning
                            ? "⏳ Running..."
                            : "▶ Run Code"}

                    </button>

                </div>


                {/* MONACO */}

                <div className="monaco-wrapper">

                    <Editor

                        height="100%"

                        language={language}

                        value={code}

                        onChange={
                            handleEditorChange
                        }

                        theme="vs-dark"

                        options={{

                            fontSize: 15,

                            minimap: {
                                enabled: false
                            },

                            automaticLayout: true,

                            padding: {
                                top: 15
                            },

                            scrollBeyondLastLine:
                                false,

                            lineNumbers:
                                "on",

                            renderWhitespace:
                                "selection"

                        }}

                    />

                </div>


                {/* OUTPUT */}

                <div className="output-section">

                    <div className="output-header">

                        <span>
                            <span className="output-dot">
                            </span>

                            Output
                        </span>

                        {output && (
                            <span className="output-status">
                                Execution finished
                            </span>
                        )}

                    </div>


                    <pre>

                        {output ||
                            "Run your code to see the output here."}

                    </pre>

                </div>

            </section>

        </div>

    );
}


export default CodeEditor;