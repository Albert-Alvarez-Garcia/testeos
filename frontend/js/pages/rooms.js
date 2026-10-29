/* rooms.js · Selector de salas: listado, creación y unión (rooms.html) */
    document.addEventListener("DOMContentLoaded", () => {
        const roomsList = document.getElementById("rooms-list");
        const createRoomForm = document.getElementById("create-room-form");
        const usernameInput = document.getElementById("username-input");
        const roomNameInput = document.getElementById("room-name-input");
        const refreshBtn = document.getElementById("refresh-btn");

        const escapeHtml = (v) => String(v ?? '').replace(/[&<>'"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

        // Cargar usuario guardado previamente si existe
        const savedSession = JSON.parse(localStorage.getItem("user_session")) || 
                             JSON.parse(localStorage.getItem("cardbinder_user"));
        if (savedSession && savedSession.username) {
            usernameInput.value = savedSession.username;
        } else {
            usernameInput.value = "Conjurador_" + Math.floor(Math.random() * 1000);
        }

        async function fetchActiveRooms() {
            try {
                const response = await fetch("/api/game/rooms");
                const data = await response.json();
                renderRooms(data.rooms);
            } catch (error) {
                console.error("Error al obtener las salas:", error);
                roomsList.innerHTML = `<div class="text-xs text-red-400 text-center py-4">Error al conectar con el servidor.</div>`;
            }
        }

        function renderRooms(rooms) {
            roomsList.innerHTML = "";
            if (!rooms || rooms.length === 0) {
                roomsList.innerHTML = `<div class="text-xs text-[rgb(var(--c-amber-200)/0.4)] italic text-center py-8">No hay salas abiertas en este momento. ¡Crea una!</div>`;
                return;
            }

            rooms.forEach(room => {
                const div = document.createElement("div");
                div.className = "flex justify-between items-center bg-[rgb(var(--c-ink))] border border-[rgb(var(--c-gold)/0.2)] p-3 rounded-xl text-xs";

                const infoDiv = document.createElement("div");
                // Los nombres de sala los escribe cualquier usuario: se escapan antes de pintarlos
                infoDiv.innerHTML = `
                    <div class="font-bold text-[rgb(var(--c-amber-200))] text-sm mb-0.5">🏛️ ${escapeHtml(room.room_id)}</div>
                    <div class="text-[11px] text-[rgb(var(--c-amber-200)/0.6)]">Ocupación: <span class="text-emerald-400 font-semibold">${escapeHtml(room.current_players)}/${escapeHtml(room.max_players)}</span> jugadores</div>
                `;

                const joinBtn = document.createElement("button");
                joinBtn.className = "bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all cursor-pointer";
                joinBtn.textContent = "Unirse";
                
                joinBtn.addEventListener("click", () => {
                    const username = usernameInput.value.trim() || "Conjurador";
                    localStorage.setItem("user_session", JSON.stringify({ username }));
                    window.location.href = `lobby.html?room=${encodeURIComponent(room.room_id)}`;
                });

                div.appendChild(infoDiv);
                div.appendChild(joinBtn);
                roomsList.appendChild(div);
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
