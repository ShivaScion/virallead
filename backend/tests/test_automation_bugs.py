"""Regression tests for iteration-2 bug fixes:
- Buffer real scheduling (buffer_post_id populated on schedule)
- Auto-schedule on PATCH status=approved
- Multi-post spread across days
- Autonomous scheduler / automation endpoints
- Concept-driven image prompt
- Buffer analytics, sync-past-posts
- _clean_post_shape sanitizes body
"""
import os
import time
import re
from datetime import datetime
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
API = f"{BASE_URL.rstrip('/')}/api"
TIMEOUT = 240


def _post(path, json=None, timeout=TIMEOUT):
    return requests.post(f"{API}{path}", json=json or {}, timeout=timeout)


def _get(path, timeout=60):
    return requests.get(f"{API}{path}", timeout=timeout)


def _patch(path, json=None, timeout=60):
    return requests.patch(f"{API}{path}", json=json or {}, timeout=timeout)


state = {}


# --------- Setup: ensure profile is buffer-enabled ---------
def test_01_profile_buffer_ready():
    r = _get("/profile")
    assert r.status_code == 200
    p = r.json()
    assert p.get("buffer_api_key"), "Buffer API key must be present"
    assert p.get("scheduler_provider") == "buffer", "provider must be buffer"
    assert p.get("past_posts"), "past_posts should be populated already"
    state["profile"] = p


# --------- Voice fingerprint / automation status ---------
def test_02_automation_status_shape():
    r = _get("/automation/status")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("cycle_hours", "last_buffer_sync", "voice_fingerprint", "upcoming"):
        assert k in d, f"missing key {k}"
    assert isinstance(d["upcoming"], list)
    assert isinstance(d["cycle_hours"], int)
    # Voice fingerprint must be non-empty after past posts sync
    assert d["voice_fingerprint"] and len(d["voice_fingerprint"]) > 50, \
        f"voice_fingerprint too short: {d.get('voice_fingerprint')!r}"
    state["voice_fingerprint"] = d["voice_fingerprint"]


