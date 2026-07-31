/**
 * dashboard.js — Carga la jornada actual/seleccionada, renderiza las tarjetas
 * de partidos con selectores numéricos de goles y gestiona el envío
 * de la quiniela completa al backend.
 *
 * Nuevas funcionalidades (v2):
 *  - Carrusel de jornadas (selector de jornada)
 *  - Indicador de tendencia en tiempo real (Victoria Local / Empate / Victoria Visitante)
 *  - Repoblación de quiniela existente vía GET /api/quinielas/mia
 *  - Countdown compacto en el header
 *  - Estado de tarjeta bloqueada para jornadas no abiertas
 */

// Estado local del dashboard
const state = {
  jornada: null,
  partidos: [],
  pronosticos: {}, // { partido_id: { goles_local: 0, goles_visitante: 0 } }
  tocados: new Set(), // IDs de partidos que el usuario tocó explícitamente
  jornadaLocked: false,
  allJornadas: [],
  user: null,
};

// Emojis de equipos de La Liga (mapa visual)
const TEAM_EMOJIS = {
  'Real Madrid': '👑',
  'FC Barcelona': '🔵', 'Barcelona': '🔵',
  'Atlético de Madrid': '🔴', 'Atletico de Madrid': '🔴',
  'Sevilla FC': '⚪', 'Sevilla': '⚪',
  'Real Betis': '🟢', 'Betis': '🟢',
  'Real Sociedad': '🔵',
  'Valencia CF': '🦇', 'Valencia': '🦇',
  'Villarreal CF': '🟡', 'Villarreal': '🟡',
  'Athletic Club': '🦁',
  'Rayo Vallecano': '⚡', 'Osasuna': '🔴', 'Celta de Vigo': '🩵',
  'Getafe CF': '🔵', 'Getafe': '🔵', 'Espanyol': '🔵', 'UD Las Palmas': '🌴',
  'Deportivo Alavés': '🔵', 'RCD Mallorca': '🔴', 'Girona FC': '🔴',
  'Leganés': '🥒', 'Real Valladolid': '🟣',
};

document.addEventListener('DOMContentLoaded', async () => {
  // Guard de autenticación: ocultar la página hasta verificar que hay sesión
  document.body.style.visibility = 'hidden';

  state.user = await loadUserHeader();

  if (!state.user) {
    // Sin sesión válida → redirigir al login inmediatamente (sin mostrar nada)
    window.location.href = 'index.html';
    return;
  }

  // Sesión confirmada → mostrar la página y cargar datos
  document.body.style.visibility = 'visible';
  await loadAllJornadas();   // Cargar lista de jornadas para el carrusel
  await loadJornada();       // Cargar la jornada actual (abierta)
  setupLogout();
});

// ─── Cargar todas las jornadas (carrusel) ─────────────────────
async function loadAllJornadas() {
  const { data, status } = await api.get('/jornadas/');
  if (status === 200 && data?.jornadas) {
    // Ordenar ascendente por número de jornada para el carrusel
    state.allJornadas = [...data.jornadas].sort((a, b) => a.numero_jornada - b.numero_jornada);
  }
}

// ─── Renderizar carrusel de jornadas ─────────────────────────
function renderJornadaCarousel(activeJornadaId) {
  const carousel = document.getElementById('jornada-carousel');
  if (!carousel || state.allJornadas.length === 0) return;

  const estadoLabels = {
    'Abierta':   { label: 'Abierta',   icon: '🟢' },
    'Cerrada':   { label: 'Cerrada',   icon: '🔒' },
    'Calculada': { label: 'Calculada', icon: '✅' },
    'Futura':    { label: 'Próxima',   icon: '⏳' },
  };

  carousel.innerHTML = state.allJornadas.map(j => {
    const isActive = String(j.id) === String(activeJornadaId);
    const info = estadoLabels[j.estado] || { label: j.estado, icon: '📅' };
    return `
      <button
        class="jornada-tab ${isActive ? 'active' : ''}"
        role="tab"
        aria-selected="${isActive}"
        aria-label="Jornada ${j.numero_jornada} — ${info.label}"
        data-jornada-id="${j.id}"
        onclick="switchJornada('${j.id}')"
      >
        <span class="jornada-tab-num">J${j.numero_jornada}</span>
        <span class="jornada-tab-estado">${info.icon} ${info.label}</span>
      </button>
    `;
  }).join('');

  // Scroll automático al tab activo
  const activeTab = carousel.querySelector('.jornada-tab.active');
  if (activeTab) {
    setTimeout(() => activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 100);
  }
}

