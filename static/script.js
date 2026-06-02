/* ============================================================
   Portal da Controladoria — script.js
   Todas as operações de dados passam pela API do backend.
   ============================================================ */

// ── Config ────────────────────────────────────────────────
// Em produção, troque pela URL do seu servidor (ex: Render)

const API = "";  // string vazia = mesmo host (backend serve o frontend)

// ── State ─────────────────────────────────────────────────
let state = {
  users:   [],
  tarefas: [],
  current: null,   // usuário logado
  filtroUsuario: null
};

// ── API helpers ───────────────────────────────────────────
async function apiFetch(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== null) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Erro ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const api = {
  getTarefas:       ()         => apiFetch("GET",    "/api/tarefas"),
  criarTarefa:      (t)        => apiFetch("POST",   "/api/tarefas", t),
  atualizarTarefa:  (id, t)    => apiFetch("PUT",    `/api/tarefas/${id}`, t),
  patchTarefa:      (id, body) => apiFetch("PATCH",  `/api/tarefas/${id}`, body),
  deletarTarefa:    (id)       => apiFetch("DELETE", `/api/tarefas/${id}`),

  getUsuarios:      ()         => apiFetch("GET",    "/api/usuarios"),
  criarUsuario:     (u)        => apiFetch("POST",   "/api/usuarios", u),
};

// ── Data helpers ──────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isDiariaFeitaHoje(t) {
  return t.prazo === "diaria" && t.diariaFeitaEm === todayStr();
}

// ── Boot ──────────────────────────────────────────────────
async function boot() {
  showLoading(true);
  try {
    [state.users, state.tarefas] = await Promise.all([
      api.getUsuarios(),
      api.getTarefas(),
    ]);
    resetDiariasSeNecessario();
  } catch (e) {
    toast("Não foi possível conectar ao servidor.", true);
    console.error(e);
  }
  showLoading(false);

  // ← Bloco novo: restaura sessão se houver
  const savedId = document.cookie.split("; ").find(r => r.startsWith("currentUserId="))?.split("=")[1];
  if (savedId) {
    const user = state.users.find(u => u.id === parseInt(savedId));
    if (user) {
      state.current = user;
      enterApp();
      return; // pula a tela de login
    }
  }

  renderLoginUsers(); // só exibe login se não houver sessão salva
}

/** Zera diariaFeitaEm de tarefas marcadas em dias anteriores */
async function resetDiariasSeNecessario() {
  const promises = [];
  state.tarefas.forEach(t => {
    if (t.prazo === "diaria" && t.diariaFeitaEm && t.diariaFeitaEm !== todayStr()) {
      t.diariaFeitaEm = null;
      promises.push(api.patchTarefa(t.id, { diariaFeitaEm: null }));
    }
  });
  if (promises.length) await Promise.all(promises);
}

function showLoading(on) {
  document.getElementById("loading-overlay").classList.toggle("hidden", !on);
}

// ── Login ─────────────────────────────────────────────────
function renderLoginUsers() {
  const list = document.getElementById("login-user-list");
  list.innerHTML = "";
  state.users.forEach(u => {
    const el = document.createElement("div");
    el.className = "user-option";
    el.dataset.id = u.id;
    el.innerHTML = `
      <div class="avatar">${u.avatar}</div>
      <div class="user-option-info">
        <strong>${u.nome}</strong>
        <span>${u.cargo}</span>
      </div>`;
    el.addEventListener("click", () => selectUser(el, u.id));
    list.appendChild(el);
  });
}

function selectUser(el, id) {
  document.querySelectorAll(".user-option").forEach(o => o.classList.remove("selected"));
  el.classList.add("selected");
  document.getElementById("btn-enter").disabled = false;
  document.getElementById("btn-enter").dataset.userId = id;
}

document.getElementById("btn-enter").addEventListener("click", () => {
  const id = parseInt(document.getElementById("btn-enter").dataset.userId);
  if (!id) return;
  const user = state.users.find(u => u.id === id);
  if (!user) return;
  state.current = user;
  enterApp();
});

document.getElementById("btn-show-new-user").addEventListener("click", () => {
  document.getElementById("new-user-form").classList.toggle("visible");
});

