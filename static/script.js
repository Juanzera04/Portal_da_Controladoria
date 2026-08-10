/* ============================================================
   Portal da Controladoria — script.js
   ============================================================ */

const API = "";

// ── Tema (paleta de cor) ──────────────────────────────────
function applyAccent(name) {
  document.documentElement.setAttribute("data-accent", name);
  localStorage.setItem("accent", name);
  document.querySelectorAll(".theme-swatch").forEach(b =>
    b.classList.toggle("selected", b.dataset.accent === name)
  );
}
document.querySelectorAll(".theme-swatch").forEach(b =>
  b.addEventListener("click", () => applyAccent(b.dataset.accent))
);
applyAccent(localStorage.getItem("accent") || "green");

let state = {
  users:        [],
  tarefas:      [],
  current:      null,
  filtroUsuario: null,
  filtroConcluidoUsuario:  null,
  filtroConcluidoPeriodo:  "todos",
};

// ── API helpers ───────────────────────────────────────────
async function apiFetch(method, path, body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
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
  getTarefas:      ()         => apiFetch("GET",    "/api/tarefas"),
  criarTarefa:     (t)        => apiFetch("POST",   "/api/tarefas", t),
  atualizarTarefa: (id, t)    => apiFetch("PUT",    `/api/tarefas/${id}`, t),
  patchTarefa:     (id, body) => apiFetch("PATCH",  `/api/tarefas/${id}`, body),
  deletarTarefa:   (id)       => apiFetch("DELETE", `/api/tarefas/${id}`),
  getUsuarios:     ()         => apiFetch("GET",    "/api/usuarios"),
  criarUsuario:    (u)        => apiFetch("POST",   "/api/usuarios", u),
  atualizarUsuario:(id, u)    => apiFetch("PUT",    `/api/usuarios/${id}`, u),
  deletarUsuario:  (id)       => apiFetch("DELETE", `/api/usuarios/${id}`),
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

  const savedId = document.cookie
    .split("; ")
    .find(r => r.startsWith("currentUserId="))
    ?.split("=")[1];

  if (savedId) {
    const user = state.users.find(u => u.id === parseInt(savedId));
    if (user) {
      state.current = user;
      enterApp();
      return;
    }
  }

  renderLoginUsers();
}

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

// ── Avatar (foto de perfil) ───────────────────────────────
// u.fotoPerfil é uma data URL (base64) opcional; sem ela, cai nas iniciais em u.avatar.
function avatarHTML(u, extraClass = "") {
  const cls = "avatar" + (extraClass ? " " + extraClass : "");
  if (u && u.fotoPerfil) {
    return `<div class="${cls}"><img src="${u.fotoPerfil}" alt=""></div>`;
  }
  return `<div class="${cls}">${u ? (u.avatar || "") : ""}</div>`;
}

function setAvatarEl(el, u) {
  el.innerHTML = u && u.fotoPerfil
    ? `<img src="${u.fotoPerfil}" alt="">`
    : (u ? (u.avatar || "") : "");
}

// Redimensiona a imagem escolhida no cliente antes de mandar como base64,
// pra não inflar o banco com fotos em resolução original.
function resizeImageToBase64(file, maxSize = 160, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo não é uma imagem válida."));
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
        } else {
          if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
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
      ${avatarHTML(u)}
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

// ── Enter / Logout ────────────────────────────────────────
function enterApp() {
  document.cookie = `currentUserId=${state.current.id};path=/;max-age=86400`;
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app").classList.add("visible");
  document.getElementById("sb-user-name").textContent   = state.current.nome;
  document.getElementById("sb-user-cargo").textContent  = state.current.cargo;
  setAvatarEl(document.getElementById("sb-user-avatar"), state.current);
  document.getElementById("nav-admin").classList.toggle("hidden", !state.current.isAdmin);
  renderFiltroUsuarios();
  renderBoard();
}

document.getElementById("btn-logout").addEventListener("click", () => {
  state.current      = null;
  state.filtroUsuario = null;
  document.cookie = "currentUserId=;path=/;max-age=0";
  document.getElementById("app").classList.remove("visible");
  document.getElementById("login-screen").style.display = "";
  document.querySelectorAll(".user-option").forEach(o => o.classList.remove("selected"));
  document.getElementById("btn-enter").disabled = true;
  delete document.getElementById("btn-enter").dataset.userId;
  const bar = document.getElementById("filtro-usuario-bar");
  if (bar) bar.remove();
  document.getElementById("nav-admin").classList.add("hidden");
  showBoardView();
});

// ── Foto de perfil (qualquer usuário, não só admin) ───────
// Clicar no próprio avatar da sidebar revela o botão de trocar a foto —
// self-service, sem precisar passar pelo Gerenciador de Base.
document.getElementById("sb-avatar-edit-wrap").addEventListener("click", () => {
  if (!state.current) return;
  document.getElementById("sb-user-foto-input").click();
});

document.getElementById("sb-user-foto-input").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !state.current) return;

  try {
    const fotoPerfil = await resizeImageToBase64(file);
    const payload = {
      nome:       state.current.nome,
      cargo:      state.current.cargo,
      avatar:     state.current.avatar,
      isAdmin:    state.current.isAdmin,
      fotoPerfil,
    };
    const atualizado = await api.atualizarUsuario(state.current.id, payload);
    state.current = atualizado;
    const idx = state.users.findIndex(u => u.id === atualizado.id);
    if (idx !== -1) state.users[idx] = atualizado;

    setAvatarEl(document.getElementById("sb-user-avatar"), state.current);
    renderBoard();
    renderFiltroUsuarios();
    toast("Foto de perfil atualizada.");
  } catch (err) {
    toast(err.message, true);
  }
});

