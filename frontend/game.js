document.addEventListener("DOMContentLoaded", () => {
    const API_HOST = location.host;

    const cardImg = document.getElementById("game-card-img");
    const titleMask = document.getElementById("title-mask");
    const optionsContainer = document.getElementById("options-container");
    const timerText = document.getElementById("timer");
    const timerBar = document.getElementById("timer-bar");
    const scoreDisplay = document.getElementById("player-score");
    const streakDisplay = document.getElementById("player-streak");
    const roomStatus = document.getElementById("room-status");
    const scoreboard = document.getElementById("scoreboard");
    const winScoreLabel = document.getElementById("win-score");
    const roundNumberLabel = document.getElementById("round-number");
    const roundBanner = document.getElementById("round-banner");
    const endOverlay = document.getElementById("end-overlay");
    const endWinner = document.getElementById("end-winner");
    const endRanking = document.getElementById("end-ranking");
    const endCountdown = document.getElementById("end-countdown");

    const userSession = JSON.parse(localStorage.getItem("user_session")) ||
                        JSON.parse(localStorage.getItem("cardbinder_user")) || {
                            username: "Conjurador"
                        };
    const urlParams = new URLSearchParams(window.location.search);
    // ?user=Ana permite probar varios jugadores en el mismo navegador (se recuerda por pestaña)
    if (urlParams.get("user")) sessionStorage.setItem("cb_tab_user", urlParams.get("user"));
    const username = sessionStorage.getItem("cb_tab_user") || userSession.username || "Jugador";
    const roomId = urlParams.get("room") || "sala-1";

    console.info("Adivina la Carta · cliente v2 · usuario:", username, "· sala:", roomId);

    // ---- Estado local (el reloj REAL vive en el servidor) ----
    let ws = null;
    let phase = "waiting";        // waiting | playing | reveal
    let roundEndsAt = 0;          // performance.now() en el que acaba la ronda
    let roundDuration = 15;
    let selectedOption = null;
    let locked = true;
    let gameEnded = false;

    const BTN_BASE = "option-btn py-3 px-4 rounded-lg text-sm font-medium text-left border transition-all ";
    const BTN_STATES = {
        idle: "bg-[#1e140d] hover:bg-[#2a1d13] border-[#b39258]/30 text-amber-100 cursor-pointer hover:border-amber-400",
        pending: "bg-amber-900/60 border-amber-500 text-amber-100 cursor-not-allowed",
        wrong: "bg-red-950/80 border-red-600 text-amber-200 cursor-not-allowed",
        right: "bg-emerald-900/80 border-emerald-400 text-white cursor-not-allowed"
    };

    function setBtnState(btn, state) {
        btn.dataset.state = state;
        btn.className = BTN_BASE + BTN_STATES[state];
    }

    const norm = (s) => String(s || "").trim().toLowerCase();

    // ---------------- WebSocket ----------------
    function connectGameWebSocket() {
        if (gameEnded) return;
        ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${API_HOST}/api/game/ws/game/${encodeURIComponent(roomId)}?username=${encodeURIComponent(username)}`);

        ws.onopen = () => {
            if (roomStatus) roomStatus.textContent = `🟢 En línea - ${roomId}`;
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            switch (data.type) {
                case "NEW_ROUND": startRound(data); break;
                case "ANSWER_RESULT": handleAnswerResult(data); break;
                case "ROUND_END": showReveal(data.correct_answer, data.round_winner); break;
                case "SCORES": renderScoreboard(data); break;
                case "GAME_OVER": handleGameOver(data); break;
            }
        };

        ws.onclose = () => {
            if (gameEnded) return;
            if (roomStatus) roomStatus.textContent = "🔴 Desconectado. Reintentando...";
            lockOptions();
            setTimeout(connectGameWebSocket, 2000);
        };
    }

    // ---------------- Rondas ----------------
    function startRound(data) {
        phase = data.phase || "playing";
        roundDuration = data.round_duration || 15;
        roundEndsAt = performance.now() + (data.time_remaining || 0) * 1000;
        selectedOption = null;
        locked = false;

        if (roundNumberLabel) roundNumberLabel.textContent = data.round_number || 1;
        if (roundBanner) roundBanner.textContent = "";
        if (titleMask) titleMask.style.display = "block";

        if (cardImg) {
            cardImg.style.filter = "blur(6px) brightness(0.8)";
            cardImg.src = data.image_uri || "public/assets/nocapi.png";
        }

        renderOptions(data.options || []);

        if (phase === "reveal") {
            showReveal(data.correct_answer, data.round_winner);
            return;
        }
        if (data.already_answered) lockOptions();
        tick();
    }

    function renderOptions(options) {
        optionsContainer.innerHTML = "";
        options.forEach(optionText => {
            const btn = document.createElement("button");
            btn.textContent = optionText;
            setBtnState(btn, "idle");
            btn.addEventListener("click", () => handlePlayerClick(optionText, btn));
            optionsContainer.appendChild(btn);
        });
    }

    function lockOptions() {
        locked = true;
        optionsContainer.querySelectorAll("button").forEach(b => {
            b.disabled = true;
            if (b.dataset.state === "idle") b.classList.add("opacity-50", "cursor-not-allowed");
        });
    }

    function handlePlayerClick(optionText, btn) {
        if (locked || phase !== "playing") return;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        selectedOption = optionText;
        setBtnState(btn, "pending");
        lockOptions();
        ws.send(JSON.stringify({ action: "ANSWER", answer: optionText }));
    }

    function handleAnswerResult(data) {
        if (scoreDisplay) scoreDisplay.textContent = data.total_score;
        if (streakDisplay) streakDisplay.textContent = data.streak;

        const btn = Array.from(optionsContainer.querySelectorAll("button"))
            .find(b => norm(b.textContent) === norm(selectedOption));
        if (btn) setBtnState(btn, data.correct ? "right" : "wrong");

        if (roundBanner) {
            roundBanner.textContent = data.correct
                ? `✅ ¡Correcto! +${data.points_earned} puntos`
                : "❌ Fallaste. Esperando al resto...";
        }
    }

    function showReveal(correctAnswer, winner) {
        phase = "reveal";
        lockOptions();
        if (titleMask) titleMask.style.display = "none";
        if (cardImg) cardImg.style.filter = "blur(0px) brightness(1)";
        updateTimerUI(0);

        optionsContainer.querySelectorAll("button").forEach(b => {
            if (norm(b.textContent) === norm(correctAnswer)) {
                setBtnState(b, "right");
                b.disabled = true;
            }
        });

        if (roundBanner) {
            roundBanner.textContent = winner
                ? `🎉 ${winner} acertó: ${correctAnswer}`
                : `⌛ Nadie acertó. Era: ${correctAnswer}`;
        }
    }

    // ---------------- Reloj (derivado del tiempo que manda el servidor) ----------------
    function tick() {
        if (phase !== "playing") return;
        const remaining = Math.max(0, roundEndsAt - performance.now()) / 1000;
        applyBlur(roundDuration - remaining);
        updateTimerUI(remaining);
        if (remaining <= 0) lockOptions();   // el servidor cerrará la ronda con ROUND_END
    }
    setInterval(tick, 100);

    function applyBlur(elapsed) {
        if (!cardImg) return;
        const progress = Math.min(1, Math.max(0, elapsed / 5));
        const blur = 6 * (1 - progress);
        const brightness = 0.8 + 0.2 * progress;
        cardImg.style.filter = `blur(${blur.toFixed(2)}px) brightness(${brightness.toFixed(2)})`;
    }

    function updateTimerUI(remaining) {
        const secs = Math.ceil(remaining);
        if (timerText) timerText.textContent = phase === "playing" ? `${secs}s` : "—";
        if (timerBar) {
            const pct = (Math.max(0, remaining) / roundDuration) * 100;
            timerBar.style.width = `${pct}%`;
            const color = remaining <= 5 ? "bg-red-500" : remaining <= 10 ? "bg-amber-500" : "bg-emerald-500";
            timerBar.className = `${color} h-full transition-[width] duration-100 ease-linear`;
        }
    }

    // ---------------- Marcador ----------------
    function renderScoreboard(data) {
        const winScore = data.win_score || 10;
        if (winScoreLabel) winScoreLabel.textContent = winScore;
        if (!scoreboard) return;
        scoreboard.innerHTML = "";

        data.players.forEach((p, i) => {
            const isMe = p.username === username;

            if (isMe) {
                if (scoreDisplay) scoreDisplay.textContent = p.score;
                if (streakDisplay) streakDisplay.textContent = p.streak;
            }

            const row = document.createElement("li");
            row.className = "bg-[#0b0705] border rounded-lg p-2 text-xs " +
                (isMe ? "border-amber-400/60" : "border-[#b39258]/20") +
                (p.connected ? "" : " opacity-50");

            const top = document.createElement("div");
            top.className = "flex justify-between items-center mb-1";

            const name = document.createElement("span");
            name.className = "font-medium text-amber-100";
            const medal = ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
            const status = !p.connected ? " 🔌" : (p.answered ? " ✔" : "");
            name.textContent = `${medal} ${p.username}${isMe ? " (tú)" : ""}${status}`;

            const pts = document.createElement("span");
            pts.className = "font-bold text-emerald-400";
            pts.textContent = `${p.score}` + (p.streak > 1 ? `  🔥${p.streak}` : "");

            top.appendChild(name);
            top.appendChild(pts);

            const barWrap = document.createElement("div");
            barWrap.className = "w-full bg-[#140e09] h-1.5 rounded-full overflow-hidden";
            const bar = document.createElement("div");
            bar.className = (isMe ? "bg-amber-400" : "bg-emerald-600") + " h-full transition-all duration-500";
            bar.style.width = `${Math.min(100, (p.score / winScore) * 100)}%`;
            barWrap.appendChild(bar);

            row.appendChild(top);
            row.appendChild(barWrap);
            scoreboard.appendChild(row);
        });
    }

    // ---------------- Fin de partida ----------------
    function handleGameOver(data) {
        gameEnded = true;
        phase = "reveal";
        lockOptions();

        if (endWinner) endWinner.textContent = `El ganador es ${data.winner}`;
        if (endRanking) {
            endRanking.innerHTML = "";
            (data.ranking || []).forEach((p, i) => {
                const li = document.createElement("li");
                li.className = "flex justify-between text-sm py-1";
                const a = document.createElement("span");
                a.textContent = `${["🥇", "🥈", "🥉"][i] || (i + 1) + "."} ${p.username}`;
                const b = document.createElement("span");
                b.className = "font-bold text-emerald-400";
                b.textContent = p.score;
                li.appendChild(a);
                li.appendChild(b);
                endRanking.appendChild(li);
            });
        }
        if (endOverlay) endOverlay.classList.remove("hidden");

        let left = 6;
        const t = setInterval(() => {
            left--;
            if (endCountdown) endCountdown.textContent = left;
            if (left <= 0) {
                clearInterval(t);
                // Todos vuelven al MISMO lobby (antes cada uno iba a una sala aleatoria distinta)
                window.location.href = `lobby.html?room=${encodeURIComponent(roomId)}`;
            }
        }, 1000);
        if (ws) ws.close();
    }

    connectGameWebSocket();
});