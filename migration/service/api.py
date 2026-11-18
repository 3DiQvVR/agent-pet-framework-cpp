import copy
import hmac
import json
import os
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from . import agent, memory, store


@asynccontextmanager
async def lifespan(app):
    store.initialize()
    yield


app = FastAPI(lifespan=lifespan)


def owner(authorization: str = Header(default="")):
    invitations = json.loads(os.environ.get("INVITES_JSON", "{}"))
    for user, token in invitations.items():
        if (
            isinstance(token, str)
            and len(token) >= 24
            and hmac.compare_digest(
                authorization.encode(), ("Bearer " + token).encode()
            )
        ):
            return user
    raise HTTPException(401, "需要有效的邀请码")


class NewSession(BaseModel):
    character_id: str


class Turn(BaseModel):
    session_id: str
    message: str = Field(min_length=1, max_length=12000)
    request_id: UUID = Field(default_factory=uuid4)


def public(card):
    return {k: v for k, v in card.items() if k not in {"persona", "tools"}}


def session(db, user, sid):
    row = db.execute(
        "SELECT data FROM pet_sessions WHERE owner=%s AND id=%s", (user, sid)
    ).fetchone()
    if not row:
        raise HTTPException(404, "会话不存在")
    return row[0]


def scope_lock(db, user, card):
    # GC of a character fact updates the context boundary of every sibling session.
    db.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(%s,1))",
        (json.dumps([user, card]),),
    )


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/characters")
def list_cards(user=Depends(owner)):
    with store.connect() as db:
        return {"characters": [public(c) for c in store.cards(db, user).values()]}


@app.get("/api/sessions")
def sessions(limit: int = 20, user=Depends(owner)):
    with store.connect() as db:
        return {
            "sessions": [
                r[0]
                for r in db.execute(
                    "SELECT data FROM pet_sessions WHERE owner=%s ORDER BY data->>'updated_at' DESC LIMIT %s",
                    (user, max(1, min(limit, 200))),
                )
            ]
        }


@app.post("/api/sessions")
def create(body: NewSession, user=Depends(owner)):
    with store.connect() as db:
        store.owner_lock(db, user)
        scope_lock(db, user, body.character_id)
        card = store.cards(db, user).get(body.character_id)
        if not card:
            raise HTTPException(404, "角色不存在")
        sid = agent.uid()
        now = agent.utc()
        s = dict(
            id=sid,
            character_id=card["id"],
            title=card["name"],
            summary="",
            summary_upto=0,
            memory_context_after_seq=0,
            memory_context_version=0,
            created_at=now,
            updated_at=now,
            state=dict(
                emotion=dict(
                    name=card.get("default_emotion", "neutral"),
                    intensity=0.5,
                    updated_unix=int(agent.time.time()),
                )
            ),
        )
        msg = agent.add(
            [],
            "assistant",
            card.get("greeting") or "嗨，我是" + card["name"] + "。",
            name=card["name"],
        )
        db.execute(
            "INSERT INTO pet_sessions VALUES (%s,%s,%s,%s)",
            (user, sid, card["id"], Jsonb(s)),
        )
        db.execute(
            "INSERT INTO pet_messages VALUES (%s,%s,1,%s)", (user, sid, Jsonb(msg))
        )
        return dict(session=s, character=public(card), greeting=msg["content"])


@app.get("/api/sessions/{sid}")
def detail(sid: str, user=Depends(owner)):
    with store.connect() as db:
        s = session(db, user, sid)
        rows = db.execute(
            "SELECT data FROM pet_messages WHERE owner=%s AND session_id=%s ORDER BY seq",
            (user, sid),
        )
        return dict(
            session=s,
            messages=[r[0] for r in rows],
            character=public(store.cards(db, user)[s["character_id"]]),
        )


def subset(db, user, card):
    sessions = dict(
        db.execute(
            "SELECT id,data FROM pet_sessions WHERE owner=%s AND card=%s", (user, card)
        ).fetchall()
    )
    scopes = [*sessions, "character:" + card]
    facts = {}
    for scope, k, f in db.execute(
        "SELECT scope,key,data FROM pet_facts WHERE owner=%s AND scope=ANY(%s)",
        (user, scopes),
    ):
        facts.setdefault(scope, {})[k] = f
    messages = {}
    for sid, m in db.execute(
        "SELECT session_id,data FROM pet_messages WHERE owner=%s AND session_id=ANY(%s) ORDER BY seq",
        (user, list(sessions)),
    ):
        messages.setdefault(sid, []).append(m)
    return dict(sessions=sessions, messages=messages, facts=facts)


