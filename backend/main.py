"""
Portal da Controladoria — Backend FastAPI + PostgreSQL
Os dados ficam em tabelas reais e nunca se perdem entre deploys.
A conexão é lida da variável de ambiente DATABASE_URL.
"""

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor

# ── Config ─────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── App ────────────────────────────────────────────────────
app = FastAPI(title="Portal da Controladoria", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB helpers ─────────────────────────────────────────────
def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def init_db():
    """Cria as tabelas se não existirem e importa os JSONs na primeira vez."""
    with get_conn() as conn:
        with conn.cursor() as cur:

            # Tabela de usuários
            cur.execute("""
                CREATE TABLE IF NOT EXISTS usuarios (
                    id        SERIAL PRIMARY KEY,
                    nome      TEXT NOT NULL,
                    cargo     TEXT DEFAULT 'Colaborador',
                    avatar    TEXT,
                    is_admin  BOOLEAN DEFAULT FALSE
                )
            """)
            cur.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE")
            conn.commit()

            # Tabela de tarefas
            cur.execute("""
                CREATE TABLE IF NOT EXISTS tarefas (
                    id              SERIAL PRIMARY KEY,
                    nome            TEXT NOT NULL,
                    descricao       TEXT DEFAULT '',
                    etapas          JSONB DEFAULT '[]',
                    prazo           TEXT NOT NULL,
                    data_prazo      TEXT,
                    urgencia        TEXT DEFAULT 'media',
                    responsavel     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                    status          TEXT DEFAULT 'pendente',
                    observacoes     TEXT DEFAULT '',
                    retorno         TEXT DEFAULT '',
                    criado_em       TEXT,
                    criado_por      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                    concluida       BOOLEAN DEFAULT FALSE,
                    diaria_feita_em TEXT
                )
            """)
            conn.commit()

            cur.execute("ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS concluido_em TEXT")
            cur.execute("ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS concluido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL")
            conn.commit()

            # Importa usuários do JSON só se a tabela estiver vazia
            cur.execute("SELECT COUNT(*) as c FROM usuarios")
            if cur.fetchone()["c"] == 0:
                users_file = os.path.join(BASE_DIR, "data", "users.json")
                if os.path.exists(users_file):
                    with open(users_file, encoding="utf-8") as f:
                        users = json.load(f)
                    for u in users:
                        cur.execute(
                            "INSERT INTO usuarios (id, nome, cargo, avatar) VALUES (%s, %s, %s, %s)",
                            (u["id"], u["nome"], u.get("cargo", "Colaborador"), u.get("avatar"))
                        )
                    cur.execute("SELECT setval('usuarios_id_seq', (SELECT MAX(id) FROM usuarios))")
                    conn.commit()

            # Importa tarefas do JSON só se a tabela estiver vazia
            cur.execute("SELECT COUNT(*) as c FROM tarefas")
            if cur.fetchone()["c"] == 0:
                tarefas_file = os.path.join(BASE_DIR, "data", "tarefas.json")
                if os.path.exists(tarefas_file):
                    with open(tarefas_file, encoding="utf-8") as f:
                        tarefas = json.load(f)
                    for t in tarefas:
                        cur.execute("""
                            INSERT INTO tarefas
                                (id, nome, descricao, etapas, prazo, data_prazo, urgencia,
                                 responsavel, status, observacoes, retorno, criado_em,
                                 criado_por, concluida, diaria_feita_em)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        """, (
                            t["id"], t["nome"], t.get("descricao",""),
                            json.dumps(t.get("etapas", []), ensure_ascii=False),
                            t["prazo"], t.get("dataPrazo"),
                            t.get("urgencia","media"), t.get("responsavel"),
                            t.get("status","pendente"), t.get("observacoes",""),
                            t.get("retorno",""), t.get("criadoEm"),
                            t.get("criadoPor"), t.get("concluida", False),
                            t.get("diariaFeitaEm")
                        ))
                    cur.execute("SELECT setval('tarefas_id_seq', (SELECT MAX(id) FROM tarefas))")
                    conn.commit()

def row_to_tarefa(row: dict) -> dict:
    """Converte uma linha do banco para o formato esperado pelo frontend."""
    etapas = row["etapas"]
    if isinstance(etapas, str):
        etapas = json.loads(etapas)
    return {
        "id":             row["id"],
        "nome":           row["nome"],
        "descricao":      row["descricao"] or "",
        "etapas":         etapas or [],
        "prazo":          row["prazo"],
        "dataPrazo":      row["data_prazo"],
        "urgencia":       row["urgencia"],
        "responsavel":    row["responsavel"],
        "status":         row["status"],
        "observacoes":    row["observacoes"] or "",
        "retorno":        row["retorno"] or "",
        "criadoEm":       row["criado_em"],
        "criadoPor":      row["criado_por"],
        "concluida":      row["concluida"],
        "diariaFeitaEm":  row["diaria_feita_em"],
        "concluidoEm":    row["concluido_em"],
        "concluidoPor":   row["concluido_por"],
    }

def row_to_usuario(row: dict) -> dict:
    return {
        "id":       row["id"],
        "nome":     row["nome"],
        "cargo":    row["cargo"],
        "avatar":   row["avatar"],
        "isAdmin":  row.get("is_admin", False),
    }

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
    prazo: str
    dataPrazo: Optional[str] = None
    urgencia: Optional[str] = "media"
    responsavel: Optional[int] = None
    status: Optional[str] = "pendente"
    observacoes: Optional[str] = ""
    retorno: Optional[str] = ""
    criadoEm: Optional[str] = None
    criadoPor: Optional[int] = None
    concluida: Optional[bool] = False
    diariaFeitaEm: Optional[str] = None
    concluidoEm: Optional[str] = None
    concluidoPor: Optional[int] = None

class Usuario(BaseModel):
    id: Optional[int] = None
    nome: str
    cargo: Optional[str] = "Colaborador"
    avatar: Optional[str] = None
    isAdmin: Optional[bool] = False

# ── Startup ────────────────────────────────────────────────
@app.on_event("startup")
def startup():
    if DATABASE_URL:
        init_db()

# ══════════════════════════════════════════════════════════
# ROTAS — TAREFAS
# ══════════════════════════════════════════════════════════

@app.get("/api/tarefas")
def listar_tarefas():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM tarefas ORDER BY id")
            return [row_to_tarefa(r) for r in cur.fetchall()]


@app.post("/api/tarefas", status_code=201)
def criar_tarefa(tarefa: Tarefa):
    with get_conn() as conn:
        with conn.cursor() as cur:
            criado_em = tarefa.criadoEm or datetime.now(timezone.utc).isoformat()
            etapas_json = json.dumps(
                [e.model_dump() for e in tarefa.etapas], ensure_ascii=False
            )
            cur.execute("""
                INSERT INTO tarefas
                    (nome, descricao, etapas, prazo, data_prazo, urgencia,
                     responsavel, status, observacoes, retorno, criado_em,
                     criado_por, concluida, diaria_feita_em)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                tarefa.nome, tarefa.descricao, etapas_json,
                tarefa.prazo, tarefa.dataPrazo, tarefa.urgencia,
                tarefa.responsavel, tarefa.status, tarefa.observacoes,
                tarefa.retorno, criado_em, tarefa.criadoPor,
                tarefa.concluida, tarefa.diariaFeitaEm
            ))
            conn.commit()
            return row_to_tarefa(cur.fetchone())


@app.put("/api/tarefas/{tarefa_id}")
def atualizar_tarefa(tarefa_id: int, tarefa: Tarefa):
    with get_conn() as conn:
        with conn.cursor() as cur:
            etapas_json = json.dumps(
                [e.model_dump() for e in tarefa.etapas], ensure_ascii=False
            )
            cur.execute("""
                UPDATE tarefas SET
                    nome=%(nome)s, descricao=%(descricao)s, etapas=%(etapas)s,
                    prazo=%(prazo)s, data_prazo=%(data_prazo)s, urgencia=%(urgencia)s,
                    responsavel=%(responsavel)s, status=%(status)s,
                    observacoes=%(observacoes)s, retorno=%(retorno)s,
                    concluida=%(concluida)s, diaria_feita_em=%(diaria_feita_em)s,
                    concluido_em=%(concluido_em)s, concluido_por=%(concluido_por)s
                WHERE id=%(id)s
                RETURNING *
            """, {
                "id": tarefa_id, "nome": tarefa.nome,
                "descricao": tarefa.descricao, "etapas": etapas_json,
                "prazo": tarefa.prazo, "data_prazo": tarefa.dataPrazo,
                "urgencia": tarefa.urgencia, "responsavel": tarefa.responsavel,
                "status": tarefa.status, "observacoes": tarefa.observacoes,
                "retorno": tarefa.retorno, "concluida": tarefa.concluida,
                "diaria_feita_em": tarefa.diariaFeitaEm,
                "concluido_em": tarefa.concluidoEm, "concluido_por": tarefa.concluidoPor,
            })
            conn.commit()
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Tarefa não encontrada")
            return row_to_tarefa(row)


@app.patch("/api/tarefas/{tarefa_id}")
def patch_tarefa(tarefa_id: int, campos: dict):
    col_map = {
        "nome": "nome", "descricao": "descricao", "etapas": "etapas",
        "prazo": "prazo", "dataPrazo": "data_prazo", "urgencia": "urgencia",
        "responsavel": "responsavel", "status": "status",
        "observacoes": "observacoes", "retorno": "retorno",
        "concluida": "concluida", "diariaFeitaEm": "diaria_feita_em",
        "concluidoEm": "concluido_em", "concluidoPor": "concluido_por",
    }
    sets, values = [], []
    for key, val in campos.items():
        col = col_map.get(key)
        if not col:
            continue
        if col == "etapas" and isinstance(val, list):
            val = json.dumps(val, ensure_ascii=False)
        sets.append(f"{col} = %s")
        values.append(val)

    if not sets:
        raise HTTPException(status_code=400, detail="Nenhum campo válido para atualizar")

    values.append(tarefa_id)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE tarefas SET {', '.join(sets)} WHERE id = %s RETURNING *",
                values
            )
            conn.commit()
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Tarefa não encontrada")
            return row_to_tarefa(row)


@app.delete("/api/tarefas/{tarefa_id}", status_code=204)
def deletar_tarefa(tarefa_id: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM tarefas WHERE id = %s RETURNING id", (tarefa_id,))
            conn.commit()
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return None

# ══════════════════════════════════════════════════════════
# ROTAS — USUÁRIOS
# ══════════════════════════════════════════════════════════

@app.get("/api/usuarios")
def listar_usuarios():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM usuarios ORDER BY id")
            return [row_to_usuario(r) for r in cur.fetchall()]


@app.post("/api/usuarios", status_code=201)
def criar_usuario(usuario: Usuario):
    avatar = usuario.avatar
    if not avatar:
        partes = usuario.nome.split()
        avatar = "".join(p[0] for p in partes[:2]).upper()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO usuarios (nome, cargo, avatar) VALUES (%s, %s, %s) RETURNING *",
                (usuario.nome, usuario.cargo or "Colaborador", avatar)
            )
            conn.commit()
            return row_to_usuario(cur.fetchone())


@app.put("/api/usuarios/{usuario_id}")
def atualizar_usuario(usuario_id: int, usuario: Usuario):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE usuarios SET
                    nome=%(nome)s, cargo=%(cargo)s, avatar=%(avatar)s, is_admin=%(is_admin)s
                WHERE id=%(id)s
                RETURNING *
            """, {
                "id": usuario_id, "nome": usuario.nome,
                "cargo": usuario.cargo, "avatar": usuario.avatar,
                "is_admin": usuario.isAdmin,
            })
            conn.commit()
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Usuário não encontrado")
            return row_to_usuario(row)


@app.delete("/api/usuarios/{usuario_id}", status_code=204)
def deletar_usuario(usuario_id: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM usuarios WHERE id = %s RETURNING id", (usuario_id,))
            conn.commit()
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return None

# ══════════════════════════════════════════════════════════
# SERVE O FRONTEND
# ══════════════════════════════════════════════════════════

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
app.mount("/data",   StaticFiles(directory=os.path.join(BASE_DIR, "data")),   name="data")

@app.get("/")
def index():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))