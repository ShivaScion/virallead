import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { dashboardSummary, getProfile, automationStatus, automationTick } from "@/lib/api";
import { toast } from "sonner";
import { Users, PenSquare, Mail, TrendingUp, ArrowRight, Zap, RefreshCcw, Loader2 } from "lucide-react";

const Stat = ({ label, value, sub, testId }) => (
  <Card className="tech-card p-5 rounded-none" data-testid={testId}>
    <div className="text-[10px] font-mono text-white/40 tracking-widest">{label}</div>
    <div className="font-display font-extrabold text-4xl mt-2 text-white">{value ?? 0}</div>
    {sub && <div className="text-xs text-white/50 mt-1 font-mono">{sub}</div>}
  </Card>
);

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoStatus, setAutoStatus] = useState(null);
  const [ticking, setTicking] = useState(false);
  const navigate = useNavigate();

  const loadAll = () => {
    Promise.all([dashboardSummary(), getProfile(), automationStatus().catch(() => null)])
      .then(([s, p, a]) => {
        setData(s);
        setProfile(p);
        setAutoStatus(a);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 30000);
    return () => clearInterval(id);
  }, []);

  const forceTick = async () => {
    setTicking(true);
    try {
      await automationTick();
      toast.success("Autonomous cycle queued — new topics, drafts and visuals coming.");
      setTimeout(loadAll, 4000);
    } catch (e) {
      toast.error("Tick failed.");
    } finally {
      setTicking(false);
    }
  };

  const c = data?.counters || {};
  const positioning = profile?.positioning || "Consumer behavior based brand strategy and marketing executive";
  const isEmpty = !profile?.positioning;

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      {isEmpty && (
        <Card className="tech-card p-6 rounded-none border-l-4 border-cyber" data-testid="onboarding-nudge">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[10px] font-mono text-cyber tracking-widest">// FIRST RUN</div>
              <h2 className="font-display font-extrabold text-2xl mt-1">Tell the AI who you are.</h2>
              <p className="text-sm text-white/60 mt-2 max-w-xl">
                Two minutes of positioning input unlocks tone-accurate posts, targeted leads, and cold emails that don't
                sound like copy-paste.
              </p>
            </div>
            <Button
              className="bg-cyber text-black hover:bg-yellow-400 rounded-none font-semibold"
              onClick={() => navigate("/onboarding")}
              data-testid="cta-start-onboarding"
            >
              Complete positioning <ArrowRight size={14} className="ml-2" />
            </Button>
          </div>
        </Card>
      )}

      {/* Hero row */}
      <div>
        <div className="text-[10px] font-mono text-white/40 tracking-widest mb-2">// POSITIONING SNAPSHOT</div>
        <p className="text-white/80 text-lg leading-relaxed max-w-3xl">
          <span className="text-cyber">You:</span> {positioning}.
          <br />
          <span className="text-white/50 text-sm">The engine scrapes public web signals every cycle and writes in your voice.</span>
        </p>
      </div>

      {/* Autonomous status */}
      <Card className="tech-card rounded-none p-5 border-l-4 border-cyber" data-testid="autonomy-card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-cyber" />
              <div className="text-[10px] font-mono text-cyber tracking-widest">AUTONOMOUS ENGINE · ACTIVE</div>
            </div>
            <div className="text-sm text-white/85 mt-2 font-mono">
              Cycle: every 3h · Buffer sync: {autoStatus?.last_buffer_sync ? new Date(autoStatus.last_buffer_sync).toLocaleString() : "not yet"}
            </div>
            {autoStatus?.upcoming?.length > 0 && (
              <div className="text-xs text-white/60 mt-2">
                Next scheduled: <span className="text-cyber font-mono">{new Date(autoStatus.upcoming[0].scheduled_for).toLocaleString()}</span>
                {autoStatus.upcoming[0].buffer_post_id && <span className="text-emerald-400 ml-2">✓ on Buffer</span>}
              </div>
            )}
            {autoStatus?.voice_fingerprint && (
              <div className="text-[11px] text-white/50 mt-2 italic max-w-2xl truncate">
                🖋 Voice fingerprint decoded from your Buffer past posts.
              </div>
            )}
          </div>
          <Button variant="outline" onClick={forceTick} disabled={ticking} className="rounded-none border-white/15 hover:border-cyber hover:text-cyber" data-testid="btn-force-tick">
            {ticking ? <Loader2 size={14} className="mr-2 animate-spin" /> : <RefreshCcw size={14} className="mr-2" />} Run cycle now
          </Button>
        </div>
      </Card>

      {/* Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-none bg-white/5" />)
        ) : (
          <>
            <Stat label="LEADS" value={c.leads_total} sub={`${c.leads_new || 0} new · ${c.leads_contacted || 0} contacted`} testId="stat-leads" />
            <Stat label="POSTS" value={c.posts_total} sub={`${c.posts_draft || 0} awaiting approval · ${c.posts_scheduled || 0} scheduled`} testId="stat-posts" />
            <Stat label="EMAILS" value={c.emails_draft + c.emails_sent || 0} sub={`${c.emails_draft || 0} drafts · ${c.emails_sent || 0} sent`} testId="stat-emails" />
            <Stat label="TOPICS" value={c.research_total} sub="viral candidates in queue" testId="stat-topics" />
          </>
        )}
      </div>

      {/* Split panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="tech-card rounded-none p-5 lg:col-span-2" data-testid="panel-recent-posts">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] font-mono text-white/40 tracking-widest">// LATEST DRAFTS</div>
              <h3 className="font-display font-extrabold text-xl">Awaiting your approval</h3>
            </div>
            <Button variant="ghost" onClick={() => navigate("/posts")} className="rounded-none text-cyber hover:text-yellow-300 hover:bg-white/5" data-testid="link-posts">
              Open queue <ArrowRight size={14} className="ml-1" />
            </Button>
          </div>
          <div className="space-y-2">
            {(data?.recent_posts || []).length === 0 && (
              <div className="text-sm text-white/40 py-8 font-mono text-center border border-dashed border-white/10">
                No posts yet. Go to Research → pick a topic → generate.
              </div>
            )}
            {(data?.recent_posts || []).map((p) => (
              <div key={p.id} className="hairline p-3 flex items-start justify-between gap-3 hover:border-cyber transition-colors">
                <div className="min-w-0">
                  <div className="text-xs text-white/50 font-mono truncate">{p.topic_title}</div>
                  <div className="text-sm text-white/90 mt-0.5 truncate">{p.hook || p.body?.slice(0, 90)}</div>
                </div>
                <Badge variant="outline" className="rounded-none font-mono text-[10px] shrink-0 border-white/20">
                  {p.status?.toUpperCase()}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="tech-card rounded-none p-5" data-testid="panel-top-topics">
          <div className="text-[10px] font-mono text-white/40 tracking-widest">// VIRAL RADAR</div>
          <h3 className="font-display font-extrabold text-xl mb-4">Trending topics</h3>
          <div className="space-y-3">
            {(data?.top_topics || []).length === 0 && (
              <div className="text-xs text-white/40 font-mono py-6 text-center border border-dashed border-white/10">
                No research yet.
              </div>
            )}
            {(data?.top_topics || []).map((t) => (
              <div key={t.id} className="flex items-start gap-3">
                <div className="font-mono text-cyber text-lg font-bold w-10 shrink-0">{t.virality_score}</div>
                <div className="min-w-0">
                  <div className="text-sm text-white/90 leading-tight">{t.title}</div>
                  <div className="text-[11px] text-white/40 truncate">{t.angle}</div>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/research")}
            className="w-full mt-4 rounded-none border-white/15 hover:border-cyber hover:text-cyber"
            data-testid="link-research"
          >
            Pull fresh signals
          </Button>
        </Card>
      </div>

      {/* Recent leads */}
      <Card className="tech-card rounded-none p-5" data-testid="panel-recent-leads">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] font-mono text-white/40 tracking-widest">// LATEST LEADS</div>
            <h3 className="font-display font-extrabold text-xl">Fresh from the crawler</h3>
          </div>
          <Button variant="ghost" onClick={() => navigate("/leads")} className="rounded-none text-cyber hover:text-yellow-300 hover:bg-white/5" data-testid="link-leads">
            Open leads <ArrowRight size={14} className="ml-1" />
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {(data?.recent_leads || []).length === 0 && (
            <div className="col-span-2 text-sm text-white/40 py-8 font-mono text-center border border-dashed border-white/10">
              No leads discovered yet.
            </div>
          )}
          {(data?.recent_leads || []).map((l) => (
            <div key={l.id} className="hairline p-3 hover:border-cyber transition-colors">
              <div className="flex items-center justify-between">
                <div className="text-sm text-white/90 font-medium">{l.name}</div>
                <div className="font-mono text-cyber text-xs">{l.fit_score ?? "—"}</div>
              </div>
              <div className="text-xs text-white/50 mt-0.5">{l.role} · {l.company}</div>
              <div className="text-[11px] text-white/40 font-mono mt-1 truncate">{l.email}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
