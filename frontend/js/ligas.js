/**
 * Manejo global de ligas para el frontend.
 * - Obtiene la lista de ligas activas del backend.
 * - Mantiene el estado global de window.currentLigaId.
 * - Renderiza un selector (<select>) si se le proporciona un contenedor.
 */

window.currentLigaId = localStorage.getItem('currentLigaId') ? parseInt(localStorage.getItem('currentLigaId')) : 1;

async function fetchLigasActivas() {
    try {
        const response = await api.get('/ligas/');
        if (response && response.data && response.data.ligas) {
            return response.data.ligas;
        }
        return [];
    } catch (e) {
        console.error("Error al obtener ligas activas:", e);
        return [];
    }
}

async function initLigaSelector(selectorId, onLigaChange) {
    const selector = document.getElementById(selectorId);
    if (!selector) return;

    const ligas = await fetchLigasActivas();
    if (ligas.length === 0) return;

    selector.innerHTML = '';
    
    // Validar si la currentLigaId sigue siendo válida, sino tomar la primera
    const validLiga = ligas.find(l => l.id === window.currentLigaId);
    if (!validLiga && ligas.length > 0) {
        window.currentLigaId = ligas[0].id;
        localStorage.setItem('currentLigaId', window.currentLigaId);
    }

    ligas.forEach(liga => {
        const option = document.createElement('option');
        option.value = liga.id;
        option.textContent = liga.nombre;
        if (liga.id === window.currentLigaId) {
            option.selected = true;
        }
        selector.appendChild(option);
    });

    selector.addEventListener('change', (e) => {
        const newId = parseInt(e.target.value);
        if (newId !== window.currentLigaId) {
            window.currentLigaId = newId;
            localStorage.setItem('currentLigaId', window.currentLigaId);
            
            // Actualizar el nombre de la liga en el sidebar si existe
            const sidebarLigaVal = document.getElementById('sidebar-liga-val');
            if (sidebarLigaVal) {
                const selectedText = e.target.options[e.target.selectedIndex].textContent;
                sidebarLigaVal.textContent = selectedText;
            }

            if (typeof onLigaChange === 'function') {
                onLigaChange();
            } else {
                // Default action: reload page to refresh data
                window.location.reload();
            }
        }
    });

    // Set initial sidebar text if exists
    const sidebarLigaVal = document.getElementById('sidebar-liga-val');
    if (sidebarLigaVal) {
        const selectedOption = selector.querySelector(`option[value="${window.currentLigaId}"]`);
        if (selectedOption) {
            sidebarLigaVal.textContent = selectedOption.textContent;
        }
    }
}