// ── Filtro de Usuário ─────────────────────────────────────
function renderFiltroUsuarios() {
  const existing = document.getElementById("filtro-usuario-bar");
  if (existing) existing.remove();

  const bar = document.createElement("div");
  bar.id = "filtro-usuario-bar";
  bar.className = "filtro-bar";

  const group = document.createElement("div");
  group.className = "filtro-group";

  const label = document.createElement("span");
  label.className = "filtro-group-label";
  label.textContent = "Filtrar:";
  group.appendChild(label);

  // Botão Todos
  const btnTodos = document.createElement("button");
  btnTodos.className = "filtro-btn" + (state.filtroUsuario === null ? " active" : "");
  btnTodos.textContent = "Todos";
  btnTodos.onclick = () => {
    state.filtroUsuario = null;
    renderFiltroUsuarios();
    renderBoard();
  };
  group.appendChild(btnTodos);

  // Botão por usuário
  state.users.forEach(u => {
    const btn = document.createElement("button");
    btn.className = "filtro-btn" + (state.filtroUsuario === u.id ? " active" : "");
    btn.innerHTML = `${u.avatar} ${u.nome}`;
    btn.onclick = () => {
      state.filtroUsuario = u.id;
      renderFiltroUsuarios();
      renderBoard();
    };
    group.appendChild(btn);
  });

  bar.appendChild(group);

  // Insere entre topbar e board
  const main   = document.getElementById("main");
  const topbar = document.getElementById("topbar");
  main.insertBefore(bar, topbar.nextSibling);

  // Só faz sentido enquanto o board está na tela — as telas de
  // concluídas/admin têm seus próprios filtros ou nenhum.
  bar.classList.toggle("hidden", document.getElementById("board").classList.contains("hidden"));
}

// ── Board ─────────────────────────────────────────────────
const COLUMNS = [
  { key: "diaria", label: "Tarefas Diárias",  color: "#3b82f6" },
  { key: "hoje",   label: "Tarefas de Hoje",   color: "#ef4444" },
  { key: "semana", label: "Tarefas da Semana", color: "#f59e0b" },
  { key: "mes",    label: "Tarefas do Mês",    color: "var(--green)" },
];

function renderBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";

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

    body.addEventListener("dragover", e => {
      e.preventDefault();
      body.classList.add("drag-over");
    });
    body.addEventListener("dragleave", () => body.classList.remove("drag-over"));
    body.addEventListener("drop", async e => {
      e.preventDefault();
      body.classList.remove("drag-over");
      const id = Number(e.dataTransfer.getData("text/plain"));
      const t  = state.tarefas.find(x => x.id === id);
      if (!t || t.prazo === col.key) return;

      const prazoAnterior = t.prazo;
      t.prazo = col.key;
      renderBoard();
      try {
        await api.atualizarTarefa(t.id, t);
      } catch (err) {
        t.prazo = prazoAnterior;
        renderBoard();
        toast(err.message, true);
      }
    });

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
  el.draggable = true;
  el.addEventListener("dragstart", e => {
    e.dataTransfer.setData("text/plain", String(t.id));
    e.dataTransfer.effectAllowed = "move";
    el.classList.add("dragging");
  });
  el.addEventListener("dragend", () => el.classList.remove("dragging"));

  const resp     = t.responsavel ? state.users.find(u => u.id === t.responsavel) : null;
  const urgClass = { alta: "urg-alta", media: "urg-media", baixa: "urg-baixa" }[t.urgencia] || "urg-media";

  el.innerHTML = `
    <div class="diaria-top">
      <button class="diaria-checkbox ${feita ? "checked" : ""}" data-id="${t.id}" title="${feita ? "Desmarcar" : "Marcar como feita hoje"}">
        ${feita ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ""}
      </button>
      <div class="card-title diaria-title">${t.nome}</div>
      <button class="diaria-delete" title="Excluir tarefa diária">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    </div>
    <div class="card-meta" style="padding-left:30px">
      <div class="urgency-dot ${urgClass}"></div>
      ${feita
        ? `<span class="badge badge-concluida">Feita hoje</span>`
        : `<span class="badge badge-pendente">Pendente</span>`}
      ${resp
        ? `<div class="card-resp">${avatarHTML(resp, "sm")}<span>${resp.nome}</span></div>`
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

  el.querySelector(".diaria-delete").addEventListener("click", async e => {
    e.stopPropagation();
    const ok = await showConfirm(`Excluir a tarefa diária "${t.nome}" permanentemente? Essa ação não pode ser desfeita.`);
    if (!ok) return;
    try {
      await api.deletarTarefa(t.id);
      state.tarefas = state.tarefas.filter(x => x.id !== t.id);
      renderBoard();
      toast("Tarefa diária excluída.");
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
  el.draggable = true;
  el.addEventListener("dragstart", e => {
    e.dataTransfer.setData("text/plain", String(t.id));
    e.dataTransfer.effectAllowed = "move";
    el.classList.add("dragging");
  });
  el.addEventListener("dragend", () => el.classList.remove("dragging"));

  const etapasDone  = t.etapas.filter(e => e.concluida).length;
  const etapasTotal = t.etapas.length;
  const pct         = etapasTotal ? Math.round((etapasDone / etapasTotal) * 100) : 0;

  const resp        = t.responsavel ? state.users.find(u => u.id === t.responsavel) : null;
  const urgClass    = { alta: "urg-alta", media: "urg-media", baixa: "urg-baixa" }[t.urgencia] || "urg-media";
  const statusClass = { pendente: "badge-pendente", "em andamento": "badge-andamento", concluida: "badge-concluida" }[t.status] || "badge-pendente";
  const statusLabel = { pendente: "Pendente", "em andamento": "Em andamento", concluida: "Concluída" }[t.status] || t.status;

  const concluidor = t.concluida
    ? state.users.find(u => u.id === (t.concluidoPor || t.responsavel))
    : null;

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
      ${resp ? `<div class="card-resp">${avatarHTML(resp, "sm")}<span>${resp.nome}</span></div>` : ""}
    </div>
    ${t.concluida && t.concluidoEm ? `
      <div class="card-concluido-info">Concluída em ${formatDate(t.concluidoEm)}${concluidor ? ` por ${concluidor.nome}` : ""}</div>
    ` : ""}`;

  el.addEventListener("click", () => openDetail(t.id));
  return el;
}

