const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsList = document.getElementById('resultsList');

async function realizarBusqueda() {
    const query = searchInput.value.trim();
    if (query.length < 2) {
        resultsList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">Escribe al menos 2 caracteres...</p>`;
        return;
    }

    try {
        const response = await fetch(`http://localhost:8000/api/cards/filter?name=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                resultsList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">No se encontraron cartas.</p>`;
                return;
            }
            throw new Error('Error al consultar la base de datos');
        }

        const cards = await response.json();
        
        resultsList.innerHTML = '';
        cards.forEach(card => {
            const item = document.createElement('div');
            item.className = 'result-item';
            item.innerHTML = `
                <div>
                    <strong>${card.name}</strong><br>
                    <span style="color: var(--text-muted);">${card.type_line || 'Sin tipo'}</span>
                </div>
                <button class="action-btn" onclick="eliminarCarta('${card.scryfall_id}')">Eliminar</button>
            `;
            resultsList.appendChild(item);
        });

    } catch (error) {
        console.error("Error:", error);
        resultsList.innerHTML = `<p style="color: #ef4444; font-size: 0.9rem;">Error de conexión con el servidor.</p>`;
    }
}

searchBtn.addEventListener('click', realizarBusqueda);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') realizarBusqueda();
});

function eliminarCarta(id) {
    alert(`Próximamente: eliminar carta con ID ${id}`);
}

// Funcionalidad para añadir carta manualmente
const addNameInput = document.getElementById('addNameInput');
const addTypeInput = document.getElementById('addTypeInput');
const addCardBtn = document.getElementById('addCardBtn');

addCardBtn.addEventListener('click', async () => {
    const name = addNameInput.value.trim();
    const type_line = addTypeInput.value.trim();

    if (!name) {
        alert("El nombre de la carta es obligatorio.");
        return;
    }

    try {
        // Preparando el envío al backend (crearemos el endpoint si hace falta o usamos el modelo)
        const response = await fetch(`http://localhost:8000/api/cards/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                type_line: type_line || "Card",
                rarity: "common"
            })
        });

        if (!response.ok) {
            throw new Error('Error al guardar la carta');
        }

        alert("¡Carta añadida con éxito!");
        addNameInput.value = '';
        addTypeInput.value = '';
        
        // Refrescamos la búsqueda si había algo escrito
        if (searchInput.value.trim().length >= 2) {
            realizarBusqueda();
        }

    } catch (error) {
        console.error("Error:", error);
        alert("Error al conectar con el servidor para guardar la carta.");
    }
});