import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listResearch, generateResearch, deleteResearch, generatePost } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Sparkles, PenSquare, Trash2 } from "lucide-react";

export default function Research() {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [focus, setFocus] = useState("");

  const load = () => {
    setLoading(true);
    listResearch().then(setTopics).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const runResearch = async () => {
    setRunning(true);
    try {
      const res = await generateResearch({ focus, n: 6 });
      toast.success(`${res.count} viral candidates surfaced.`);
      load();
    } catch (e) {
      toast.error("Research failed: " + (e?.response?.data?.detail || e.message));
    } finally {
      setRunning(false);
    }
  };

  const draftPost = async (t) => {
    toast.loading("Drafting post…", { id: `p-${t.id}` });
    try {
      await generatePost({ topic_id: t.id });
      toast.success("Draft ready in Posts →", { id: `p-${t.id}` });
    } catch (e) {
      toast.error("Draft failed", { id: `p-${t.id}` });
    }
  };

  return (
    <div className="space-y-6" data-testid="research-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] font-mono text-cyber tracking-widest">// VIRAL RADAR · AUTONOMOUS</div>
          <h2 className="font-display font-extrabold text-3xl">Market research</h2>
          <p className="text-white/60 text-sm mt-1">Auto-refreshed every 3 hours. New topics appear here without you clicking anything.</p>
        </div>
      </div>

      <Card className="tech-card rounded-none p-5" data-testid="research-runner">
        <div className="text-[10px] font-mono text-white/40 tracking-widest">MANUAL BOOST (OPTIONAL)</div>
        <div className="flex flex-col md:flex-row gap-3 mt-3">
          <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Optional focus for the next auto-cycle: e.g. 'retention hacks for D2C in India'" className="rounded-none bg-transparent" data-testid="input-focus" />
          <Button onClick={runResearch} disabled={running} variant="outline" className="rounded-none border-white/15 hover:border-cyber hover:text-cyber" data-testid="btn-run-research">
            {running ? <><Loader2 size={14} className="mr-2 animate-spin" /> Running…</> : <><Sparkles size={14} className="mr-2" /> Force run now</>}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading && <div className="text-white/40 font-mono">Loading…</div>}
        {!loading && topics.length === 0 && (
          <div className="col-span-2 tech-card rounded-none p-10 text-center text-white/40 font-mono border border-dashed border-white/10">
            No topics yet. Pull fresh signals.
          </div>
        )}
        {topics.map((t, i) => (
          <Card key={t.id} className="tech-card rounded-none p-5 space-y-3 reveal" style={{ animationDelay: `${i * 60}ms` }} data-testid={`topic-${t.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-mono text-white/40 tracking-widest">TOPIC</div>
                <h3 className="font-display font-bold text-lg leading-tight mt-0.5">{t.title}</h3>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-mono text-white/40">VIRALITY</div>
                <div className={`font-mono text-2xl font-extrabold ${t.virality_score >= 75 ? "text-cyber" : t.virality_score >= 50 ? "text-white" : "text-white/50"}`}>
                  {t.virality_score}
                </div>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-white/40 tracking-widest">ANGLE</div>
              <p className="text-sm text-white/80 mt-0.5">{t.angle}</p>
            </div>
            <div>
              <div className="text-[10px] font-mono text-white/40 tracking-widest">WHY NOW</div>
              <p className="text-sm text-white/70 mt-0.5">{t.trend_reason}</p>
            </div>
            {t.supporting_signals?.length > 0 && (
              <div>
                <div className="text-[10px] font-mono text-white/40 tracking-widest mb-1">SIGNALS</div>
                <div className="flex flex-wrap gap-1.5">
                  {t.supporting_signals.map((s, idx) => (
                    <Badge key={idx} variant="outline" className="rounded-none border-white/15 font-mono text-[10px] text-white/70">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="p-3 bg-white/[0.03] border border-cyber/30">
              <div className="text-[10px] font-mono text-cyber tracking-widest">SUGGESTED HOOK</div>
              <p className="text-sm text-white/90 mt-1 italic">"{t.suggested_hook}"</p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={() => draftPost(t)} className="bg-cyber text-black hover:bg-yellow-400 rounded-none font-semibold flex-1" data-testid={`draft-${t.id}`}>
                <PenSquare size={14} className="mr-2" /> Draft post
              </Button>
              <Button variant="ghost" onClick={async () => { await deleteResearch(t.id); load(); }} className="rounded-none hover:text-destructive" data-testid={`del-topic-${t.id}`}>
                <Trash2 size={14} />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
