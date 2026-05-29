/* ============================================================
   Portal da Controladoria — script.js
   ============================================================ */

// ── State ─────────────────────────────────────────────────
let state = {
  users:    [],
  tarefas:  [],
  current:  null,   // usuário logado
  view:     'board' // 'board' | 'concluded'
};

// ── Data helpers ──────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/** Verifica se uma tarefa diária foi marcada hoje */
function isDiariaFeitaHoje(t) {
  return t.prazo === 'diaria' && t.diariaFeitaEm === todayStr();
}

/** Reseta o campo diariaFeitaEm de tarefas diárias que foram marcadas em dias anteriores */
function resetDiariasSeNecessario() {
  let changed = false;
  state.tarefas.forEach(t => {
    if (t.prazo === 'diaria' && t.diariaFeitaEm && t.diariaFeitaEm !== todayStr()) {
      t.diariaFeitaEm = null;
      changed = true;
    }
  });
  if (changed) saveData();
}

// ── Boot ──────────────────────────────────────────────────
async function boot() {
  await loadData();
  resetDiariasSeNecessario();
  renderLoginUsers();
}

async function loadData() {
  try {
    const [uRes, tRes] = await Promise.all([
      fetch('data/users.json'),
      fetch('data/tarefas.json')
    ]);
    state.users   = await uRes.json();
    state.tarefas = await tRes.json();
  } catch (e) {
    // fallback: dados já podem estar no localStorage (modo offline)
    const saved = localStorage.getItem('controladoria_data');
    if (saved) {
      const d = JSON.parse(saved);
      state.users   = d.users   || [];
      state.tarefas = d.tarefas || [];
    }
  }
  // sempre mescla com o localStorage (edições em runtime)
  const saved = localStorage.getItem('controladoria_data');
  if (saved) {
    const d = JSON.parse(saved);
    if (d.tarefas) state.tarefas = d.tarefas;
    if (d.users)   state.users   = d.users;
  }
}

function saveData() {
  localStorage.setItem('controladoria_data', JSON.stringify({
    users:   state.users,
    tarefas: state.tarefas
  }));
}

// ── Login ─────────────────────────────────────────────────
function renderLoginUsers() {
  const list = document.getElementById('login-user-list');
  list.innerHTML = '';
  state.users.forEach(u => {
    const el = document.createElement('div');
    el.className = 'user-option';
    el.dataset.id = u.id;
    el.innerHTML = `
      <div class="avatar">${u.avatar}</div>
      <div class="user-option-info">
        <strong>${u.nome}</strong>
        <span>${u.cargo}</span>
      </div>`;
    el.addEventListener('click', () => selectUser(el, u.id));
    list.appendChild(el);
  });
}

function selectUser(el, id) {
  document.querySelectorAll('.user-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('btn-enter').disabled = false;
  document.getElementById('btn-enter').dataset.userId = id;
}

document.getElementById('btn-enter').addEventListener('click', () => {
  const id = parseInt(document.getElementById('btn-enter').dataset.userId);
  if (!id) return;
  const user = state.users.find(u => u.id === id);
  if (!user) return;
  state.current = user;
  enterApp();
});

// Toggle novo usuário
document.getElementById('btn-show-new-user').addEventListener('click', () => {
  const form = document.getElementById('new-user-form');
  form.classList.toggle('visible');
});

document.getElementById('btn-create-user').addEventListener('click', () => {
  const nome  = document.getElementById('new-user-name').value.trim();
  const cargo = document.getElementById('new-user-cargo').value.trim();
  if (!nome) { toast('Informe o nome do usuário.', true); return; }
  const initials = nome.split(' ').map(p => p[0]).slice(0,2).join('').toUpperCase();
  const newUser = {
    id:     Date.now(),
    nome,
    cargo:  cargo || 'Colaborador',
    avatar: initials
  };
  state.users.push(newUser);
  saveData();
  document.getElementById('new-user-form').classList.remove('visible');
  document.getElementById('new-user-name').value  = '';
  document.getElementById('new-user-cargo').value = '';
  renderLoginUsers();
  toast(`Usuário ${nome} criado!`);
});

// ── Enter App ─────────────────────────────────────────────
function enterApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('visible');

  // Sidebar info
  document.getElementById('sb-user-name').textContent  = state.current.nome;
  document.getElementById('sb-user-cargo').textContent = state.current.cargo;
  document.getElementById('sb-user-avatar').textContent = state.current.avatar;

  renderBoard();
}

