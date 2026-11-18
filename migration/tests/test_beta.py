"""Run with a disposable Postgres DATABASE_URL and CARD_DIRS pointing at repository cards."""

import json
import os
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from migration.service import agent, memory, store
from migration.service.api import app


class MemoryTests(unittest.TestCase):
    def test_permanent_forgetting(self):
        f = dict(value="tea", last_reviewed_unix=1000, half_life_hours=24)
        now = 1000 + 86400 * 180
        s = dict(character_id="reimu", summary="tea", summary_upto=1)
        data = dict(
            facts={"character:reimu": {"drink": f, "todo:1": f}},
            sessions={"a": s.copy(), "b": s.copy()},
            messages={"a": [dict(seq=5)], "b": [dict(seq=11)]},
        )
        memory.prune(data, now)
        self.assertEqual(list(data["facts"]["character:reimu"]), ["todo:1"])
        for sid, end in [("a", 5), ("b", 11)]:
            self.assertEqual(data["sessions"][sid]["memory_context_after_seq"], end)
            self.assertEqual(data["sessions"][sid]["summary"], "")

    def test_budget_groups(self):
        h = [
            dict(role="tool"),
            dict(role="assistant", tool_calls=[dict(id="x")]),
            dict(role="user", content="new"),
        ]
        self.assertEqual(list(agent.groups(h)), [[h[-1]]])

    def test_review_cooldown(self):
        f = dict(last_reviewed_unix=1000, half_life_hours=24, review_count=4)
        memory.review(f, 4599)
        self.assertEqual(f["review_count"], 4)
        memory.review(f, 4600)
        self.assertEqual(f["review_count"], 5)


class DatabaseRoundTrip(unittest.TestCase):
    def test_import_replay_and_isolation(self):
        a, b, token, token_b = map(str, [uuid4() for _ in range(4)])
        with (
            patch.dict(
                os.environ,
                {
                    "INVITES_JSON": json.dumps({a: token, b: token_b}),
                    "LLM_MODEL": "mock",
                },
            ),
            TestClient(app) as c,
        ):
            auth = {"Authorization": "Bearer " + token}
            other = {"Authorization": "Bearer " + token_b}
            card = c.get("/api/characters", headers=auth).json()["characters"][0]["id"]
            created = c.post(
                "/api/sessions", headers=auth, json=dict(character_id=card)
            )
            self.assertEqual(created.status_code, 200, created.text)
            sid = created.json()["session"]["id"]
            self.assertEqual(
                c.get("/api/sessions/" + sid, headers=other).status_code, 404
            )
            self.assertEqual(
                c.get(
                    "/api/memory", params=dict(session_id=sid), headers=other
                ).status_code,
                404,
            )
            body = dict(request_id=str(uuid4()), session_id=sid, message="你好")

            def chat():
                r = c.post("/api/chat", headers=auth, json=body)
                return [
                    json.loads(l[5:])
                    for l in r.text.splitlines()
                    if l.startswith("data:")
                ]

            events = chat()
            self.assertEqual(events[-1]["data"]["stop_reason"], "completed", events)
            self.assertEqual(chat(), [events[-1]])
            with store.connect() as db:
                snap = store.snapshot(db, a)
                self.assertEqual([m["seq"] for m in snap["messages"][sid]], [1, 2, 3])
                raw = json.dumps(snap).encode()
                self.assertEqual(store.import_file(db, b, raw), "imported")
                self.assertEqual(store.import_file(db, b, raw), "already imported")
                self.assertEqual(store.snapshot(db, b), snap)
            self.assertEqual(
                c.get("/api/sessions/" + sid, headers=other).json()["messages"][-1][
                    "content"
                ],
                "模拟回复：你好",
            )
            self.assertEqual(c.get("/api/sessions").status_code, 401)

    def test_tool_round(self):
        card = dict(
            id="pet",
            name="测试",
            persona={"system": "测试"},
            tools={"allow": ["remember", "recall"]},
        )
        data = dict(sessions={"s": {"character_id": "pet"}}, messages={}, facts={})
        contexts = []

        def fake(messages, schemas):
            contexts.append(messages)
            if len(contexts) == 1:
                yield [
                    dict(
                        id="x", name="remember", arguments=dict(key="饮品", value="茶")
                    )
                ]
            else:
                yield "记住了"
                yield []

        events = list(agent.run(data, "s", card, "记住饮品", fake))
        self.assertEqual(contexts[1][-1]["tool_call_id"], "x")
        self.assertEqual(data["facts"]["character:pet"]["饮品"]["value"], "茶")
        self.assertEqual(events[-1][1]["stop_reason"], "completed")
