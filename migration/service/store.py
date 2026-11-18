import hashlib
import json
import os
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

HERE = Path(__file__).resolve().parent


def connect():
    return psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=8)


def initialize():
    with connect() as db:
        db.execute(HERE.joinpath("schema.sql").read_text(encoding="utf8"))


def cards(db, owner):
    result = {}
    for directory in os.environ.get("CARD_DIRS", "cards").split(os.pathsep):
        for path in sorted(Path(directory).glob("*.json")):
            card = json.loads(path.read_text(encoding="utf-8-sig"))
            result[card["id"]] = card
    for (card,) in db.execute(
        'SELECT data FROM pet_file_cards WHERE owner=%s ORDER BY filename COLLATE "C"',
        (owner,),
    ):
        result[card["id"]] = card
    for key, record in db.execute(
        "SELECT id,data FROM pet_cards WHERE owner=%s", (owner,)
    ):
        payload = json.loads(record["payload"])
        result[key] = dict(payload, id=key)
    return result


def snapshot(db, owner):
    sessions = {
        k: v
        for k, v in db.execute(
            "SELECT id,data FROM pet_sessions WHERE owner=%s", (owner,)
        )
    }
    messages, facts = {}, {}
    for sid, msg in db.execute(
        "SELECT session_id,data FROM pet_messages WHERE owner=%s ORDER BY seq", (owner,)
    ):
        messages.setdefault(sid, []).append(msg)
    for scope, key, fact in db.execute(
        "SELECT scope,key,data FROM pet_facts WHERE owner=%s", (owner,)
    ):
        facts.setdefault(scope, {})[key] = fact
    return dict(
        version=1,
        sessions=sessions,
        messages=messages,
        facts=facts,
        characters=dict(
            db.execute(
                "SELECT id,data FROM pet_cards WHERE owner=%s", (owner,)
            ).fetchall()
        ),
    )


def owner_lock(db, owner):
    db.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (owner,))


def import_file(db, owner, raw, file_cards=None):
    file_cards = file_cards or {}
    digest = hashlib.sha256(
        raw + b"\x00" + json.dumps(file_cards, sort_keys=True).encode()
    ).hexdigest()
    owner_lock(db, owner)
    old = db.execute(
        "SELECT digest FROM pet_imports WHERE owner=%s", (owner,)
    ).fetchone()
    if old == (digest,):
        return "already imported"
    if (
        old
        or db.execute(
            "SELECT 1 FROM pet_sessions WHERE owner=%s LIMIT 1", (owner,)
        ).fetchone()
    ):
        raise ValueError("import requires an empty destination owner")
    data = json.loads(raw)
    if data.get("version", 1) != 1 or not isinstance(data.get("sessions"), dict):
        raise ValueError("unsupported snapshot")
    for filename, card in file_cards.items():
        if not card.get("id") or not card.get("persona", {}).get("system"):
            raise ValueError("invalid file card: " + filename)
        db.execute(
            "INSERT INTO pet_file_cards VALUES (%s,%s,%s)",
            (owner, filename, Jsonb(card)),
        )
    for key, record in data.get("characters", {}).items():
        card = json.loads(record["payload"])
        if card.get("id", key) != key or not card.get("persona", {}).get("system"):
            raise ValueError("invalid character overlay")
        db.execute(
            "INSERT INTO pet_cards VALUES (%s,%s,%s)", (owner, key, Jsonb(record))
        )
    valid = cards(db, owner)
    for sid, s in data["sessions"].items():
        if s["id"] != sid or s["character_id"] not in valid:
            raise ValueError("unresolved session or character: " + sid)
        db.execute(
            "INSERT INTO pet_sessions VALUES (%s,%s,%s,%s)",
            (owner, sid, s["character_id"], Jsonb(s)),
        )
    for sid, rows in data.get("messages", {}).items():
        for m in rows:
            db.execute(
                "INSERT INTO pet_messages VALUES (%s,%s,%s,%s)",
                (owner, sid, m["seq"], Jsonb(m)),
            )
    for scope, bucket in data.get("facts", {}).items():
        if scope not in data["sessions"] and not (
            scope.startswith("character:") and scope[10:] in valid
        ):
            raise ValueError("unknown memory scope: " + scope)
        for key, fact in bucket.items():
            db.execute(
                "INSERT INTO pet_facts VALUES (%s,%s,%s,%s)",
                (owner, scope, key, Jsonb(fact)),
            )
    db.execute("INSERT INTO pet_imports(owner,digest) VALUES (%s,%s)", (owner, digest))
    return "imported"


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["import", "export"])
    parser.add_argument("owner")
    parser.add_argument("path", type=Path)
    parser.add_argument(
        "--user-cards", type=Path, help="owner's legacy characters directory"
    )
    args = parser.parse_args()
    initialize()
    with connect() as conn:
        if args.operation == "import":
            if args.user_cards and not args.user_cards.is_dir():
                raise ValueError("user card directory is missing")
            files = (
                {
                    p.name: json.loads(p.read_text(encoding="utf-8-sig"))
                    for p in sorted(args.user_cards.glob("*.json"))
                }
                if args.user_cards
                else {}
            )
            print(import_file(conn, args.owner, args.path.read_bytes(), files))
        else:
            owner_lock(conn, args.owner)
            files = dict(
                conn.execute(
                    "SELECT filename,data FROM pet_file_cards WHERE owner=%s",
                    (args.owner,),
                ).fetchall()
            )
            if files:
                if not args.user_cards:
                    raise ValueError(
                        "specify a new --user-cards directory for file overlays"
                    )
                args.user_cards.mkdir(exist_ok=False)
                for name, card in files.items():
                    if Path(name).name != name:
                        raise ValueError("invalid card filename")
                    (args.user_cards / name).write_text(
                        json.dumps(card, ensure_ascii=False), encoding="utf8"
                    )
            with args.path.open("x", encoding="utf8") as output:
                json.dump(snapshot(conn, args.owner), output, ensure_ascii=False)