// ── View: Concluídas ──────────────────────────────────────
document.getElementById("btn-concluded").addEventListener("click", () => {
  document.getElementById("board").classList.add("hidden");
  document.getElementById("filtro-usuario-bar")?.classList.add("hidden");
  document.getElementById("concluded-screen").classList.add("visible");
  renderConcluded();
});

document.getElementById("btn-back-board").addEventListener("click", showBoardView);

function dentroDoPeriodo(t, periodo) {
  if (!t.concluidoEm) return false;
  if (periodo === "hoje") return t.concluidoEm.slice(0, 10) === todayStr();
  const dias = periodo === "semana" ? 7 : 30;
  return new Date(t.concluidoEm).getTime() >= Date.now() - dias * 86400000;
}

function renderConcluded() {
  renderFiltrosConcluidas();

  const list = document.getElementById("concluded-list");
  list.innerHTML = "";

  let done = state.tarefas.filter(t => t.concluida);
  const temFiltro = state.filtroConcluidoUsuario !== null || state.filtroConcluidoPeriodo !== "todos";

  if (state.filtroConcluidoUsuario !== null) {
    done = done.filter(t => (t.concluidoPor || t.responsavel) === state.filtroConcluidoUsuario);
  }
  if (state.filtroConcluidoPeriodo !== "todos") {
    done = done.filter(t => dentroDoPeriodo(t, state.filtroConcluidoPeriodo));
  }

  // Mais recentes primeiro; tarefas concluídas antes desse campo existir
  // (sem concluidoEm) ficam no final, sem quebrar a ordenação das outras.
  done = [...done].sort((a, b) => {
    if (!a.concluidoEm && !b.concluidoEm) return 0;
    if (!a.concluidoEm) return 1;
    if (!b.concluidoEm) return -1;
    return new Date(b.concluidoEm) - new Date(a.concluidoEm);
  });

  document.getElementById("concluded-count").textContent =
    `${done.length} ${done.length === 1 ? "tarefa" : "tarefas"}`;

  if (done.length === 0) {
    list.innerHTML = `<div style="color:var(--muted);font-size:13px;">Nenhuma tarefa concluída${temFiltro ? " com esse filtro" : " ainda"}.</div>`;
    return;
  }
  done.forEach(t => list.appendChild(buildCard(t)));
}

// ── Filtros da tela de Concluídas ──────────────────────────
function renderFiltrosConcluidas() {
  const existing = document.getElementById("filtro-concluidas-bar");
  if (existing) existing.remove();

  const bar = document.createElement("div");
  bar.id = "filtro-concluidas-bar";
  bar.className = "filtro-bar";

  const addGroup = (labelTxt) => {
    const group = document.createElement("div");
    group.className = "filtro-group";
    const label = document.createElement("span");
    label.className = "filtro-group-label";
    label.textContent = labelTxt;
    group.appendChild(label);
    bar.appendChild(group);
    return group;
  };
  const addBtn = (group, html, ativo, onClick) => {
    const btn = document.createElement("button");
    btn.className = "filtro-btn" + (ativo ? " active" : "");
    btn.innerHTML = html;
    btn.onclick = onClick;
    group.appendChild(btn);
  };

  const groupUser = addGroup("Concluído por");
  addBtn(groupUser, "Todos", state.filtroConcluidoUsuario === null, () => {
    state.filtroConcluidoUsuario = null;
    renderConcluded();
  });
  state.users.forEach(u => {
    addBtn(groupUser, `${u.avatar} ${u.nome}`, state.filtroConcluidoUsuario === u.id, () => {
      state.filtroConcluidoUsuario = u.id;
      renderConcluded();
    });
  });

  const sep = document.createElement("span");
  sep.className = "filtro-sep";
  bar.appendChild(sep);

  const groupPeriodo = addGroup("Período");
  [["todos", "Todos"], ["hoje", "Hoje"], ["semana", "Últimos 7 dias"], ["mes", "Últimos 30 dias"]]
    .forEach(([key, label]) => {
      addBtn(groupPeriodo, label, state.filtroConcluidoPeriodo === key, () => {
        state.filtroConcluidoPeriodo = key;
        renderConcluded();
      });
    });

  const topbar = document.querySelector("#concluded-screen .concluded-topbar");
  topbar.insertAdjacentElement("afterend", bar);
}

