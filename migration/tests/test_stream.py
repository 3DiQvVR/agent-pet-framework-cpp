import contextlib
import json
import os
import unittest
from unittest.mock import patch

from migration.service.provider import complete


class Response:
    def __init__(self, frames):
        self.frames = frames

    def raise_for_status(self):
        pass

    def iter_lines(self):
        for f in self.frames:
            yield "data: " + (json.dumps(f) if isinstance(f, dict) else f)
            yield ""


def decode(*frames):
    with (
        patch.dict(
            os.environ,
            {
                "LLM_MODEL": "fixture",
                "LLM_API_KEY": "fixture",
                "LLM_BASE_URL": "http://fixture.invalid",
            },
        ),
        patch("httpx.stream", return_value=contextlib.nullcontext(Response(frames))),
    ):
        return list(complete([], []))


class StreamTests(unittest.TestCase):
    def test_finish_reason_and_usage(self):
        self.assertEqual(
            decode(
                {"choices": [{"delta": {"content": "你好"}, "finish_reason": "stop"}]},
                {"choices": [], "usage": {"total_tokens": 4}},
            ),
            ["你好", []],
        )

    def test_truncation(self):
        with self.assertRaises(ValueError):
            decode({"choices": [{"delta": {"content": "partial"}}]})

    def test_split_tool_arguments(self):
        first = {
            "index": 0,
            "id": "t",
            "function": {"name": "recall", "arguments": '{"query":'},
        }
        second = {"index": 0, "function": {"arguments": '"茶"}'}}

        def frame(part):
            return {"choices": [{"delta": {"tool_calls": [part]}}]}

        result = decode(frame(first), frame(second), "[DONE]")
        self.assertEqual(
            result, [[dict(id="t", name="recall", arguments=dict(query="茶"))]]
        )
        with self.assertRaises(ValueError):
            decode(frame(first), "[DONE]")