// ─── Cambiar de jornada desde el carrusel ─────────────────────
async function switchJornada(jornadaId) {
  await loadJornadaPorId(jornadaId);
}

// ─── Cargar Jornada Actual (Abierta) ─────────────────────────
async function loadJornada() {
  const grid = document.getElementById('matches-grid');
  const jornadaHeader = document.getElementById('jornada-header');

  grid.innerHTML = renderSkeletons(6);

  const { data, status } = await api.get('/jornadas/actual');

  if (status === 404) {
    // No hay jornada abierta — mostrar la más reciente si existe
    if (state.allJornadas.length > 0) {
      const ultima = state.allJornadas[state.allJornadas.length - 1];
      await loadJornadaPorId(ultima.id);
      return;
    }
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🏟️</div>
        <h3>No hay jornada activa</h3>
        <p>Vuelve cuando se abra la próxima jornada de La Liga.</p>
      </div>`;
    if (jornadaHeader) jornadaHeader.style.display = 'none';
    document.getElementById('jornada-carousel').style.display = 'none';
    return;
  }

  if (!data?.jornada) {
    showToast('Error al cargar la jornada.', 'error');
    grid.innerHTML = '';
    return;
  }

  await renderJornadaData(data.jornada, data.partidos);
}

// ─── Cargar jornada por ID (desde el carrusel) ───────────────
async function loadJornadaPorId(jornadaId) {
  const grid = document.getElementById('matches-grid');
  grid.innerHTML = renderSkeletons(6);

  const { data, status } = await api.get(`/jornadas/${jornadaId}`);

  if (status !== 200 || !data?.jornada) {
    showToast('Error al cargar la jornada seleccionada.', 'error');
    return;
  }

  await renderJornadaData(data.jornada, data.partidos);
}

// ─── Renderizar datos de una jornada ─────────────────────────
async function renderJornadaData(jornada, partidos) {
  const jornadaHeader = document.getElementById('jornada-header');
  const submitBar = document.querySelector('.submit-bar');

  state.jornada   = jornada;
  state.partidos  = partidos;
  state.jornadaLocked = jornada.estado !== 'Abierta' || 
                        (state.user && state.user.rol === 'Administrador') ||
                        (state.user && state.user.rol === 'Cliente' && !state.user.suscripcion_activa);

  // Si es admin, mostrar mensaje
  if (state.user && state.user.rol === 'Administrador') {
      const jornadaHeader = document.getElementById('jornada-header');
      if (jornadaHeader && !document.getElementById('admin-read-only-msg')) {
          const msg = document.createElement('div');
          msg.id = 'admin-read-only-msg';
          msg.className = 'alert alert-info';
          msg.style.marginTop = '1rem';
          msg.innerHTML = '<strong>Modo Auditoría:</strong> Los administradores no participan en las quinielas. Visualización de solo lectura.';
          jornadaHeader.parentNode.insertBefore(msg, jornadaHeader.nextSibling);
      }
  }

  // Si es cliente sin suscripción activa, mostrar cartel amarillo
  if (state.user && state.user.rol === 'Cliente' && !state.user.suscripcion_activa) {
      const jornadaHeader = document.getElementById('jornada-header');
      if (jornadaHeader && !document.getElementById('inactive-sub-msg')) {
          const msg = document.createElement('div');
          msg.id = 'inactive-sub-msg';
          msg.className = 'alert alert-warning';
          msg.style.marginTop = '1rem';
          msg.innerHTML = '<strong>⚠️ Suscripción Inactiva:</strong> No puedes enviar pronósticos. Por favor, contacta con el supervisor o administrador para activar tu suscripción.';
          jornadaHeader.parentNode.insertBefore(msg, jornadaHeader.nextSibling);
      }
  }

  // Resetear pronósticos y registro de partidos tocados
  state.pronosticos = {};
  state.tocados = new Set();
  partidos.forEach(p => {
    state.pronosticos[p.id] = { goles_local: 0, goles_visitante: 0 };
  });

  // Renderizar carrusel (marca la jornada activa)
  renderJornadaCarousel(jornada.id);

  // Renderizar cabecera
  if (jornadaHeader) {
    jornadaHeader.innerHTML = renderJornadaHeader(jornada);
    if (jornada.estado === 'Abierta') {
      startCountdown(jornada.fecha_limite_envio);
    }
  }

  // Mostrar/ocultar submit bar según estado
  if (submitBar) {
    submitBar.style.display = state.jornadaLocked ? 'none' : '';
  }

  // Renderizar tarjetas de partido con separadores de día
  const grid = document.getElementById('matches-grid');
  grid.innerHTML = '';
  let lastDay = '';

  partidos.forEach((partido, idx) => {
    // Extraer el día de la semana (ej. 'sábado', 'domingo')
    const matchDate = new Date(partido.fecha_partido);
    const dayStr = matchDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

    if (dayStr !== lastDay) {
      const divider = document.createElement('div');
      divider.style.gridColumn = '1 / -1';
      divider.style.marginTop = idx === 0 ? '0' : 'var(--space-6)';
      divider.style.marginBottom = 'var(--space-2)';
      divider.style.borderBottom = '1px solid var(--color-border)';
      divider.style.paddingBottom = 'var(--space-2)';
      divider.innerHTML = `<h3 style="font-size:var(--text-lg);font-weight:700;color:var(--color-gold);text-transform:capitalize;letter-spacing:0.05em">📅 ${dayStr}</h3>`;
      grid.appendChild(divider);
      lastDay = dayStr;
    }

    const card = document.createElement('div');
    card.className = `match-card animate-fadeInUp stagger-${Math.min(idx + 1, 5)}${state.jornadaLocked ? ' locked' : ''}`;
    card.id = `card-${partido.id}`;
    card.setAttribute('role', 'listitem');
    card.innerHTML = renderMatchCard(partido, state.jornadaLocked);
    grid.appendChild(card);
  });

  // Listeners solo si la jornada está abierta
  if (!state.jornadaLocked) {
    attachScoreListeners();
    updateSubmitProgress();
    await loadExistingQuiniela(jornada.id);
  } else {
    // Para jornadas cerradas: mostrar quiniela enviada si existe (read-only)
    await loadExistingQuiniela(jornada.id, true);
  }
}

// ─── Renderizar cabecera de jornada ─────────────────────────
function renderJornadaHeader(jornada) {
  const estadoBadge = {
    'Abierta':   '<span class="badge badge-success">🟢 Abierta</span>',
    'Cerrada':   '<span class="badge badge-warning">🔒 Cerrada</span>',
    'Calculada': '<span class="badge badge-info">✅ Calculada</span>',
  };
  const badge = estadoBadge[jornada.estado] || `<span class="badge">${jornada.estado}</span>`;

  const countdownHTML = jornada.estado === 'Abierta' ? `
    <div class="countdown">
      <div>
        <div class="countdown-label">Cierre de pronósticos</div>
        <div class="countdown-time" id="countdown-display">—</div>
        <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:0.25rem">
          ${formatDate(jornada.fecha_limite_envio)}
        </div>
      </div>
    </div>
  ` : `<div style="font-size:var(--text-sm);color:var(--color-text-muted)">
    Jornada ${jornada.estado.toLowerCase()} · Solo lectura
  </div>`;

  return `
    <div class="jornada-info">
      <div style="margin-bottom:0.5rem">${badge}</div>
      <h2>Jornada <span class="jornada-num">${jornada.numero_jornada}</span></h2>
      <p style="color:var(--color-text-muted);font-size:var(--text-sm);margin-top:0.25rem">
        ${jornada.total_partidos} partidos · La Liga EA Sports
      </p>
    </div>
    ${countdownHTML}
  `;
}

// ─── Calcular y retornar clase/texto de tendencia ─────────────
function getTendency(gLocal, gVisitante) {
  if (gLocal > gVisitante) {
    return { cls: 'tend-local', text: '🏠 Victoria Local' };
  } else if (gLocal < gVisitante) {
    return { cls: 'tend-visita', text: '✈️ Victoria Visitante' };
  } else {
    return { cls: 'tend-empate', text: '🤝 Empate' };
  }
}

// ─── Renderizar una tarjeta de partido ───────────────────────
function renderMatchCard(partido, locked = false) {
  const localEmoji = TEAM_EMOJIS[partido.equipo_local] || '⚽';
  const visEmoji   = TEAM_EMOJIS[partido.equipo_visitante] || '⚽';
  // La API devuelve fechas en UTC. new Date() las convierte automáticamente a la hora local del navegador.
  const matchDate  = new Date(partido.fecha_partido);
  const datePart   = matchDate.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  const timePart   = matchDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const tzPart     = matchDate.toLocaleDateString('es-ES', { timeZoneName: 'short' }).split(',').pop().trim();
  const dateStr    = `${datePart}, ${timePart}<br><span style="font-size:0.7em;opacity:0.65">${tzPart}</span>`;

  const lockedAttr  = locked ? 'disabled aria-disabled="true"' : '';
  const lockedBadge = locked ? '<span class="locked-badge">🔒 Cerrado</span>' : '';

  // Resultado real si el partido finalizó (para jornadas Calculadas/Cerradas)
  let resultadoReal = '';
  if (partido.estado === 'Finalizado' && partido.goles_local_real !== undefined) {
    resultadoReal = `
      <div style="margin-top:var(--space-2);text-align:center;font-size:var(--text-xs);color:var(--color-text-muted)">
        Resultado real:
        <span style="font-family:var(--font-display);font-size:var(--text-lg);color:var(--color-gold);letter-spacing:0.05em">
          ${partido.goles_local_real} – ${partido.goles_visitante_real}
        </span>
      </div>`;
  }

  return `
    <div class="match-teams">
      <div class="team">
        <div class="team-badge">${localEmoji}</div>
        <div class="team-name">${partido.equipo_local}</div>
      </div>
      <div class="match-vs">
        <div class="vs-label">VS</div>
        <div class="match-date">${dateStr}</div>
        ${lockedBadge}
      </div>
      <div class="team">
        <div class="team-badge">${visEmoji}</div>
        <div class="team-name">${partido.equipo_visitante}</div>
      </div>
    </div>

    <div class="score-selector" data-partido-id="${partido.id}">
      <div class="score-inputs">
        <!-- Goles Local -->
        <div class="score-input-group">
          <div class="score-label">Local</div>
          <div class="score-counter" id="counter-local-${partido.id}">
            <button class="counter-btn"
              data-partido="${partido.id}" data-team="local" data-action="dec"
              aria-label="Reducir goles ${partido.equipo_local}" ${lockedAttr}>−</button>
            <span class="counter-value" id="val-local-${partido.id}">0</span>
            <button class="counter-btn"
              data-partido="${partido.id}" data-team="local" data-action="inc"
              aria-label="Aumentar goles ${partido.equipo_local}" ${lockedAttr}>+</button>
          </div>
        </div>

        <div class="score-dash">:</div>

        <!-- Goles Visitante -->
        <div class="score-input-group">
          <div class="score-label">Visita</div>
          <div class="score-counter" id="counter-vis-${partido.id}">
            <button class="counter-btn"
              data-partido="${partido.id}" data-team="visitante" data-action="dec"
              aria-label="Reducir goles ${partido.equipo_visitante}" ${lockedAttr}>−</button>
            <span class="counter-value" id="val-visitante-${partido.id}">0</span>
            <button class="counter-btn"
              data-partido="${partido.id}" data-team="visitante" data-action="inc"
              aria-label="Aumentar goles ${partido.equipo_visitante}" ${lockedAttr}>+</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Indicador de tendencia en tiempo real -->
    <div class="tendency-indicator" id="tendency-${partido.id}" aria-live="polite">
      <span>Pronóstico:</span>
      <span class="tendency-badge tend-empate" id="tendency-badge-${partido.id}">🤝 Empate</span>
    </div>

    ${resultadoReal}
  `;
}

// ─── Actualizar indicador de tendencia ───────────────────────
function updateTendency(partidoId) {
  const pron  = state.pronosticos[partidoId];
  if (!pron) return;
  const { goles_local: gl, goles_visitante: gv } = pron;
  const { cls, text } = getTendency(gl, gv);
  const badge = document.getElementById(`tendency-badge-${partidoId}`);
  if (badge) {
    badge.className = `tendency-badge ${cls}`;
    badge.textContent = text;
  }
}

// ─── Event listeners de los contadores ──────────────────────
function attachScoreListeners() {
  document.querySelectorAll('.counter-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const partidoId = btn.dataset.partido;
      const team      = btn.dataset.team;    // 'local' | 'visitante'
      const action    = btn.dataset.action;  // 'inc' | 'dec'
      const key       = team === 'local' ? 'goles_local' : 'goles_visitante';

      let current = state.pronosticos[partidoId]?.[key] ?? 0;
      if (action === 'inc') current = Math.min(current + 1, 20);
      if (action === 'dec') current = Math.max(current - 1, 0);

      state.pronosticos[partidoId][key] = current;

      // Actualizar el valor en pantalla con micro-animación
      const valueEl = document.getElementById(`val-${team}-${partidoId}`);
      if (valueEl) {
        valueEl.textContent = current;
        valueEl.style.transform = 'scale(1.4)';
        setTimeout(() => {
          valueEl.style.transform = 'scale(1)';
          valueEl.style.transition = 'transform 0.15s';
        }, 50);
      }

      // Marcar partido como tocado por el usuario
      state.tocados.add(partidoId);

      // Actualizar tendencia
      updateTendency(partidoId);
      updateSubmitProgress();
    });
  });
}

// ─── Actualizar barra de progreso de pronósticos ─────────────
function updateSubmitProgress() {
  const total = state.partidos.length;
  const completados = Object.values(state.pronosticos).filter(
    p => p.goles_local !== undefined && p.goles_visitante !== undefined
  ).length;

  const progressEl  = document.getElementById('submit-progress-text');
  const progressBar = document.getElementById('progress-fill');
  const pct = total > 0 ? Math.round((completados / total) * 100) : 0;

  if (progressEl) progressEl.innerHTML = `Pronósticos: <strong>${completados}/${total}</strong>`;
  if (progressBar) progressBar.style.width = `${pct}%`;

  const submitBtn = document.getElementById('btn-submit-quiniela');
  if (submitBtn) submitBtn.disabled = false;
}

// ─── Cargar quiniela existente y repoblar contadores ─────────
async function loadExistingQuiniela(jornadaId, readOnly = false) {
  const { data, status } = await api.get(`/quinielas/mia?jornada_id=${jornadaId}`);

  if (status !== 200 || !data?.existe) return; // No hay quiniela enviada aún

  // Repoblar contadores con los pronósticos guardados
  data.pronosticos.forEach(p => {
    const { partido_id, goles_local, goles_visitante } = p;

    // Actualizar estado
    if (state.pronosticos[partido_id] !== undefined) {
      state.pronosticos[partido_id] = { goles_local, goles_visitante };
      state.tocados.add(partido_id); // Marcar como tocado porque ya tiene un valor de la BD
    }

    // Actualizar UI
    const localEl = document.getElementById(`val-local-${partido_id}`);
    const visEl   = document.getElementById(`val-visitante-${partido_id}`);
    if (localEl) localEl.textContent = goles_local;
    if (visEl)   visEl.textContent   = goles_visitante;

    // Actualizar tendencia
    updateTendency(partido_id);
  });

  if (!readOnly) {
    updateSubmitProgress();
    // Mostrar badge de "Ya enviada" en la submit bar
    const submitBtn = document.getElementById('btn-submit-quiniela');
    if (submitBtn) {
      submitBtn.querySelector('.btn-text').textContent = '✅ Actualizar Quiniela';
    }
  }

  // Mostrar toast informativo
  if (!readOnly) {
    showToast('✅ Quiniela anterior cargada. Puedes actualizarla.', 'info', 4000);
  }
}

// ─── Enviar Quiniela ─────────────────────────────────────────
async function submitQuiniela() {
  if (!state.jornada || state.jornadaLocked) return;

  // Detectar partidos no tocados
  const noTocados = state.partidos.filter(p => !state.tocados.has(p.id));

  // Construir resumen para el modal
  const resumen = state.partidos.map(p => {
    const prog = state.pronosticos[p.id];
    const tocado = state.tocados.has(p.id);
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.07);
                  ${!tocado ? 'opacity:0.5' : ''}">
        <span style="font-size:0.82rem">
          ${!tocado ? '⚠️ ' : ''}${p.equipo_local} vs ${p.equipo_visitante}
        </span>
        <span style="font-family:var(--font-display);font-size:1rem;color:var(--color-gold);min-width:50px;text-align:right">
          ${prog.goles_local} – ${prog.goles_visitante}
        </span>
      </div>`;
  }).join('');

  const advertencia = noTocados.length > 0
    ? `<div style="background:rgba(255,165,0,0.12);border:1px solid rgba(255,165,0,0.3);
                  border-radius:0.5rem;padding:0.6rem 0.8rem;margin-bottom:0.8rem;
                  font-size:0.8rem;color:#ffb347">
        ⚠️ <strong>${noTocados.length} partido(s)</strong> no fueron tocados y quedarán con <strong>0 – 0</strong>.
       </div>`
    : '';

  // Mostrar modal de confirmación
  const confirmado = await showConfirmModal(
    '¿Confirmar Quiniela?',
    `${advertencia}
     <div style="max-height:260px;overflow-y:auto;margin-top:0.5rem">${resumen}</div>
     <p style="margin-top:0.8rem;font-size:0.8rem;color:var(--color-text-muted)">
       Revisa tus pronósticos antes de enviar.
     </p>`
  );

  if (!confirmado) return;

  const btn = document.getElementById('btn-submit-quiniela');
  setLoading(btn, true);

  const pronosticos = Object.entries(state.pronosticos).map(([partido_id, goles]) => ({
    partido_id,
    goles_local:     goles.goles_local,
    goles_visitante: goles.goles_visitante,
  }));

  const payload = {
    jornada_id: state.jornada.id,
    pronosticos,
  };

  const { data, status } = await api.post('/quinielas/', payload);

  setLoading(btn, false);

  if (status === 200 || status === 201) {
    showToast(`🎯 ${data.message}`, 'success', 5000);
    document.querySelectorAll('.match-card').forEach(card => {
      card.style.borderColor = 'var(--color-success)';
      setTimeout(() => { card.style.borderColor = ''; }, 2000);
    });
    if (btn) btn.querySelector('.btn-text').textContent = '✅ Actualizar Quiniela';
  } else if (status === 403) {
    showToast('⛔ ' + (data?.error || 'Suscripción requerida.'), 'error', 6000);
  } else if (status === 400) {
    showToast('⚠️ ' + (data?.error || 'Error de validación.'), 'warning', 6000);
  } else {
    showToast('❌ ' + (data?.error || 'Error al enviar la quiniela.'), 'error');
  }
}

