import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listPosts, refreshMetrics, strategyNext } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, RefreshCcw, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from "recharts";

export default function Insights() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState({});
  const [urls, setUrls] = useState({});
  const [strategy, setStrategy] = useState(null);
  const [stratLoading, setStratLoading] = useState(false);

  const load = () => {
    setLoading(true);
    listPosts()
      .then((all) => setPosts(all.filter((p) => ["approved", "scheduled", "published", "draft"].includes(p.status))))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const refresh = async (id) => {
    setRunning((r) => ({ ...r, [id]: true }));
    try {
      const res = await refreshMetrics(id, urls[id]);
      toast.success("Metrics updated.");
      setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, metrics: res.metrics, learnings: res.learnings } : p)));
    } catch (e) {
      toast.error("Refresh failed");
    } finally {
      setRunning((r) => ({ ...r, [id]: false }));
    }
  };

  const runStrategy = async () => {
    setStratLoading(true);
    try {
      const res = await strategyNext();
      setStrategy(res);
      toast.success("Strategy updated.");
    } catch (e) {
      toast.error("Strategy failed");
    } finally {
      setStratLoading(false);
    }
  };

  const chartData = posts
    .filter((p) => p.metrics)
    .slice(0, 10)
    .reverse()
    .map((p) => ({
      name: (p.hook || "").slice(0, 20) || p.id.slice(0, 5),
      likes: p.metrics.likes || 0,
      comments: p.metrics.comments || 0,
      shares: p.metrics.shares || 0,
    }));

  const totals = posts.reduce(
    (a, p) => {
      const m = p.metrics || {};
      a.likes += m.likes || 0;
      a.comments += m.comments || 0;
      a.shares += m.shares || 0;
      a.impressions += m.impressions || 0;
      return a;
    },
    { likes: 0, comments: 0, shares: 0, impressions: 0 }
  );

  return (
    <div className="space-y-6" data-testid="insights-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] font-mono text-cyber tracking-widest">// PERFORMANCE</div>
          <h2 className="font-display font-extrabold text-3xl">Post insights</h2>
          <p className="text-white/60 text-sm mt-1">LinkedIn public metrics estimated by Gemini. Paste post URLs for higher accuracy.</p>
        </div>
        <Button onClick={runStrategy} disabled={stratLoading} className="bg-cyber text-black hover:bg-yellow-400 rounded-none font-semibold" data-testid="btn-run-strategy">
          {stratLoading ? <><Loader2 size={14} className="mr-2 animate-spin" /> Thinking…</> : <><Target size={14} className="mr-2" /> Generate next-move strategy</>}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {["likes", "comments", "shares", "impressions"].map((k) => (
          <Card key={k} className="tech-card rounded-none p-4" data-testid={`total-${k}`}>
            <div className="text-[10px] font-mono text-white/40 tracking-widest">TOTAL {k.toUpperCase()}</div>
            <div className="font-mono text-3xl font-extrabold text-cyber mt-1">{totals[k]}</div>
          </Card>
        ))}
      </div>

      {chartData.length > 0 && (
        <Card className="tech-card rounded-none p-5" data-testid="chart-card">
          <div className="text-[10px] font-mono text-white/40 tracking-widest mb-3">// ENGAGEMENT BY POST</div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={10} />
                <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} />
                <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0 }} />
                <Bar dataKey="likes" fill="#FFD700" />
                <Bar dataKey="comments" fill="#3B82F6" />
                <Bar dataKey="shares" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {strategy && (
        <Card className="tech-card rounded-none p-5 border-l-4 border-cyber" data-testid="strategy-card">
          <div className="text-[10px] font-mono text-cyber tracking-widest mb-2">// NEXT MOVE</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-mono text-white/40 mb-2">PATTERNS THAT WORK</div>
              <ul className="space-y-1 text-sm text-white/80">{strategy.patterns?.map((p, i) => <li key={i}>+ {p}</li>)}</ul>
            </div>
            <div>
              <div className="text-xs font-mono text-white/40 mb-2">GAPS</div>
              <ul className="space-y-1 text-sm text-white/80">{strategy.gaps?.map((p, i) => <li key={i}>− {p}</li>)}</ul>
            </div>
          </div>
          {strategy.voice_adjustment && (
            <div className="mt-4 p-3 bg-white/[0.03] border border-white/10">
              <div className="text-[10px] font-mono text-white/40 tracking-widest">VOICE ADJUSTMENT</div>
              <p className="text-sm text-white/85 mt-1">{strategy.voice_adjustment}</p>
            </div>
          )}
          {strategy.next_topics?.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-mono text-white/40 mb-2">NEXT 3 TOPICS</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {strategy.next_topics.map((t, i) => (
                  <div key={i} className="hairline p-3">
                    <div className="font-display font-bold">{t.title}</div>
                    <div className="text-xs text-white/60 mt-1">{t.angle}</div>
                    <div className="text-[11px] text-white/40 mt-2 font-mono">WHY NOW: {t.why_now}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="space-y-3">
        <div className="text-[10px] font-mono text-white/40 tracking-widest">// POST BY POST</div>
        {loading && <div className="text-white/40 font-mono">Loading…</div>}
        {!loading && posts.length === 0 && (
          <div className="tech-card rounded-none p-10 text-center text-white/40 font-mono border border-dashed border-white/10">
            No posts yet.
          </div>
        )}
        {posts.map((p) => (
          <Card key={p.id} className="tech-card rounded-none p-4" data-testid={`insight-${p.id}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <Badge variant="outline" className="rounded-none font-mono text-[10px] border-white/15">{p.status?.toUpperCase()}</Badge>
                <div className="font-display font-bold text-lg mt-1">{p.hook}</div>
                <div className="text-xs text-white/50 mt-1 line-clamp-2">{p.body}</div>
                {p.metrics && (
                  <div className="mt-3 flex gap-6 font-mono text-sm">
                    <span><span className="text-white/40 text-xs">L</span> <span className="text-cyber">{p.metrics.likes}</span></span>
                    <span><span className="text-white/40 text-xs">C</span> <span className="text-cyber">{p.metrics.comments}</span></span>
                    <span><span className="text-white/40 text-xs">S</span> <span className="text-cyber">{p.metrics.shares}</span></span>
                    <span><span className="text-white/40 text-xs">I</span> <span className="text-cyber">{p.metrics.impressions}</span></span>
                    <span className="text-white/30 text-[10px]">via {p.metrics.source}</span>
                  </div>
                )}
                {p.learnings && (
                  <div className="mt-2 text-xs text-white/60 italic">{p.learnings}</div>
                )}
              </div>
              <div className="flex flex-col gap-2 items-end shrink-0">
                <Input value={urls[p.id] || ""} onChange={(e) => setUrls({ ...urls, [p.id]: e.target.value })} placeholder="LinkedIn post URL (optional)" className="rounded-none bg-transparent w-64 text-xs" data-testid={`url-${p.id}`} />
                <Button size="sm" onClick={() => refresh(p.id)} disabled={running[p.id]} className="rounded-none bg-cyber text-black hover:bg-yellow-400 font-semibold" data-testid={`refresh-${p.id}`}>
                  {running[p.id] ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <RefreshCcw size={12} className="mr-1.5" />}
                  Refresh
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
