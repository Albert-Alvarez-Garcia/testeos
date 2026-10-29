/* lobby.js · Sala de espera: jugadores, configuración del host, chat y arranque (lobby.html) */
    document.addEventListener("DOMContentLoaded", () => {
        const API_HOST = location.host;

        const roomStatus = document.getElementById("room-status");
        const playerCount = document.getElementById("player-count");
        const playersList = document.getElementById("players-list");
        const hostControls = document.getElementById("host-controls");
        const waitingHostMsg = document.getElementById("waiting-host-msg");
        const maxPlayersSelect = document.getElementById("max-players-select");
        const startGameBtn = document.getElementById("start-game-btn");
        const chatMessages = document.getElementById("chat-messages");
        const chatForm = document.getElementById("chat-form");
        const chatInput = document.getElementById("chat-input");
        const leaveRoomBtn = document.getElementById("leave-room-btn");
        const inviteBtn = document.getElementById("invite-btn");

        // ---- Sesión: si no hay usuario guardado, se genera UNA vez y se persiste,
        // para que game.html use exactamente el mismo nombre ----
        let userSession = JSON.parse(localStorage.getItem("user_session")) ||
                          JSON.parse(localStorage.getItem("cardbinder_user"));
        if (!userSession || !userSession.username) {
            userSession = { username: "Conjurador_" + Math.floor(Math.random() * 1000) };
        }
        const urlParams = new URLSearchParams(window.location.search);
        // ?user=Ana permite probar varios jugadores en el mismo navegador (se recuerda por pestaña)
        if (urlParams.get("user")) sessionStorage.setItem("cb_tab_user", urlParams.get("user"));
        const tabUser = sessionStorage.getItem("cb_tab_user");
        if (!tabUser) localStorage.setItem("user_session", JSON.stringify({ username: userSession.username }));
        const username = tabUser || userSession.username;

        const roomId = urlParams.get("room") || "sala-1";
        document.getElementById("room-name-display").textContent = roomId;

        let ws = null;
        let isHost = false;
        let leaving = false;          // salida voluntaria o paso a la partida: no reconectar
        let reconnectTimer = null;
        let knownPlayers = null;      // para anunciar entradas/salidas en el chat

        // ---------------- WebSocket con reconexión ----------------
        function connectLobbyWebSocket() {
            ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${API_HOST}/api/game/ws/lobby/${encodeURIComponent(roomId)}?username=${encodeURIComponent(username)}`);

            ws.onopen = () => {
                roomStatus.textContent = "🟢 Conectado al vestíbulo";
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.type === "LOBBY_STATE") {
                    updateLobbyUI(data.players, data.max_players);
                } else if (data.type === "CHAT_MESSAGE") {
                    appendChatMessage(data.username, data.message);
                } else if (data.type === "START_GAME") {
                    leaving = true;
                    window.location.href = `game.html?room=${encodeURIComponent(roomId)}`;
                }
            };

            ws.onclose = () => {
                if (leaving) return;
                roomStatus.textContent = "🔴 Desconectado. Reconectando...";
                clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(connectLobbyWebSocket, 2000);
            };
        }

        function send(payload) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(payload));
                return true;
            }
            return false;
        }

        // ---------------- UI ----------------
        function updateLobbyUI(players, maxPlayers) {
            playerCount.textContent = `${players.length}/${maxPlayers}`;
            playersList.innerHTML = "";
            isHost = false;

            if (players.length === 0) {
                const li = document.createElement("li");
                li.className = "text-xs text-[rgb(var(--c-amber-200)/0.5)] italic";
                li.textContent = "Esperando jugadores...";
                playersList.appendChild(li);
            }

            players.forEach(p => {
                const isMe = p.username === username;

                const li = document.createElement("li");
                li.className = "flex justify-between items-center bg-[rgb(var(--c-ink))] border p-2.5 rounded-lg text-xs " +
                    (isMe ? "border-[rgb(var(--c-amber-400)/0.5)]" : "border-[rgb(var(--c-gold)/0.2)]");

                const nameSpan = document.createElement("span");
                nameSpan.className = "font-medium text-[rgb(var(--c-amber-100))] flex items-center gap-1.5";
                nameSpan.textContent = p.username + (isMe ? " (tú)" : "");

                if (p.is_host) {
                    const hostBadge = document.createElement("span");
                    hostBadge.className = "bg-[rgb(var(--c-amber-500)/0.2)] text-[rgb(var(--c-amber-400))] text-[10px] px-1.5 py-0.5 rounded font-bold border border-[rgb(var(--c-amber-500)/0.3)]";
                    hostBadge.textContent = "HOST";
                    nameSpan.appendChild(hostBadge);
                }

                li.appendChild(nameSpan);
                playersList.appendChild(li);

                if (isMe && p.is_host) isHost = true;
            });

            // Avisos de entrada/salida (no en la primera carga)
            const names = new Set(players.map(p => p.username));
            if (knownPlayers) {
                names.forEach(n => { if (!knownPlayers.has(n) && n !== username) appendSystemMessage(`${n} se ha unido a la sala.`); });
                knownPlayers.forEach(n => { if (!names.has(n)) appendSystemMessage(`${n} ha abandonado la sala.`); });
            }
            knownPlayers = names;

            // Controles del Host
            if (isHost) {
                hostControls.classList.remove("hidden");
                waitingHostMsg.classList.add("hidden");
                maxPlayersSelect.value = maxPlayers;
                // No permitir un máximo menor que los jugadores ya presentes
                Array.from(maxPlayersSelect.options).forEach(opt => {
                    opt.disabled = parseInt(opt.value) < players.length;
                });
            } else {
                hostControls.classList.add("hidden");
                waitingHostMsg.classList.remove("hidden");
            }
        }

        function appendChatMessage(author, message) {
            const isMe = author === username;
            const div = document.createElement("div");

            const strong = document.createElement("strong");
            strong.className = isMe ? "text-emerald-400" : "text-[rgb(var(--c-amber-400))]";
            strong.textContent = `${author}: `;

            const span = document.createElement("span");
            span.className = "text-[rgb(var(--c-amber-100)/0.9)] break-words";
            span.textContent = message;   // textContent: sin inyección de HTML

            div.appendChild(strong);
            div.appendChild(span);
            chatMessages.appendChild(div);
            trimChat();
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        // Se conservan solo los últimos 200 mensajes en pantalla
        function trimChat() {
            while (chatMessages.children.length > 200) chatMessages.removeChild(chatMessages.firstChild);
        }

        function appendSystemMessage(text) {
            const div = document.createElement("div");
            div.className = "text-[rgb(var(--c-amber-200)/0.4)] italic";
            div.textContent = `— ${text}`;
            chatMessages.appendChild(div);
            trimChat();
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        // ---------------- Eventos ----------------
        chatForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (!text) return;
            if (send({ action: "CHAT_MESSAGE", username, message: text })) {
                chatInput.value = "";
            }
        });

        maxPlayersSelect.addEventListener("change", () => {
            if (isHost) send({ action: "UPDATE_CONFIG", max_players: parseInt(maxPlayersSelect.value) });
        });

        startGameBtn.addEventListener("click", () => {
            if (!isHost) return;
            if (send({ action: "START_GAME" })) {
                startGameBtn.disabled = true;
                startGameBtn.textContent = "Iniciando...";
                // Si por algún motivo no llega la orden de arranque, se reactiva
                setTimeout(() => {
                    startGameBtn.disabled = false;
                    startGameBtn.textContent = "🚀 Comenzar Partida";
                }, 4000);
            }
        });

        leaveRoomBtn.addEventListener("click", () => {
            leaving = true;
            clearTimeout(reconnectTimer);
            if (ws) ws.close();   // el backend reasigna host o desmonta la sala si queda vacía
            window.location.href = "rooms.html";
        });

        // Enlace de invitación a esta sala
        inviteBtn.addEventListener("click", async () => {
            const link = `${location.origin}${location.pathname}?room=${encodeURIComponent(roomId)}`;
            let ok = false;
            try {
                await navigator.clipboard.writeText(link);
                ok = true;
            } catch (_) {
                ok = false;
            }
            const original = "🔗 Invitar";
            inviteBtn.textContent = ok ? "✅ ¡Enlace copiado!" : "⚠️ No se pudo copiar";
            setTimeout(() => { inviteBtn.textContent = original; }, 1800);
        });

        window.addEventListener('pagehide', () => { leaving = true; clearTimeout(reconnectTimer); if (ws) ws.close(); });
        window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload(); });
        connectLobbyWebSocket();
    });
