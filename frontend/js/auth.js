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
          if (data.usuario && data.usuario.rol === 'Administrador') {
            window.location.href = 'admin.html';
          } else {
            window.location.href = 'dashboard.html';
          }
        }, 600);
      } else {
        showAlert('login-alert', data?.error || 'Error al iniciar sesión.', 'error');
      }
    });
  }

  // ── Forgot Password ────────────────────────────────────────
  const btnForgotPassword = document.getElementById('btn-forgot-password');
  if (btnForgotPassword) {
    btnForgotPassword.addEventListener('click', (e) => {
      e.preventDefault();
      window.alert('Si ha olvidado su contraseña, por favor contacte al administrador para que genere un enlace de recuperación desde el panel de administración.');
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
      if (!nombre) {
        showAlert('register-alert', 'Por favor ingresa tu nombre completo.', 'error');
        setLoading(btn, false);
        return;
      }

      if (!email) {
        showAlert('register-alert', 'Por favor ingresa tu correo electrónico.', 'error');
        setLoading(btn, false);
        return;
      }

      if (!password) {
        showAlert('register-alert', 'Por favor ingresa una contraseña.', 'error');
        setLoading(btn, false);
        return;
      }

      if (password.length < 8) {
        showAlert('register-alert', 'La contraseña debe tener al menos 8 caracteres.', 'error');
        setLoading(btn, false);
        return;
      }

      if (password !== password2) {
        showAlert('register-alert', 'Las contraseñas no coinciden.', 'error');
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

    // Profile chip badge de suscripción
    const subBadge = document.getElementById('sub-badge');
    if (subBadge) {
      if (data.suscripcion_activa) {
        subBadge.textContent = '⭐ Premium';
        subBadge.className = 'profile-chip-badge profile-chip-badge--premium';
      } else {
        subBadge.textContent = 'Sin suscripción';
        subBadge.className = 'profile-chip-badge';
      }
    }

    // Wire profile chip click → Bottom Sheet (no logout directo)
    const chip = document.getElementById('profile-chip');
    if (chip) {
      chip.title = 'Ver perfil';
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', () => openProfileSheet(data));
    }

    // Si el usuario es Administrador, adaptar la navegación
    if (data.rol === 'Administrador') {
      const isCurrentPage = window.location.pathname.includes('admin.html');
      
      const headerNav = document.querySelector('.header-nav');
      if (headerNav) {
        // Renombrar Mis Quinielas a Historial Global
        const misQLinkDesktop = headerNav.querySelector('a[href="mis-quinielas.html"]');
        if (misQLinkDesktop) {
          misQLinkDesktop.href = 'admin.html?tab=historial';
          misQLinkDesktop.innerHTML = '<span aria-hidden="true">📋</span> Historial Global';
        }

        if (!document.getElementById('nav-admin')) {
          const adminLink = document.createElement('a');
          adminLink.href = 'admin.html';
          adminLink.id = 'nav-admin';
          adminLink.className = `nav-link ${isCurrentPage ? 'active' : ''}`;
          adminLink.innerHTML = '<span aria-hidden="true">⚙️</span> Panel Admin';
          const selectLiga = headerNav.querySelector('select');
          if (selectLiga) {
            headerNav.insertBefore(adminLink, selectLiga);
          } else {
            headerNav.appendChild(adminLink);
          }
        }
        
        const navRanking = document.getElementById('nav-ranking');
        if (navRanking) navRanking.style.display = '';
      }

      const bottomNavInner = document.querySelector('.bottom-nav-inner');
      if (bottomNavInner) {
        // Mapear Mis Quinielas a Historial Global
        const bnavMis = document.getElementById('bnav-mis');
        if (bnavMis) {
          bnavMis.href = 'admin.html?tab=historial';
          bnavMis.innerHTML = '<span class="bottom-nav-icon" aria-hidden="true">📋</span><span>Historial</span>';
        }

        if (!document.getElementById('bnav-admin')) {
          const adminBnav = document.createElement('a');
          adminBnav.href = 'admin.html';
          adminBnav.id = 'bnav-admin';
          adminBnav.className = `bottom-nav-item ${isCurrentPage ? 'active' : ''}`;
          adminBnav.innerHTML = '<span class="bottom-nav-icon" aria-hidden="true">⚙️</span><span>Admin</span>';
          bottomNavInner.appendChild(adminBnav);
        }
        
        const bnavRanking = document.getElementById('bnav-ranking');
        if (bnavRanking) bnavRanking.style.display = '';
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

// ────────────────────────────────────────────────────────────────────────────
// PROFILE BOTTOM SHEET
// ────────────────────────────────────────────────────────────────────────────
function openProfileSheet(user) {
  if (document.getElementById('profile-sheet-overlay')) return; // ya abierto

  const isPremium = user.suscripcion_activa;
  const initial  = (user.nombre || '?').charAt(0).toUpperCase();

  const overlay = document.createElement('div');
  overlay.id = 'profile-sheet-overlay';
  overlay.className = 'psheet-overlay';
  overlay.innerHTML = `
    <div class="psheet" role="dialog" aria-modal="true" aria-label="Perfil de usuario" id="profile-sheet">
      <div class="psheet-handle"></div>

      <!-- Avatar + info -->
      <div class="psheet-header">
        <div class="psheet-avatar">${initial}</div>
        <div class="psheet-user-info">
          <div class="psheet-name">${user.nombre}</div>
          <div class="psheet-email">${user.email || ''}</div>
          <span class="psheet-sub ${isPremium ? 'psheet-sub--premium' : ''}">
            ${isPremium ? '⭐ Plan Premium' : 'Sin suscripción activa'}
          </span>
        </div>
      </div>

      <div class="psheet-divider"></div>

      <!-- Acciones -->
      <div class="psheet-actions">
        <button class="psheet-btn psheet-btn--logout" id="psheet-logout-btn">
          <span>🚪</span> Cerrar Sesión
        </button>
        <button class="psheet-btn psheet-btn--cancel" id="psheet-cancel-btn">
          Cancelar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Forzar reflow para que la animación de entrada funcione
  requestAnimationFrame(() => {
    overlay.classList.add('psheet-overlay--open');
    overlay.querySelector('#profile-sheet').classList.add('psheet--open');
  });

  // Cerrar al tocar el backdrop
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeProfileSheet();
  });

  document.getElementById('psheet-cancel-btn').addEventListener('click', closeProfileSheet);

  document.getElementById('psheet-logout-btn').addEventListener('click', () => {
    closeProfileSheet();
    setTimeout(() => {
      const logoutBtn = document.getElementById('btn-logout');
      if (logoutBtn) logoutBtn.click();
    }, 250);
  });

  // Cerrar con ESC
  overlay._escHandler = (e) => { if (e.key === 'Escape') closeProfileSheet(); };
  document.addEventListener('keydown', overlay._escHandler);
}

function closeProfileSheet() {
  const overlay = document.getElementById('profile-sheet-overlay');
  if (!overlay) return;
  overlay.classList.remove('psheet-overlay--open');
  overlay.querySelector('#profile-sheet')?.classList.remove('psheet--open');
  document.removeEventListener('keydown', overlay._escHandler);
  setTimeout(() => overlay.remove(), 350);
}
