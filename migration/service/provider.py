import json
import os

import httpx


def complete(messages, schemas):
    """Yield text chunks, then one validated list of tool calls."""
    model = os.environ.get("LLM_MODEL", "mock")
    if model == "mock":
        yield "模拟回复：" + messages[-1].get("content", "")
        yield []
        return
    url = os.environ["LLM_BASE_URL"].rstrip("/")
    if not url.endswith("/chat/completions"):
        url += "/chat/completions"
    payload = dict(model=model, messages=messages, stream=True, max_tokens=1024)
    if schemas:
        payload["tools"] = schemas
    calls, finished, has_text = {}, False, False
    with httpx.stream(
        "POST",
        url,
        headers={"Authorization": "Bearer " + os.environ["LLM_API_KEY"]},
        json=payload,
        timeout=60,
    ) as response:
        response.raise_for_status()
        lines = []

        def events():
            for line in response.iter_lines():
                if line.startswith("data:"):
                    lines.append(line[5:].lstrip(" "))
                elif not line and lines:
                    yield "\n".join(lines)
                    lines.clear()
            if lines:
                yield "\n".join(lines)

        for event in events():
            if event.strip() == "[DONE]":
                finished = True
                break
            frame = json.loads(event)
            if "error" in frame or not isinstance(frame.get("choices"), list):
                raise ValueError("invalid provider event")
            if not frame["choices"]:
                continue
            choice = frame["choices"][0]
            finished |= bool(choice.get("finish_reason"))
            delta = choice.get("delta") or {}
            content = delta.get("content") or delta.get("refusal")
            if content:
                has_text = True
                yield content
            for part in delta.get("tool_calls", []):
                index = part.get("index", 0)
                if not isinstance(index, int) or index < 0:
                    raise ValueError("invalid call index")
                call = calls.setdefault(index, dict(id="", name="", arguments=""))
                call["id"] += part.get("id", "")
                for key in ("name", "arguments"):
                    call[key] += part.get("function", {}).get(key, "")
    if not finished or not (has_text or calls):
        raise ValueError("incomplete model response")
    result = []
    for index in sorted(calls):
        c = calls[index]
        c["arguments"] = json.loads(c["arguments"])
        if not c["id"] or not c["name"] or not isinstance(c["arguments"], dict):
            raise ValueError("invalid tool call")
        result.append(c)
    yield result
