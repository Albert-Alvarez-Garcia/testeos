/* rooms.js · Selector de salas: listado, creación y unión (rooms.html) */
    document.addEventListener("DOMContentLoaded", () => {
        const roomsList = document.getElementById("rooms-list");
        const createRoomForm = document.getElementById("create-room-form");
        const usernameInput = document.getElementById("username-input");
        const roomNameInput = document.getElementById("room-name-input");
        const refreshBtn = document.getElementById("refresh-btn");

        // Cargar usuario guardado previamente si existe
        const readSession = (key) => {
            try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
        };
        const savedSession = readSession("cardbinder_user") || readSession("user_session");
        if (savedSession && savedSession.username) {
            usernameInput.value = savedSession.username;
            if (readSession("cardbinder_user")) {
                usernameInput.readOnly = true;
                usernameInput.title = "Tu nombre de perfil se usa en las partidas.";
                document.getElementById("player-name-hint").textContent = "Usamos el nombre de tu perfil en las partidas.";
            }
        } else {
            usernameInput.value = "Conjurador_" + Math.floor(Math.random() * 1000);
        }

        let refreshing = false;
        async function fetchActiveRooms() {
            if (refreshing) return;
            refreshing = true;
            roomsList.setAttribute("aria-busy", "true");
            try {
                const response = await fetch("/api/game/rooms", { headers: { Accept: "application/json" } });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                renderRooms(data.rooms);
            } catch (error) {
                console.error("Error al obtener las salas:", error);
                const errorState = document.createElement("div");
                errorState.className = "rooms-empty rooms-error";
                errorState.innerHTML = `<span class="rooms-empty-icon" aria-hidden="true">!</span><strong>No se pudieron cargar las salas</strong><span>Comprueba tu conexión e inténtalo de nuevo.</span>`;
                roomsList.replaceChildren(errorState);
            } finally {
                refreshing = false;
                roomsList.setAttribute("aria-busy", "false");
            }
        }

        function renderRooms(rooms) {
            roomsList.replaceChildren();
            if (!rooms || rooms.length === 0) {
                const empty = document.createElement("div");
                empty.className = "rooms-empty";
                empty.innerHTML = `<span class="rooms-empty-icon" aria-hidden="true">✧</span><strong>No hay salas abiertas ahora</strong><span>Crea una sala y anima a tus amigos a unirse.</span>`;
                roomsList.appendChild(empty);
                return;
            }

            rooms.forEach(room => {
                const card = document.createElement("article");
                card.className = "room-card";
                const info = document.createElement("div");
                info.className = "room-card-info";
                const titleRow = document.createElement("div");
                titleRow.className = "room-title-row";
                const title = document.createElement("h3");
                title.className = "room-card-title";
                title.textContent = room.room_id || "Sala sin nombre";
                const state = document.createElement("span");
                state.className = `room-state${room.in_game ? " is-playing" : " is-waiting"}`;
                state.textContent = room.in_game ? "En partida" : "Esperando jugadores";
                titleRow.append(title, state);
                const details = document.createElement("p");
                details.className = "room-card-details";
                details.textContent = `${room.current_players ?? 0} de ${room.max_players ?? 0} jugadores`;
                info.append(titleRow, details);
                if (room.in_game || room.spectators) {
                    const spectatorInfo = document.createElement("p");
                    spectatorInfo.className = "room-spectators";
                    spectatorInfo.textContent = `${room.in_game ? `Ronda ${room.round || 1} · ` : ""}${room.spectators || 0} espectadores`;
                    info.appendChild(spectatorInfo);
                }
                const joinBtn = document.createElement("button");
                joinBtn.className = "room-action-btn";
                joinBtn.type = "button";
                joinBtn.textContent = room.in_game ? "Ver partida →" : "Entrar al vestíbulo →";
                
                joinBtn.addEventListener("click", () => {
                    const username = usernameInput.value.trim() || "Conjurador";
                    localStorage.setItem("user_session", JSON.stringify({ username }));
                    window.location.href = room.in_game
                        ? `game.html?room=${encodeURIComponent(room.room_id)}&spectate=1`
                        : `lobby.html?room=${encodeURIComponent(room.room_id)}`;
                });

                card.append(info, joinBtn);
                roomsList.appendChild(card);
            });
        }

        createRoomForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const username = usernameInput.value.trim();
            const roomName = roomNameInput.value.trim();
            if (!username || !roomName) return;

            localStorage.setItem("user_session", JSON.stringify({ username }));
            window.location.href = `lobby.html?room=${encodeURIComponent(roomName)}`;
        });

        refreshBtn.addEventListener("click", fetchActiveRooms);

        // Cargar salas al iniciar y actualizar cada 5 segundos automáticamente
        fetchActiveRooms();
        setInterval(fetchActiveRooms, 5000);
    });