document.getElementById("btn-create-user").addEventListener("click", async () => {
  const nome  = document.getElementById("new-user-name").value.trim();
  const cargo = document.getElementById("new-user-cargo").value.trim();
  if (!nome) { toast("Informe o nome do usuário.", true); return; }

  try {
    const novo = await api.criarUsuario({ nome, cargo: cargo || "Colaborador" });
    state.users.push(novo);
    document.getElementById("new-user-form").classList.remove("visible");
    document.getElementById("new-user-name").value  = "";
    document.getElementById("new-user-cargo").value = "";
    renderLoginUsers();
    toast(`Usuário ${novo.nome} criado!`);
  } catch (e) {
    toast(e.message, true);
  }
});

function renderFiltroUsuarios() {
  // Remove filtro anterior se existir
  const existing = document.getElementById("filtro-usuario-bar");
  if (existing) existing.remove();

  const bar = document.createElement("div");
  bar.id = "filtro-usuario-bar";
  bar.style.cssText = `
    display: flex; align-items: center; gap: 8px;
    padding: 10px 24px; flex-wrap: wrap;
  `;

  const label = document.createElement("span");
  label.textContent = "Filtrar por:";
  label.style.cssText = "font-size:12px; color:var(--muted); font-weight:500;";
  bar.appendChild(label);

  // Botão "Todos"
  const btnTodos = document.createElement("button");
  btnTodos.textContent = "Todos";
  btnTodos.className = "filtro-btn" + (state.filtroUsuario === null ? " filtro-ativo" : "");
  btnTodos.onclick = () => { state.filtroUsuario = null; renderFiltroUsuarios(); renderBoard(); };
  bar.appendChild(btnTodos);

  // Um botão por usuário
  state.users.forEach(u => {
    const btn = document.createElement("button");
    btn.innerHTML = `<span style="margin-right:4px">${u.avatar}</span>${u.nome}`;
    btn.className = "filtro-btn" + (state.filtroUsuario === u.id ? " filtro-ativo" : "");
    btn.onclick = () => { state.filtroUsuario = u.id; renderFiltroUsuarios(); renderBoard(); };
    bar.appendChild(btn);
  });

  // Insere a barra antes do board
  const board = document.getElementById("board");
  board.parentNode.insertBefore(bar, board);
}

function enterApp() {
  document.cookie = `currentUserId=${state.current.id};path=/;max-age=86400`;
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app").classList.add("visible");
  document.getElementById("sb-user-name").textContent   = state.current.nome;
  document.getElementById("sb-user-cargo").textContent  = state.current.cargo;
  document.getElementById("sb-user-avatar").textContent = state.current.avatar;
  renderFiltroUsuarios();  // ← adicionar esta linha
  renderBoard();
}

document.getElementById("btn-logout").addEventListener("click", () => {
  state.current = null;
  document.cookie = "currentUserId=;path=/;max-age=0";
  document.getElementById("app").classList.remove("visible");
  document.getElementById("login-screen").style.display = "";
  document.querySelectorAll(".user-option").forEach(o => o.classList.remove("selected"));
  document.getElementById("btn-enter").disabled = true;
  delete document.getElementById("btn-enter").dataset.userId;
});

// ── Board ─────────────────────────────────────────────────
const COLUMNS = [
  { key: "diaria", label: "Tarefas Diárias",  color: "#3b82f6" },
  { key: "hoje",   label: "Tarefas de Hoje",   color: "#ef4444" },
  { key: "semana", label: "Tarefas da Semana", color: "#f59e0b" },
  { key: "mes",    label: "Tarefas do Mês",    color: "#22c55e" },
];

function renderBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";

  // ← esta linha estava faltando
  const tarefasFiltradas = state.filtroUsuario !== null
    ? state.tarefas.filter(t => t.responsavel === state.filtroUsuario)
    : state.tarefas;

  COLUMNS.forEach(col => {
    const tasks = col.key === "diaria"
      ? tarefasFiltradas.filter(t => t.prazo === "diaria")
      : tarefasFiltradas.filter(t => t.prazo === col.key && !t.concluida);

    const count = col.key === "diaria"
      ? tasks.filter(t => !isDiariaFeitaHoje(t)).length
      : tasks.length;

    const col_el = document.createElement("div");
    col_el.className = "column";
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
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
          </svg>
          <span>Nenhuma tarefa</span>
        </div>`;
    } else {
      const sorted = col.key === "diaria"
        ? [...tasks].sort((a, b) => (isDiariaFeitaHoje(a) ? 1 : 0) - (isDiariaFeitaHoje(b) ? 1 : 0))
        : tasks;
      sorted.forEach(t => body.appendChild(
        col.key === "diaria" ? buildDiariaCard(t) : buildCard(t)
      ));
    }
  });
}

// ── Cards ─────────────────────────────────────────────────
function buildDiariaCard(t) {
  const feita = isDiariaFeitaHoje(t);
  const el = document.createElement("div");
  el.className = `task-card task-card-diaria ${feita ? "diaria-feita" : ""}`;

  const resp     = t.responsavel ? state.users.find(u => u.id === t.responsavel) : null;
  const urgClass = { alta: "urg-alta", media: "urg-media", baixa: "urg-baixa" }[t.urgencia] || "urg-media";

  el.innerHTML = `
    <div class="diaria-top">
      <button class="diaria-checkbox ${feita ? "checked" : ""}" data-id="${t.id}" title="${feita ? "Desmarcar" : "Marcar como feita hoje"}">
        ${feita ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ""}
      </button>
      <div class="card-title diaria-title">${t.nome}</div>
    </div>
    <div class="card-meta" style="padding-left:30px">
      <div class="urgency-dot ${urgClass}"></div>
      ${feita
        ? `<span class="badge badge-concluida">Feita hoje</span>`
        : `<span class="badge badge-pendente">Pendente</span>`}
      ${resp
        ? `<div class="card-resp"><div class="avatar sm">${resp.avatar}</div><span>${resp.nome}</span></div>`
        : `<span style="color:var(--muted2)">Sem resp.</span>`}
    </div>
    ${feita ? `<div class="diaria-reset-hint">↻ Será resetada amanhã</div>` : ""}`;

  el.querySelector(".diaria-checkbox").addEventListener("click", async e => {
    e.stopPropagation();
    const novaData = feita ? null : todayStr();
    try {
      const atualizada = await api.patchTarefa(t.id, { diariaFeitaEm: novaData });
      Object.assign(t, atualizada);
      renderBoard();
    } catch (err) {
      toast(err.message, true);
    }
  });

  el.addEventListener("click", () => openDetail(t.id));
  return el;
}

function buildCard(t) {
  const el = document.createElement("div");
  el.className = "task-card";

  const etapasDone  = t.etapas.filter(e => e.concluida).length;
  const etapasTotal = t.etapas.length;
  const pct         = etapasTotal ? Math.round((etapasDone / etapasTotal) * 100) : 0;

  const resp        = t.responsavel ? state.users.find(u => u.id === t.responsavel) : null;
  const urgClass    = { alta: "urg-alta", media: "urg-media", baixa: "urg-baixa" }[t.urgencia] || "urg-media";
  const statusClass = { pendente: "badge-pendente", "em andamento": "badge-andamento", concluida: "badge-concluida" }[t.status] || "badge-pendente";
  const statusLabel = { pendente: "Pendente", "em andamento": "Em andamento", concluida: "Concluída" }[t.status] || t.status;

  el.innerHTML = `
    <div class="card-title">${t.nome}</div>
    <div class="card-meta">
      <div class="urgency-dot ${urgClass}"></div>
      <span class="badge ${statusClass}">${statusLabel}</span>
      ${t.dataPrazo ? `<span>${formatDate(t.dataPrazo)}</span>` : ""}
    </div>
    ${etapasTotal > 0 ? `
      <div class="card-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span class="progress-text">${etapasDone}/${etapasTotal}</span>
      </div>` : ""}
    <div class="card-footer">
      <span class="card-date">${resp ? "" : "Sem resp."}</span>
      ${resp ? `<div class="card-resp"><div class="avatar sm">${resp.avatar}</div><span>${resp.nome}</span></div>` : ""}
    </div>`;

  el.addEventListener("click", () => openDetail(t.id));
  return el;
}

// ── View: Concluídas ──────────────────────────────────────
document.getElementById("btn-concluded").addEventListener("click", () => {
  document.getElementById("board").classList.add("hidden");
  document.getElementById("concluded-screen").classList.add("visible");
  renderConcluded();
});

document.getElementById("btn-back-board").addEventListener("click", () => {
  document.getElementById("board").classList.remove("hidden");
  document.getElementById("concluded-screen").classList.remove("visible");
});

function renderConcluded() {
  const list = document.getElementById("concluded-list");
  list.innerHTML = "";
  const done = state.tarefas.filter(t => t.concluida);
  if (done.length === 0) {
    list.innerHTML = `<div style="color:var(--muted);font-size:13px;">Nenhuma tarefa concluída ainda.</div>`;
    return;
  }
  done.forEach(t => list.appendChild(buildCard(t)));
}

// ── Modal: Nova Tarefa ────────────────────────────────────
let etapasTemp = [];

document.getElementById("btn-new-task").addEventListener("click", openCreateModal);
document.getElementById("btn-cancel-create").addEventListener("click", closeCreateModal);
document.getElementById("modal-create-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("modal-create-overlay")) closeCreateModal();
});

function openCreateModal() {
  etapasTemp = [];
  document.getElementById("form-create").reset();
  renderEtapasTemp();
  const sel = document.getElementById("input-responsavel");
  sel.innerHTML = '<option value="">Sem responsável</option>';
  state.users.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.nome;
    sel.appendChild(opt);
  });
  document.getElementById("modal-create-overlay").classList.remove("hidden");
}

function closeCreateModal() {
  document.getElementById("modal-create-overlay").classList.add("hidden");
}

document.getElementById("btn-add-etapa").addEventListener("click", addEtapaFromInput);
document.getElementById("input-etapa").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); addEtapaFromInput(); }
});

function addEtapaFromInput() {
  const input = document.getElementById("input-etapa");
  const val = input.value.trim();
  if (!val) return;
  etapasTemp.push({ id: Date.now(), texto: val, concluida: false });
  input.value = "";
  renderEtapasTemp();
}

function renderEtapasTemp() {
  const list = document.getElementById("etapas-temp-list");
  list.innerHTML = "";
  etapasTemp.forEach((e, i) => {
    const el = document.createElement("div");
    el.className = "etapa-item";
    el.innerHTML = `
      <span>${e.texto}</span>
      <button class="btn-remove-etapa" data-i="${i}" title="Remover">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
    el.querySelector(".btn-remove-etapa").addEventListener("click", () => {
      etapasTemp.splice(i, 1);
      renderEtapasTemp();
    });
    list.appendChild(el);
  });
}

