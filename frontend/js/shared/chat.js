/* chat.js · Chat flotante con GIFs (Giphy). Estilos: .chat-* en css/portal.css */
document.addEventListener("DOMContentLoaded", () => {
    const floatBtn = document.getElementById("chat-float-btn");
    const chatBox = document.getElementById("chat-box");
    const closeBtn = document.getElementById("chat-close-btn");
    const chatForm = document.getElementById("chat-form");
    const chatInput = document.getElementById("chat-input");
    const messagesContainer = document.getElementById("chat-messages");

    // Buscador de Giphy
    const stickerToggleBtn = document.getElementById("sticker-toggle-btn");
    const stickerPicker = document.getElementById("sticker-picker");
    const giphySearchInput = document.getElementById("giphy-search-input");
    const giphyResults = document.getElementById("giphy-results");

    let ws = null;
    let historyLoaded = false;
    let searchTimeout = null;

    if (!floatBtn || !chatBox) return;

    // ---------- Utilidades ----------
    const GUEST = { username: "Invitado", user_login: "guest", badge_type: "civil_homebrewer" };

    function getSession() {
        try {
            return JSON.parse(localStorage.getItem("user_session"))
                || JSON.parse(localStorage.getItem("cardbinder_user")) || GUEST;
        } catch (e) { return GUEST; }
    }

    function buildPayload(message) {
        const s = getSession();
        return {
            username: s.username || s.user_login || "Invitado",
            user_login: s.user_login || "guest",
            badge_type: s.badge_type || s.badge || "civil_homebrewer",
            message
        };
    }

    function setHint(text, mod) {
        const span = document.createElement("span");
        span.className = "chat-hint" + (mod ? " is-" + mod : "");
        span.textContent = text;
        giphyResults.replaceChildren(span);
    }

    // Solo se aceptan imágenes servidas por Giphy (el mensaje llega como "<img src=...>")
    function giphyUrlFrom(message) {
        const m = /<img[^>]*\ssrc="(https:\/\/[^"]+)"/.exec(message || "");
        if (!m) return null;
        try {
            const host = new URL(m[1]).hostname;
            return host === "giphy.com" || host.endsWith(".giphy.com") ? m[1] : null;
        } catch (e) { return null; }
    }

    // ---------- Abrir / cerrar ----------
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

    // ---------- Buscador de GIFs ----------
    if (stickerToggleBtn && stickerPicker && giphySearchInput) {
        stickerToggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            stickerPicker.classList.toggle("hidden");
            if (!stickerPicker.classList.contains("hidden")) giphySearchInput.focus();
        });

        stickerPicker.addEventListener("click", (e) => e.stopPropagation());
        document.addEventListener("click", () => stickerPicker.classList.add("hidden"));

        giphySearchInput.addEventListener("input", (e) => {
            const query = e.target.value.trim();
            clearTimeout(searchTimeout);

            if (!query) { setHint("Escribe algo para buscar..."); return; }

            searchTimeout = setTimeout(async () => {
                try {
                    setHint("Buscando...", "active");
                    // API Key personal y soporte de idioma en español
                    const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=uYe3zQDwYQ8ZaDrzjdbgSr5Uwm3TOZ6O&q=${encodeURIComponent(query)}&limit=9&lang=es`);
                    const data = await response.json();

                    if (!data.data || data.data.length === 0) { setHint("No se encontraron GIFs"); return; }

                    giphyResults.replaceChildren();
                    data.data.forEach(gif => {
                        const imgUrl = gif.images.fixed_height_small.url;
                        const btn = document.createElement("button");
                        btn.type = "button";
                        btn.className = "chat-gif-btn";
                        const img = document.createElement("img");
                        img.src = imgUrl;
                        img.alt = "GIF";
                        btn.appendChild(img);
                        btn.addEventListener("click", () => sendGifMessage(imgUrl));
                        giphyResults.appendChild(btn);
                    });
                } catch (err) {
                    console.error("Error buscando en Giphy:", err);
                    setHint("Error de conexión", "error");
                }
            }, 400);
        });
    }

    // ---------- Enviar ----------
    function send(message, onSent) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(buildPayload(message)));
            if (onSent) onSent();
        } else {
            alert("No estás conectado al servidor de chat en tiempo real.");
        }
    }

    function sendGifMessage(gifUrl) {
        send(`<img src="${gifUrl}" class="chat-gif" alt="Sticker"/>`, () => {
            stickerPicker.classList.add("hidden");
            giphySearchInput.value = "";
            setHint("Escribe algo para buscar...");
        });
    }

    chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;
        send(text, () => { chatInput.value = ""; });
    });

    // ---------- Historial y WebSocket ----------
    async function loadHistory() {
        try {
            const response = await fetch("/api/chat/history");
            const messages = await response.json();
            messages.forEach(appendMessage);
        } catch (error) {
            console.error("Error al cargar historial del chat:", error);
        }
    }

    function connectWebSocket() {
        if (ws && ws.readyState === WebSocket.OPEN) return;

        ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/chat/ws/chat");

        ws.onmessage = (event) => appendMessage(JSON.parse(event.data));

        ws.onclose = () => {
            console.log("🔌 Desconectado del chat. Reintentando en 3s...");
            setTimeout(connectWebSocket, 3000);
        };
    }

    // ---------- Pintar mensajes (todo con textContent: nunca se inyecta HTML del servidor) ----------
    function appendMessage(data) {
        const when = data.created_at ? new Date(data.created_at) : new Date();
        const timeStr = (isNaN(when) ? new Date() : when).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const name = data.username || data.user_login || "Conjurador";
        const login = data.user_login ? `(${data.user_login})` : "";

        const msg = document.createElement("div");
        msg.className = "chat-msg";

        const head = document.createElement("div");
        head.className = "chat-msg-head";
        const who = document.createElement("strong");
        who.textContent = `👤 ${name} ${login}`;
        const time = document.createElement("span");
        time.className = "chat-msg-time";
        time.textContent = timeStr;
        head.append(who, time);

        const body = document.createElement("div");
        body.className = "chat-msg-body";
        const gif = giphyUrlFrom(data.message);
        if (gif) {
            const img = document.createElement("img");
            img.className = "chat-gif";
            img.src = gif;
            img.alt = "Sticker";
            body.appendChild(img);
        } else {
            body.textContent = data.message || "";
        }

        msg.append(head, body);
        messagesContainer.appendChild(msg);
        scrollToBottom();
    }

    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
});