document.getElementById('btn-logout').addEventListener('click', () => {
  state.current = null;
  document.getElementById('app').classList.remove('visible');
  document.getElementById('login-screen').style.display = '';
  document.querySelectorAll('.user-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('btn-enter').disabled = true;
  delete document.getElementById('btn-enter').dataset.userId;
});

// ── Board ─────────────────────────────────────────────────
const COLUMNS = [
  { key: 'diaria', label: 'Tarefas Diárias',   color: '#3b82f6' },
  { key: 'hoje',   label: 'Tarefas de Hoje',    color: '#ef4444' },
  { key: 'semana', label: 'Tarefas da Semana',  color: '#f59e0b' },
  { key: 'mes',    label: 'Tarefas do Mês',     color: '#22c55e' }
];

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  COLUMNS.forEach(col => {
    // Diárias: nunca saem da coluna (excluir apenas as permanentemente deletadas não existe aqui)
    // Demais: mostrar só as não concluídas
    const tasks = col.key === 'diaria'
      ? state.tarefas.filter(t => t.prazo === 'diaria')
      : state.tarefas.filter(t => t.prazo === col.key && !t.concluida);

    // Contador: diárias pendentes hoje
    const count = col.key === 'diaria'
      ? tasks.filter(t => !isDiariaFeitaHoje(t)).length
      : tasks.length;

    const col_el = document.createElement('div');
    col_el.className = 'column';
    col_el.innerHTML = `
      <div class="column-header">
        <div class="column-title">
          <div class="col-dot" style="background:${col.color}"></div>
          ${col.label}
        </div>
        <span class="col-count">${count}</span>
      </div>
      <div class="column-body" id="col-${col.key}"></div>`;
    board.appendChild(col_el);

    const body = col_el.querySelector(`#col-${col.key}`);
    if (tasks.length === 0) {
      body.innerHTML = `
        <div class="column-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
          </svg>
          <span>Nenhuma tarefa</span>
        </div>`;
    } else {
      // Diárias: pendentes primeiro, depois feitas
      const sorted = col.key === 'diaria'
        ? [...tasks].sort((a, b) => (isDiariaFeitaHoje(a) ? 1 : 0) - (isDiariaFeitaHoje(b) ? 1 : 0))
        : tasks;
      sorted.forEach(t => {
        const card = col.key === 'diaria' ? buildDiariaCard(t) : buildCard(t);
        body.appendChild(card);
      });
    }
  });
}

/** Card especial para tarefas diárias recorrentes */
function buildDiariaCard(t) {
  const feita = isDiariaFeitaHoje(t);
  const el = document.createElement('div');
  el.className = `task-card task-card-diaria ${feita ? 'diaria-feita' : ''}`;

  const resp = t.responsavel ? state.users.find(u => u.id === t.responsavel) : null;
  const urgClass = { alta: 'urg-alta', media: 'urg-media', baixa: 'urg-baixa' }[t.urgencia] || 'urg-media';

  el.innerHTML = `
    <div class="diaria-top">
      <button class="diaria-checkbox ${feita ? 'checked' : ''}" data-id="${t.id}" title="${feita ? 'Desmarcar' : 'Marcar como feita hoje'}">
        ${feita ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
      </button>
      <div class="card-title diaria-title">${t.nome}</div>
    </div>
    <div class="card-meta" style="padding-left:30px">
      <div class="urgency-dot ${urgClass}"></div>
      ${feita
        ? `<span class="badge badge-concluida">Feita hoje</span>`
        : `<span class="badge badge-pendente">Pendente</span>`}
      ${resp ? `<div class="card-resp"><div class="avatar sm">${resp.avatar}</div><span>${resp.nome}</span></div>` : '<span style="color:var(--muted2)">Sem resp.</span>'}
    </div>
    ${feita ? `<div class="diaria-reset-hint">↻ Será resetada amanhã</div>` : ''}`;

  el.querySelector('.diaria-checkbox').addEventListener('click', e => {
    e.stopPropagation();
    t.diariaFeitaEm = feita ? null : todayStr();
    saveData();
    renderBoard();
  });

  el.addEventListener('click', () => openDetail(t.id));
  return el;
}

