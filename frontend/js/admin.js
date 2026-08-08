/**
 * admin.js v4 — Panel de Administracion Completo
 * 5 pestanas: Resumen, Enviadas, Pendientes, Usuarios, Historial Global
 * Incluye toggle de suscripcion, paginacion e exportacion CSV
 */

// ── Estado Global ──────────────────────────────────────────────────────────
const adminState = {
  currentTab: 'resumen',
  allJornadas: [],
  currentJornadaId: null,
  jornadaData: null,
  allUsuarios: [],
  historial: { page: 1, per_page: 20, total: 0, total_pages: 1, rows: [] },
  historialJornadaFilter: '',
  historialSearch: '',
  historialSearchTimer: null,
};

// ── Inicializacion ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { data: user, status } = await api.get('/auth/me');

  if (status !== 200 || user?.rol !== 'Administrador') {
    showToast('Acceso denegado. Se requieren permisos de Administrador.', 'error');
    setTimeout(() => window.location.href = 'dashboard.html', 1500);
    return;
  }

  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl && user.nombre) avatarEl.textContent = user.nombre.charAt(0).toUpperCase();

  const nameBadge = document.getElementById('admin-name-badge');
  if (nameBadge) nameBadge.textContent = '\u{1F464} ' + user.nombre;

  setupLogout();

  // Inicializar selector de ligas (obsoleto, la jornada es global)

  await Promise.all([loadGlobalMetrics(), loadJornadasSelector()]);
  populateHistorialJornadaFilter();
  await loadAdminData();

  const urlParams = new URLSearchParams(window.location.search);
  const tab = urlParams.get('tab');
  if (tab) {
    switchAdminTab(tab);
  }
});

// ── Logout ─────────────────────────────────────────────────────────────────
function setupLogout() {
  const btn = document.getElementById('btn-logout');
  if (btn) btn.addEventListener('click', () => {
    localStorage.removeItem('access_token');
    window.location.href = 'index.html';
  });
}