// ── View: navegação entre Board / Gerenciador de Base ─────
function showBoardView() {
  document.getElementById("admin-screen").classList.remove("visible");
  document.getElementById("concluded-screen").classList.remove("visible");
  document.getElementById("board").classList.remove("hidden");
  document.getElementById("filtro-usuario-bar")?.classList.remove("hidden");
  document.getElementById("nav-board").classList.add("active");
  document.getElementById("nav-admin").classList.remove("active");
}

document.getElementById("nav-board").addEventListener("click", showBoardView);

document.getElementById("nav-admin").addEventListener("click", () => {
  document.getElementById("board").classList.add("hidden");
  document.getElementById("filtro-usuario-bar")?.classList.add("hidden");
  document.getElementById("concluded-screen").classList.remove("visible");
  document.getElementById("admin-screen").classList.add("visible");
  document.getElementById("nav-admin").classList.add("active");
  document.getElementById("nav-board").classList.remove("active");
  renderAdminTarefas();
  renderAdminUsuarios();
});

document.getElementById("btn-back-board-admin").addEventListener("click", showBoardView);

document.getElementById("admin-tab-tarefas").addEventListener("click", () => switchAdminTab("tarefas"));
document.getElementById("admin-tab-usuarios").addEventListener("click", () => switchAdminTab("usuarios"));

function switchAdminTab(tab) {
  document.getElementById("admin-tab-tarefas").classList.toggle("active", tab === "tarefas");
  document.getElementById("admin-tab-usuarios").classList.toggle("active", tab === "usuarios");
  document.getElementById("admin-tarefas-wrap").classList.toggle("hidden", tab !== "tarefas");
  document.getElementById("admin-usuarios-wrap").classList.toggle("hidden", tab !== "usuarios");
}

// ── Gerenciador de Base: tabelas ──────────────────────────
function renderAdminTarefas() {
  const tbody = document.getElementById("admin-tarefas-tbody");
  tbody.innerHTML = "";
  state.tarefas.forEach(t => {
    const resp = t.responsavel ? state.users.find(u => u.id === t.responsavel) : null;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.id}</td>
      <td class="admin-nome-cell">${t.nome}</td>
      <td>${t.prazo}</td>
      <td>${labelStatus(t.status)}</td>
      <td>${labelUrgencia(t.urgencia)}</td>
      <td>${resp ? resp.nome : "—"}</td>
      <td>${t.concluida ? "Sim" : "Não"}</td>
      <td>
        <div class="admin-row-actions">
          <button class="btn-admin-action" data-action="edit">Editar</button>
          <button class="btn-admin-action danger" data-action="delete">Excluir</button>
        </div>
      </td>`;
    tr.querySelector('[data-action="edit"]').addEventListener("click", () => openAdminTarefaModal(t.id));
    tr.querySelector('[data-action="delete"]').addEventListener("click", () => deleteAdminTarefa(t.id));
    tbody.appendChild(tr);
  });
}

function renderAdminUsuarios() {
  const tbody = document.getElementById("admin-usuarios-tbody");
  tbody.innerHTML = "";
  state.users.forEach(u => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.id}</td>
      <td class="admin-nome-cell">${u.nome}</td>
      <td>${u.cargo || "—"}</td>
      <td>${u.avatar || "—"}</td>
      <td>${u.isAdmin ? "Sim" : "Não"}</td>
      <td>
        <div class="admin-row-actions">
          <button class="btn-admin-action" data-action="edit">Editar</button>
          <button class="btn-admin-action danger" data-action="delete">Excluir</button>
        </div>
      </td>`;
    tr.querySelector('[data-action="edit"]').addEventListener("click", () => openAdminUsuarioModal(u.id));
    tr.querySelector('[data-action="delete"]').addEventListener("click", () => deleteAdminUsuario(u.id));
    tbody.appendChild(tr);
  });
}

async function deleteAdminTarefa(id) {
  const t = state.tarefas.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`Excluir a tarefa "${t.nome}" permanentemente? Essa ação não pode ser desfeita.`)) return;
  try {
    await api.deletarTarefa(id);
    state.tarefas = state.tarefas.filter(x => x.id !== id);
    renderAdminTarefas();
    renderBoard();
    toast("Tarefa excluída.");
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteAdminUsuario(id) {
  const u = state.users.find(x => x.id === id);
  if (!u) return;
  if (!confirm(`Excluir o usuário "${u.nome}" permanentemente?`)) return;
  try {
    await api.deletarUsuario(id);
    state.users = state.users.filter(x => x.id !== id);
    renderAdminUsuarios();
    renderFiltroUsuarios();
    renderBoard();
    toast("Usuário excluído.");
  } catch (err) {
    toast(err.message, true);
  }
}

// ── Gerenciador de Base: editar tarefa ────────────────────
let adminEditingTarefaId = null;

function openAdminTarefaModal(id) {
  const t = state.tarefas.find(x => x.id === id);
  if (!t) return;
  adminEditingTarefaId = id;

  document.getElementById("admin-tarefa-id-label").textContent = `ID ${t.id}`;
  document.getElementById("admin-t-nome").value        = t.nome;
  document.getElementById("admin-t-descricao").value    = t.descricao || "";
  document.getElementById("admin-t-prazo").value        = t.prazo;
  document.getElementById("admin-t-data-prazo").value   = t.dataPrazo || "";
  document.getElementById("admin-t-urgencia").value     = t.urgencia;
  document.getElementById("admin-t-status").value       = t.status;
  document.getElementById("admin-t-concluida").value    = t.concluida ? "true" : "false";
  document.getElementById("admin-t-observacoes").value  = t.observacoes || "";
  document.getElementById("admin-t-retorno").value      = t.retorno || "";
  document.getElementById("admin-t-etapas").value       = JSON.stringify(t.etapas || [], null, 2);

  const sel = document.getElementById("admin-t-responsavel");
  sel.innerHTML = '<option value="">Sem responsável</option>';
  state.users.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.nome;
    if (t.responsavel === u.id) opt.selected = true;
    sel.appendChild(opt);
  });

  document.getElementById("modal-admin-tarefa-overlay").classList.remove("hidden");
}

