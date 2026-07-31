/**
 * mis-quinielas.js — Obtiene el historial de quinielas del usuario
 * y renderiza las tarjetas expansibles con los resultados.
 */

const TEAM_EMOJIS = {
  'Real Madrid': '👑', 'FC Barcelona': '🔵🔴', 'Atlético de Madrid': '❤️🤍',
  'Sevilla FC': '⚪🔴', 'Real Betis': '🟢⚪', 'Real Sociedad': '🔵⚪',
  'Valencia CF': '🦇', 'Villarreal CF': '🟡', 'Athletic Club': '🔴⚪',
  'Rayo Vallecano': '🔴⚪', 'Osasuna': '🔴🔵', 'Celta de Vigo': '🔵',
  'Getafe CF': '🔵', 'Espanyol': '🔵⚪', 'UD Las Palmas': '🟡🔵',
  'Deportivo Alavés': '🔵⚪', 'RCD Mallorca': '🔴', 'Girona FC': '🔴⚪',
  'Leganés': '🔵⚪', 'Real Valladolid': '🟣',
};

document.addEventListener('DOMContentLoaded', async () => {
  document.body.style.visibility = 'hidden';

  const user = await loadUserHeader();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  document.body.style.visibility = 'visible';
  await loadHistory();
  setupLogout();
});

async function loadHistory() {
  const grid = document.getElementById('history-grid');
  grid.innerHTML = `
    <div class="skeleton" style="height:120px;border-radius:1rem"></div>
    <div class="skeleton" style="height:120px;border-radius:1rem"></div>
  `;

  const { data, status } = await api.get('/quinielas/mis-quinielas');

  if (status !== 200) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">⚠️</div>
        <h3>Error al cargar historial</h3>
        <p>No pudimos obtener tus datos. Inténtalo más tarde.</p>
      </div>`;
    return;
  }

  const quinielas = data.quinielas || [];

  if (quinielas.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">📋</div>
        <h3>Aún no tienes historial</h3>
        <p>Participa en la jornada actual para empezar a acumular puntos.</p>
        <a href="dashboard.html" class="btn btn-primary" style="margin-top:1rem">Ir a Mi Quiniela</a>
      </div>`;
    return;
  }

  // Actualizar el resumen de puntos totales (suma de todas las jornadas)
  const totalHistorico = quinielas.reduce((sum, q) => sum + (q.puntos_totales || 0), 0);
  document.getElementById('total-puntos-badge').textContent = `${totalHistorico} pts`;

  // Renderizar tarjetas
  grid.innerHTML = quinielas.map(q => renderHistoryCard(q)).join('');
}

function renderHistoryCard(quiniela) {
  const isCalculada = quiniela.estado_jornada === 'Calculada';
  const headerIcon = isCalculada ? '✅' : (quiniela.estado_jornada === 'Abierta' ? '🟢' : '🔒');

  // Construir filas de partidos (ocultas por defecto)
  const rowsHTML = quiniela.pronosticos.map(p => {
    const locE  = TEAM_EMOJIS[p.equipo_local]     || '⚽';
    const visE  = TEAM_EMOJIS[p.equipo_visitante] || '⚽';

    // Pronóstico del usuario
    const pLocal = p.goles_local_pronostico;
    const pVisit = p.goles_visitante_pronostico;

    // Resultado real y puntos
    const isFinalizado = p.estado_partido === 'Finalizado' && p.goles_local_real !== null;
    const rLocal  = isFinalizado ? p.goles_local_real        : '–';
    const rVisit  = isFinalizado ? p.goles_visitante_real    : '–';

    let ptsClass = 'pts-pending';
    let ptsText  = '·';
    if (isFinalizado) {
      ptsText = `+${p.puntos_obtenidos}`;
      if      (p.puntos_obtenidos === 5)                              ptsClass = 'pts-exact';
      else if (p.puntos_obtenidos === 4 || p.puntos_obtenidos === 3) ptsClass = 'pts-tend';
      else { ptsClass = 'pts-zero'; ptsText = '0'; }
    }

    return `
      <div class="mq-match-card">
        <div class="mq-match-card-inner">
          <!-- Local -->
          <div class="mq-match-row">
            <span class="mq-match-team">${p.equipo_local}</span>
            <div class="mq-match-scores">
              <span class="mq-score-pred" title="Tu pronóstico">${pLocal}</span>
              <span class="mq-score-real ${isFinalizado ? '' : 'mq-score-pending'}" title="Resultado real">${rLocal}</span>
            </div>
          </div>
          <!-- Visitante -->
          <div class="mq-match-row">
            <span class="mq-match-team">${p.equipo_visitante}</span>
            <div class="mq-match-scores">
              <span class="mq-score-pred" title="Tu pronóstico">${pVisit}</span>
              <span class="mq-score-real ${isFinalizado ? '' : 'mq-score-pending'}" title="Resultado real">${rVisit}</span>
            </div>
          </div>
        </div>
        <!-- Badge de puntos -->
        <div class="mq-match-pts ${ptsClass}" title="Puntos obtenidos">${ptsText}</div>
      </div>
    `;

  }).join('');

  return `
    <div class="quiniela-history-card animate-fadeInUp">
      <div class="quiniela-history-header" onclick="toggleCard('${quiniela.quiniela_id}')" tabindex="0" role="button" aria-expanded="false">
        <div>
          <div class="quiniela-history-title">${headerIcon} Jornada ${quiniela.numero_jornada}</div>
          <div class="quiniela-history-meta">Enviada: ${new Date(quiniela.fecha_registro).toLocaleDateString('es-ES')}</div>
        </div>
        <div style="text-align:right">
          <div class="quiniela-points-big">${quiniela.puntos_totales || 0}</div>
          <div class="quiniela-pts-label">PUNTOS</div>
        </div>
      </div>
      <div class="quiniela-history-body" id="body-${quiniela.quiniela_id}">
        <div class="mq-legend">
          <span>Partido</span>
          <div class="mq-legend-scores"><span>Tú</span><span>Real</span></div>
          <span>Pts</span>
        </div>
        <div class="mq-match-list">${rowsHTML}</div>
      </div>
    </div>
  `;
}

// ─── Toggles del acordeón de historial ───────────────────────
function toggleCard(id) {
  const body = document.getElementById(`body-${id}`);
  const isOpen = body.classList.contains('open');

  // Opcional: cerrar todos los demás
  // document.querySelectorAll('.quiniela-history-body').forEach(el => el.classList.remove('open'));

  if (isOpen) {
    body.classList.remove('open');
  } else {
    body.classList.add('open');
  }
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

// Exponer handler al global scope
window.toggleCard = toggleCard;
