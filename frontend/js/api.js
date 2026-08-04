/**
 * api.js — Cliente HTTP centralizado
 * Todos los fetch a la API pasan por este módulo.
 * Gestiona automáticamente las cookies JWT (credentials: 'include')
 * y el header X-CSRF-Token (doble-submit pattern).
 */

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
// Usamos URL relativa en producción para aprovechar el Rewrite de Vercel (vercel.json)
const API_BASE = isLocalhost ? 'http://localhost:5000/api' : '/api';


/**
 * Obtiene el token CSRF de la cookie csrf_access_token (no HttpOnly, legible por JS).
 * El servidor la establece junto con la cookie JWT al hacer login.
 */
function getCsrfToken() {
  const match = document.cookie.match(/csrf_access_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Función base de fetch.
 * @param {string} endpoint - Path relativo, ej: '/auth/login'
 * @param {object} options  - Opciones de fetch (method, body, etc.)
 * @returns {Promise<{data: any, status: number}>}
 */
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const csrfToken = getCsrfToken();

  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Agregar CSRF token para métodos que mutan estado (POST, PUT, PATCH, DELETE)
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (csrfToken && mutatingMethods.includes((options.method || 'GET').toUpperCase())) {
    defaultHeaders['X-CSRF-TOKEN'] = csrfToken;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...defaultHeaders, ...(options.headers || {}) },
      credentials: 'include', // Envía cookies HttpOnly automáticamente
    });

    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    }

    // Si el token expiró, redirigir al login
    if (response.status === 401) {
      const currentPage = window.location.pathname;
      if (!currentPage.includes('index.html') && currentPage !== '/') {
        sessionStorage.setItem('quiniela_redirect', currentPage);
        window.location.href = '/index.html';
      }
    }

    return { data, status: response.status, ok: response.ok };
  } catch (error) {
    console.error('[API Error]', error);
    return {
      data: { error: 'Error de conexión. Verifica tu red e inténtalo nuevamente.' },
      status: 0,
      ok: false,
    };
  }
}

/** Métodos de conveniencia */
const api = {
  get: (endpoint) => apiFetch(endpoint, { method: 'GET' }),
  post: (endpoint, body) => apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => apiFetch(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => apiFetch(endpoint, { method: 'DELETE' }),
};

/**
 * Muestra un toast de notificación.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration ms
 */
function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-msg">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Formatea una fecha ISO a texto legible en español.
 * @param {string} isoString
 * @returns {string}
 */
function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formatea duración restante hasta una fecha ISO.
 * @param {string} isoString
 * @returns {string}
 */
function timeUntil(isoString) {
  const diff = new Date(isoString) - new Date();
  if (diff <= 0) return 'Plazo vencido';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

// Exportar para uso en otros módulos (ES modules o script global)
window.api = api;
window.showToast = showToast;
window.formatDate = formatDate;
window.timeUntil = timeUntil;

/**
 * Muestra el modal de reglas de puntuación.
 */
function showRulesModal() {
  let overlay = document.getElementById('rules-modal-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'rules-modal-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;backdrop-filter:blur(3px);';
  
  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--color-surface);border-radius:1rem;padding:2rem;width:100%;max-width:500px;box-shadow:0 10px 25px rgba(0,0,0,0.5);color:var(--color-text);max-height:90vh;overflow-y:auto;';
  
  modal.innerHTML = `
    <h3 style="margin-top:0;margin-bottom:1.5rem;font-size:1.5rem;color:var(--color-text);display:flex;align-items:center;gap:10px;">
      🏆 Reglas de Puntuación
    </h3>
    <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:1.2rem;">
      <li style="background:rgba(255,255,255,0.05);padding:1rem;border-radius:0.5rem;border-left:4px solid var(--color-gold);">
        <strong>🎯 Marcador exacto (5 pts)</strong><br>
        <span style="font-size:0.9rem;color:var(--color-text-secondary)">Acertaste exactamente los goles.</span><br>
        <em style="font-size:0.85rem;color:#888;">Ej: Pronóstico 2-1 | Real 2-1</em>
      </li>
      <li style="background:rgba(255,255,255,0.05);padding:1rem;border-radius:0.5rem;border-left:4px solid var(--color-success);">
        <strong>⚡ Tendencia + 1 gol (4 pts)</strong><br>
        <span style="font-size:0.9rem;color:var(--color-text-secondary)">Acertaste quién gana (o empate) y los goles de un equipo.</span><br>
        <em style="font-size:0.85rem;color:#888;">Ej: Pronóstico 2-0 | Real 2-1 (Gana Local y local hizo 2)</em>
      </li>
      <li style="background:rgba(255,255,255,0.05);padding:1rem;border-radius:0.5rem;border-left:4px solid var(--color-info);">
        <strong>✅ Solo tendencia (3 pts)</strong><br>
        <span style="font-size:0.9rem;color:var(--color-text-secondary)">Acertaste quién gana o si hay empate, pero fallaste los goles.</span><br>
        <em style="font-size:0.85rem;color:#888;">Ej: Pronóstico 1-0 | Real 3-1</em>
      </li>
      <li style="background:rgba(255,255,255,0.05);padding:1rem;border-radius:0.5rem;border-left:4px solid var(--color-warning);">
        <strong>⚠️ Solo 1 gol (1 pt)</strong><br>
        <span style="font-size:0.9rem;color:var(--color-text-secondary)">Fallaste el ganador, pero acertaste los goles de un equipo.</span><br>
        <em style="font-size:0.85rem;color:#888;">Ej: Pronóstico 1-1 | Real 1-2 (Fallas empate, pero local hizo 1)</em>
      </li>
      <li style="background:rgba(255,255,255,0.05);padding:1rem;border-radius:0.5rem;border-left:4px solid var(--color-error);">
        <strong>❌ Sin acierto (0 pts)</strong><br>
        <span style="font-size:0.9rem;color:var(--color-text-secondary)">Nada coincide.</span>
      </li>
    </ul>
    <div style="margin-top:2rem;text-align:right;">
      <button id="close-rules-btn" class="btn" style="background:var(--color-primary);color:#fff;border:none;border-radius:0.5rem;padding:0.6rem 1.5rem;cursor:pointer;font-weight:600;">Entendido</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close logic
  const closeBtn = document.getElementById('close-rules-btn');
  closeBtn.onclick = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
}
window.showRulesModal = showRulesModal;
