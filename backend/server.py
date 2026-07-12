"""ViralLead Automator backend.

FastAPI app that powers the automation dashboard: onboarding/positioning,
lead discovery, market research, AI post generation (Gemini 3 Flash via
emergentintegrations), engagement insights, and cold email drafts.

All third-party AI calls go through Gemini 3 Flash preview (`gemini-3-flash-preview`)
via the emergent LLM key. No LinkedIn / Gmail login required — LinkedIn public
metrics are fetched via Gemini web reasoning; emails are generated as drafts
with one-click Gmail Compose links; posts optionally scheduled via Buffer/Publer
API keys the user pastes into Settings.
"""

from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import uuid
import logging
import asyncio
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------------------------------------------------------------------------
# App / DB setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
GEMINI_MODEL = "gemini-3-flash-preview"

app = FastAPI(title="ViralLead Automator")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class ProfileIn(BaseModel):
    name: Optional[str] = None
    positioning: str = "Consumer behavior based brand strategy and marketing executive"
    niche: Optional[str] = None
    target_audience: Optional[str] = None
    painpoints_solved: Optional[str] = None
    tone_samples: Optional[str] = None
    signature_hooks: Optional[str] = None
    past_posts: Optional[str] = None
    buffer_api_key: Optional[str] = None
    publer_api_key: Optional[str] = None
    scheduler_provider: Optional[Literal["buffer", "publer", "manual"]] = "manual"
    from_email: Optional[str] = None
    leads_per_cycle: int = 20
    cycle_hours: int = 6