// ─── Modal de Confirmación ───────────────────────────────────
function showConfirmModal(titulo, htmlContenido) {
  return new Promise(resolve => {
    // Eliminar modal previo si existe
    document.getElementById('confirm-modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'confirm-modal-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;
      display:flex;align-items:center;justify-content:center;padding:1rem;
      animation:fadeIn 0.15s ease;
    `;

    overlay.innerHTML = `
      <div style="background:var(--color-surface,#1e1e2e);border:1px solid rgba(255,255,255,0.12);
                  border-radius:1rem;padding:1.5rem;max-width:480px;width:100%;
                  box-shadow:0 20px 60px rgba(0,0,0,0.5)">
        <h3 style="margin:0 0 1rem;font-size:1.1rem">${titulo}</h3>
        <div>${htmlContenido}</div>
        <div style="display:flex;gap:0.75rem;margin-top:1.25rem;justify-content:flex-end">
          <button id="modal-cancel" style="padding:0.5rem 1.2rem;border-radius:0.5rem;
            border:1px solid rgba(255,255,255,0.2);background:transparent;
            color:inherit;cursor:pointer;font-size:0.9rem">Revisar</button>
          <button id="modal-confirm" style="padding:0.5rem 1.4rem;border-radius:0.5rem;
            border:none;background:var(--color-primary,#7c3aed);
            color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600">✅ Confirmar Envío</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('modal-confirm').onclick = () => { overlay.remove(); resolve(true); };
    document.getElementById('modal-cancel').onclick  = () => { overlay.remove(); resolve(false); };
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });
}

// ─── Countdown al cierre de jornada ─────────────────────────
function startCountdown(fechaLimiteISO) {
  const el       = document.getElementById('countdown-display');
  const headerEl = document.getElementById('header-countdown-text');
  const headerChip = document.getElementById('header-countdown');

  if (headerChip) headerChip.style.display = 'flex';

  function update() {
    const remaining = timeUntil(fechaLimiteISO);
    if (el)       el.textContent = remaining;
    if (headerEl) headerEl.textContent = remaining;

    if (remaining === 'Plazo vencido') {
      if (el) el.style.color = 'var(--color-error)';
      if (headerChip) headerChip.style.borderColor = 'var(--color-error)';
      const btn = document.getElementById('btn-submit-quiniela');
      if (btn) { btn.disabled = true; btn.querySelector('.btn-text').textContent = '⏱️ Plazo vencido'; }
    }
  }

  update();
  setInterval(update, 30000); // Actualizar cada 30 segundos
}

// ─── Skeleton loaders ────────────────────────────────────────
function renderSkeletons(count) {
  return Array.from({ length: count }, () => `
    <div class="match-card" role="listitem">
      <div class="skeleton" style="height:80px;margin-bottom:1rem;border-radius:0.5rem"></div>
      <div class="skeleton" style="height:60px;border-radius:0.5rem"></div>
    </div>
  `).join('');
}

// ─── Logout ──────────────────────────────────────────────────
function setupLogout() {
  const btn = document.getElementById('btn-logout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await api.post('/auth/logout', {});
    window.location.href = 'index.html';
  });
}

// Exponer switchJornada y submitQuiniela al HTML (onclick)
window.switchJornada  = switchJornada;
window.submitQuiniela = submitQuiniela;