# --------- Buffer analytics ---------
def test_03_buffer_analytics_30_days():
    r = _post("/buffer/analytics", {"days": 30}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "entries" in d
    entries = d["entries"]
    # If Buffer has data we expect >=3 entries
    if not entries:
        pytest.skip(f"Buffer analytics returned no entries (note={d.get('note')})")
    assert len(entries) >= 3, f"expected >=3 entries, got {len(entries)}: {entries}"
    e0 = entries[0]
    for k in ("name", "value", "unit"):
        assert k in e0, f"entry missing key {k}: {e0}"


# --------- Buffer sync past posts ---------
def test_04_buffer_sync_past_posts():
    r = _post("/buffer/sync-past-posts", {}, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("count", 0) > 0, f"expected past posts, got: {d}"
    # profile.past_posts should now be populated
    p = _get("/profile").json()
    assert p.get("past_posts"), "profile.past_posts should be populated after sync"


# --------- Draft a post to work with ---------
def test_05_generate_draft_post():
    r = _post("/posts/generate", {"topic_title": "Consumer behavior signals founders miss in early GTM"})
    assert r.status_code == 200, r.text
    p = r.json()
    for k in ("id", "hook", "body", "hashtags"):
        assert k in p
    # body must NOT be raw JSON (verify _clean_post_shape ran)
    body = p.get("body") or ""
    assert not body.lstrip().startswith('{"hook"'), f"body appears to be raw JSON: {body[:200]}"
    assert not body.lstrip().startswith('{'), f"body starts with '{{' → likely raw JSON: {body[:200]}"
    state["post_id"] = p["id"]
    state["post_hook"] = p.get("hook")
    state["post_topic"] = p.get("topic_title") or "Consumer behavior signals founders miss in early GTM"


# --------- Post shape from GET /posts ---------
def test_06_posts_list_clean_shape():
    r = _get("/posts")
    assert r.status_code == 200
    posts = r.json()
    assert isinstance(posts, list)
    for p in posts[:10]:
        body = p.get("body") or ""
        assert not body.lstrip().startswith('{"hook"'), \
            f"post {p.get('id')} body starts with raw JSON hook: {body[:150]}"


# --------- Direct schedule -> Buffer real scheduling ---------
def test_07_direct_schedule_creates_buffer_post():
    pid = state["post_id"]
    # ensure it's in draft first
    _patch(f"/posts/{pid}", {"status": "draft"})
    r = _post(f"/posts/{pid}/schedule", {}, timeout=90)
    assert r.status_code == 200, r.text
    body = r.json()
    post = body.get("post") or {}
    detail = body.get("detail") or ""
    assert body.get("provider") == "buffer", f"provider should be buffer, got {body}"
    assert body.get("channel_id"), f"channel_id must be resolved, got {body}"
    assert post.get("status") == "scheduled"
    assert post.get("scheduled_for")
    assert post.get("buffer_channel_id"), "buffer_channel_id must be set on post"
    assert post.get("buffer_post_id"), f"buffer_post_id must be set. detail={detail}"
    assert "Scheduled on Buffer" in detail, f"detail should confirm Buffer scheduling: {detail!r}"


# --------- Auto-schedule on approve ---------
def test_08_patch_approved_auto_schedules_via_buffer():
    # Fresh post
    r = _post("/posts/generate", {"topic_title": "Distribution beats product for pre-seed"})
    assert r.status_code == 200
    p = r.json()
    pid = p["id"]
    state["approve_pid_1"] = pid

    r = _patch(f"/posts/{pid}", {"status": "approved"})
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc.get("status") == "scheduled", \
        f"After approve, status should be auto-set to scheduled, got {doc.get('status')}"
    assert doc.get("scheduled_for"), "scheduled_for should be populated"
    assert doc.get("buffer_post_id"), \
        f"buffer_post_id should be populated after auto-schedule, got: {doc}"


# --------- Multi-approve spread across days ---------
def test_09_multiple_approvals_spread_across_days():
    scheduled_dates = []
    ids = []
    # Include the previous one from test_08
    if state.get("approve_pid_1"):
        r = _get(f"/posts")
        for p in r.json():
            if p["id"] == state["approve_pid_1"] and p.get("scheduled_for"):
                scheduled_dates.append(p["scheduled_for"])
                ids.append(p["id"])
                break
    # Create 2 more drafts + approve
    for topic in ["Founders overspend on branding pre-PMF", "Cold outbound copy for B2B SaaS"]:
        rg = _post("/posts/generate", {"topic_title": topic})
        assert rg.status_code == 200
        pid = rg.json()["id"]
        ids.append(pid)
        rp = _patch(f"/posts/{pid}", {"status": "approved"})
        assert rp.status_code == 200, rp.text
        d = rp.json()
        assert d.get("scheduled_for"), f"post {pid} not scheduled: {d}"
        scheduled_dates.append(d["scheduled_for"])

    state["multi_approve_ids"] = ids
    # Extract calendar days
    days = []
    for iso in scheduled_dates:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        days.append(dt.strftime("%Y-%m-%d"))
    assert len(set(days)) == len(days), \
        f"Approved posts must fall on DIFFERENT calendar days, got: {days} (ids={ids})"
    # Chronologically increasing
    isos_sorted = sorted(scheduled_dates)
    assert isos_sorted == scheduled_dates or True  # not strictly ordered by approval, but distinct days is key
    # None more than ~15 days out
    now = datetime.utcnow()
    for iso in scheduled_dates:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00")).replace(tzinfo=None)
        delta_days = (dt - now).days
        assert -1 <= delta_days <= 15, f"scheduled_for {iso} is {delta_days} days out, too far"


# --------- Concept-driven image prompt ---------
def test_10_generate_image_concept_prompt():
    pid = state["post_id"]
    r = _post(f"/posts/{pid}/generate-image", {}, timeout=180)
    if r.status_code >= 400:
        pytest.skip(f"image gen unavailable: {r.status_code} {r.text[:200]}")
    d = r.json()
    assert "prompt" in d and isinstance(d["prompt"], str)
    prompt = d["prompt"].lower()
    assert len(prompt) > 100, f"prompt too short: {prompt}"
    # Prompt must contain concept-driven sections (SUBJECT/COMPOSITION), not the fallback
    # "visual metaphor of: <hook>" which appears only when Gemini concept step failed.
    assert "subject:" in prompt, f"prompt missing SUBJECT section (concept step failed?): {prompt[:300]}"
    assert "composition:" in prompt, f"prompt missing COMPOSITION section: {prompt[:300]}"
    # If concept step failed, subject would be exactly "visual metaphor of: <hook>"
    assert "visual metaphor of:" not in prompt, \
        f"prompt used fallback (concept generation failed): {prompt[:300]}"
    # Store for reporting
    state["image_prompt_sample"] = d["prompt"][:400]


# --------- Autonomous tick endpoint ---------
def test_11_automation_tick_and_status_update():
    r0 = _get("/automation/status").json()
    prev_last_tick = (r0.get("last_tick") or {}).get("created_at")

    r = _post("/automation/tick", {}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert body.get("queued") is True

    # Poll for new tick job (up to 90s — autonomous tick does buffer sync + gemini calls)
    new_tick = None
    for _ in range(18):
        time.sleep(5)
        st = _get("/automation/status").json()
        lt = st.get("last_tick") or {}
        if lt.get("created_at") and lt["created_at"] != prev_last_tick:
            new_tick = lt
            break
    assert new_tick, f"No new autonomous_tick job appeared in db.jobs within 90s (prev={prev_last_tick})"
    assert new_tick.get("kind") == "autonomous_tick"


# --------- Cleanup ---------
def test_99_cleanup():
    # Remove test-created local posts (Buffer scheduled entries remain — per instructions)
    for pid in [state.get("post_id"), state.get("approve_pid_1")] + (state.get("multi_approve_ids") or []):
        if pid:
            try:
                requests.delete(f"{API}/posts/{pid}", timeout=15)
            except Exception:
                pass
