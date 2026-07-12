import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { listVoice, generateVoice, answerVoice } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

export default function Voice() {
  const [qs, setQs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [drafts, setDrafts] = useState({});

  const load = () => {
    setLoading(true);
    listVoice().then(setQs).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const generate = async () => {
    setRunning(true);
    try {
      await generateVoice(4);
      toast.success("New voice questions ready.");
      load();
    } catch (e) {
      toast.error("Generation failed");
    } finally {
      setRunning(false);
    }
  };

  const submit = async (id) => {
    const a = drafts[id];
    if (!a?.trim()) return;
    await answerVoice(id, a);
    toast.success("Saved. Future posts will lean on this.");
    setDrafts((d) => ({ ...d, [id]: "" }));
    load();
  };

  return (
    <div className="space-y-6" data-testid="voice-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] font-mono text-cyber tracking-widest">// TONE ANCHOR</div>
          <h2 className="font-display font-extrabold text-3xl">Your voice, answered</h2>
          <p className="text-white/60 text-sm mt-1">The engine interviews you. Answers become tone anchors for every post it writes.</p>
        </div>
        <Button onClick={generate} disabled={running} className="bg-cyber text-black hover:bg-yellow-400 rounded-none font-semibold" data-testid="btn-generate-voice">
          {running ? <><Loader2 size={14} className="mr-2 animate-spin" /> Thinking…</> : <><Sparkles size={14} className="mr-2" /> Ask me 4 new questions</>}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading && <div className="text-white/40 font-mono">Loading…</div>}
        {!loading && qs.length === 0 && (
          <div className="col-span-2 tech-card rounded-none p-10 text-center text-white/40 font-mono border border-dashed border-white/10">
            No questions yet. Hit "Ask me 4 new questions" above.
          </div>
        )}
        {qs.map((q, i) => (
          <Card key={q.id} className="tech-card rounded-none p-5 space-y-3 reveal" style={{ animationDelay: `${i * 60}ms` }} data-testid={`voice-${q.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="text-[10px] font-mono text-cyber tracking-widest">Q{String(i + 1).padStart(2, "0")}</div>
              {q.answered && <Badge variant="outline" className="rounded-none border-emerald-400/40 text-emerald-400 font-mono text-[10px]">ANSWERED</Badge>}
            </div>
            <div className="font-display font-bold text-lg leading-snug">{q.question}</div>
            {q.context && <p className="text-xs text-white/50 italic">{q.context}</p>}

            {q.answered ? (
              <div className="p-3 bg-white/[0.03] border-l-2 border-cyber">
                <div className="text-[10px] font-mono text-white/40 tracking-widest">YOUR ANSWER</div>
                <p className="text-sm text-white/85 mt-1 whitespace-pre-wrap">{q.answer}</p>
              </div>
            ) : (
              <>
                <Textarea rows={4} value={drafts[q.id] || ""} onChange={(e) => setDrafts({ ...drafts, [q.id]: e.target.value })} placeholder="Type raw. This becomes your tone." className="rounded-none bg-transparent" data-testid={`voice-answer-${q.id}`} />
                <Button onClick={() => submit(q.id)} className="bg-cyber text-black hover:bg-yellow-400 rounded-none font-semibold w-full" data-testid={`voice-save-${q.id}`}>
                  Save answer
                </Button>
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