function buildCard(t) {
  const el = document.createElement('div');
  el.className = 'task-card';

  const etapasDone = t.etapas.filter(e => e.concluida).length;
  const etapasTotal = t.etapas.length;
  const pct = etapasTotal ? Math.round((etapasDone / etapasTotal) * 100) : 0;

  const resp = t.responsavel ? state.users.find(u => u.id === t.responsavel) : null;
  const urgClass = { alta: 'urg-alta', media: 'urg-media', baixa: 'urg-baixa' }[t.urgencia] || 'urg-media';
  const statusClass = { pendente: 'badge-pendente', 'em andamento': 'badge-andamento', concluida: 'badge-concluida' }[t.status] || 'badge-pendente';
  const statusLabel = { pendente: 'Pendente', 'em andamento': 'Em andamento', concluida: 'Concluída' }[t.status] || t.status;

  el.innerHTML = `
    <div class="card-title">${t.nome}</div>
    <div class="card-meta">
      <div class="urgency-dot ${urgClass}"></div>
      <span class="badge ${statusClass}">${statusLabel}</span>
      ${t.dataPrazo ? `<span>${formatDate(t.dataPrazo)}</span>` : ''}
    </div>
    ${etapasTotal > 0 ? `
      <div class="card-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span class="progress-text">${etapasDone}/${etapasTotal}</span>
      </div>` : ''}
    <div class="card-footer">
      <span class="card-date">${resp ? '' : 'Sem resp.'}</span>
      ${resp ? `<div class="card-resp"><div class="avatar sm">${resp.avatar}</div><span>${resp.nome}</span></div>` : ''}
    </div>`;

  el.addEventListener('click', () => openDetail(t.id));
  return el;
}

// ── View: Concluídas ──────────────────────────────────────
document.getElementById('btn-concluded').addEventListener('click', () => {
  document.getElementById('board').classList.add('hidden');
  document.getElementById('concluded-screen').classList.add('visible');
  renderConcluded();
});

document.getElementById('btn-back-board').addEventListener('click', () => {
  document.getElementById('board').classList.remove('hidden');
  document.getElementById('concluded-screen').classList.remove('visible');
});

function renderConcluded() {
  const list = document.getElementById('concluded-list');
  list.innerHTML = '';
  const done = state.tarefas.filter(t => t.concluida);
  if (done.length === 0) {
    list.innerHTML = `<div style="color:var(--muted);font-size:13px;">Nenhuma tarefa concluída ainda.</div>`;
    return;
  }
  done.forEach(t => list.appendChild(buildCard(t)));
}

// ── Modal: Nova Tarefa ────────────────────────────────────
const modalCreate = document.getElementById('modal-create');
let etapasTemp = [];

document.getElementById('btn-new-task').addEventListener('click', openCreateModal);
document.getElementById('btn-cancel-create').addEventListener('click', closeCreateModal);
document.getElementById('modal-create-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-create-overlay')) closeCreateModal();
});

function openCreateModal() {
  etapasTemp = [];
  document.getElementById('form-create').reset();
  renderEtapasTemp();
  // popular select de responsáveis
  const sel = document.getElementById('input-responsavel');
  sel.innerHTML = '<option value="">Sem responsável</option>';
  state.users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.nome;
    sel.appendChild(opt);
  });
  document.getElementById('modal-create-overlay').classList.remove('hidden');
}

function closeCreateModal() {
  document.getElementById('modal-create-overlay').classList.add('hidden');
}

// adicionar etapa
document.getElementById('btn-add-etapa').addEventListener('click', addEtapaFromInput);
document.getElementById('input-etapa').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addEtapaFromInput(); }
});

function addEtapaFromInput() {
  const input = document.getElementById('input-etapa');
  const val = input.value.trim();
  if (!val) return;
  etapasTemp.push({ id: Date.now(), texto: val, concluida: false });
  input.value = '';
  renderEtapasTemp();
}

function renderEtapasTemp() {
  const list = document.getElementById('etapas-temp-list');
  list.innerHTML = '';
  etapasTemp.forEach((e, i) => {
    const el = document.createElement('div');
    el.className = 'etapa-item';
    el.innerHTML = `
      <span>${e.texto}</span>
      <button class="btn-remove-etapa" data-i="${i}" title="Remover">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`;
    el.querySelector('.btn-remove-etapa').addEventListener('click', () => {
      etapasTemp.splice(i, 1);
      renderEtapasTemp();
    });
    list.appendChild(el);
  });
}

// submeter nova tarefa
document.getElementById('btn-save-create').addEventListener('click', () => {
  const nome = document.getElementById('input-nome').value.trim();
  const desc = document.getElementById('input-desc').value.trim();
  const prazo = document.getElementById('input-prazo').value;
  const dataPrazo = document.getElementById('input-data-prazo').value || null;
  const urgencia = document.getElementById('input-urgencia').value;
  const respId = document.getElementById('input-responsavel').value;

  if (!nome) { toast('Informe o nome da tarefa.', true); return; }
  if (!prazo) { toast('Selecione o tipo de prazo.', true); return; }

  const nova = {
    id: Date.now(),
    nome,
    descricao: desc,
    etapas: etapasTemp.map(e => ({ ...e })),
    prazo,
    dataPrazo,
    urgencia,
    responsavel: respId ? parseInt(respId) : null,
    status: 'pendente',
    observacoes: '',
    retorno: '',
    criadoEm: new Date().toISOString(),
    criadoPor: state.current.id,
    concluida: false
  };

  state.tarefas.push(nova);
  saveData();
  closeCreateModal();
  renderBoard();
  toast('Tarefa criada com sucesso!');
});