function closeAdminTarefaModal() {
  document.getElementById("modal-admin-tarefa-overlay").classList.add("hidden");
  adminEditingTarefaId = null;
}

document.getElementById("btn-close-admin-tarefa").addEventListener("click", closeAdminTarefaModal);
document.getElementById("btn-cancel-admin-tarefa").addEventListener("click", closeAdminTarefaModal);
document.getElementById("modal-admin-tarefa-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("modal-admin-tarefa-overlay")) closeAdminTarefaModal();
});

document.getElementById("btn-save-admin-tarefa").addEventListener("click", async () => {
  const t = state.tarefas.find(x => x.id === adminEditingTarefaId);
  if (!t) return;

  let etapas;
  try {
    etapas = JSON.parse(document.getElementById("admin-t-etapas").value || "[]");
  } catch (e) {
    toast("Etapas: JSON inválido.", true);
    return;
  }

  const respVal = document.getElementById("admin-t-responsavel").value;
  const payload = {
    nome:        document.getElementById("admin-t-nome").value.trim(),
    descricao:   document.getElementById("admin-t-descricao").value,
    etapas,
    prazo:       document.getElementById("admin-t-prazo").value,
    dataPrazo:   document.getElementById("admin-t-data-prazo").value || null,
    urgencia:    document.getElementById("admin-t-urgencia").value,
    responsavel: respVal ? parseInt(respVal) : null,
    status:      document.getElementById("admin-t-status").value,
    observacoes: document.getElementById("admin-t-observacoes").value,
    retorno:     document.getElementById("admin-t-retorno").value,
    criadoEm:    t.criadoEm,
    criadoPor:   t.criadoPor,
    concluida:   document.getElementById("admin-t-concluida").value === "true",
    diariaFeitaEm: t.diariaFeitaEm,
  };

  if (!payload.nome) { toast("Informe o nome da tarefa.", true); return; }

  try {
    const atualizada = await api.atualizarTarefa(t.id, payload);
    Object.assign(t, atualizada);
    closeAdminTarefaModal();
    renderAdminTarefas();
    renderBoard();
    toast("Tarefa atualizada.");
  } catch (err) {
    toast(err.message, true);
  }
});

// ── Gerenciador de Base: editar usuário ───────────────────
let adminEditingUsuarioId = null;
let adminEditingUsuarioFoto = null; // data URL atual (ou null) enquanto o modal está aberto

function openAdminUsuarioModal(id) {
  const u = state.users.find(x => x.id === id);
  if (!u) return;
  adminEditingUsuarioId = id;
  adminEditingUsuarioFoto = u.fotoPerfil || null;

  document.getElementById("admin-usuario-id-label").textContent = `ID ${u.id}`;
  document.getElementById("admin-u-nome").value     = u.nome;
  document.getElementById("admin-u-cargo").value    = u.cargo || "";
  document.getElementById("admin-u-avatar").value   = u.avatar || "";
  document.getElementById("admin-u-isadmin").checked = !!u.isAdmin;
  setAvatarEl(document.getElementById("admin-u-foto-preview"), u);
  document.getElementById("admin-u-foto-input").value = "";

  document.getElementById("modal-admin-usuario-overlay").classList.remove("hidden");
}

function closeAdminUsuarioModal() {
  document.getElementById("modal-admin-usuario-overlay").classList.add("hidden");
  adminEditingUsuarioId = null;
  adminEditingUsuarioFoto = null;
}

document.getElementById("btn-close-admin-usuario").addEventListener("click", closeAdminUsuarioModal);
document.getElementById("btn-cancel-admin-usuario").addEventListener("click", closeAdminUsuarioModal);
document.getElementById("modal-admin-usuario-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("modal-admin-usuario-overlay")) closeAdminUsuarioModal();
});

document.getElementById("btn-admin-u-foto-escolher").addEventListener("click", () => {
  document.getElementById("admin-u-foto-input").click();
});

document.getElementById("admin-u-foto-input").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    adminEditingUsuarioFoto = await resizeImageToBase64(file);
    setAvatarEl(document.getElementById("admin-u-foto-preview"), {
      fotoPerfil: adminEditingUsuarioFoto,
      avatar: document.getElementById("admin-u-avatar").value.trim(),
    });
  } catch (err) {
    toast(err.message, true);
  }
});

document.getElementById("btn-admin-u-foto-remover").addEventListener("click", () => {
  adminEditingUsuarioFoto = null;
  document.getElementById("admin-u-foto-input").value = "";
  setAvatarEl(document.getElementById("admin-u-foto-preview"), {
    fotoPerfil: null,
    avatar: document.getElementById("admin-u-avatar").value.trim(),
  });
});