document.getElementById("btn-save-create").addEventListener("click", async () => {
  const nome     = document.getElementById("input-nome").value.trim();
  const desc     = document.getElementById("input-desc").value.trim();
  const prazo    = document.getElementById("input-prazo").value;
  const dataPrazo = document.getElementById("input-data-prazo").value || null;
  const urgencia = document.getElementById("input-urgencia").value;
  const respId   = document.getElementById("input-responsavel").value;

  if (!nome)  { toast("Informe o nome da tarefa.", true); return; }
  if (!prazo) { toast("Selecione o tipo de prazo.", true); return; }

  const payload = {
    nome, descricao: desc,
    etapas: etapasTemp.map(e => ({ ...e })),
    prazo, dataPrazo, urgencia,
    responsavel: respId ? parseInt(respId) : null,
    status: "pendente",
    observacoes: "", retorno: "",
    criadoEm: new Date().toISOString(),
    criadoPor: state.current.id,
    concluida: false,
    diariaFeitaEm: null,
  };

  try {
    const nova = await api.criarTarefa(payload);
    state.tarefas.push(nova);
    closeCreateModal();
    renderBoard();
    toast("Tarefa criada com sucesso!");
  } catch (err) {
    toast(err.message, true);
  }
});

// ── Modal: Detalhe ────────────────────────────────────────
const modalDetail = document.getElementById("modal-detail-overlay");

document.getElementById("btn-close-detail").addEventListener("click", closeDetail);
modalDetail.addEventListener("click", e => { if (e.target === modalDetail) closeDetail(); });