def persist(db, user, before, after):
    for sid, s in after["sessions"].items():
        if s != before["sessions"][sid]:
            db.execute(
                "UPDATE pet_sessions SET data=%s WHERE owner=%s AND id=%s",
                (Jsonb(s), user, sid),
            )
        rows = after["messages"].get(sid, [])
        for m in rows[len(before["messages"].get(sid, [])) :]:
            db.execute(
                "INSERT INTO pet_messages VALUES (%s,%s,%s,%s)",
                (user, sid, m["seq"], Jsonb(m)),
            )
    for scope, bucket in after["facts"].items():
        old = before["facts"].get(scope, {})
        for k in old.keys() - bucket.keys():
            db.execute(
                "DELETE FROM pet_facts WHERE owner=%s AND scope=%s AND key=%s",
                (user, scope, k),
            )
        for k, f in bucket.items():
            if f != old.get(k):
                db.execute(
                    "INSERT INTO pet_facts VALUES (%s,%s,%s,%s) ON CONFLICT(owner,scope,key) DO UPDATE SET data=excluded.data",
                    (user, scope, k, Jsonb(f)),
                )


@app.get("/api/memory")
def facts(session_id: str, user=Depends(owner)):
    with store.connect() as db:
        card = store.cards(db, user)[session(db, user, session_id)["character_id"]]
        scope_lock(db, user, card["id"])
        data = subset(db, user, card["id"])
        old = copy.deepcopy(data)
        memory.prune(data, int(agent.time.time()))
        persist(db, user, old, data)
        scope = (
            session_id
            if card.get("memory", {}).get("scope") == "session"
            else "character:" + card["id"]
        )
        return {
            "facts": [dict(f, key=k) for k, f in data["facts"].get(scope, {}).items()]
        }


def frame(kind, data):
    return "data: " + agent.dump(dict(type=kind, data=data)) + "\n\n"


@app.post("/api/chat")
def chat(body: Turn, user=Depends(owner)):
    with store.connect() as db:
        card_id = session(db, user, body.session_id)["character_id"]

    def events():
        try:
            with store.connect() as db:
                db.execute(
                    "SELECT pg_advisory_xact_lock_shared(hashtextextended(%s,0))",
                    (user,),
                )
                db.execute(
                    "SELECT pg_advisory_xact_lock(hashtextextended(%s,2))",
                    (json.dumps([user, body.session_id]),),
                )
                cached = db.execute(
                    "SELECT session_id,input,result FROM pet_turns WHERE owner=%s AND request_id=%s",
                    (user, body.request_id),
                ).fetchone()
                if cached:
                    if cached[:2] != (body.session_id, body.message):
                        raise ValueError("request ID conflict")
                    yield frame("done", cached[2])
                    return
                with store.connect() as quota:
                    day = agent.utc()[:10]
                    accepted = quota.execute(
                        "INSERT INTO pet_usage VALUES (%s,%s,1) ON CONFLICT(owner,day) DO UPDATE SET attempts=pet_usage.attempts+1 WHERE pet_usage.attempts<%s RETURNING attempts",
                        (user, day, int(os.getenv("DAILY_TURNS", "100"))),
                    ).fetchone()
                if not accepted:
                    yield frame("error", dict(message="今日对话次数已用完"))
                    yield frame("done", dict(text="", stop_reason="quota"))
                    return
                # A short locked snapshot makes pruning atomic across sibling sessions.
                with store.connect() as reader:
                    scope_lock(reader, user, card_id)
                    data = subset(reader, user, card_id)
                    before_gc = copy.deepcopy(data)
                    memory.prune(data, int(agent.time.time()))
                    persist(reader, user, before_gc, data)
                old = copy.deepcopy(data)
                card = store.cards(db, user)[card_id]
                for kind, payload in agent.run(
                    data, body.session_id, card, body.message
                ):
                    if kind == "done":
                        final = payload
                    else:
                        yield frame(kind, payload)
                # Inference can overlap across sessions; serialize only the final shared-memory update.
                scope_lock(db, user, card_id)
                latest = subset(db, user, card_id)
                for sid, record in data["sessions"].items():
                    if (
                        record != old["sessions"][sid] or sid == body.session_id
                    ) and latest["sessions"][sid] != old["sessions"][sid]:
                        raise ValueError("context changed during inference")
                for scope, bucket in data["facts"].items():
                    prior = old["facts"].get(scope, {})
                    for key in bucket.keys() | prior.keys():
                        if bucket.get(key) != prior.get(key) and latest["facts"].get(
                            scope, {}
                        ).get(key) != prior.get(key):
                            raise ValueError("memory changed during inference")
                persist(db, user, old, data)
                db.execute(
                    "INSERT INTO pet_turns(owner,request_id,session_id,input,result) VALUES (%s,%s,%s,%s,%s)",
                    (
                        user,
                        body.request_id,
                        body.session_id,
                        body.message,
                        Jsonb(final),
                    ),
                )
            yield frame("done", final)
        except Exception:
            yield frame("error", dict(message="本轮未保存，请刷新会话后重试"))
            yield frame("done", dict(text="", stop_reason="error"))

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
