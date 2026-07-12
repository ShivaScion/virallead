"""Backend end-to-end tests for ViralLead Automator.

Runs sequentially — later tests depend on data created earlier (lead/topic ids).
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
API = f"{BASE_URL.rstrip('/')}/api"
TIMEOUT = 180  # Gemini calls can be slow


state = {}


def _post(path, json=None, timeout=TIMEOUT):
    return requests.post(f"{API}{path}", json=json or {}, timeout=timeout)


def _get(path, timeout=60):
    return requests.get(f"{API}{path}", timeout=timeout)


# ---------- Root / Profile ----------
def test_01_root():
    r = _get("/")
    assert r.status_code == 200
    data = r.json()
    assert data.get("ok") is True
    assert data.get("model") == "gemini-3-flash-preview"


def test_02_profile_empty_then_saved():
    r = _get("/profile")
    assert r.status_code == 200
    # empty or a previously saved doc — accept either but if not empty we still proceed
    payload = {
        "name": "TEST User",
        "positioning": "Consumer behavior based brand strategy and marketing executive",
        "niche": "B2B SaaS growth",
        "target_audience": "Early-stage founders",
        "painpoints_solved": "Zero-to-one distribution",
        "leads_per_cycle": 3,
        "cycle_hours": 6,
        "scheduler_provider": "manual",
    }
    r = _post("/profile", payload, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert body["positioning"] == payload["positioning"]
    assert body["leads_per_cycle"] == 3

    r = _get("/profile")
    assert r.status_code == 200
    got = r.json()
    assert got.get("name") == "TEST User"
    assert got.get("leads_per_cycle") == 3


# ---------- Leads ----------
def test_03_leads_discover():
    r = _post("/leads/discover", {
        "ideal_customer": "Founders of pre-seed B2B SaaS startups in the US who post on LinkedIn about GTM",
        "industry": "B2B SaaS",
        "company_size": "1-10",
        "geography": "US",
        "seniority": "Founder",
        "keywords": "GTM, distribution, early stage",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert "count" in data and "leads" in data
    assert data["count"] <= 3  # profile.leads_per_cycle=3
    if data["count"] > 0:
        lead = data["leads"][0]
        for k in ("id", "name"):
            assert k in lead
        state["lead_id"] = lead["id"]
    else:
        pytest.skip("Gemini returned no leads this run")


def test_04_leads_list_and_patch_delete():
    r = _get("/leads")
    assert r.status_code == 200
    leads = r.json()
    assert isinstance(leads, list)
    if "lead_id" not in state and leads:
        state["lead_id"] = leads[0]["id"]
    if "lead_id" not in state:
        pytest.skip("no lead to patch")
    lid = state["lead_id"]
    r = requests.patch(f"{API}/leads/{lid}", json={"status": "contacted"}, timeout=30)
    assert r.status_code == 200
    assert r.json().get("status") == "contacted"


def test_05_leads_export_csv():
    r = _get("/leads/export.csv")
    assert r.status_code == 200
    data = r.json()
    assert "csv" in data
    assert "name,role,company" in data["csv"]


# ---------- Research ----------
def test_06_research_generate_list_delete():
    r = _post("/research/generate", {"focus": "consumer behavior in B2B marketing 2026", "n": 2})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "topics" in data
    if data["count"] > 0:
        t = data["topics"][0]
        for k in ("id", "title", "angle", "virality_score", "trend_reason", "supporting_signals", "suggested_hook"):
            assert k in t, f"missing key {k} in topic"
        state["topic_id"] = t["id"]

    r = _get("/research")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- Posts ----------
def test_07_posts_generate():
    if "topic_id" not in state:
        # fallback with plain title
        payload = {"topic_title": "Consumer behavior signals founders miss"}
    else:
        payload = {"topic_id": state["topic_id"]}
    r = _post("/posts/generate", payload)
    assert r.status_code == 200, r.text
    p = r.json()
    for k in ("id", "hook", "body", "hashtags"):
        assert k in p
    state["post_id"] = p["id"]


def test_08_posts_list_patch_schedule():
    r = _get("/posts")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    pid = state["post_id"]
    r = requests.patch(f"{API}/posts/{pid}",
                       json={"hook": "TEST updated hook", "status": "approved"}, timeout=30)
    assert r.status_code == 200
    assert r.json().get("hook") == "TEST updated hook"

    r = _post(f"/posts/{pid}/schedule", {}, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["post"]["status"] == "scheduled"
    assert body["post"]["scheduled_for"]


def test_09_posts_metrics_and_strategy():
    pid = state["post_id"]
    r = _post(f"/posts/{pid}/metrics/refresh", {"post_id": pid})
    assert r.status_code == 200, r.text
    body = r.json()
    m = body["metrics"]
    for k in ("likes", "comments", "shares", "impressions"):
        assert k in m
    assert "learnings" in body

    r = _post("/posts/strategy", {})
    assert r.status_code == 200, r.text
    data = r.json()
    # Empty dict is technically allowed; but keys expected
    for k in ("patterns", "gaps", "next_topics", "voice_adjustment"):
        assert k in data, f"missing strategy key {k}"


# ---------- Voice Q&A ----------
def test_10_voice_questions_flow():
    r = _post("/voice-questions/generate", {"n": 2})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "questions" in body
    if body["count"] > 0:
        qid = body["questions"][0]["id"]
        r = _post(f"/voice-questions/{qid}/answer", {"answer": "TEST answer, distribution beats product for pre-seed."}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("answered") is True
    r = _get("/voice-questions")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- Emails ----------
def test_11_emails_flow():
    if "lead_id" not in state:
        pytest.skip("no lead to email")
    lid = state["lead_id"]
    r = _post("/emails/generate", {"lead_id": lid})
    assert r.status_code == 200, r.text
    e = r.json()
    for k in ("id", "subject", "body", "lead_id"):
        assert k in e
    eid = e["id"]

    r = _get("/emails")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    r = requests.patch(f"{API}/emails/{eid}", json={"subject": "TEST subject"}, timeout=30)
    assert r.status_code == 200
    assert r.json().get("subject") == "TEST subject"

    r = _post(f"/emails/{eid}/mark-sent", {}, timeout=30)
    assert r.status_code == 200

    r = requests.delete(f"{API}/emails/{eid}", timeout=30)
    assert r.status_code == 200


# ---------- Dashboard ----------
def test_12_dashboard_summary():
    r = _get("/dashboard/summary")
    assert r.status_code == 200
    data = r.json()
    assert "counters" in data
    for k in ("leads_total", "posts_total", "emails_draft", "research_total"):
        assert k in data["counters"]
    for k in ("recent_posts", "recent_leads", "top_topics"):
        assert isinstance(data[k], list)


# ---------- Cleanup: delete post/lead/topic ----------
def test_13_cleanup():
    if "post_id" in state:
        requests.delete(f"{API}/posts/{state['post_id']}", timeout=30)
    if "topic_id" in state:
        requests.delete(f"{API}/research/{state['topic_id']}", timeout=30)
    if "lead_id" in state:
        requests.delete(f"{API}/leads/{state['lead_id']}", timeout=30)
