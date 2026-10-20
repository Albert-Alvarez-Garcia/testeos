import React, { useEffect, useRef, useState } from 'react';

export default function PongGame() {
    const canvasRef = useRef(null);

    // Estados reactivos para la UI (puntuaciones, estados de la partida, etc.)
    const [scoreLeft, setScoreLeft] = useState(0);
    const [scoreRight, setScoreRight] = useState(0);
    const [roomStatus, setRoomStatus] = useState("Conectando a la arena...");
    const [gameOverData, setGameOverData] = useState(null);

    // Leer parámetros de la URL (?room=sala-1&mode=online&win=5&orb=white&theme=classic)
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get("room") || "sala-pong-1";
    const mode = urlParams.get("mode") || "online";
    const winScore = urlParams.get("win") || "5";
    const orbColor = urlParams.get("orb") || "white";
    const theme = urlParams.get("theme") || "classic";

    const userSession = JSON.parse(localStorage.getItem("user_session")) || { username: "Mago" };
    const username = sessionStorage.getItem("cb_tab_user") || userSession.username;

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        let ws = null;
        let animationFrameId = null;

        // Estado interno del juego renderizado en el Canvas
        let gameState = {
            ball: { x: 400, y: 250 },
            paddles: { left: 200, right: 200 }
        };

        // Conexión WebSocket al backend (pong.py)
        const wsUrl = `ws://localhost:8000/api/pong/ws/pong/${encodeURIComponent(roomId)}?username=${encodeURIComponent(username)}&mode=${mode}&win_score=${winScore}&orb_color=${orbColor}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => setRoomStatus(`🟢 En línea - ${roomId} (${mode.toUpperCase()})`);
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "PONG_STATE") {
                gameState.ball = data.ball;
                gameState.paddles = data.paddles;
                setScoreLeft(data.scores.left);
                setScoreRight(data.scores.right);
            } else if (data.type === "PONG_GAME_OVER") {
                setGameOverData(data);
            }
        };

        ws.onclose = () => setRoomStatus("🔴 Desconectado. Reintentando...");

        // Captura de teclado para las palas
        const keysPressed = {};
        const handleKeyDown = (e) => { keysPressed[e.key.toLowerCase()] = true; };
        const handleKeyUp = (e) => { keysPressed[e.key.toLowerCase()] = false; };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        // Bucle de envío de inputs al servidor y renderizado isométrico en Canvas (60 FPS)
        const renderLoop = () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                if (mode === "local") {
                    let leftDir = 0;
                    let rightDir = 0;
                    if (keysPressed["w"]) leftDir = -1;
                    if (keysPressed["s"]) leftDir = 1;
                    if (keysPressed["arrowup"]) rightDir = -1;
                    if (keysPressed["arrowdown"]) rightDir = 1;

                    if (leftDir !== 0 || rightDir !== 0) {
                        ws.send(JSON.stringify({ action: "MOVE_LOCAL_PADDLES", left_dir: leftDir, right_dir: rightDir }));
                    }
                } else {
                    let dir = 0;
                    if (keysPressed["w"] || keysPressed["arrowup"]) dir = -1;
                    if (keysPressed["s"] || keysPressed["arrowdown"]) dir = 1;

                    if (dir !== 0) {
                        ws.send(JSON.stringify({ action: "MOVE_PADDLE", direction: dir }));
                    }
                }
            }

            // --- Dibujo del Canvas con perspectiva isométrica y temática Magic ---
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Fondo según el tema seleccionado
            ctx.fillStyle = theme === "innistrad" ? "#0f0c15" : theme === "ravnica" ? "#141008" : "#120c08";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Mesa de Pong central con estética de pergamino / tapete
            ctx.strokeStyle = "rgba(179, 146, 88, 0.4)";
            ctx.lineWidth = 3;
            ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);

            // Red central punteada
            ctx.beginPath();
            ctx.setLineDash([10, 10]);
            ctx.moveTo(canvas.width / 2, 50);
            ctx.lineTo(canvas.width / 2, canvas.height - 50);
            ctx.strokeStyle = "rgba(179, 146, 88, 0.2)";
            ctx.stroke();
            ctx.setLineDash([]);

            // Dibujar Palas
            ctx.fillStyle = "#b39258";
            ctx.fillRect(35, gameState.paddles.left, 15, 90);      // Pala Izquierda
            ctx.fillRect(canvas.width - 50, gameState.paddles.right, 15, 90); // Pala Derecha

            // Dibujar Orbe de Maná (Pelota) con colores según selección de Magic
            const orbColorsMap = {
                white: "#fef3c7",
                blue: "#3b82f6",
                black: "#1e1b4b",
                red: "#ef4444",
                green: "#10b981"
            };
            ctx.fillStyle = orbColorsMap[orbColor] || "#fef3c7";
            ctx.beginPath();
            ctx.arc(gameState.ball.x, gameState.ball.y, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 15;
            ctx.shadowColor = ctx.fillStyle;
            ctx.fill();
            ctx.shadowBlur = 0; // Reset sombra

            animationFrameId = requestAnimationFrame(renderLoop);
        };

        renderLoop();

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            cancelAnimationFrame(animationFrameId);
            if (ws) ws.close();
        };
    }, [roomId, mode, orbColor, theme, username]);

    return (
        <div className="min-h-screen bg-[#0b0705] text-[#fef3c7] flex flex-col items-center justify-center p-4 font-sans">
            {/* Cabecera */}
            <div className="w-full max-w-[800px] flex justify-between items-center mb-4 bg-[#140e09] border border-[#b39258]/30 p-4 rounded-xl shadow-lg">
                <div>
                    <h1 className="text-xl text-amber-400 font-bold font-serif">⚔️ Duelo de Pong Isométrico (React)</h1>
                    <p className="text-xs text-amber-200/60">{roomStatus}</p>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-center">
                        <span className="text-[10px] text-amber-200/70 block uppercase">P1 / Izq</span>
                        <span className="text-2xl font-bold text-amber-400">{scoreLeft}</span>
                    </div>
                    <span className="text-xl font-bold text-amber-600">VS</span>
                    <div className="text-center">
                        <span className="text-[10px] text-amber-200/70 block uppercase">P2 / Der</span>
                        <span className="text-2xl font-bold text-emerald-400">{scoreRight}</span>
                    </div>
                </div>
            </div>

            {/* Canvas */}
            <div className="relative w-full max-w-[800px] aspect-[16/10] bg-[#120c08] border-2 border-[#b39258]/40 rounded-2xl overflow-hidden shadow-2xl">
                <canvas ref={canvasRef} width="800" height="500" className="w-full h-full block" />
            </div>

            {/* Controles informativos */}
            <div className="w-full max-w-[800px] mt-3 flex justify-between text-xs text-amber-200/60 px-2">
                <span>🎮 Controles: <strong className="text-amber-300">W / S</strong> (P1) {mode === 'local' ? '| <strong className="text-amber-300">Flechas</strong> (P2)' : ''}</span>
                <span>Meta: <strong className="text-amber-300">{winScore}</strong> Goles</span>
            </div>

            {/* Modal de Fin de Partida */}
            {gameOverData && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
                    <div className="bg-[#140e09] border border-[#b39258]/50 rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl">
                        <h2 className="text-2xl text-amber-400 mb-2 font-serif">🏆 ¡Duelo Finalizado!</h2>
                        <p className="text-amber-100 mb-4 font-bold text-lg">Ganador: {gameOverData.winner}</p>
                        <button 
                            onClick={() => window.location.href = `pong_lobby.html?room=${roomId}`}
                            className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold py-3 px-4 rounded-xl text-xs transition-all cursor-pointer"
                        >
                            Volver al Vestíbulo
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}