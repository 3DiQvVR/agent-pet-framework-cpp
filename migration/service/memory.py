import re
from datetime import UTC, datetime


def anchor(f):
    reviewed = f.get("last_reviewed_unix", 0)
    if 0 < reviewed <= 253402300799:
        return int(reviewed)
    try:
        return (
            datetime.strptime(
                f.get("updated_at") or f["created_at"], "%Y-%m-%dT%H:%M:%SZ"
            )
            .replace(tzinfo=UTC)
            .timestamp()
        )
    except (ValueError, TypeError, KeyError):
        return 0


def half(f):
    return min(8760, max(24, f.get("half_life_hours", 24)))


def retention(f, now):
    start = anchor(f)
    return 1 / (1 + max(0, now - start) / (3600 * half(f))) if start else 1


def expired(key, f, now):
    if key.startswith("todo:") or "todo" in f.get("tags", []):
        return False
    start = anchor(f)
    days = (now - start) / 86400
    return start > 0 and (days >= 180 or days >= 30 and retention(f, now) < 0.05)


def review(f, now):
    if now > 0 and (not anchor(f) or now - anchor(f) >= 3600):
        f.update(
            half_life_hours=min(8760, half(f) * (2 - retention(f, now))),
            last_reviewed_unix=now,
            review_count=min(2147483647, f.get("review_count", 0) + 1),
        )


def rank(bucket, query, now):
    fold = str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz")
    query = query.strip().translate(fold)
    tokens = re.findall(r"[a-z0-9]{2,}", query)
    tokens.extend(
        a + b
        for a, b in zip(query, query[1:])
        if all("\u4000" <= x <= "\u9fff" for x in (a, b))
    )
    hits = []
    for key, f in bucket.items():
        hay = " ".join([key, f["value"], *f.get("tags", [])]).translate(fold)
        score = (6 * (query in hay) + 2 * sum(t in hay for t in tokens)) if query else 1
        strength = retention(f, now)
        if score and strength >= 0.05 and not expired(key, f, now):
            hits.append((score * strength, f.get("updated_at", ""), key))
    hits.sort(key=lambda x: x[2])
    hits.sort(key=lambda x: x[:2], reverse=True)
    return [key for _, _, key in hits]


def prune(data, now):
    changed = set()
    for scope, facts in data["facts"].items():
        for key in list(facts):
            if expired(key, facts[key], now):
                del facts[key]
                changed.add(scope)
    for sid, s in data["sessions"].items():
        if sid in changed or "character:" + s["character_id"] in changed:
            end = max(
                [
                    s.get("memory_context_after_seq", 0),
                    *(m["seq"] for m in data["messages"].get(sid, [])),
                ]
            )
            s.update(
                summary="",
                summary_upto=max(s.get("summary_upto", 0), end),
                memory_context_after_seq=end,
                memory_context_version=s.get("memory_context_version", 0) + 1,
            )