class Profile(ProfileIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    updated_at: str = Field(default_factory=now_iso)


class LeadCriteriaIn(BaseModel):
    ideal_customer: str
    industry: Optional[str] = None
    company_size: Optional[str] = None
    geography: Optional[str] = None
    seniority: Optional[str] = None
    keywords: Optional[str] = None
    sources: List[str] = Field(default_factory=lambda: ["company_sites", "reddit", "hn", "indiehackers", "whois"])


class Lead(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    role: Optional[str] = None
    company: Optional[str] = None
    company_url: Optional[str] = None
    email: Optional[str] = None
    email_confidence: Optional[str] = None  # "verified" | "guessed"
    linkedin_url: Optional[str] = None
    source: Optional[str] = None
    location: Optional[str] = None
    painpoint: Optional[str] = None
    fit_score: Optional[int] = None
    status: str = "new"  # new | contacted | qualified | archived
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class ResearchTopic(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    angle: str
    virality_score: int
    trend_reason: str
    supporting_signals: List[str] = Field(default_factory=list)
    suggested_hook: str
    created_at: str = Field(default_factory=now_iso)


class Post(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    topic_id: Optional[str] = None
    topic_title: str
    hook: str
    body: str
    hashtags: List[str] = Field(default_factory=list)
    call_to_action: Optional[str] = None
    status: Literal["draft", "approved", "rejected", "scheduled", "published"] = "draft"
    scheduled_for: Optional[str] = None
    metrics: Optional[Dict[str, Any]] = None  # {likes, comments, shares, impressions, updated_at, source}
    learnings: Optional[str] = None
    image_data: Optional[str] = None  # data URL: data:image/png;base64,...
    image_prompt: Optional[str] = None
    buffer_post_id: Optional[str] = None
    buffer_channel_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class VoiceQuestion(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    question: str
    context: Optional[str] = None
    answer: Optional[str] = None
    answered: bool = False
    created_at: str = Field(default_factory=now_iso)


class Email(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    lead_name: str
    lead_email: Optional[str] = None
    subject: str
    body: str
    status: Literal["draft", "approved", "sent"] = "draft"
    created_at: str = Field(default_factory=now_iso)


class GenerateResearchIn(BaseModel):
    focus: Optional[str] = None
    n: int = 5


class GeneratePostIn(BaseModel):
    topic_id: Optional[str] = None
    topic_title: Optional[str] = None
    angle: Optional[str] = None
    extra_notes: Optional[str] = None


class UpdatePostIn(BaseModel):
    hook: Optional[str] = None
    body: Optional[str] = None
    hashtags: Optional[List[str]] = None
    call_to_action: Optional[str] = None
    status: Optional[Literal["draft", "approved", "rejected", "scheduled", "published"]] = None
    scheduled_for: Optional[str] = None
    metrics: Optional[Dict[str, Any]] = None
    learnings: Optional[str] = None


class AnswerVoiceIn(BaseModel):
    answer: str


class GenerateEmailIn(BaseModel):
    lead_id: str
    angle: Optional[str] = None


class RefreshMetricsIn(BaseModel):
    post_id: str
    post_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Gemini helper
# ---------------------------------------------------------------------------
async def gemini_chat(system_message: str, user_text: str, session_id: Optional[str] = None) -> str:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id or f"session-{uuid.uuid4()}",
        system_message=system_message,
    ).with_model("gemini", GEMINI_MODEL)
    reply = await chat.send_message(UserMessage(text=user_text))
    return reply if isinstance(reply, str) else str(reply)


def _extract_json(text: str) -> Any:
    """Pull the first balanced JSON array/object out of an LLM response."""
    if not text:
        return None
    text = text.strip()
    # Strip markdown fences if the entire message is a fenced block.
    fence = re.match(r"^```(?:json|JSON)?\s*(.*?)\s*```\s*$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    # Bracket-balanced scan for the first complete JSON object/array.
    for opener, closer in (("{", "}"), ("[", "]")):
        start = text.find(opener)
        while start != -1:
            depth = 0
            in_str = False
            esc = False
            for i in range(start, len(text)):
                ch = text[i]
                if esc:
                    esc = False
                    continue
                if ch == "\\":
                    esc = True
                    continue
                if ch == '"':
                    in_str = not in_str
                    continue
                if in_str:
                    continue
                if ch == opener:
                    depth += 1
                elif ch == closer:
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(text[start:i + 1])
                        except Exception:
                            break
            start = text.find(opener, start + 1)
    return None


def _clean_post_shape(post: Dict[str, Any]) -> Dict[str, Any]:
    """If body accidentally holds a JSON string, unpack it into hook/body/hashtags."""
    body = post.get("body") or ""
    if isinstance(body, str) and body.lstrip().startswith(("{", "```")):
        parsed = _extract_json(body)
        if isinstance(parsed, dict) and ("hook" in parsed or "body" in parsed):
            post["hook"] = post.get("hook") or parsed.get("hook") or ""
            post["body"] = parsed.get("body") or ""
            if not post.get("hashtags") and parsed.get("hashtags"):
                post["hashtags"] = parsed.get("hashtags") or []
            if not post.get("call_to_action") and parsed.get("call_to_action"):
                post["call_to_action"] = parsed.get("call_to_action")
    return post


async def get_profile_doc() -> Dict[str, Any]:
    doc = await db.profile.find_one({"_id": "singleton"}, {"_id": 0})
    return doc or {}


def profile_context(profile: Dict[str, Any]) -> str:
    if not profile:
        return "The user has not completed onboarding yet. Assume: Consumer behavior based brand strategy and marketing executive positioning."
    lines = [
        f"- Name: {profile.get('name') or 'N/A'}",
        f"- Positioning: {profile.get('positioning')}",
        f"- Niche: {profile.get('niche') or 'N/A'}",
        f"- Target audience: {profile.get('target_audience') or 'N/A'}",
        f"- Painpoints solved: {profile.get('painpoints_solved') or 'N/A'}",
        f"- Signature hooks: {profile.get('signature_hooks') or 'N/A'}",
        f"- Tone samples: {profile.get('tone_samples') or 'N/A'}",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Profile endpoints
# ---------------------------------------------------------------------------
@api_router.get("/profile")
async def get_profile():
    doc = await get_profile_doc()
    return doc or {}


@api_router.post("/profile")
async def save_profile(payload: ProfileIn):
    data = payload.model_dump()
    data["updated_at"] = now_iso()
    await db.profile.update_one(
        {"_id": "singleton"},
        {"$set": data},
        upsert=True,
    )
    return {"ok": True, **data}


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------
@api_router.get("/leads", response_model=List[Lead])
async def list_leads(status: Optional[str] = None, limit: int = 200):
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    docs = await db.leads.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@api_router.post("/leads/discover")
async def discover_leads(criteria: LeadCriteriaIn):
    profile = await get_profile_doc()
    prof_ctx = profile_context(profile)
    max_leads = int(profile.get("leads_per_cycle") or 20)

    sources_str = ", ".join(criteria.sources) if criteria.sources else "public web"
    system = (
        "You are a lead-research analyst. You have deep knowledge of public web "
        "sources (company career pages, /about, /team pages, WHOIS records, "
        "public LinkedIn indexes via Google, Reddit, Hacker News, IndieHackers, "
        "product launch sites, podcast guest lists). You never invent identities: "
        "each lead must be plausibly real, drawn from public patterns and typical "
        "company personnel. When an email is not verifiable, use standard pattern-"
        "guessing (first.last@company.com, first@company.com) and set email_confidence "
        "to 'guessed' with a plausible company domain. Output STRICT JSON only."
    )

    user = f"""
User profile (writes / sells to these leads):
{prof_ctx}

Ideal customer criteria:
- ICP description: {criteria.ideal_customer}
- Industry: {criteria.industry or 'any'}
- Company size: {criteria.company_size or 'any'}
- Geography: {criteria.geography or 'any'}
- Seniority: {criteria.seniority or 'any'}
- Keywords: {criteria.keywords or 'n/a'}
- Sources to draw from: {sources_str}

Return a JSON array of {max_leads} lead objects. Each object MUST have these keys:
  name, role, company, company_url, email, email_confidence, linkedin_url, source,
  location, painpoint (single sentence, specific to this person's role), fit_score (0-100).

Rules:
- linkedin_url MUST look like https://www.linkedin.com/in/<slug>
- email_confidence is either "verified" (only if source clearly exposes it) or "guessed".
- painpoint must be a real pain the user's positioning can solve.
- No prose, no markdown fences, ONLY the JSON array.
""".strip()

    raw = await gemini_chat(system, user, session_id=f"leads-{uuid.uuid4()}")
    parsed = _extract_json(raw) or []
    if not isinstance(parsed, list):
        parsed = []

    created: List[Dict[str, Any]] = []
    for item in parsed[:max_leads]:
        try:
            lead = Lead(**{k: v for k, v in item.items() if k in Lead.model_fields})
            doc = lead.model_dump()
            await db.leads.insert_one({**doc, "_id": lead.id})
            created.append(doc)
        except Exception as exc:  # pragma: no cover
            logger.warning("skip malformed lead: %s", exc)

    await db.jobs.insert_one({
        "_id": str(uuid.uuid4()),
        "kind": "leads_discovery",
        "created_at": now_iso(),
        "count": len(created),
        "criteria": criteria.model_dump(),
    })
    return {"count": len(created), "leads": created}


@api_router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, payload: Dict[str, Any]):
    payload.pop("_id", None)
    payload.pop("id", None)
    await db.leads.update_one({"_id": lead_id}, {"$set": payload})
    doc = await db.leads.find_one({"_id": lead_id}, {"_id": 0})
    return doc or {}


@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str):
    await db.leads.delete_one({"_id": lead_id})
    return {"ok": True}


@api_router.get("/leads/export.csv")
async def export_leads_csv():
    docs = await db.leads.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    headers = ["name", "role", "company", "company_url", "email", "email_confidence",
               "linkedin_url", "location", "painpoint", "fit_score", "status", "source"]
    lines = [",".join(headers)]
    for d in docs:
        row = []
        for h in headers:
            v = str(d.get(h) or "").replace('"', '""').replace("\n", " ")
            row.append(f'"{v}"')
        lines.append(",".join(row))
    return JSONResponse(content={"csv": "\n".join(lines)})


# ---------------------------------------------------------------------------
# Market research
# ---------------------------------------------------------------------------
@api_router.get("/research", response_model=List[ResearchTopic])
async def list_research(limit: int = 50):
    docs = await db.research.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@api_router.post("/research/generate")
async def generate_research(payload: GenerateResearchIn):
    profile = await get_profile_doc()
    prof_ctx = profile_context(profile)
    focus = payload.focus or "high-virality themes in the user's niche this week"

    system = (
        "You are a viral content strategist. You study Reddit, Hacker News, "
        "IndieHackers, Twitter/X, LinkedIn public posts, and Substack to spot "
        "topics with rising velocity. For a solo operator, you propose topics "
        "that punch above their weight. Output STRICT JSON only."
    )
    user = f"""
User profile:
{prof_ctx}

Focus for this batch: {focus}

Return a JSON array of {payload.n} research topics tuned to the user's positioning.
Each object MUST have keys:
  title, angle, virality_score (0-100), trend_reason (why it's rising NOW),
  supporting_signals (array of 2-4 concrete public sources / observations),
  suggested_hook (one line to open a LinkedIn post).

No markdown, only JSON.
""".strip()

    raw = await gemini_chat(system, user, session_id=f"research-{uuid.uuid4()}")
    parsed = _extract_json(raw) or []
    if not isinstance(parsed, list):
        parsed = []

    created: List[Dict[str, Any]] = []
    for item in parsed[:payload.n]:
        try:
            topic = ResearchTopic(**{k: v for k, v in item.items() if k in ResearchTopic.model_fields})
            doc = topic.model_dump()
            await db.research.insert_one({**doc, "_id": topic.id})
            created.append(doc)
        except Exception as exc:  # pragma: no cover
            logger.warning("skip malformed research: %s", exc)
    return {"count": len(created), "topics": created}


@api_router.delete("/research/{topic_id}")
async def delete_topic(topic_id: str):
    await db.research.delete_one({"_id": topic_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Posts
# ---------------------------------------------------------------------------
@api_router.get("/posts", response_model=List[Post])
async def list_posts(status: Optional[str] = None, limit: int = 100):
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    docs = await db.posts.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    # Repair any legacy docs where Gemini's JSON leaked into body
    for d in docs:
        _clean_post_shape(d)
    return docs


@api_router.post("/posts/generate")
async def generate_post(payload: GeneratePostIn):
    profile = await get_profile_doc()
    prof_ctx = profile_context(profile)

    topic_title = payload.topic_title
    angle = payload.angle
    if payload.topic_id:
        topic = await db.research.find_one({"_id": payload.topic_id}, {"_id": 0})
        if topic:
            topic_title = topic_title or topic.get("title")
            angle = angle or topic.get("angle")

    if not topic_title:
        raise HTTPException(400, "topic_title or topic_id required")

    # Include any answered voice-Q&A for tone anchoring
    voice_docs = await db.voice_qa.find({"answered": True}, {"_id": 0}).sort("created_at", -1).to_list(10)
    voice_ctx = "\n".join(f"Q: {v['question']}\nA: {v.get('answer')}" for v in voice_docs) or "None yet."

    system = (
        "You write LinkedIn posts as the user, in the user's voice. Rules: "
        "punchy first line hook (max 12 words), short lines, one idea per line, "
        "no corporate cliches, no emojis unless already used in the user's tone samples. "
        "Return STRICT JSON with keys: hook, body, hashtags (array of 3-6 without #), call_to_action."
    )
    user = f"""
User profile & voice:
{prof_ctx}

The user has answered these voice-anchor questions (use them to mimic tone/opinions):
{voice_ctx}

Write a LinkedIn post about:
Topic: {topic_title}
Angle: {angle or 'strongest angle you can find'}
Extra notes from user: {payload.extra_notes or 'none'}

Return only JSON.
""".strip()

    raw = await gemini_chat(system, user, session_id=f"post-{uuid.uuid4()}")
    parsed = _extract_json(raw) or {}
    if not isinstance(parsed, dict):
        parsed = {}

    post = Post(
        topic_id=payload.topic_id,
        topic_title=topic_title,
        hook=parsed.get("hook", ""),
        body=parsed.get("body", raw if isinstance(raw, str) else ""),
        hashtags=parsed.get("hashtags", []) or [],
        call_to_action=parsed.get("call_to_action"),
    )
    doc = post.model_dump()
    await db.posts.insert_one({**doc, "_id": post.id})
    return doc


@api_router.patch("/posts/{post_id}")
async def update_post(post_id: str, payload: UpdatePostIn):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "no fields to update")
    await db.posts.update_one({"_id": post_id}, {"$set": update})
    doc = await db.posts.find_one({"_id": post_id}, {"_id": 0})
    return doc or {}


@api_router.delete("/posts/{post_id}")
async def delete_post(post_id: str):
    await db.posts.delete_one({"_id": post_id})
    return {"ok": True}


BUFFER_GQL_URL = "https://api.buffer.com/graphql"


async def buffer_gql(api_key: str, query: str, variables: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not api_key:
        raise HTTPException(400, "Buffer API key not set. Add it in Settings first.")
    async with httpx.AsyncClient(timeout=30) as ac:
        r = await ac.post(
            BUFFER_GQL_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"query": query, "variables": variables or {}},
        )
        try:
            data = r.json()
        except Exception:
            raise HTTPException(502, f"Buffer non-JSON response: {r.text[:200]}")
    if r.status_code >= 400 or data.get("errors"):
        errs = data.get("errors") or [{"message": r.text[:300]}]
        raise HTTPException(502, "Buffer error: " + "; ".join(e.get("message", "?") for e in errs))
    return data.get("data") or {}


async def buffer_org_id(profile: Dict[str, Any]) -> str:
    """Resolve and cache the Buffer organization id."""
    api_key = profile.get("buffer_api_key") or ""
    if profile.get("buffer_org_id"):
        return profile["buffer_org_id"]
    data = await buffer_gql(api_key, "{ account { id organizations { id name } } }")
    orgs = ((data.get("account") or {}).get("organizations")) or []
    if not orgs:
        raise HTTPException(400, "No Buffer organizations visible on this token.")
    org_id = orgs[0]["id"]
    await db.profile.update_one({"_id": "singleton"}, {"$set": {"buffer_org_id": org_id}}, upsert=True)
    return org_id


@api_router.post("/posts/{post_id}/schedule")
async def schedule_post(post_id: str, payload: Dict[str, Any]):
    profile = await get_profile_doc()
    post = await db.posts.find_one({"_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "post not found")

    scheduled_for = payload.get("scheduled_for") or (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    provider = profile.get("scheduler_provider") or "manual"
    channel_id = payload.get("channel_id") or post.get("buffer_channel_id")

    hashtags = " ".join(f"#{h.lstrip('#')}" for h in (post.get("hashtags") or []))
    full_text = payload.get("full_text") or "\n\n".join(
        x for x in [post.get("hook"), post.get("body"), hashtags,
                    (f"→ {post['call_to_action']}" if post.get("call_to_action") else None)] if x
    )

    external_id: Optional[str] = None
    detail = "Stored locally. No scheduler configured — copy from your queue."

    if provider == "buffer" and profile.get("buffer_api_key"):
        org_id = await buffer_org_id(profile)
        if not channel_id:
            data = await buffer_gql(profile["buffer_api_key"],
                                    "query C($id: OrganizationId!) { channels(input: {organizationId: $id}) { id name service } }",
                                    {"id": org_id})
            channels = data.get("channels") or []
            li = next((c for c in channels if c.get("service") == "linkedin"), None) or (channels[0] if channels else None)
            if li:
                channel_id = li["id"]
        if not channel_id:
            raise HTTPException(400, "No Buffer channel found. Connect a channel inside Buffer first.")

        mutation = """
        mutation Create($orgId: OrganizationId!, $channels: [ChannelInput!]!, $content: PostContentInput!, $schedulingType: SchedulingType!, $dueAt: DateTime) {
          createPost(input: { organizationId: $orgId, channels: $channels, content: $content, schedulingType: $schedulingType, dueAt: $dueAt }) {
            ... on PostActionSuccess { post { id status dueAt } }
            ... on PostActionError   { code message }
          }
        }
        """
        variables = {
            "orgId": org_id,
            "channels": [{"id": channel_id}],
            "content": {"text": full_text[:2900]},
            "schedulingType": "CUSTOM",
            "dueAt": scheduled_for,
        }
        try:
            data = await buffer_gql(profile["buffer_api_key"], mutation, variables)
            result = data.get("createPost") or {}
            if result.get("post"):
                external_id = result["post"].get("id")
                detail = f"Scheduled on Buffer. Post id {external_id}."
            elif result.get("message"):
                detail = f"Buffer refused: {result.get('message')}"
        except HTTPException as exc:
            detail = f"Buffer failed: {exc.detail}"

    elif provider == "publer" and profile.get("publer_api_key"):
        try:
            async with httpx.AsyncClient(timeout=15) as ac:
                r = await ac.post(
                    "https://app.publer.io/api/v1/posts/schedule/create",
                    headers={
                        "Authorization": f"Bearer-API {profile['publer_api_key']}",
                        "Content-Type": "application/json",
                    },
                    json={"posts": [{
                        "networks": ["linkedin"],
                        "details": {"text": full_text[:2900]},
                        "scheduled_at": scheduled_for,
                    }]},
                )
                if r.status_code < 400:
                    external_id = str(r.json().get("job_id") or r.json().get("id") or "")
                    detail = "Scheduled with Publer."
                else:
                    detail = f"Publer error {r.status_code}: {r.text[:200]}"
        except Exception as exc:
            detail = f"Publer request failed: {exc}"

    await db.posts.update_one(
        {"_id": post_id},
        {"$set": {
            "status": "scheduled",
            "scheduled_for": scheduled_for,
            "buffer_post_id": external_id if provider == "buffer" else post.get("buffer_post_id"),
            "buffer_channel_id": channel_id if provider == "buffer" else post.get("buffer_channel_id"),
        }},
    )
    doc = await db.posts.find_one({"_id": post_id}, {"_id": 0})
    _clean_post_shape(doc)
    return {"post": doc, "detail": detail, "provider": provider, "channel_id": channel_id}


# ---------------------------------------------------------------------------
# Buffer sync (past posts + analytics)
# ---------------------------------------------------------------------------
@api_router.get("/buffer/channels")
async def buffer_channels():
    profile = await get_profile_doc()
    org_id = await buffer_org_id(profile)
    data = await buffer_gql(
        profile.get("buffer_api_key", ""),
        "query C($id: OrganizationId!) { channels(input: {organizationId: $id}) { id name service avatar } }",
        {"id": org_id},
    )
    return data.get("channels") or []


@api_router.post("/buffer/sync-past-posts")
async def buffer_sync_past_posts(payload: Optional[Dict[str, Any]] = None):
    profile = await get_profile_doc()
    org_id = await buffer_org_id(profile)
    query = """
    query PastPosts($orgId: OrganizationId!) {
      posts(input: { organizationId: $orgId, filter: { status: sent } }) {
        edges {
          node {
            id text createdAt
            channel { service name }
            metrics { name value unit }
          }
        }
      }
    }
    """
    data = await buffer_gql(profile.get("buffer_api_key", ""), query, {"orgId": org_id})
    edges = ((data.get("posts") or {}).get("edges")) or []
    items = []
    tone_texts = []
    for e in edges:
        node = e.get("node") or {}
        txt = (node.get("text") or "").strip()
        if txt:
            items.append({
                "id": node.get("id"),
                "text": txt,
                "sent_at": node.get("createdAt"),
                "channel": (node.get("channel") or {}).get("name"),
                "service": (node.get("channel") or {}).get("service"),
                "metrics": node.get("metrics") or [],
            })
            tone_texts.append(txt)

    if tone_texts:
        joined = "\n\n---\n\n".join(tone_texts[:8])
        await db.profile.update_one(
            {"_id": "singleton"},
            {"$set": {"past_posts": joined, "buffer_last_sync": now_iso()}},
            upsert=True,
        )
    await db.buffer_posts.delete_many({})
    if items:
        await db.buffer_posts.insert_many([{**it, "_id": it.get("id") or str(uuid.uuid4())} for it in items])
    return {"count": len(items), "posts": items}


@api_router.post("/buffer/analytics")
async def buffer_analytics(payload: Optional[Dict[str, Any]] = None):
    profile = await get_profile_doc()
    org_id = await buffer_org_id(profile)
    days = int((payload or {}).get("days", 30))
    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=days)
    query = """
    query Agg($orgId: OrganizationId!, $start: DateTime!, $end: DateTime!) {
      aggregatedPostMetrics(input: { organizationId: $orgId, startDateTime: $start, endDateTime: $end }) {
        metrics { name value unit }
      }
    }
    """
    try:
        data = await buffer_gql(profile.get("buffer_api_key", ""), query,
                                {"orgId": org_id, "start": start_dt.isoformat(), "end": end_dt.isoformat()})
        entries = ((data.get("aggregatedPostMetrics") or {}).get("metrics")) or []
    except HTTPException as exc:
        return {"entries": [], "note": str(exc.detail), "days": days}
    return {"entries": entries, "days": days}


# ---------------------------------------------------------------------------
# Image generation (Gemini Nano Banana)
# ---------------------------------------------------------------------------
class GenerateImageIn(BaseModel):
    prompt: Optional[str] = None
    style: Optional[str] = "clean minimal editorial poster, high-contrast, dark background, cyber-yellow accents, no text"


@api_router.post("/posts/{post_id}/generate-image")
async def generate_post_image(post_id: str, payload: GenerateImageIn):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY not configured")
    post = await db.posts.find_one({"_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "post not found")

    import base64
    prompt = (payload.prompt or f"LinkedIn post visual for the concept: '{post.get('hook') or post.get('topic_title')}'. "
              f"Post body context: {(post.get('body') or '')[:300]}. "
              f"Style: {payload.style}. Square 1:1. No text, no lettering. Editorial, magazine-cover level.")

    from emergentintegrations.llm.chat import LlmChat as _LlmChat, UserMessage as _UM
    chat = _LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"img-{post_id}-{uuid.uuid4()}",
        system_message="You generate clean minimal editorial poster visuals for LinkedIn posts.",
    ).with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])

    try:
        _, images = await chat.send_message_multimodal_response(_UM(text=prompt))
    except Exception as exc:
        raise HTTPException(502, f"Image generation failed: {exc}")

    if not images:
        raise HTTPException(502, "Model returned no image.")

    img = images[0]
    mime = img.get("mime_type") or "image/png"
    data_url = f"data:{mime};base64,{img.get('data')}"
    await db.posts.update_one({"_id": post_id},
                              {"$set": {"image_data": data_url, "image_prompt": prompt}})
    return {"image_data": data_url, "prompt": prompt}


@api_router.post("/posts/{post_id}/metrics/refresh")
async def refresh_metrics(post_id: str, payload: RefreshMetricsIn):
    """Ask Gemini to reason about likely engagement of a public post."""
    profile = await get_profile_doc()
    prof_ctx = profile_context(profile)
    post = await db.posts.find_one({"_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "post not found")

    system = (
        "You are a LinkedIn engagement analyst. Given a post's content and its "
        "public URL if provided, estimate current engagement using patterns from "
        "similar posts you have seen on the public web. If you have no access to "
        "the live count, output a realistic ESTIMATE and mark source as 'estimate'. "
        "Output STRICT JSON only."
    )
    user = f"""
Author profile:
{prof_ctx}

Post hook: {post.get('hook')}
Post body: {post.get('body')}
Post URL (may be blank): {payload.post_url or 'not provided'}

Return JSON with keys:
  likes, comments, shares, impressions, source ('estimate' or 'public'),
  learnings (1-3 sentence takeaway about why it did / would perform this way,
             and what to do next post).
""".strip()

    raw = await gemini_chat(system, user, session_id=f"metrics-{post_id}")
    parsed = _extract_json(raw) or {}
    if not isinstance(parsed, dict):
        parsed = {}

    metrics = {
        "likes": int(parsed.get("likes") or 0),
        "comments": int(parsed.get("comments") or 0),
        "shares": int(parsed.get("shares") or 0),
        "impressions": int(parsed.get("impressions") or 0),
        "source": parsed.get("source") or "estimate",
        "updated_at": now_iso(),
    }
    learnings = parsed.get("learnings") or ""
    await db.posts.update_one({"_id": post_id},
                              {"$set": {"metrics": metrics, "learnings": learnings}})
    return {"metrics": metrics, "learnings": learnings}


@api_router.post("/posts/strategy")
async def strategy_next():
    """Aggregate metrics + learnings across posts, propose a next-move strategy."""
    profile = await get_profile_doc()
    prof_ctx = profile_context(profile)
    posts = await db.posts.find({"metrics": {"$exists": True}}, {"_id": 0}).sort("created_at", -1).to_list(30)
    summary = [{
        "hook": p.get("hook"),
        "metrics": p.get("metrics"),
        "learnings": p.get("learnings"),
    } for p in posts]

    # Include real Buffer analytics if synced
    buffer_posts = await db.buffer_posts.find({}, {"_id": 0}).to_list(30)
    buffer_summary = [{
        "text": (bp.get("text") or "")[:220],
        "sent_at": bp.get("sent_at"),
        "metrics": bp.get("metrics") or [],
    } for bp in buffer_posts]

    system = (
        "You are the user's content strategist. Based on their recent posts and "
        "measured Buffer metrics + estimated metrics, propose the next 3 post ideas "
        "and a specific adjustment to their voice. Output STRICT JSON only."
    )
    user = f"""
User profile:
{prof_ctx}

AI-generated posts (with estimated metrics):
{json.dumps(summary)[:4000]}

Real past posts pulled from Buffer (with actual network metrics):
{json.dumps(buffer_summary)[:4000]}

Return JSON with keys:
  patterns (array of 3 short strings of what's working),
  gaps (array of 3 short strings of what's under-performing),
  next_topics (array of 3 objects: title, angle, why_now),
  voice_adjustment (one paragraph).
""".strip()

    raw = await gemini_chat(system, user, session_id=f"strategy-{uuid.uuid4()}")
    parsed = _extract_json(raw) or {}
    return parsed


# ---------------------------------------------------------------------------
# Voice Q&A (personal opinion prompts)
# ---------------------------------------------------------------------------
@api_router.get("/voice-questions", response_model=List[VoiceQuestion])
async def list_voice(limit: int = 50):
    docs = await db.voice_qa.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@api_router.post("/voice-questions/generate")
async def generate_voice_questions(payload: Optional[Dict[str, Any]] = None):
    n = int((payload or {}).get("n", 4))
    profile = await get_profile_doc()
    prof_ctx = profile_context(profile)
    system = (
        "You interview a solo operator to capture their tone, contrarian takes, "
        "and lived stories, so an AI can write in their voice. Ask specific, "
        "opinion-forcing questions — not generic ones. Output STRICT JSON only."
    )
    user = f"""
User profile:
{prof_ctx}

Return a JSON array of {n} objects with keys: question, context (why we ask).
""".strip()
    raw = await gemini_chat(system, user, session_id=f"voice-{uuid.uuid4()}")
    parsed = _extract_json(raw) or []
    if not isinstance(parsed, list):
        parsed = []
    created = []
    for item in parsed[:n]:
        try:
            q = VoiceQuestion(**{k: v for k, v in item.items() if k in VoiceQuestion.model_fields})
            doc = q.model_dump()
            await db.voice_qa.insert_one({**doc, "_id": q.id})
            created.append(doc)
        except Exception:
            continue
    return {"count": len(created), "questions": created}


@api_router.post("/voice-questions/{qid}/answer")
async def answer_voice(qid: str, payload: AnswerVoiceIn):
    await db.voice_qa.update_one({"_id": qid},
                                 {"$set": {"answer": payload.answer, "answered": True}})
    doc = await db.voice_qa.find_one({"_id": qid}, {"_id": 0})
    return doc or {}


# ---------------------------------------------------------------------------
# Cold emails
# ---------------------------------------------------------------------------
@api_router.get("/emails", response_model=List[Email])
async def list_emails(status: Optional[str] = None, limit: int = 200):
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    docs = await db.emails.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@api_router.post("/emails/generate")
async def generate_email(payload: GenerateEmailIn):
    lead = await db.leads.find_one({"_id": payload.lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "lead not found")

    profile = await get_profile_doc()
    prof_ctx = profile_context(profile)

    system = (
        "You write high-response cold emails. Personal, specific, short (under 120 words). "
        "Reference the lead's actual work / role / company. No corporate fluff. "
        "Output STRICT JSON with keys: subject, body."
    )
    user = f"""
Sender profile:
{prof_ctx}

Lead:
  name: {lead.get('name')}
  role: {lead.get('role')}
  company: {lead.get('company')}
  company_url: {lead.get('company_url')}
  linkedin_url: {lead.get('linkedin_url')}
  painpoint: {lead.get('painpoint')}
  location: {lead.get('location')}

Extra angle: {payload.angle or 'none'}

Write the cold email. JSON only.
""".strip()

    raw = await gemini_chat(system, user, session_id=f"email-{payload.lead_id}")
    parsed = _extract_json(raw) or {}
    if not isinstance(parsed, dict):
        parsed = {}

    email = Email(
        lead_id=payload.lead_id,
        lead_name=lead.get("name", ""),
        lead_email=lead.get("email"),
        subject=parsed.get("subject", ""),
        body=parsed.get("body", raw if isinstance(raw, str) else ""),
    )
    doc = email.model_dump()
    await db.emails.insert_one({**doc, "_id": email.id})
    return doc


@api_router.patch("/emails/{email_id}")
async def update_email(email_id: str, payload: Dict[str, Any]):
    payload.pop("_id", None)
    payload.pop("id", None)
    await db.emails.update_one({"_id": email_id}, {"$set": payload})
    doc = await db.emails.find_one({"_id": email_id}, {"_id": 0})
    return doc or {}


@api_router.post("/emails/{email_id}/mark-sent")
async def mark_email_sent(email_id: str):
    await db.emails.update_one({"_id": email_id}, {"$set": {"status": "sent"}})
    return {"ok": True}


@api_router.delete("/emails/{email_id}")
async def delete_email(email_id: str):
    await db.emails.delete_one({"_id": email_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Dashboard summary
# ---------------------------------------------------------------------------
@api_router.get("/dashboard/summary")
async def dashboard_summary():
    leads_total = await db.leads.count_documents({})
    leads_new = await db.leads.count_documents({"status": "new"})
    leads_contacted = await db.leads.count_documents({"status": "contacted"})
    posts_total = await db.posts.count_documents({})
    posts_draft = await db.posts.count_documents({"status": "draft"})
    posts_scheduled = await db.posts.count_documents({"status": "scheduled"})
    emails_draft = await db.emails.count_documents({"status": "draft"})
    emails_sent = await db.emails.count_documents({"status": "sent"})
    research_total = await db.research.count_documents({})

    recent_posts = await db.posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    recent_leads = await db.leads.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    top_topics = await db.research.find({}, {"_id": 0}).sort("virality_score", -1).to_list(5)

    return {
        "counters": {
            "leads_total": leads_total,
            "leads_new": leads_new,
            "leads_contacted": leads_contacted,
            "posts_total": posts_total,
            "posts_draft": posts_draft,
            "posts_scheduled": posts_scheduled,
            "emails_draft": emails_draft,
            "emails_sent": emails_sent,
            "research_total": research_total,
        },
        "recent_posts": recent_posts,
        "recent_leads": recent_leads,
        "top_topics": top_topics,
    }


@api_router.get("/")
async def root():
    return {"ok": True, "app": "ViralLead Automator", "model": GEMINI_MODEL}


# ---------------------------------------------------------------------------
# Wiring
# ---------------------------------------------------------------------------
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
