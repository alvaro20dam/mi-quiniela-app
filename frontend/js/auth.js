/**
 * auth.js — Gestión de autenticación en el frontend.
 * Login, Registro y Logout.
 * Las credenciales nunca se almacenan en localStorage/sessionStorage.
 * La sesión la gestiona la HttpOnly Cookie del servidor.
 */

document.addEventListener('DOMContentLoaded', () => {
  // ── Elementos del DOM ──────────────────────────────────────
  const loginForm    = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const logoutBtn    = document.getElementById('btn-logout');
  const tabLogin     = document.getElementById('tab-login');
  const tabRegister  = document.getElementById('tab-register');
  const loginSection = document.getElementById('section-login');
  const registerSection = document.getElementById('section-register');

  // ── Tab switching ──────────────────────────────────────────
  if (tabLogin && tabRegister) {
    tabLogin.addEventListener('click', () => switchTab('login'));
    tabRegister.addEventListener('click', () => switchTab('register'));
  }

  function switchTab(tab) {
    const isLogin = tab === 'login';
    tabLogin.classList.toggle('btn-primary', isLogin);
    tabLogin.classList.toggle('btn-ghost', !isLogin);
    tabRegister.classList.toggle('btn-primary', !isLogin);
    tabRegister.classList.toggle('btn-ghost', isLogin);
    loginSection.classList.toggle('hidden', !isLogin);
    registerSection.classList.toggle('hidden', isLogin);
  }

  // ── Login ──────────────────────────────────────────────────
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector('[type="submit"]');
      setLoading(btn, true);
      clearAlert('login-alert');

      const email    = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      const { data, status } = await api.post('/auth/login', { email, password });

      setLoading(btn, false);

      if (status === 200 && data.message) {
        showToast('¡Bienvenido de vuelta! 🎉', 'success');
        // Pequeño delay para que el usuario vea el toast
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 600);
      } else {
        showAlert('login-alert', data?.error || 'Error al iniciar sesión.', 'error');
      }
    });
  }

  // ── Registro ───────────────────────────────────────────────
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = registerForm.querySelector('[type="submit"]');
      setLoading(btn, true);
      clearAlert('register-alert');

      const nombre    = document.getElementById('reg-nombre').value.trim();
      const email     = document.getElementById('reg-email').value.trim();
      const password  = document.getElementById('reg-password').value;
      const password2 = document.getElementById('reg-password2').value;

      // Validación frontend (la validación real está en el backend)
      if (password !== password2) {
        showAlert('register-alert', 'Las contraseñas no coinciden.', 'error');
        setLoading(btn, false);
        return;
      }

      if (password.length < 8) {
        showAlert('register-alert', 'La contraseña debe tener al menos 8 caracteres.', 'error');
        setLoading(btn, false);
        return;
      }

      const { data, status } = await api.post('/auth/register', { nombre, email, password });

      setLoading(btn, false);

      if (status === 201) {
        showAlert('register-alert', '✅ ' + data.message, 'success');
        // Limpiar el formulario y cambiar al login
        registerForm.reset();
        setTimeout(() => switchTab('login'), 2000);
      } else {
        showAlert('register-alert', data?.error || 'Error en el registro.', 'error');
      }
    });
  }

  // ── Logout ─────────────────────────────────────────────────
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const { status } = await api.post('/auth/logout', {});
      if (status === 200) {
        showToast('Sesión cerrada.', 'info');
        setTimeout(() => { window.location.href = 'index.html'; }, 500);
      }
    });
  }

  // ── Cargar nombre del usuario en el header ─────────────────
  loadUserHeader();

  // ── Mostrar/ocultar contraseña ─────────────────────────────
  document.querySelectorAll('[data-toggle-password]').forEach(btn => {
    btn.addEventListener('click', () => {
      const inputId = btn.dataset.togglePassword;
      const input = document.getElementById(inputId);
      if (!input) return;
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.textContent = isText ? '👁️' : '🙈';
    });
  });
});

/**
 * Carga la info del usuario autenticado y la muestra en el header.
 * Si no hay sesión, no redirige (permite páginas públicas).
 */
async function loadUserHeader() {
  const avatarEl = document.getElementById('user-avatar');
  const userNameEl = document.getElementById('user-name');

  const { data, status } = await api.get('/auth/me');
  if (status === 200 && data.nombre) {
    if (avatarEl) avatarEl.textContent = data.nombre.charAt(0).toUpperCase();
    if (userNameEl) userNameEl.textContent = data.nombre;

    // Badge de suscripción
    const subBadge = document.getElementById('sub-badge');
    if (subBadge) {
      subBadge.textContent = data.suscripcion_activa ? '⭐ Premium' : 'Sin suscripción';
      subBadge.className = `badge ${data.suscripcion_activa ? 'badge-gold' : 'badge-warning'}`;
    }

    // Si el usuario es Administrador, mostrar link a Panel Admin en la barra de navegación
    if (data.rol === 'Administrador') {
      const headerNav = document.querySelector('.header-nav');
      if (headerNav && !document.getElementById('nav-admin-link')) {
        const adminLink = document.createElement('a');
        adminLink.href = 'admin.html';
        adminLink.id = 'nav-admin-link';
        const isCurrentPage = window.location.pathname.includes('admin.html');
        adminLink.className = `nav-link ${isCurrentPage ? 'active' : ''}`;
        adminLink.innerHTML = '<span aria-hidden="true">⚙️</span> Panel Admin';
        headerNav.appendChild(adminLink);
      }
    }

    return data;
  }
  return null;
}

/** Activa/desactiva el estado de carga de un botón */
function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

/** Muestra un alert inline en el formulario */
function showAlert(containerId, message, type = 'error') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const icons = { error: '❌', success: '✅', warning: '⚠️', info: 'ℹ️' };
  container.innerHTML = `
    <div class="alert alert-${type}">
      <span class="alert-icon">${icons[type]}</span>
      <span>${message}</span>
    </div>
  `;
}

function clearAlert(containerId) {
  const container = document.getElementById(containerId);
  if (container) container.innerHTML = '';
}

// Exportar helpers para otros scripts
window.setLoading = setLoading;
window.showAlert = showAlert;
window.clearAlert = clearAlert;
window.loadUserHeader = loadUserHeader;