document.getElementById("btn-save-admin-usuario").addEventListener("click", async () => {
  const u = state.users.find(x => x.id === adminEditingUsuarioId);
  if (!u) return;

  const nome = document.getElementById("admin-u-nome").value.trim();
  if (!nome) { toast("Informe o nome do usuário.", true); return; }

  const payload = {
    nome,
    cargo:      document.getElementById("admin-u-cargo").value.trim() || "Colaborador",
    avatar:     document.getElementById("admin-u-avatar").value.trim() || null,
    isAdmin:    document.getElementById("admin-u-isadmin").checked,
    fotoPerfil: adminEditingUsuarioFoto,
  };

  try {
    const atualizado = await api.atualizarUsuario(u.id, payload);
    Object.assign(u, atualizado);
    closeAdminUsuarioModal();
    renderAdminUsuarios();
    renderFiltroUsuarios();
    renderBoard();
    if (state.current && state.current.id === u.id) {
      state.current = u;
      document.getElementById("sb-user-name").textContent   = u.nome;
      document.getElementById("sb-user-cargo").textContent  = u.cargo;
      setAvatarEl(document.getElementById("sb-user-avatar"), u);
      document.getElementById("nav-admin").classList.toggle("hidden", !u.isAdmin);
    }
    toast("Usuário atualizado.");
  } catch (err) {
    toast(err.message, true);
  }
});

// ── Modal: Nova Tarefa ────────────────────────────────────
let etapasTemp = [];

document.getElementById("btn-new-task").addEventListener("click", openCreateModal);
document.getElementById("btn-cancel-create").addEventListener("click", closeCreateModal);
document.getElementById("modal-create-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("modal-create-overlay")) closeCreateModal();
});