// ── Utilitarios ────────────────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function formatDate(isoStr) {
  if (!isoStr) return '\u2014';
  const d = new Date(isoStr);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(isoStr) {
  if (!isoStr) return '\u2014';
  const d = new Date(isoStr);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// ────────────────────────────────────────────────────────────────────────────
// BLOQUE 1: METRICAS GLOBALES
// ────────────────────────────────────────────────────────────────────────────
async function loadGlobalMetrics() {
  const { data, status } = await api.get('/admin/usuarios');
  if (status !== 200 || !data) return;

  adminState.allUsuarios = data.usuarios || [];
  const m = data.metricas_globales || {};

  setText('gm-total',             m.total_usuarios ?? '\u2014');
  setText('gm-suscritos',         m.suscritos ?? '\u2014');
  setText('gm-no-suscritos',      m.no_suscritos ?? '\u2014');
  setText('gm-total-quinielas',   m.total_quinielas_historicas ?? '\u2014');
  setText('gm-jornadas-abiertas', m.jornadas_abiertas ?? '\u2014');

  renderUsuariosTable(adminState.allUsuarios);
}

// ────────────────────────────────────────────────────────────────────────────
// BLOQUE 2: JORNADAS
// ────────────────────────────────────────────────────────────────────────────
async function loadJornadasSelector() {
  const select = document.getElementById('select-jornada-admin');
  if (!select) return;

  const { data, status } = await api.get(`/jornadas`);
  if (status === 200 && Array.isArray(data?.jornadas)) {
    adminState.allJornadas = [...data.jornadas];

    if (adminState.allJornadas.length === 0) {
      select.innerHTML = '<option value="">⚠️ Sin jornadas creadas</option>';
      adminState.currentJornadaId = null;
      return;
    }

    select.innerHTML = adminState.allJornadas.map(j => {
      const icon = j.estado === 'Abierta' ? '\u{1F7E2}' : j.estado === 'Cerrada' ? '\u{1F512}' : '\u2705';
      return `<option value="${j.id}">${j.nombre} (${icon} ${j.estado})</option>`;
    }).join('');

    const abierta = adminState.allJornadas.find(j => j.estado === 'Abierta');
    adminState.currentJornadaId = abierta ? abierta.id : adminState.allJornadas[0].id;
    select.value = adminState.currentJornadaId;
  } else {
    select.innerHTML = '<option value="">⚠️ Error al cargar jornadas</option>';
  }
}

function populateHistorialJornadaFilter() {
  const sel = document.getElementById('filter-jornada-historial');
  if (!sel) return;
  const opts = adminState.allJornadas.map(j =>
    `<option value="${j.id}">${j.nombre}</option>`
  ).join('');
  sel.innerHTML = '<option value="">Todas las jornadas</option>' + opts;
}

async function onJornadaChange(jornadaId) {
  adminState.currentJornadaId = jornadaId;
  await loadAdminData();
}

// ────────────────────────────────────────────────────────────────────────────
// BLOQUE 3: DATOS POR JORNADA (resumen, participantes, pendientes)
// ────────────────────────────────────────────────────────────────────────────
async function loadAdminData() {
  const url = adminState.currentJornadaId
    ? `/admin/status?jornada_id=${adminState.currentJornadaId}`
    : `/admin/status`;

  const { data, status } = await api.get(url);
  
  if (status === 404) {
    showToast('No hay jornadas activas. Usa la opción de importar nueva jornada.', 'warning');
    renderMetrics({});
    renderJornadaEstado(null);
    renderPartidosRealesContainer([]);
    renderParticipantesContainer([]);
    renderPendientesContainer([]);
    return;
  }

  if (status !== 200 || !data) {
    showToast('Error al cargar datos del panel admin.', 'error');
    return;
  }

  adminState.jornadaData = data;
  adminState.currentJornadaId = data.jornada.id;

  renderMetrics(data.metricas);
  renderJornadaEstado(data.jornada.estado);
  renderPartidosRealesContainer(data.partidos || []);
  renderParticipantesContainer(data.participantes || []);
  renderPendientesContainer(data.pendientes || []);
}

function renderMetrics(m) {
  setText('metric-total',      m.total_usuarios || 0);
  setText('metric-enviados',   m.total_enviados || 0);
  setText('metric-pendientes', m.total_pendientes || 0);
  setText('metric-pct',        `${m.porcentaje_participacion || 0}%`);
  setText('count-tab-participantes', m.total_enviados || 0);
  setText('count-tab-pendientes',    m.total_pendientes || 0);
}

function renderPartidosRealesContainer(partidos) {
  const container = document.getElementById('partidos-reales-container');
  if (!container) return;

  if (!partidos || partidos.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚽</div><p>No hay partidos registrados para esta jornada.</p></div>`;
    return;
  }

  container.innerHTML = `<div class="match-cards-grid">${partidos.map(p => {
    const isFinalizado = p.estado === 'Finalizado';
    const isEnCurso   = p.estado === 'En Curso';
    const golesLocal  = p.goles_local_real   !== null && p.goles_local_real   !== undefined ? p.goles_local_real   : '–';
    const golesVisita = p.goles_visitante_real !== null && p.goles_visitante_real !== undefined ? p.goles_visitante_real : '–';

    const statusColor = isFinalizado ? 'var(--color-success)' : isEnCurso ? '#f59e0b' : 'var(--color-text-muted)';
    const statusDot   = isFinalizado ? '' : isEnCurso ? '🔴 ' : '';

    return `
      <div class="match-score-card">
        <div class="match-score-status" style="color:${statusColor}">${statusDot}${p.estado}</div>
        <div class="match-score-row">
          <span class="match-score-team">${p.equipo_local}</span>
          <span class="match-score-goals">${golesLocal}</span>
        </div>
        <div class="match-score-row">
          <span class="match-score-team">${p.equipo_visitante}</span>
          <span class="match-score-goals">${golesVisita}</span>
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

function renderJornadaEstado(estado) {
  const badge     = document.getElementById('jornada-estado-badge');
  const btnCerrar = document.getElementById('btn-cerrar-jornada');
  const btnAbrir  = document.getElementById('btn-abrir-jornada');
  const btnCalc   = document.getElementById('btn-calcular-puntos');

  if (!estado) {
    if (badge) { badge.className = 'badge badge-warning'; badge.textContent = 'Sin Jornadas'; }
    if (btnCerrar) btnCerrar.style.display = 'none';
    if (btnAbrir) btnAbrir.style.display = 'none';
    if (btnCalc) btnCalc.style.display = 'none';
    return;
  }

  if (badge) {
    const cls  = estado === 'Abierta' ? 'badge-success' : estado === 'Cerrada' ? 'badge-warning' : 'badge-info';
    const icon = estado === 'Abierta' ? '\u{1F7E2}' : estado === 'Cerrada' ? '\u{1F512}' : '\u2705';
    badge.className   = `badge ${cls}`;
    badge.textContent = `${icon} ${estado}`;
  }

  if (btnCerrar) btnCerrar.style.display = estado === 'Abierta' ? '' : 'none';
  if (btnAbrir)  btnAbrir.style.display  = estado === 'Cerrada' ? '' : 'none';
  if (btnCalc)   btnCalc.style.display   = estado === 'Cerrada' ? '' : 'none';
}

// ────────────────────────────────────────────────────────────────────────────
// BLOQUE 4: PARTICIPANTES
// ────────────────────────────────────────────────────────────────────────────
function renderParticipantesContainer(lista) {
  const container = document.getElementById('participantes-container');
  if (!container) return;

  if (!lista || lista.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">\u{1F4ED}</div>
        <h3>No hay quinielas enviadas</h3>
        <p>Ningun usuario ha jugado en esta jornada aun.</p>
      </div>`;
    return;
  }

  container.innerHTML = lista.map((u, idx) => `
    <div class="glass-card" style="margin-bottom:16px;padding:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="user-avatar" style="width:40px;height:40px;font-size:1rem">${u.nombre.charAt(0).toUpperCase()}</div>
          <div>
            <div style="font-weight:700;font-size:1rem">${u.nombre}</div>
            <div style="font-size:12px;opacity:.65">\u{1F4E7} ${u.email} \u00B7 \u{1F550} ${formatDateTime(u.fecha_envio)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:16px">
          <div style="text-align:right">
            <div style="font-size:1.5rem;font-weight:800;color:var(--color-accent);line-height:1">${u.puntos_totales || 0} pts</div>
            <div style="font-size:10px;opacity:.5">Puntos actuales</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="togglePronosticos(this, 'pron-${idx}')" data-pronosticos='${JSON.stringify(u.pronosticos || []).replace(/'/g, "&#39;")}'>
            \u{1F50D} Ver Pronosticos
          </button>
        </div>
      </div>
      <div id="pron-${idx}" class="pronosticos-mini-list" style="display:none">
        <!-- Se renderiza on-demand -->
      </div>
    </div>
  `).join('');
}

function filterParticipantes() {
  const q = (document.getElementById('search-participantes')?.value || '').toLowerCase();
  const lista = (adminState.jornadaData?.participantes || []).filter(u =>
    u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  );
  renderParticipantesContainer(lista);
}

// ────────────────────────────────────────────────────────────────────────────
// BLOQUE 5: PENDIENTES
// ────────────────────────────────────────────────────────────────────────────
function renderPendientesContainer(lista) {
  const container = document.getElementById('pendientes-container');
  if (!container) return;

  if (!lista || lista.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">\u{1F389}</div>
        <h3>Todos han participado</h3>
        <p>No hay usuarios pendientes para esta jornada.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="glass-card" style="padding:0;overflow:hidden">
      <div class="table-wrapper">
        <table class="ranking-table">
          <thead><tr>
            <th>#</th><th>Usuario</th><th>Correo</th>
            <th>Suscripcion</th><th style="text-align:right">Registro</th>
          </tr></thead>
          <tbody>
            ${lista.map((u, i) => `
              <tr>
                <td><strong>${i + 1}</strong></td>
                <td>
                  <div class="rank-user">
                    <div class="user-avatar" style="width:32px;height:32px;font-size:12px">${u.nombre.charAt(0).toUpperCase()}</div>
                    <span><strong>${u.nombre}</strong></span>
                  </div>
                </td>
                <td><span style="opacity:.7">${u.email}</span></td>
                <td>
                  <span class="badge ${u.estado_suscripcion ? 'badge-success' : 'badge-warning'}">
                    ${u.estado_suscripcion ? '\u2705 Activa' : '\u26A0\uFE0F Inactiva'}
                  </span>
                </td>
                <td style="text-align:right;opacity:.5;font-size:12px">${formatDate(u.fecha_registro)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function filterPendientes() {
  const q = (document.getElementById('search-pendientes')?.value || '').toLowerCase();
  const lista = (adminState.jornadaData?.pendientes || []).filter(u =>
    u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  );
  renderPendientesContainer(lista);
}

// ────────────────────────────────────────────────────────────────────────────
// BLOQUE 6: GESTION DE USUARIOS
// ────────────────────────────────────────────────────────────────────────────
function renderUsuariosTable(lista) {
  const container  = document.getElementById('usuarios-container');
  const countLabel = document.getElementById('usuarios-count-label');
  if (!container) return;

  if (countLabel) countLabel.textContent = `${lista.length} usuarios`;

  if (!lista || lista.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">\u{1F50D}</div>
        <h3>Sin resultados</h3>
        <p>No se encontraron usuarios con ese criterio.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="glass-card" style="padding:0;overflow:hidden">
      <div class="table-wrapper">
        <table class="ranking-table">
          <thead><tr>
            <th>Usuario</th>
            <th>Correo</th>
            <th>Suscripcion</th>
            <th style="text-align:center">Quinielas</th>
            <th>Ultima Quiniela</th>
            <th style="text-align:right">Registro</th>
            <th style="text-align:center">Accion</th>
          </tr></thead>
          <tbody>
            ${lista.map(u => `
              <tr>
                <td>
                  <div class="rank-user">
                    <div class="user-avatar" style="width:32px;height:32px;font-size:12px">${u.nombre.charAt(0).toUpperCase()}</div>
                    <span><strong>${u.nombre}</strong></span>
                  </div>
                </td>
                <td><span style="opacity:.65;font-size:12px">${u.email}</span></td>
                <td>
                  <span class="badge ${u.estado_suscripcion ? 'badge-success' : 'badge-warning'}">
                    ${u.estado_suscripcion ? '\u2705 Activa' : '\u26A0\uFE0F Inactiva'}
                  </span>
                </td>
                <td style="text-align:center">
                  <span style="font-weight:800;color:var(--color-accent)">${u.total_quinielas}</span>
                </td>
                <td style="font-size:12px;opacity:.6">${formatDate(u.ultima_quiniela)}</td>
                <td style="text-align:right;font-size:12px;opacity:.6">${formatDate(u.fecha_registro)}</td>
                <td style="text-align:center; display: flex; gap: 4px; justify-content: center;">
                  <button
                    id="sub-btn-${u.id}"
                    class="toggle-sub-btn ${u.estado_suscripcion ? 'active-sub' : 'inactive-sub'}"
                    onclick="toggleSuscripcion('${u.id}', ${!u.estado_suscripcion})"
                    title="${u.estado_suscripcion ? 'Desactivar suscripcion' : 'Activar suscripcion'}"
                  >
                    ${u.estado_suscripcion ? '\u{1F534} Desactivar' : '\u{1F7E2} Activar'}
                  </button>
                  <button class="btn btn-secondary btn-sm" style="padding: 2px 6px; font-size: 11px;" onclick="generarResetLink('${u.id}')" title="Generar link de recuperacion">
                    🔑 Reset
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function filterUsuarios() {
  const q   = (document.getElementById('search-usuarios')?.value || '').toLowerCase();
  const sub = document.getElementById('filter-suscripcion')?.value || '';

  let lista = adminState.allUsuarios;
  if (q)              lista = lista.filter(u => u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  if (sub === 'activa')   lista = lista.filter(u => u.estado_suscripcion);
  if (sub === 'inactiva') lista = lista.filter(u => !u.estado_suscripcion);

  renderUsuariosTable(lista);
}

async function toggleSuscripcion(usuarioId, activar) {
  const { data, status } = await api.post('/admin/usuario/suscripcion', { usuario_id: usuarioId, activar });

  if (status === 200) {
    showToast(data.message, 'success');
    const u = adminState.allUsuarios.find(x => x.id === usuarioId);
    if (u) u.estado_suscripcion = activar;
    await loadGlobalMetrics();
  } else {
    showToast(data?.error || 'Error al cambiar suscripcion.', 'error');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// BLOQUE 7: HISTORIAL GLOBAL
// ────────────────────────────────────────────────────────────────────────────
async function loadHistorial(page = 1) {
  const params = new URLSearchParams({ page, per_page: adminState.historial.per_page });
  if (adminState.historialJornadaFilter) params.set('jornada_id', adminState.historialJornadaFilter);
  if (adminState.historialSearch)        params.set('search', adminState.historialSearch);

  const { data, status } = await api.get(`/admin/historial?${params.toString()}`);
  if (status !== 200 || !data) { showToast('Error al cargar historial.', 'error'); return; }

  adminState.historial = { ...data.pagination, rows: data.historial };
  renderHistorialTable(data.historial, data.pagination);
}

function renderHistorialTable(rows, pagination) {
  const container = document.getElementById('historial-container');
  const paginBar  = document.getElementById('historial-pagination');
  if (!container) return;

  if (!rows || rows.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">\u{1F4ED}</div><h3>Sin registros</h3><p>No se encontraron quinielas con ese filtro.</p></div>`;
    if (paginBar) paginBar.style.display = 'none';
    return;
  }

  container.innerHTML = `
    <div class="glass-card" style="padding:0;overflow:hidden">
      <div class="table-wrapper">
        <table class="ranking-table">
          <thead><tr>
            <th>Jornada</th><th>Usuario</th><th>Correo</th>
            <th style="text-align:center">Puntos</th>
            <th style="text-align:right">Fecha Envio</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><span class="badge badge-info">${r.nombre_jornada || r.numero_jornada || 'Jornada'}</span></td>
                <td><strong>${r.nombre}</strong></td>
                <td><span style="opacity:.65;font-size:12px">${r.email}</span></td>
                <td style="text-align:center">
                  <span style="font-weight:800;color:var(--color-accent)">${r.puntos_totales}</span>
                </td>
                <td style="text-align:right;opacity:.5;font-size:12px">${formatDateTime(r.fecha_envio)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  if (paginBar && pagination.total_pages > 1) {
    paginBar.style.display = 'flex';
    const { page, total_pages, total } = pagination;
    let html = `<button class="pagination-btn" onclick="loadHistorial(${page - 1})" ${page <= 1 ? 'disabled' : ''}>&lsaquo; Anterior</button>`;

    for (let p = 1; p <= total_pages; p++) {
      if (p === 1 || p === total_pages || Math.abs(p - page) <= 2) {
        html += `<button class="pagination-btn ${p === page ? 'active' : ''}" onclick="loadHistorial(${p})">${p}</button>`;
      } else if (Math.abs(p - page) === 3) {
        html += `<span style="opacity:.4;padding:0 8px">...</span>`;
      }
    }

    html += `<button class="pagination-btn" onclick="loadHistorial(${page + 1})" ${page >= total_pages ? 'disabled' : ''}>Siguiente &rsaquo;</button>`;
    html += `<span style="font-size:12px;opacity:.5;margin-left:8px">Pagina ${page} de ${total_pages} (${total} registros)</span>`;
    paginBar.innerHTML = html;
  } else if (paginBar) {
    paginBar.style.display = 'none';
  }
}

function onHistorialSearch() {
  clearTimeout(adminState.historialSearchTimer);
  adminState.historialSearchTimer = setTimeout(() => {
    adminState.historialSearch = document.getElementById('search-historial')?.value || '';
    loadHistorial(1);
  }, 350);
}

function onHistorialJornadaChange() {
  adminState.historialJornadaFilter = document.getElementById('filter-jornada-historial')?.value || '';
  loadHistorial(1);
}

async function exportarCSV() {
  const params = new URLSearchParams();
  if (adminState.historialJornadaFilter) params.set('jornada_id', adminState.historialJornadaFilter);
  if (adminState.historialSearch)        params.set('search', adminState.historialSearch);

  try {
    const url = `${API_BASE}/admin/historial/csv?${params}`;
    const resp = await fetch(url, {
      method: 'GET',
      credentials: 'include'
    });
    
    if (resp.status === 401) { showToast('Debes iniciar sesion.', 'error'); return; }
    if (!resp.ok) { showToast('Error al exportar CSV.', 'error'); return; }

    const blob = await resp.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'historial_quinielas.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('CSV descargado exitosamente.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Error de conexion al exportar.', 'error');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// BLOQUE 8: NAVEGACION DE PESTANAS
// ────────────────────────────────────────────────────────────────────────────
function switchAdminTab(tabName) {
  adminState.currentTab = tabName;
  ['resumen', 'participantes', 'pendientes', 'usuarios', 'historial'].forEach(t => {
    document.getElementById(`tab-${t}`)?.classList.toggle('active', t === tabName);
    const view = document.getElementById(`view-${t}`);
    if (view) view.style.display = t === tabName ? '' : 'none';
  });

  // Update bottom-nav active state
  const bnavMis = document.getElementById('bnav-mis');
  const bnavAdmin = document.getElementById('bnav-admin');
  if (bnavMis && bnavAdmin) {
    if (tabName === 'historial') {
      bnavMis.classList.add('active');
      bnavAdmin.classList.remove('active');
    } else {
      bnavMis.classList.remove('active');
      bnavAdmin.classList.add('active');
    }
  }

  // Update URL without reloading
  const url = new URL(window.location);
  url.searchParams.set('tab', tabName);
  window.history.pushState({}, '', url);

  if (tabName === 'historial' && adminState.historial.rows.length === 0) {
    loadHistorial(1);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// BLOQUE 9: CONTROL DE JORNADA
// ────────────────────────────────────────────────────────────────────────────
let selectedPartidosForNewJornada = [];
let foundPartidosCache = [];

async function buscarPartidos() {
  const dateFrom = document.getElementById('input-date-from').value;
  const dateTo = document.getElementById('input-date-to').value;
  const btn = document.getElementById('btn-buscar-partidos');
  const resultsContainer = document.getElementById('buscar-partidos-resultados');

  if (!dateFrom || !dateTo) {
    showToast('Por favor, selecciona las fechas Desde y Hasta.', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '⏳ Buscando...';

  try {
    const { data, status } = await api.get(`/admin/partidos/buscar?dateFrom=${dateFrom}&dateTo=${dateTo}`);
    
    if (status === 200 && data.partidos) {
      // Filtrar partidos cuyo día local esté estrictamente dentro del rango seleccionado [dateFrom, dateTo]
      foundPartidosCache = data.partidos.filter(p => {
        const d = new Date(p.fecha_partido);
        const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return localDate >= dateFrom && localDate <= dateTo;
      });
      
      const select = document.getElementById('select-filter-liga');
      const containerFiltro = document.getElementById('filter-ligas-container');
      if (select && containerFiltro) {
        const leagues = [...new Set(foundPartidosCache.map(p => p.liga_nombre))].sort();
        select.innerHTML = '<option value="">Todas las ligas</option>' + leagues.map(l => `<option value="${l}">${l}</option>`).join('');
        containerFiltro.style.display = 'flex';
      }

      renderPartidosResultados();
      resultsContainer.style.display = 'block';
    } else {
      showToast(data?.error || 'Error al buscar partidos.', 'error');
    }
  } catch (error) {
    showToast('Error de conexión al buscar.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔍 Buscar Partidos';
  }
}

function renderPartidosResultados() {
  const container = document.getElementById('buscar-partidos-resultados');
  const select = document.getElementById('select-filter-liga');
  const ligaFiltro = select ? select.value : '';

  if (!foundPartidosCache || foundPartidosCache.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:10px;"><p>No se encontraron partidos en este rango de fechas.</p></div>`;
    return;
  }

  const partidosMostrados = ligaFiltro 
    ? foundPartidosCache.filter(p => p.liga_nombre === ligaFiltro)
    : foundPartidosCache;

  if (partidosMostrados.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:10px;"><p>No hay partidos para la liga seleccionada.</p></div>`;
    return;
  }

  container.innerHTML = partidosMostrados.map(p => {
    const isSelected = selectedPartidosForNewJornada.some(sp => sp.id_api === p.id_api);
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-bottom:1px solid rgba(255,255,255,0.1);${isSelected ? 'background:rgba(245,158,11,0.1)' : ''}">
        <div style="font-size:12px;">
          <strong>${p.equipo_local} vs ${p.equipo_visitante}</strong><br>
          <span style="opacity:0.7;display:flex;align-items:center;gap:4px;margin-top:2px;">
            ${new Date(p.fecha_partido).toLocaleString('es-ES')} - ${p.liga_nombre} 
            <img src="${p.liga_bandera}" alt="Bandera" style="width:16px;height:12px;border-radius:2px;object-fit:cover;">
          </span>
        </div>
        <button class="btn btn-sm ${isSelected ? 'btn-secondary' : 'btn-primary'}" 
                onclick="togglePartidoSeleccionado(${p.id_api})" 
                style="padding:4px 8px;font-size:11px;">
          ${isSelected ? 'Quitar' : 'Seleccionar'}
        </button>
      </div>
    `;
  }).join('');
}

window.togglePartidoSeleccionado = function(partidoId) {
  const idx = selectedPartidosForNewJornada.findIndex(p => p.id_api === partidoId);
  if (idx > -1) {
    selectedPartidosForNewJornada.splice(idx, 1);
  } else {
    if (selectedPartidosForNewJornada.length >= 10) {
      showToast('Ya has seleccionado 10 partidos. Quita alguno para agregar otro.', 'warning');
      return;
    }
    const partido = foundPartidosCache.find(p => p.id_api === partidoId);
    if (partido) selectedPartidosForNewJornada.push(partido);
  }
  
  renderPartidosResultados();
  renderPartidosSeleccionados();
}

function renderPartidosSeleccionados() {
  const container = document.getElementById('partidos-seleccionados-container');
  const countEl = document.getElementById('count-seleccionados');
  const btnCrear = document.getElementById('btn-crear-jornada');
  
  countEl.textContent = selectedPartidosForNewJornada.length;
  btnCrear.disabled = selectedPartidosForNewJornada.length !== 10;
  
  if (selectedPartidosForNewJornada.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:var(--space-2)"><p>No has seleccionado partidos.</p></div>`;
    return;
  }
  
  container.innerHTML = selectedPartidosForNewJornada.map((p, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);padding:8px;border-radius:var(--radius-sm);font-size:12px;">
      <div>
        <strong>${i+1}. ${p.equipo_local} vs ${p.equipo_visitante}</strong> 
        <span style="opacity:0.7;display:inline-flex;align-items:center;gap:4px;margin-left:4px;">
          <img src="${p.liga_bandera}" alt="Bandera" style="width:16px;height:12px;border-radius:2px;object-fit:cover;">
        </span>
      </div>
      <button class="btn btn-sm" style="color:var(--color-danger);background:transparent;border:none" onclick="togglePartidoSeleccionado(${p.id_api})">❌</button>
    </div>
  `).join('');
}

async function crearJornadaPersonalizada() {
  const btn = document.getElementById('btn-crear-jornada');
  const nombreInput = document.getElementById('input-nombre-jornada').value.trim();
  
  if (selectedPartidosForNewJornada.length !== 10) {
    showToast('Debes seleccionar exactamente 10 partidos.', 'error');
    return;
  }
  
  if (!nombreInput) {
    showToast('Debes darle un nombre a la jornada.', 'error');
    return;
  }
  
  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Creando...';
  
  try {
    const payload = {
      nombre: nombreInput,
      partidos: selectedPartidosForNewJornada
    };
    
    const { data, status } = await api.post('/admin/jornadas/personalizada', payload);
    
    if (status === 201) {
      showToast(data.message || 'Jornada creada exitosamente.', 'success');
      selectedPartidosForNewJornada = [];
      document.getElementById('input-nombre-jornada').value = 'Quiniela Semanal';
      renderPartidosSeleccionados();
      document.getElementById('buscar-partidos-resultados').style.display = 'none';
      document.getElementById('input-date-from').value = '';
      document.getElementById('input-date-to').value = '';
      
      await loadJornadasSelector();
      if (adminState.allJornadas.length > 0) {
        adminState.currentJornadaId = adminState.allJornadas[0].id;
        document.getElementById('select-jornada-admin').value = adminState.currentJornadaId;
        await loadAdminData();
      }
    } else {
      showToast(data?.error || 'Error al crear la jornada.', 'error');
    }
  } catch (e) {
    showToast('Error de conexión al crear jornada.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function cambiarEstadoJornada(nuevoEstado) {
  if (!adminState.currentJornadaId) return;

  const confirmar = window.confirm(`¿Estás seguro de que deseas cambiar el estado de la jornada a "${nuevoEstado}"?`);
  if (!confirmar) return;

  const { data, status } = await api.post('/admin/jornada/estado', {
    jornada_id: adminState.currentJornadaId,
    estado: nuevoEstado
  });
  if (status === 200) {
    showToast(`Jornada ${nuevoEstado.toLowerCase()} exitosamente.`, 'success');
    await loadJornadasSelector();
    await loadAdminData();
  } else {
    showToast(data?.error || 'Error al cambiar estado.', 'error');
  }
}

async function ejecutarCalculoPuntos() {
  if (!adminState.currentJornadaId) return;

  const confirmar = window.confirm('¿Estás seguro de que deseas calcular los puntos? Esto es irreversible.');
  if (!confirmar) return;

  const { data, status } = await api.post(`/quinielas/calcular/${adminState.currentJornadaId}`, {});
  if (status === 200) {
    showToast(data?.message || 'Calculo ejecutado.', 'success');
    await loadJornadasSelector();
    await loadAdminData();
  } else {
    showToast(data?.error || 'Error al calcular puntos.', 'error');
  }
}

async function eliminarJornada() {
  if (!adminState.currentJornadaId) return;

  const confirmar = window.confirm('⚠️ ¡ADVERTENCIA! ¿Estás completamente seguro de eliminar esta jornada? Se borrarán todos los partidos, y las quinielas asociadas.');
  if (!confirmar) return;

  const { data, status } = await api.delete(`/admin/jornada/${adminState.currentJornadaId}`);
  
  if (status === 200) {
    showToast(data?.message || 'Jornada eliminada exitosamente.', 'success');
    await loadJornadasSelector();
    populateHistorialJornadaFilter();

    if (adminState.allJornadas.length > 0) {
      adminState.currentJornadaId = adminState.allJornadas[0].id;
      const select = document.getElementById('select-jornada-admin');
      if (select) select.value = adminState.currentJornadaId;
      await loadAdminData();
    } else {
      adminState.currentJornadaId = null;
      const select = document.getElementById('select-jornada-admin');
      if (select) select.innerHTML = '<option value="">⚠️ Sin jornadas creadas</option>';
      renderPartidosRealesContainer([]);
      renderParticipantesContainer([]);
      renderPendientesContainer([]);
      renderMetrics({total_usuarios: 0, total_enviados: 0, total_pendientes: 0, porcentaje_participacion: 0});
      renderJornadaEstado(null);
    }
  } else {
    showToast(data?.error || 'Error al eliminar la jornada.', 'error');
  }
}

async function actualizarResultadosAPI() {
  if (!adminState.currentJornadaId) return;

  const btn = document.querySelector('button[onclick="actualizarResultadosAPI()"]');
  if (btn) btn.disabled = true;

  showToast('Consultando API de resultados...', 'info');

  const { data, status } = await api.post('/admin/jornada/actualizar-resultados', {
    jornada_id: adminState.currentJornadaId
  });

  if (status === 200) {
    showToast(data?.message || 'Resultados sincronizados exitosamente.', 'success');
    await loadAdminData();
  } else {
    showToast(data?.error || 'Error al sincronizar resultados.', 'error');
  }

  if (btn) btn.disabled = false;
}

// ────────────────────────────────────────────────────────────────────────────
// BLOQUE 10: TOGGLE PRONOSTICOS
// ────────────────────────────────────────────────────────────────────────────
function togglePronosticos(btn, elemId) {
  const el = document.getElementById(elemId);
  if (!el) return;
  
  if (!el.dataset.rendered) {
    try {
      const pronosticos = JSON.parse(btn.dataset.pronosticos || "[]");
      el.innerHTML = pronosticos.map(p => `
        <div class="pronostico-mini-item" style="flex-direction: column; align-items: stretch; gap: 8px; padding: 12px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.05);">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
            <span style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--color-text-primary);"><span style="opacity:0.4; margin-right:6px; font-size:0.9em;">🏠</span>${p.equipo_local}</span>
            <span style="font-weight: 800; color: var(--color-gold); font-size: 1.1em; min-width: 24px; text-align: center; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">${p.goles_local}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
            <span style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--color-text-primary);"><span style="opacity:0.4; margin-right:6px; font-size:0.9em;">✈️</span>${p.equipo_visitante}</span>
            <span style="font-weight: 800; color: var(--color-gold); font-size: 1.1em; min-width: 24px; text-align: center; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">${p.goles_visitante}</span>
          </div>
        </div>
      `).join('');
    } catch(e){}
    el.dataset.rendered = 'true';
  }

  el.style.display = el.style.display === 'none' ? 'grid' : 'none';
}

// Exponer funciones al window
window.buscarPartidos = buscarPartidos;
window.crearJornadaPersonalizada = crearJornadaPersonalizada;
window.cambiarEstadoJornada = cambiarEstadoJornada;
window.ejecutarCalculoPuntos = ejecutarCalculoPuntos;
window.eliminarJornada = eliminarJornada;
window.actualizarResultadosAPI = actualizarResultadosAPI;

async function generarResetLink(usuarioId) {
  const confirmar = window.confirm('¿Generar un enlace de recuperacion para este usuario?');
  if (!confirmar) return;

  const { data, status } = await api.post(`/admin/usuarios/${usuarioId}/generate-reset-link`, {});
  
  if (status === 200) {
    window.prompt('Enlace de recuperacion generado exitosamente. Copialo y enviaselo al usuario:', data.reset_link);
  } else {
    showToast(data?.error || 'Error al generar el enlace.', 'error');
  }
}
window.generarResetLink = generarResetLink;
