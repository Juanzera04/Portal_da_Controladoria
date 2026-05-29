"""
Portal da Controladoria — Backend FastAPI
Serve os arquivos estáticos e expõe a API REST para tarefas e usuários.
"""

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import json
import os

# ── Paths ──────────────────────────────────────────────────
# os.getcwd() é a raiz do projeto tanto localmente quanto no Render
BASE_DIR     = os.getcwd()
DATA_DIR     = os.path.join(BASE_DIR, "data")
TAREFAS_FILE = os.path.join(DATA_DIR, "tarefas.json")
USERS_FILE   = os.path.join(DATA_DIR, "users.json")

# ── App ────────────────────────────────────────────────────
app = FastAPI(title="Portal da Controladoria", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── JSON helpers ───────────────────────────────────────────
def read_json(path: str) -> list:
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def write_json(path: str, data: list) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ── Models ─────────────────────────────────────────────────
class Etapa(BaseModel):
    id: int
    texto: str
    concluida: bool

class Tarefa(BaseModel):
    id: Optional[int] = None
    nome: str
    descricao: Optional[str] = ""
    etapas: Optional[List[Etapa]] = []
    prazo: str                          # diaria | hoje | semana | mes
    dataPrazo: Optional[str] = None
    urgencia: Optional[str] = "media"  # alta | media | baixa
    responsavel: Optional[int] = None
    status: Optional[str] = "pendente" # pendente | em andamento | concluida
    observacoes: Optional[str] = ""
    retorno: Optional[str] = ""
    criadoEm: Optional[str] = None
    criadoPor: Optional[int] = None
    concluida: Optional[bool] = False
    diariaFeitaEm: Optional[str] = None

class Usuario(BaseModel):
    id: Optional[int] = None
    nome: str
    cargo: Optional[str] = "Colaborador"
    avatar: Optional[str] = None

# ══════════════════════════════════════════════════════════
# ROTAS — TAREFAS
# ══════════════════════════════════════════════════════════

@app.get("/api/tarefas")
def listar_tarefas():
    """Retorna todas as tarefas."""
    return read_json(TAREFAS_FILE)


@app.post("/api/tarefas", status_code=201)
def criar_tarefa(tarefa: Tarefa):
    """Cria uma nova tarefa e persiste no JSON."""
    tarefas = read_json(TAREFAS_FILE)

    # Gera ID único
    novo_id = max((t["id"] for t in tarefas), default=0) + 1
    nova = tarefa.model_dump()
    nova["id"] = novo_id

    from datetime import datetime, timezone
    if not nova.get("criadoEm"):
        nova["criadoEm"] = datetime.now(timezone.utc).isoformat()

    tarefas.append(nova)
    write_json(TAREFAS_FILE, tarefas)
    return nova


@app.put("/api/tarefas/{tarefa_id}")
def atualizar_tarefa(tarefa_id: int, tarefa: Tarefa):
    """Substitui uma tarefa existente pelo ID."""
    tarefas = read_json(TAREFAS_FILE)
    idx = next((i for i, t in enumerate(tarefas) if t["id"] == tarefa_id), None)

    if idx is None:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    atualizada = tarefa.model_dump()
    atualizada["id"] = tarefa_id          # garante que o ID não muda
    tarefas[idx] = atualizada
    write_json(TAREFAS_FILE, tarefas)
    return atualizada


@app.patch("/api/tarefas/{tarefa_id}")
def patch_tarefa(tarefa_id: int, campos: dict):
    """Atualiza campos específicos de uma tarefa (patch parcial)."""
    tarefas = read_json(TAREFAS_FILE)
    idx = next((i for i, t in enumerate(tarefas) if t["id"] == tarefa_id), None)

    if idx is None:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    tarefas[idx].update(campos)
    write_json(TAREFAS_FILE, tarefas)
    return tarefas[idx]


@app.delete("/api/tarefas/{tarefa_id}", status_code=204)
def deletar_tarefa(tarefa_id: int):
    """Remove uma tarefa pelo ID."""
    tarefas = read_json(TAREFAS_FILE)
    novas = [t for t in tarefas if t["id"] != tarefa_id]

    if len(novas) == len(tarefas):
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    write_json(TAREFAS_FILE, novas)
    return None

# ══════════════════════════════════════════════════════════
# ROTAS — USUÁRIOS
# ══════════════════════════════════════════════════════════

@app.get("/api/usuarios")
def listar_usuarios():
    """Retorna todos os usuários."""
    return read_json(USERS_FILE)


@app.post("/api/usuarios", status_code=201)
def criar_usuario(usuario: Usuario):
    """Cria um novo usuário."""
    usuarios = read_json(USERS_FILE)

    novo_id = max((u["id"] for u in usuarios), default=0) + 1
    novo = usuario.model_dump()
    novo["id"] = novo_id

    # Gera avatar/iniciais se não fornecido
    if not novo.get("avatar"):
        partes = novo["nome"].split()
        novo["avatar"] = "".join(p[0] for p in partes[:2]).upper()

    usuarios.append(novo)
    write_json(USERS_FILE, usuarios)
    return novo

# ══════════════════════════════════════════════════════════
# SERVE O FRONTEND (deve ficar por último)
# ══════════════════════════════════════════════════════════

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
app.mount("/data",   StaticFiles(directory=DATA_DIR), name="data")

@app.get("/")
def index():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))
