document.addEventListener("DOMContentLoaded", () => {
    const floatBtn = document.getElementById("chat-float-btn");
    const chatBox = document.getElementById("chat-box");
    const closeBtn = document.getElementById("chat-close-btn");
    const chatForm = document.getElementById("chat-form");
    const chatInput = document.getElementById("chat-input");
    const messagesContainer = document.getElementById("chat-messages");

    // Elementos del buscador de Giphy
    const stickerToggleBtn = document.getElementById("sticker-toggle-btn");
    const stickerPicker = document.getElementById("sticker-picker");
    const giphySearchInput = document.getElementById("giphy-search-input");
    const giphyResults = document.getElementById("giphy-results");

    let ws = null;
    let historyLoaded = false;
    let searchTimeout = null;

    if (!floatBtn || !chatBox) return;

    // Abrir/Cerrar cajón de chat
    floatBtn.addEventListener("click", () => {
        const isFlex = chatBox.style.display === "flex";
        chatBox.style.display = isFlex ? "none" : "flex";
        if (!isFlex) {
            if (!historyLoaded) {
                loadHistory();
                historyLoaded = true;
            }
            connectWebSocket();
            scrollToBottom();
        }
    });

    closeBtn.addEventListener("click", () => {
        chatBox.style.display = "none";
        if (stickerPicker) stickerPicker.classList.add("hidden");
    });

    // ==========================================
    // GESTIÓN DEL BUSCADOR DE GIPHY
    // ==========================================
    if (stickerToggleBtn && stickerPicker && giphySearchInput) {
        stickerToggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            stickerPicker.classList.toggle("hidden");
            if (!stickerPicker.classList.contains("hidden")) {
                giphySearchInput.focus();
            }
        });

        // Evitar que hacer clic dentro del panel lo cierre
        stickerPicker.addEventListener("click", (e) => {
            e.stopPropagation();
        });

        document.addEventListener("click", () => {
            stickerPicker.classList.add("hidden");
        });

        // Búsqueda con debounce al escribir en tiempo real
        giphySearchInput.addEventListener("input", (e) => {
            const query = e.target.value.trim();
            clearTimeout(searchTimeout);

            if (!query) {
                giphyResults.innerHTML = '<span class="text-[10px] text-amber-200/50 col-span-3 text-center py-4">Escribe algo para buscar...</span>';
                return;
            }

            searchTimeout = setTimeout(async () => {
                try {
                    giphyResults.innerHTML = '<span class="text-[10px] text-amber-200 col-span-3 text-center py-4">Buscando...</span>';
                    
                    // API Key personal y soporte de idioma en español
                    const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=uYe3zQDwYQ8ZaDrzjdbgSr5Uwm3TOZ6O&q=${encodeURIComponent(query)}&limit=9&lang=es`);
                    const data = await response.json();

                    if (!data.data || data.data.length === 0) {
                        giphyResults.innerHTML = '<span class="text-[10px] text-amber-200/50 col-span-3 text-center py-4">No se encontraron GIFs</span>';
                        return;
                    }

                    giphyResults.innerHTML = '';
                    data.data.forEach(gif => {
                        const imgUrl = gif.images.fixed_height_small.url;
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'hover:scale-105 transition-transform overflow-hidden rounded cursor-pointer h-16 bg-[#140e09] border border-[#b39258]/30';
                        btn.innerHTML = `<img src="${imgUrl}" class="w-full h-full object-cover" alt="GIF"/>`;
                        
                        btn.addEventListener('click', () => {
                            sendGifMessage(imgUrl);
                        });

                        giphyResults.appendChild(btn);
                    });
                } catch (err) {
                    console.error("Error buscando en Giphy:", err);
                    giphyResults.innerHTML = '<span class="text-[10px] text-red-400 col-span-3 text-center py-4">Error de conexión</span>';
                }
            }, 400);
        });
    }

    // Función específica para enviar un GIF seleccionado
    function sendGifMessage(gifUrl) {
        const userSession = JSON.parse(localStorage.getItem("user_session")) || JSON.parse(localStorage.getItem("cardbinder_user")) || {
            username: "Invitado",
            user_login: "guest",
            badge_type: "civil_homebrewer"
        };

        const payload = {
            username: userSession.username || userSession.user_login || "Invitado",
            user_login: userSession.user_login || "guest",
            badge_type: userSession.badge_type || userSession.badge || "civil_homebrewer",
            message: `<img src="${gifUrl}" class="w-28 h-28 object-cover rounded-lg mt-1 inline-block shadow-md" alt="Sticker"/>`
        };

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
            stickerPicker.classList.add("hidden");
            giphySearchInput.value = "";
            giphyResults.innerHTML = '<span class="text-[10px] text-amber-200/50 col-span-3 text-center py-4">Escribe algo para buscar...</span>';
        } else {
            alert("No estás conectado al servidor de chat en tiempo real.");
        }
    }

    // Cargar historial inicial desde el API REST
    async function loadHistory() {
        try {
            const response = await fetch("http://localhost:8000/api/chat/history");
            const messages = await response.json();
            messages.forEach(msg => appendMessage(msg));
        } catch (error) {
            console.error("Error al cargar historial del chat:", error);
        }
    }

    // Conexión WebSocket
    function connectWebSocket() {
        if (ws && ws.readyState === WebSocket.OPEN) return;

        ws = new WebSocket("ws://localhost:8000/api/chat/ws/chat");

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            appendMessage(data);
        };

        ws.onclose = () => {
            console.log("🔌 Desconectado del chat. Reintentando en 3s...");
            setTimeout(connectWebSocket, 3000);
        };
    }

    // Enviar mensaje de texto normal
    chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;

        const userSession = JSON.parse(localStorage.getItem("user_session")) || JSON.parse(localStorage.getItem("cardbinder_user")) || {
            username: "Invitado",
            user_login: "guest",
            badge_type: "civil_homebrewer"
        };

        const payload = {
            username: userSession.username || userSession.user_login || "Invitado",
            user_login: userSession.user_login || "guest",
            badge_type: userSession.badge_type || userSession.badge || "civil_homebrewer",
            message: text
        };

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
            chatInput.value = "";
        } else {
            alert("No estás conectado al servidor de chat en tiempo real.");
        }
    });

    // Pintar mensaje en pantalla (Soporta texto plano o etiquetas HTML de imágenes para GIFs)
    function appendMessage(data) {
        const msgDiv = document.createElement("div");
        msgDiv.style.background = "#140e09";
        msgDiv.style.padding = "8px 12px";
        msgDiv.style.borderRadius = "8px";
        msgDiv.style.border = "1px solid rgba(179, 146, 88, 0.3)";
        msgDiv.style.marginBottom = "8px";

        const timeStr = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const usernameDisplay = data.username || data.user_login || "Conjurador";
        const loginDisplay = data.user_login ? `(${data.user_login})` : "";
        
        const isHtmlMessage = data.message && data.message.includes('<img');
        const contentRendered = isHtmlMessage ? data.message : escapeHTML(data.message);

        msgDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #fbbf24; margin-bottom: 4px;">
                <strong>👤 ${escapeHTML(usernameDisplay)} ${escapeHTML(loginDisplay)}</strong>
                <span style="color: rgba(254, 243, 199, 0.5);">${timeStr}</span>
            </div>
            <div style="color: #fef3c7; word-break: break-word; font-size: 12px;">${contentRendered}</div>
        `;
        messagesContainer.appendChild(msgDiv);
        scrollToBottom();
    }

    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function escapeHTML(str) {
        if (!str) return "";
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
});