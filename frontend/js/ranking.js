/**
 * ranking.js — Carga y renderiza la tabla de clasificación de usuarios.
 */

document.addEventListener('DOMContentLoaded', async () => {
  await loadUserHeader();
  await loadRanking();
  setupMobileMenu();
  setupLogout();
  setupJornadaFilter();
});

async function loadRanking(jornadaId = null) {
  const tbody      = document.getElementById('ranking-tbody');
  const totalEl    = document.getElementById('total-participantes');
  const myRankEl   = document.getElementById('my-rank');

  // Skeleton
  tbody.innerHTML = Array.from({ length: 5 }, (_, i) => `
    <tr>
      <td><div class="skeleton" style="height:20px;width:30px;border-radius:4px"></div></td>
      <td><div class="skeleton" style="height:20px;width:160px;border-radius:4px"></div></td>
      <td class="col-email"><div class="skeleton" style="height:20px;width:200px;border-radius:4px"></div></td>
      <td><div class="skeleton" style="height:20px;width:50px;border-radius:4px;margin-left:auto"></div></td>
    </tr>
  `).join('');

  const endpoint = jornadaId
    ? `/quinielas/ranking?jornada_id=${jornadaId}`
    : '/quinielas/ranking';

  const { data, status } = await api.get(endpoint);

  if (status !== 200 || !data?.ranking) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">
          <div class="empty-state">
            <div class="empty-icon">🏆</div>
            <h3>Sin clasificación disponible</h3>
            <p>La clasificación se genera al finalizar la primera jornada calculada.</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  if (totalEl) totalEl.textContent = data.total_participantes;

  // Obtener usuario actual para destacarlo
  const meRes = await api.get('/auth/me');
  const myEmail = meRes.data?.email || null;
  let myPosition = '—';

  tbody.innerHTML = '';
  data.ranking.forEach((entry, idx) => {
    const isMe = entry.email === myEmail;
    const medal = getMedal(entry.posicion);
    if (isMe) myPosition = entry.posicion;

    const row = document.createElement('tr');
    row.className = `rank-${entry.posicion} ${isMe ? 'my-row' : ''} animate-fadeInUp`;
    row.style.animationDelay = `${idx * 0.04}s`;
    if (isMe) {
      row.style.background = 'rgba(230,57,70,0.08)';
      row.style.borderLeft = '2px solid var(--color-accent)';
    }

    row.innerHTML = `
      <td>
        <div class="rank-position">${medal || entry.posicion}</div>
      </td>
      <td>
        <div class="rank-user">
          <div class="user-avatar" style="width:32px;height:32px;font-size:0.75rem">
            ${entry.nombre.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="font-weight:600;${isMe ? 'color:var(--color-accent)' : ''}">
              ${entry.nombre} ${isMe ? '<span class="badge badge-info" style="font-size:10px;padding:2px 6px">Tú</span>' : ''}
            </div>
          </div>
        </div>
      </td>
      <td class="col-email" style="color:var(--color-text-muted);font-size:var(--text-sm)">
        ${entry.email}
      </td>
      <td>
        <div class="rank-points">${entry.puntos_totales} <span style="font-size:var(--text-sm);font-weight:400;color:var(--color-text-muted)">pts</span></div>
      </td>
    `;
    tbody.appendChild(row);
  });

  if (myRankEl) myRankEl.textContent = myPosition !== '—' ? `#${myPosition}` : '—';
}

function getMedal(position) {
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  return medals[position] || null;
}

function setupJornadaFilter() {
  const select = document.getElementById('filter-jornada');
  if (!select) return;

  // Cargar lista de jornadas calculadas
  api.get('/jornadas/').then(({ data, status }) => {
    if (status !== 200 || !data?.jornadas) return;

    const calculadas = data.jornadas.filter(j => j.estado === 'Calculada');
    calculadas.forEach(j => {
      const opt = document.createElement('option');
      opt.value = j.id;
      opt.textContent = `Jornada ${j.numero_jornada}`;
      select.appendChild(opt);
    });
  });

  select.addEventListener('change', () => {
    const val = select.value;
    loadRanking(val || null);
  });
}

function setupMobileMenu() {
  const toggle = document.getElementById('menu-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  if (!toggle || !mobileNav) return;
  toggle.addEventListener('click', () => mobileNav.classList.toggle('open'));
}

function setupLogout() {
  const btn = document.getElementById('btn-logout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await api.post('/auth/logout', {});
    window.location.href = 'index.html';
  });
}
