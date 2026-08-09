document.addEventListener("DOMContentLoaded", () => {
    const floatBtn = document.getElementById("chat-float-btn");
    const chatBox = document.getElementById("chat-box");
    const closeBtn = document.getElementById("chat-close-btn");
    const chatForm = document.getElementById("chat-form");
    const chatInput = document.getElementById("chat-input");
    const messagesContainer = document.getElementById("chat-messages");

    let ws = null;
    let historyLoaded = false;

    // Abrir/Cerrar cajón de chat
    floatBtn.addEventListener("click", () => {
        chatBox.style.display = chatBox.style.display === "flex" ? "none" : "flex";
        if (chatBox.style.display === "flex") {
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
    });

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

        // Nota: Asegúrate de usar ws:// o wss:// dependiendo de si estás en local o producción
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

    // Enviar mensaje
    chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;

        // Recuperar datos de usuario guardados en el localStorage (por ejemplo, tras el login de 42)
        const userSession = JSON.parse(localStorage.getItem("user_session")) || {
            username: "Invitado",
            user_login: "guest",
            badge_type: "civil_homebrewer"
        };

        const payload = {
            username: userSession.username,
            user_login: userSession.user_login,
            badge_type: userSession.badge_type,
            message: text
        };

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
            chatInput.value = "";
        } else {
            alert("No estás conectado al servidor de chat en tiempo real.");
        }
    });

    // Pintar mensaje en pantalla
    function appendMessage(data) {
        const msgDiv = document.createElement("div");
        msgDiv.style.background = "white";
        msgDiv.style.padding = "6px 10px";
        msgDiv.style.borderRadius = "6px";
        msgDiv.style.border = "1px solid #e2e8f0";

        const timeStr = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        msgDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-bottom: 2px;">
                <strong>${data.username} (${data.user_login})</strong>
                <span>${timeStr}</span>
            </div>
            <div style="color: #1e293b; word-break: break-word;">${escapeHTML(data.message)}</div>
        `;
        messagesContainer.appendChild(msgDiv);
        scrollToBottom();
    }

    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
});