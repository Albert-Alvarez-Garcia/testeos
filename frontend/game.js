document.addEventListener("DOMContentLoaded", () => {
    const cardImg = document.getElementById("game-card-img");
    const titleMask = document.getElementById("title-mask");
    const optionsContainer = document.getElementById("options-container");
    const timerText = document.getElementById("timer");
    const timerBar = document.getElementById("timer-bar");
    const scoreDisplay = document.getElementById("player-score");
    const streakDisplay = document.getElementById("player-streak");
    const roomStatus = document.getElementById("room-status");

    let ws = null;
    let timerInterval = null;
    let timeLeft = 15;
    let hasAnswered = false;
    let roundFinished = false;

    const userSession = JSON.parse(localStorage.getItem("user_session")) || 
                        JSON.parse(localStorage.getItem("cardbinder_user")) || {
                            username: "Conjurador"
                        };

    function connectGameWebSocket() {
        ws = new WebSocket("ws://localhost:8000/api/game/ws/game/sala-1");

        ws.onopen = () => {
            if (roomStatus) roomStatus.textContent = "🟢 En línea - Sala 1";
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === "NEW_ROUND") {
                startNewRound(data);
            } else if (data.type === "ANSWER_RESULT") {
                handleAnswerResult(data);
            } else if (data.type === "GAME_OVER") {
                handleGameOver(data);
            }
        };

        ws.onclose = () => {
            if (roomStatus) roomStatus.textContent = "🔴 Desconectado. Reintentando...";
            setTimeout(connectGameWebSocket, 3000);
        };
    }

    function applyBlurByTime(seconds) {
        if (!cardImg) return;
        
        if (seconds >= 10) {
            const progress = (15 - seconds) / 5;
            const currentBlur = 6 * (1 - progress);
            const currentBrightness = 0.8 + (0.2 * progress);
            cardImg.style.filter = `blur(${currentBlur.toFixed(2)}px) brightness(${currentBrightness.toFixed(2)})`;
        } else {
            cardImg.style.filter = "blur(0px) brightness(1)";
        }
    }

    function startNewRound(data) {
        hasAnswered = false;
        roundFinished = false;
        
        if (cardImg) {
            cardImg.style.filter = "blur(6px) brightness(0.8)";
            cardImg.src = data.image_uri || "public/assets/nocapi.png";
        }

        if (titleMask) {
            titleMask.style.display = "block";
        }

        optionsContainer.innerHTML = "";
        data.options.forEach(optionText => {
            const btn = document.createElement("button");
            btn.className = "option-btn bg-[#1e140d] hover:bg-[#2a1d13] border border-[#b39258]/30 py-3 px-4 rounded-lg text-sm font-medium text-amber-100 transition-all cursor-pointer text-left hover:border-amber-400";
            btn.textContent = optionText;

            btn.addEventListener("click", () => {
                if (hasAnswered || roundFinished) return;
                handlePlayerClick(optionText, btn);
            });

            optionsContainer.appendChild(btn);
        });

        resetTimer();
    }

    function resetTimer() {
        clearInterval(timerInterval);
        timeLeft = 15;
        
        applyBlurByTime(timeLeft);
        updateTimerUI();

        timerInterval = setInterval(() => {
            timeLeft--;
            
            applyBlurByTime(timeLeft);
            updateTimerUI();

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                
                if (!roundFinished) {
                    roundFinished = true;
                    if (titleMask) titleMask.style.display = "none";
                    if (cardImg) cardImg.style.filter = "blur(0px) brightness(1)";
                    
                    // Forzar el salto de ronda en el backend por tiempo agotado
                    sendAnswerToBackend("");
                }
            }
        }, 1000);
    }

    function updateTimerUI() {
        if (timerText) timerText.textContent = `${timeLeft}s`;
        if (timerBar) {
            const percentage = (timeLeft / 15) * 100;
            timerBar.style.width = `${percentage}%`;
            
            if (timeLeft <= 5) {
                timerBar.className = "bg-red-500 h-full transition-all duration-1000";
            } else if (timeLeft <= 10) {
                timerBar.className = "bg-amber-500 h-full transition-all duration-1000";
            } else {
                timerBar.className = "bg-emerald-500 h-full transition-all duration-1000";
            }
        }
    }

    function handlePlayerClick(selectedOption, clickedBtn) {
        hasAnswered = true;

        // Bloquear todos los botones al fallar
        const buttons = optionsContainer.querySelectorAll("button");
        buttons.forEach(b => {
            b.disabled = true;
            b.classList.add("opacity-50", "cursor-not-allowed");
        });

        // Marcar el botón pulsado en rojo
        clickedBtn.className = "bg-red-950/80 border-red-600 text-amber-200 py-3 px-4 rounded-lg text-sm font-medium text-left cursor-not-allowed opacity-75";

        sendAnswerToBackend(selectedOption);
    }

    function sendAnswerToBackend(answerText) {
        const payload = {
            action: "ANSWER",
            answer: answerText,
            username: userSession.username || "Jugador"
        };

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        }
    }

    function handleAnswerResult(data) {
        if (scoreDisplay) scoreDisplay.textContent = data.total_score;

        const buttons = optionsContainer.querySelectorAll("button");

        if (data.correct) {
            // Si acierta, la ronda termina inmediatamente
            roundFinished = true;
            if (titleMask) titleMask.style.display = "none";
            if (cardImg) cardImg.style.filter = "blur(0px) brightness(1)";
            clearInterval(timerInterval);

            buttons.forEach(btn => {
                btn.disabled = true;
                btn.classList.add("cursor-not-allowed");
                if (btn.textContent.trim().toLowerCase() === data.correct_answer.trim().toLowerCase()) {
                    btn.className = "bg-emerald-900/80 border-emerald-400 text-white py-3 px-4 rounded-lg text-sm font-medium transition-all text-left";
                }
            });
        } else {
            // Si falla, se queda bloqueado pero el crono SIGUE corriendo hasta llegar a 0
            buttons.forEach(btn => {
                if (btn.textContent.trim().toLowerCase() === data.correct_answer.trim().toLowerCase()) {
                    // Opcional: dejar preparado para iluminar la correcta cuando expire el tiempo
                }
            });
        }

        if (streakDisplay) {
            streakDisplay.textContent = data.correct ? parseInt(streakDisplay.textContent || "0") + 1 : "0";
        }
    }

    function handleGameOver(data) {
        clearInterval(timerInterval);
        alert(`🏆 ¡FIN DE LA PARTIDA! El ganador es: ${data.winner}`);
    }

    connectGameWebSocket();
});