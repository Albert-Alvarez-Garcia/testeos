const containerTypeSelect = document.getElementById('containerType');
const binderFields = document.getElementById('binderFields');
const deckFields = document.getElementById('deckFields');
const boxFields = document.getElementById('boxFields');
const form = document.getElementById('createContainerForm');

// Mostrar u ocultar campos dinámicos según el tipo seleccionado
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

// Envío estructurado de datos al backend con tipologías estrictas
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('containerName').value.trim();
    const baseType = containerTypeSelect.value;
    
    let type = baseType;
    let max_capacity = null;
    let slots_per_page = 9; 
    let total_pages = null;   
    let sideboard_capacity = null;

    if (baseType === 'binder') {
        type = document.getElementById('binderSize').value; // 'binder_s', 'binder_m', 'binder_xl'
        total_pages = parseInt(document.getElementById('binderPages').value) || 40;
        
        if (type === 'binder_s') {
            slots_per_page = 4;
        } else if (type === 'binder_xl' || type === 'binder_l') {
            slots_per_page = 12;
        } else {
            slots_per_page = 9; // binder_m por defecto
        }

        max_capacity = total_pages * slots_per_page;
    } else if (baseType === 'deck') {
        max_capacity = parseInt(document.getElementById('deckMainCapacity').value) || 60;
        sideboard_capacity = parseInt(document.getElementById('deckSideboardCapacity').value) || 15;
    } else if (baseType === 'box') {
        max_capacity = parseInt(document.getElementById('boxCapacity').value) || 1000;
    }

    try {
        const response = await fetch('http://localhost:8000/api/containers/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name, 
                type, 
                max_capacity, 
                slots_per_page,   
                total_pages,      
                sideboard_capacity 
            })
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
        alert("Hubo un error al crear el contenedor en el servidor.");
    }
});