function openCreateModal() {
  // Mantém o que já foi digitado de uma tentativa anterior (não reseta o
  // form nem etapasTemp aqui) — só é limpo depois de criar com sucesso.
  renderEtapasTemp();
  const sel = document.getElementById("input-responsavel");
  const prevResponsavel = sel.value;
  sel.innerHTML = '<option value="">Sem responsável</option>';
  state.users.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.nome;
    sel.appendChild(opt);
  });
  sel.value = prevResponsavel;
  document.getElementById("modal-create-overlay").classList.remove("hidden");
  document.getElementById("input-nome").focus();
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
  const nome      = document.getElementById("input-nome").value.trim();
  const desc      = document.getElementById("input-desc").value.trim();
  const prazo     = document.getElementById("input-prazo").value;
  const dataPrazo = document.getElementById("input-data-prazo").value || null;
  const urgencia  = document.getElementById("input-urgencia").value;
  const respId    = document.getElementById("input-responsavel").value;

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
    document.getElementById("form-create").reset();
    etapasTemp = [];
    renderEtapasTemp();
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

  // Mostra o modal ANTES de mexer nos campos: autoGrowTextarea mede
  // scrollHeight, e um elemento dentro de display:none sempre mede 0 --
  // isso fazia os campos abrirem sempre no tamanho mínimo, ignorando o
  // texto já salvo (que só aparecia no tamanho certo depois de digitar).
  modalDetail.classList.remove("hidden");

  document.getElementById("detail-title").textContent    = t.nome;
  document.getElementById("detail-subtitle").textContent = `Criado em ${formatDate(t.criadoEm)}`;

  document.getElementById("btn-edit-title").onclick = () => startEditTitle(t, id);

  const inputDesc = document.getElementById("detail-desc");
  inputDesc.value = t.descricao || "";
  autoGrowTextarea(inputDesc, 120);
  const salvarDescDebounced = debounce(async () => {
    t.descricao = inputDesc.value;
    try { await api.patchTarefa(t.id, { descricao: t.descricao }); }
    catch (err) { toast(err.message, true); }
  }, 600);
  inputDesc.oninput = () => { autoGrowTextarea(inputDesc, 120); salvarDescDebounced(); };

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
        <span class="check-label">${etapa.texto}</span>
        <div class="check-actions">
          <button class="btn-edit-etapa" title="Editar etapa">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="btn-remove-etapa" title="Excluir etapa">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>`;
      item.addEventListener("click", async () => {
        etapa.concluida = !etapa.concluida;
        try {
          await api.atualizarTarefa(t.id, t);
          openDetail(id);
          renderBoard();
        } catch (err) {
          etapa.concluida = !etapa.concluida;
          toast(err.message, true);
        }
      });
      item.querySelector(".btn-edit-etapa").addEventListener("click", e => {
        e.stopPropagation();
        startEditEtapa(t, etapa, item, id);
      });
      item.querySelector(".btn-remove-etapa").addEventListener("click", async e => {
        e.stopPropagation();
        const ok = await showConfirm(`Excluir a etapa "${etapa.texto}"?`, {
          title: "Excluir etapa",
          confirmLabel: "Excluir",
        });
        if (!ok) return;
        t.etapas = t.etapas.filter(e2 => e2 !== etapa);
        try {
          await api.atualizarTarefa(t.id, t);
          openDetail(id);
          renderBoard();
          toast("Etapa excluída.");
        } catch (err) {
          toast(err.message, true);
        }
      });
      checklist.appendChild(item);
    });
  }

  const inputNovaEtapa = document.getElementById("detail-input-etapa");
  inputNovaEtapa.value = "";
  const addEtapaDetail = async () => {
    const val = inputNovaEtapa.value.trim();
    if (!val) return;
    t.etapas.push({ id: Date.now(), texto: val, concluida: false });
    try {
      await api.atualizarTarefa(t.id, t);
      openDetail(id);
      renderBoard();
    } catch (err) {
      t.etapas.pop();
      toast(err.message, true);
    }
  };
  document.getElementById("btn-detail-add-etapa").onclick = addEtapaDetail;
  inputNovaEtapa.onkeydown = e => {
    if (e.key === "Enter") { e.preventDefault(); addEtapaDetail(); }
  };

  const selPrazo = document.getElementById("detail-prazo-sel");
  selPrazo.value = t.prazo;
  selPrazo.onchange = async () => {
    const prazoAnterior = t.prazo;
    t.prazo = selPrazo.value;
    try {
      await api.atualizarTarefa(t.id, t);
      renderBoard();
    } catch (err) {
      t.prazo = prazoAnterior;
      selPrazo.value = prazoAnterior;
      toast(err.message, true);
    }
  };

  const inputDataPrazo = document.getElementById("detail-data-prazo-sel");
  inputDataPrazo.value = t.dataPrazo || "";
  inputDataPrazo.onchange = async () => {
    const dataAnterior = t.dataPrazo;
    t.dataPrazo = inputDataPrazo.value || null;
    try {
      await api.atualizarTarefa(t.id, t);
      renderBoard();
    } catch (err) {
      t.dataPrazo = dataAnterior;
      inputDataPrazo.value = dataAnterior || "";
      toast(err.message, true);
    }
  };

  const selUrgencia = document.getElementById("detail-urgencia-sel");
  selUrgencia.value = t.urgencia;
  selUrgencia.onchange = async () => {
    const urgenciaAnterior = t.urgencia;
    t.urgencia = selUrgencia.value;
    try {
      await api.atualizarTarefa(t.id, t);
      renderBoard();
    } catch (err) {
      t.urgencia = urgenciaAnterior;
      selUrgencia.value = urgenciaAnterior;
      toast(err.message, true);
    }
  };

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

  const selStatus = document.getElementById("detail-status-sel");
  selStatus.value = t.status;
  selStatus.onchange = async () => {
    const statusAnterior = t.status;
    t.status = selStatus.value;
    try {
      await api.atualizarTarefa(t.id, t);
      renderBoard();
    } catch (err) {
      t.status = statusAnterior;
      selStatus.value = statusAnterior;
      toast(err.message, true);
    }
  };

  const inputObs = document.getElementById("detail-obs");
  const inputRetorno = document.getElementById("detail-retorno");
  inputObs.value     = t.observacoes || "";
  inputRetorno.value = t.retorno || "";
  autoGrowTextarea(inputObs, 160);
  autoGrowTextarea(inputRetorno, 160);

  const salvarObsDebounced = debounce(async () => {
    t.observacoes = inputObs.value;
    try { await api.patchTarefa(t.id, { observacoes: t.observacoes }); }
    catch (err) { toast(err.message, true); }
  }, 600);
  inputObs.oninput = () => { autoGrowTextarea(inputObs, 160); salvarObsDebounced(); };

  const salvarRetornoDebounced = debounce(async () => {
    t.retorno = inputRetorno.value;
    try { await api.patchTarefa(t.id, { retorno: t.retorno }); }
    catch (err) { toast(err.message, true); }
  }, 600);
  inputRetorno.oninput = () => { autoGrowTextarea(inputRetorno, 160); salvarRetornoDebounced(); };

  const btnConcluir = document.getElementById("btn-concluir");
  btnConcluir.textContent = t.concluida ? "Reabrir Tarefa" : "Concluir Tarefa";
  btnConcluir.className   = t.concluida ? "btn btn-ghost"  : "btn btn-primary";

  btnConcluir.onclick = async () => {
    const statusAnterior       = t.status;
    const concluidaAnterior    = t.concluida;
    const concluidoEmAnterior  = t.concluidoEm;
    const concluidoPorAnterior = t.concluidoPor;
    t.concluida = !t.concluida;
    t.status    = t.concluida ? "concluida" : "pendente";
    if (t.concluida) {
      t.concluidoEm  = new Date().toISOString();
      t.concluidoPor = state.current?.id ?? null;
    }
    try {
      await api.atualizarTarefa(t.id, t);
      closeDetail();
      renderBoard();
      if (document.getElementById("concluded-screen").classList.contains("visible")) renderConcluded();
      toast(t.concluida ? "Tarefa concluída!" : "Tarefa reaberta.");
    } catch (err) {
      t.status       = statusAnterior;
      t.concluida    = concluidaAnterior;
      t.concluidoEm  = concluidoEmAnterior;
      t.concluidoPor = concluidoPorAnterior;
      toast(err.message, true);
    }
  };
}

function startEditTitle(t, id) {
  // Não usa h2.replaceWith(input): o <h2 id="detail-title"> é um elemento
  // fixo do index.html (não é recriado a cada openDetail, diferente do
  // .check-label das etapas) -- substituí-lo apagaria o id permanentemente
  // e quebraria todo openDetail() seguinte ("Cannot set properties of null").
  // Em vez disso só escondemos o h2 e inserimos o input do lado.
  const h2 = document.getElementById("detail-title");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "detail-title-input";
  input.value = t.nome;
  h2.style.display = "none";
  h2.insertAdjacentElement("afterend", input);
  input.focus();
  input.select();

  let resolved = false;
  const cleanup = () => {
    input.remove();
    h2.style.display = "";
  };
  const save = async () => {
    if (resolved) return;
    resolved = true;
    const val = input.value.trim();
    if (!val || val === t.nome) { cleanup(); openDetail(id); return; }
    const nomeAnterior = t.nome;
    t.nome = val;
    try {
      await api.patchTarefa(t.id, { nome: t.nome });
      cleanup();
      openDetail(id);
      renderBoard();
    } catch (err) {
      t.nome = nomeAnterior;
      toast(err.message, true);
      cleanup();
      openDetail(id);
    }
  };
  input.addEventListener("keydown", e => {
    if (e.key === "Enter")  { e.preventDefault(); save(); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); resolved = true; cleanup(); openDetail(id); }
  });
  input.addEventListener("blur", save);
}

function startEditEtapa(t, etapa, item, id) {
  const label = item.querySelector(".check-label");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "etapa-edit-input";
  input.value = etapa.texto;
  label.replaceWith(input);
  input.focus();
  input.select();
  input.addEventListener("click", e => e.stopPropagation());

  let resolved = false;
  const save = async () => {
    if (resolved) return;
    resolved = true;
    const val = input.value.trim();
    if (!val || val === etapa.texto) { openDetail(id); return; }
    const textoAnterior = etapa.texto;
    etapa.texto = val;
    try {
      await api.atualizarTarefa(t.id, t);
      openDetail(id);
      renderBoard();
    } catch (err) {
      etapa.texto = textoAnterior;
      toast(err.message, true);
      openDetail(id);
    }
  };
  input.addEventListener("keydown", e => {
    if (e.key === "Enter")  { e.preventDefault(); save(); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); resolved = true; openDetail(id); }
  });
  input.addEventListener("blur", save);
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

// ── Modal de confirmação (substitui o confirm() nativo) ───
const confirmOverlay = document.getElementById("modal-confirm-overlay");
let confirmResolver = null;

function showConfirm(message, { title = "Confirmar exclusão", confirmLabel = "Excluir" } = {}) {
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-message").textContent = message;
  document.getElementById("btn-confirm-ok").textContent = confirmLabel;
  confirmOverlay.classList.remove("hidden");
  return new Promise(resolve => { confirmResolver = resolve; });
}

function resolveConfirm(result) {
  confirmOverlay.classList.add("hidden");
  if (confirmResolver) { confirmResolver(result); confirmResolver = null; }
}

document.getElementById("btn-confirm-ok").addEventListener("click", () => resolveConfirm(true));
document.getElementById("btn-confirm-cancel").addEventListener("click", () => resolveConfirm(false));
confirmOverlay.addEventListener("click", e => { if (e.target === confirmOverlay) resolveConfirm(false); });

// ── Fechar modais com Esc ──────────────────────────────────
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!confirmOverlay.classList.contains("hidden")) {
    resolveConfirm(false);
  } else if (!document.getElementById("modal-create-overlay").classList.contains("hidden")) {
    closeCreateModal();
  } else if (!modalDetail.classList.contains("hidden")) {
    closeDetail();
  } else if (!document.getElementById("modal-admin-tarefa-overlay").classList.contains("hidden")) {
    closeAdminTarefaModal();
  } else if (!document.getElementById("modal-admin-usuario-overlay").classList.contains("hidden")) {
    closeAdminUsuarioModal();
  }
});

// ── Tab: prender o foco dentro do modal aberto ─────────────
document.addEventListener("keydown", e => {
  if (e.key !== "Tab") return;
  const overlays = document.querySelectorAll(".modal-overlay:not(.hidden)");
  if (overlays.length === 0) return;
  const overlay = overlays[overlays.length - 1]; // o último no DOM é o que fica por cima

  const focusables = Array.from(
    overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
  ).filter(el => !el.disabled && el.offsetParent !== null);
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last  = focusables[focusables.length - 1];
  const dentro = overlay.contains(document.activeElement);

  if (e.shiftKey) {
    if (!dentro || document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (!dentro || document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

// ── Atalho "N": abrir Nova Tarefa ──────────────────────────
document.addEventListener("keydown", e => {
  if (e.key !== "n" && e.key !== "N") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!document.getElementById("app").classList.contains("visible")) return;

  const active = document.activeElement;
  const tag = active?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active?.isContentEditable) return;

  const anyModalOpen = document.querySelectorAll(".modal-overlay:not(.hidden)").length > 0;
  if (anyModalOpen) return;

  e.preventDefault();
  openCreateModal();
});

function toast(msg, error = false) {
  const c  = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className   = `toast ${error ? "error" : ""}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

// Ajusta a altura da textarea pro tamanho do conteúdo (mínimo do CSS até
// maxHeight); zera pra "auto" antes de medir scrollHeight, senão o navegador
// mede contra a altura antiga em vez do conteúdo atual. Só liga overflow-y
// quando realmente precisa cortar (scrollHeight > maxHeight) -- deixar
// "auto" sempre ligado faz o navegador reservar a barra mesmo sem conteúdo
// suficiente pra rolar.
function autoGrowTextarea(el, maxHeight) {
  el.style.height = "auto";
  const precisa = el.scrollHeight > maxHeight;
  el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  el.style.overflowY = precisa ? "auto" : "hidden";
}

// ── Init ──────────────────────────────────────────────────
boot();