function openDetail(id) {
  const t = state.tarefas.find(t => t.id === id);
  if (!t) return;

  document.getElementById("detail-title").textContent    = t.nome;
  document.getElementById("detail-subtitle").textContent = `Criado em ${formatDate(t.criadoEm)}`;
  document.getElementById("detail-desc").textContent     = t.descricao || "Sem descrição.";

  // checklist
  const checklist = document.getElementById("detail-checklist");
  checklist.innerHTML = "";
  if (t.etapas.length === 0) {
    checklist.innerHTML = `<span style="color:var(--muted);font-size:12px;">Sem etapas definidas.</span>`;
  } else {
    t.etapas.forEach(etapa => {
      const item = document.createElement("div");
      item.className = `check-item ${etapa.concluida ? "done" : ""}`;
      item.innerHTML = `
        <div class="check-box">
          ${etapa.concluida ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ""}
        </div>
        <span class="check-label">${etapa.texto}</span>`;
      item.addEventListener("click", async () => {
        etapa.concluida = !etapa.concluida;
        try {
          await api.atualizarTarefa(t.id, t);
          openDetail(id);
          renderBoard();
        } catch (err) {
          etapa.concluida = !etapa.concluida; // reverte em caso de erro
          toast(err.message, true);
        }
      });
      checklist.appendChild(item);
    });
  }

  // meta
  document.getElementById("detail-status").textContent   = labelStatus(t.status);
  document.getElementById("detail-urgencia").textContent = labelUrgencia(t.urgencia);
  document.getElementById("detail-prazo").textContent    = t.dataPrazo ? formatDate(t.dataPrazo) : "—";

  // select responsável
  const sel = document.getElementById("detail-responsavel");
  sel.innerHTML = '<option value="">Sem responsável</option>';
  state.users.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.nome;
    if (t.responsavel === u.id) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = async () => {
    t.responsavel = sel.value ? parseInt(sel.value) : null;
    try { await api.atualizarTarefa(t.id, t); renderBoard(); }
    catch (err) { toast(err.message, true); }
  };

  // select status
  const selStatus = document.getElementById("detail-status-sel");
  selStatus.value = t.status;
  selStatus.onchange = async () => {
    t.status = selStatus.value;
    try {
      await api.atualizarTarefa(t.id, t);
      renderBoard();
      document.getElementById("detail-status").textContent = labelStatus(t.status);
    } catch (err) { toast(err.message, true); }
  };

  // observações e retorno — salva com debounce
  document.getElementById("detail-obs").value     = t.observacoes || "";
  document.getElementById("detail-retorno").value = t.retorno || "";

  document.getElementById("detail-obs").oninput = debounce(async () => {
    t.observacoes = document.getElementById("detail-obs").value;
    try { await api.patchTarefa(t.id, { observacoes: t.observacoes }); }
    catch (err) { toast(err.message, true); }
  }, 600);

  document.getElementById("detail-retorno").oninput = debounce(async () => {
    t.retorno = document.getElementById("detail-retorno").value;
    try { await api.patchTarefa(t.id, { retorno: t.retorno }); }
    catch (err) { toast(err.message, true); }
  }, 600);

  // botão concluir
  const btnConcluir = document.getElementById("btn-concluir");
  btnConcluir.textContent = t.concluida ? "Reabrir Tarefa" : "Concluir Tarefa";
  btnConcluir.className   = t.concluida ? "btn btn-ghost"  : "btn btn-primary";

  btnConcluir.onclick = async () => {
    t.concluida = !t.concluida;
    t.status    = t.concluida ? "concluida" : "pendente";
    try {
      await api.atualizarTarefa(t.id, t);
      closeDetail();
      renderBoard();
      if (document.getElementById("concluded-screen").classList.contains("visible")) renderConcluded();
      toast(t.concluida ? "Tarefa concluída!" : "Tarefa reaberta.");
    } catch (err) {
      t.concluida = !t.concluida; // reverte
      t.status    = t.concluida ? "concluida" : "pendente";
      toast(err.message, true);
    }
  };

  modalDetail.classList.remove("hidden");
}

function closeDetail() {
  modalDetail.classList.add("hidden");
}

// ── Helpers ───────────────────────────────────────────────
function formatDate(str) {
  if (!str) return "";
  const d = new Date(str.includes("T") ? str : str + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function labelStatus(s) {
  return { pendente: "Pendente", "em andamento": "Em andamento", concluida: "Concluída" }[s] || s;
}
function labelUrgencia(u) {
  return { alta: "🔴 Alta", media: "🟡 Média", baixa: "🔵 Baixa" }[u] || u;
}

function toast(msg, error = false) {
  const c  = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className  = `toast ${error ? "error" : ""}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

// ── Init ──────────────────────────────────────────────────
boot();