// ── Modal: Detalhe ────────────────────────────────────────
const modalDetail = document.getElementById('modal-detail-overlay');

document.getElementById('btn-close-detail').addEventListener('click', closeDetail);
modalDetail.addEventListener('click', e => { if (e.target === modalDetail) closeDetail(); });

function openDetail(id) {
  const t = state.tarefas.find(t => t.id === id);
  if (!t) return;

  document.getElementById('detail-title').textContent = t.nome;
  document.getElementById('detail-subtitle').textContent = `Criado em ${formatDate(t.criadoEm)}`;
  document.getElementById('detail-desc').textContent = t.descricao || 'Sem descrição.';

  // checklist etapas
  const checklist = document.getElementById('detail-checklist');
  checklist.innerHTML = '';
  if (t.etapas.length === 0) {
    checklist.innerHTML = `<span style="color:var(--muted);font-size:12px;">Sem etapas definidas.</span>`;
  } else {
    t.etapas.forEach(etapa => {
      const item = document.createElement('div');
      item.className = `check-item ${etapa.concluida ? 'done' : ''}`;
      item.innerHTML = `
        <div class="check-box">
          ${etapa.concluida ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
        </div>
        <span class="check-label">${etapa.texto}</span>`;
      item.addEventListener('click', () => {
        etapa.concluida = !etapa.concluida;
        saveData();
        openDetail(id); // re-render
        renderBoard();
      });
      checklist.appendChild(item);
    });
  }

  // meta
  const resp = t.responsavel ? state.users.find(u => u.id === t.responsavel) : null;
  document.getElementById('detail-status').textContent = labelStatus(t.status);
  document.getElementById('detail-urgencia').textContent = labelUrgencia(t.urgencia);
  document.getElementById('detail-prazo').textContent = t.dataPrazo ? formatDate(t.dataPrazo) : '—';

  // select responsável
  const sel = document.getElementById('detail-responsavel');
  sel.innerHTML = '<option value="">Sem responsável</option>';
  state.users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.nome;
    if (t.responsavel === u.id) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = () => {
    t.responsavel = sel.value ? parseInt(sel.value) : null;
    saveData(); renderBoard();
  };

  // select status
  const selStatus = document.getElementById('detail-status-sel');
  selStatus.value = t.status;
  selStatus.onchange = () => {
    t.status = selStatus.value;
    saveData(); renderBoard();
    document.getElementById('detail-status').textContent = labelStatus(t.status);
  };

  // obs / retorno
  document.getElementById('detail-obs').value    = t.observacoes || '';
  document.getElementById('detail-retorno').value = t.retorno || '';

  document.getElementById('detail-obs').oninput = () => {
    t.observacoes = document.getElementById('detail-obs').value;
    saveData();
  };
  document.getElementById('detail-retorno').oninput = () => {
    t.retorno = document.getElementById('detail-retorno').value;
    saveData();
  };

  // botão concluir
  const btnConcluir = document.getElementById('btn-concluir');
  if (t.concluida) {
    btnConcluir.textContent = 'Reabrir Tarefa';
    btnConcluir.className = 'btn btn-ghost';
  } else {
    btnConcluir.textContent = 'Concluir Tarefa';
    btnConcluir.className = 'btn btn-primary';
  }
  btnConcluir.onclick = () => {
    t.concluida = !t.concluida;
    t.status = t.concluida ? 'concluida' : 'pendente';
    saveData();
    closeDetail();
    renderBoard();
    if (document.getElementById('concluded-screen').classList.contains('visible')) renderConcluded();
    toast(t.concluida ? 'Tarefa concluída!' : 'Tarefa reaberta.');
  };

  modalDetail.classList.remove('hidden');
}

function closeDetail() {
  modalDetail.classList.add('hidden');
}

// ── Helpers ───────────────────────────────────────────────
function formatDate(str) {
  if (!str) return '';
  const d = new Date(str.includes('T') ? str : str + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' });
}

function labelStatus(s) {
  return { pendente: 'Pendente', 'em andamento': 'Em andamento', concluida: 'Concluída' }[s] || s;
}
function labelUrgencia(u) {
  return { alta: '🔴 Alta', media: '🟡 Média', baixa: '🔵 Baixa' }[u] || u;
}

function toast(msg, error = false) {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${error ? 'error' : ''}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Init ──────────────────────────────────────────────────
boot();
