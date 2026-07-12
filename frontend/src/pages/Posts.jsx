import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listPosts, updatePost, deletePost, schedulePost, generatePost, generatePostImage } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Trash2, CalendarClock, PenSquare, Copy, Loader2, Sparkles, ImageIcon, Download } from "lucide-react";

const StatusPill = ({ status }) => {
  const map = {
    draft: "text-yellow-500 border-yellow-500/40",
    approved: "text-emerald-400 border-emerald-400/40",
    scheduled: "text-secondary border-secondary/40",
    published: "text-cyber border-cyber/40",
    rejected: "text-white/40 border-white/15",
  };
  return <Badge variant="outline" className={`rounded-none font-mono text-[10px] ${map[status] || ""}`}>{status?.toUpperCase()}</Badge>;
};

export default function Posts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genForm, setGenForm] = useState({ topic_title: "", angle: "", extra_notes: "" });
  const [generating, setGenerating] = useState(false);
  const [imaging, setImaging] = useState({});

  const load = () => {
    setLoading(true);
    listPosts().then(setPosts).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = filter === "all" ? posts : posts.filter((p) => p.status === filter);

  const patch = async (id, data) => {
    const updated = await updatePost(id, data);
    setPosts((ps) => ps.map((p) => (p.id === id ? updated : p)));
  };

  const approve = (id) => patch(id, { status: "approved" });
  const reject = (id) => patch(id, { status: "rejected" });

  const schedule = async (p) => {
    const dt = window.prompt("Schedule for (ISO datetime, e.g. 2026-03-01T14:30:00Z). Leave blank for +1 hour:", "");
    const scheduled_for = dt || undefined;
    const full_text = `${p.hook}\n\n${p.body}\n\n${(p.hashtags || []).map((h) => `#${h}`).join(" ")}`;
    const res = await schedulePost(p.id, { scheduled_for, full_text });
    toast.success(res.detail || "Scheduled.");
    load();
  };

  const copyToClipboard = (p) => {
    const full = `${p.hook}\n\n${p.body}\n\n${(p.hashtags || []).map((h) => `#${h}`).join(" ")}${p.call_to_action ? `\n\n${p.call_to_action}` : ""}`;
    navigator.clipboard.writeText(full);
    toast.success("Copied. Paste into LinkedIn.");
  };

  const remove = async (id) => {
    await deletePost(id);
    setPosts((ps) => ps.filter((p) => p.id !== id));
  };

  const runGen = async () => {
    if (!genForm.topic_title.trim()) {
      toast.error("Topic title required.");
      return;
    }
    setGenerating(true);
    try {
      await generatePost(genForm);
      toast.success("Draft ready.");
      setGenOpen(false);
      setGenForm({ topic_title: "", angle: "", extra_notes: "" });
      load();
    } catch (e) {
      toast.error("Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const makeImage = async (id) => {
    setImaging((m) => ({ ...m, [id]: true }));
    try {
      const res = await generatePostImage(id);
      setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, image_data: res.image_data } : p)));
      toast.success("Visual generated.");
    } catch (e) {
      toast.error("Image failed: " + (e?.response?.data?.detail || e.message));
    } finally {
      setImaging((m) => ({ ...m, [id]: false }));
    }
  };

  const downloadImage = (p) => {
    if (!p.image_data) return;
    const a = document.createElement("a");
    a.href = p.image_data;
    a.download = `post-${p.id.slice(0, 8)}.png`;
    a.click();
  };

  return (
    <div className="space-y-6" data-testid="posts-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] font-mono text-cyber tracking-widest">// APPROVAL QUEUE</div>
          <h2 className="font-display font-extrabold text-3xl">Post studio</h2>
          <p className="text-white/60 text-sm mt-1">Approve, edit, schedule. Nothing publishes without your green light.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setGenOpen((v) => !v)} className="rounded-none border-white/15 hover:border-cyber hover:text-cyber" data-testid="btn-open-generate">
            <PenSquare size={14} className="mr-2" /> New draft
          </Button>
        </div>
      </div>

      {genOpen && (
        <Card className="tech-card rounded-none p-5 space-y-3" data-testid="generate-panel">
          <div className="text-[10px] font-mono text-cyber tracking-widest">// COMPOSE FROM SCRATCH</div>
          <Input placeholder="Topic title" value={genForm.topic_title} onChange={(e) => setGenForm({ ...genForm, topic_title: e.target.value })} className="rounded-none bg-transparent" data-testid="input-gen-topic" />
          <Input placeholder="Angle (optional)" value={genForm.angle} onChange={(e) => setGenForm({ ...genForm, angle: e.target.value })} className="rounded-none bg-transparent" data-testid="input-gen-angle" />
          <Textarea rows={3} placeholder="Extra notes" value={genForm.extra_notes} onChange={(e) => setGenForm({ ...genForm, extra_notes: e.target.value })} className="rounded-none bg-transparent" data-testid="input-gen-notes" />
          <Button onClick={runGen} disabled={generating} className="bg-cyber text-black hover:bg-yellow-400 rounded-none font-semibold" data-testid="btn-generate-post">
            {generating ? <><Loader2 size={14} className="mr-2 animate-spin" /> Writing…</> : <><Sparkles size={14} className="mr-2" /> Generate draft</>}
          </Button>
        </Card>
      )}

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="bg-transparent border-b border-white/8 rounded-none p-0 h-auto w-full justify-start" data-testid="posts-tabs">
          {["all", "draft", "approved", "scheduled", "published", "rejected"].map((f) => (
            <TabsTrigger key={f} value={f} className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-cyber data-[state=active]:border-b-2 data-[state=active]:border-cyber font-mono text-xs px-4 py-2 border-b-2 border-transparent">
              {f.toUpperCase()}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={filter} className="mt-6 space-y-4">
          {loading && <div className="text-white/40 font-mono">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="tech-card rounded-none p-10 text-center text-white/40 font-mono border border-dashed border-white/10">
              Nothing here yet.
            </div>
          )}
          {filtered.map((p, i) => (
            <Card key={p.id} className="tech-card rounded-none p-5 reveal" style={{ animationDelay: `${i * 40}ms` }} data-testid={`post-${p.id}`}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusPill status={p.status} />
                    <span className="text-[10px] font-mono text-white/40 tracking-widest">{p.topic_title}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button className="p-1.5 hover:text-cyber text-white/50" onClick={() => copyToClipboard(p)} title="Copy" data-testid={`copy-${p.id}`}><Copy size={14} /></button>
                  <button className="p-1.5 hover:text-destructive text-white/50" onClick={() => remove(p.id)} title="Delete" data-testid={`del-post-${p.id}`}><Trash2 size={14} /></button>
                </div>
              </div>

              {editing === p.id ? (
                <div className="space-y-3">
                  <Input value={p.hook} onChange={(e) => patch(p.id, { hook: e.target.value })} className="rounded-none bg-transparent font-display text-lg" data-testid={`edit-hook-${p.id}`} />
                  <Textarea rows={8} value={p.body} onChange={(e) => setPosts((ps) => ps.map((x) => (x.id === p.id ? { ...x, body: e.target.value } : x)))} onBlur={(e) => patch(p.id, { body: e.target.value })} className="rounded-none bg-transparent" data-testid={`edit-body-${p.id}`} />
                  <Input value={(p.hashtags || []).join(", ")} onChange={(e) => patch(p.id, { hashtags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="hashtags, comma separated" className="rounded-none bg-transparent font-mono text-xs" data-testid={`edit-hashtags-${p.id}`} />
                  <Button variant="outline" onClick={() => setEditing(null)} className="rounded-none border-white/15" data-testid={`done-edit-${p.id}`}>Done editing</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr,240px] gap-4">
                  <div>
                    <div className="font-display font-bold text-xl leading-snug mb-2">{p.hook}</div>
                    <div className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{p.body}</div>
                    {p.hashtags?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {p.hashtags.map((h, idx) => <span key={idx} className="text-xs font-mono text-cyber">#{h.replace(/^#/, "")}</span>)}
                      </div>
                    )}
                    {p.call_to_action && <div className="mt-3 text-sm text-white/70 italic">→ {p.call_to_action}</div>}
                  </div>
                  <div className="min-w-0">
                    {p.image_data ? (
                      <div className="relative group">
                        <img src={p.image_data} alt="post visual" className="w-full aspect-square object-cover border border-white/10" data-testid={`img-${p.id}`} />
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/60 flex items-center justify-center gap-2 transition-opacity duration-200">
                          <Button size="sm" onClick={() => downloadImage(p)} className="rounded-none bg-cyber text-black hover:bg-yellow-400 font-semibold" data-testid={`download-img-${p.id}`}>
                            <Download size={12} className="mr-1" /> PNG
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => makeImage(p.id)} disabled={imaging[p.id]} className="rounded-none border-white/40 bg-transparent" data-testid={`regen-img-${p.id}`}>
                            {imaging[p.id] ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => makeImage(p.id)}
                        disabled={imaging[p.id]}
                        className="w-full aspect-square border border-dashed border-white/15 hover:border-cyber flex flex-col items-center justify-center gap-2 text-white/40 hover:text-cyber transition-colors duration-200"
                        data-testid={`make-img-${p.id}`}
                      >
                        {imaging[p.id] ? (
                          <>
                            <Loader2 size={20} className="animate-spin" />
                            <span className="text-[10px] font-mono tracking-widest">GENERATING…</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon size={20} />
                            <span className="text-[10px] font-mono tracking-widest">GENERATE VISUAL</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {p.metrics && (
                <div className="mt-4 grid grid-cols-4 gap-3 border-t border-white/8 pt-3">
                  {["likes", "comments", "shares", "impressions"].map((k) => (
                    <div key={k}>
                      <div className="text-[9px] font-mono text-white/40 tracking-widest">{k.toUpperCase()}</div>
                      <div className="font-mono text-cyber text-lg">{p.metrics[k] ?? 0}</div>
                    </div>
                  ))}
                </div>
              )}
              {p.learnings && (
                <div className="mt-3 p-3 bg-white/[0.03] border-l-2 border-cyber">
                  <div className="text-[10px] font-mono text-cyber tracking-widest">LEARNINGS</div>
                  <p className="text-xs text-white/70 mt-1">{p.learnings}</p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(editing === p.id ? null : p.id)} className="rounded-none border-white/15" data-testid={`edit-${p.id}`}>
                  <PenSquare size={12} className="mr-1.5" /> Edit
                </Button>
                {p.status === "draft" && (
                  <>
                    <Button size="sm" onClick={() => approve(p.id)} className="bg-emerald-500 hover:bg-emerald-400 text-black rounded-none font-semibold" data-testid={`approve-${p.id}`}>
                      <CheckCircle2 size={12} className="mr-1.5" /> Approve &amp; auto-schedule
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reject(p.id)} className="rounded-none border-white/15 hover:text-destructive" data-testid={`reject-${p.id}`}>
                      <XCircle size={12} className="mr-1.5" /> Reject
                    </Button>
                  </>
                )}
                {(p.status === "approved" || p.status === "scheduled") && p.scheduled_for && (
                  <div className="text-[11px] font-mono text-cyber flex items-center gap-1.5" data-testid={`when-${p.id}`}>
                    <CalendarClock size={12} />
                    → live on Buffer: {new Date(p.scheduled_for).toLocaleString()}
                    {p.buffer_post_id && <span className="text-emerald-400">✓</span>}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
