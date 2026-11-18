import json
import os
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from migration.service.api import app


class ConcurrentChats(unittest.TestCase):
    def test_sibling_sessions_reach_model_together(self):
        owner, token = str(uuid4()), str(uuid4())
        auth = {"Authorization": "Bearer " + token}
        both = threading.Barrier(2)

        def model(messages, schemas):
            both.wait(timeout=5)
            yield "ok"
            yield []

        with (
            patch.dict(os.environ, {"INVITES_JSON": json.dumps({owner: token})}),
            TestClient(app) as client,
        ):

            def create():
                return client.post(
                    "/api/sessions", headers=auth, json={"character_id": "reimu"}
                ).json()["session"]["id"]

            sessions = [create(), create()]

            def send(sid):
                r = client.post(
                    "/api/chat",
                    headers=auth,
                    json=dict(session_id=sid, message="hello"),
                )
                return json.loads(r.text.strip().splitlines()[-1][6:])["data"][
                    "stop_reason"
                ]

            with (
                patch("migration.service.provider.complete", model),
                ThreadPoolExecutor(2) as pool,
            ):
                self.assertEqual(
                    list(pool.map(send, sessions)), ["completed", "completed"]
                )
