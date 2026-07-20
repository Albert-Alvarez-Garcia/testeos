const containerTypeSelect = document.getElementById('containerType');
const binderFields = document.getElementById('binderFields');
const deckFields = document.getElementById('deckFields');
const boxFields = document.getElementById('boxFields');
const form = document.getElementById('createContainerForm');

// Mostrar u ocultar campos según el tipo seleccionado
containerTypeSelect.addEventListener('change', (e) => {
    const type = e.target.value;
    
    binderFields.classList.remove('active');
    deckFields.classList.remove('active');
    boxFields.classList.remove('active');

    if (type === 'binder') {
        binderFields.classList.add('active');
    } else if (type === 'deck') {
        deckFields.classList.add('active');
    } else if (type === 'box') {
        boxFields.classList.add('active');
    }
});

// Enviar datos al backend
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('containerName').value.trim();
    const type = containerTypeSelect.value;
    
    let max_capacity = null;
    let sideboard_capacity = null;

    if (type === 'binder') {
        max_capacity = parseInt(document.getElementById('binderCapacity').value) || 360;
    } else if (type === 'deck') {
        max_capacity = parseInt(document.getElementById('deckMainCapacity').value) || 60;
        sideboard_capacity = parseInt(document.getElementById('deckSideboardCapacity').value) || 15;
    } else if (type === 'box') {
        max_capacity = parseInt(document.getElementById('boxCapacity').value) || 1000;
    }

    try {
        const response = await fetch('http://localhost:8000/api/containers/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, max_capacity, sideboard_capacity })
        });

        if (!response.ok) {
            throw new Error('Error al registrar el contenedor');
        }

        const result = await response.json();
        alert(`¡Contenedor "${result.name}" creado con éxito!`);
        form.reset();
        binderFields.classList.remove('active');
        deckFields.classList.remove('active');
        boxFields.classList.remove('active');

    } catch (error) {
        console.error("Error:", error);
        alert("Hubo un error al crear el contenedor.");
    }
});