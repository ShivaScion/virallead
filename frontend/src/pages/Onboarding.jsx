import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getProfile, saveProfile } from "@/lib/api";
import { toast } from "sonner";
import { Save } from "lucide-react";

const DEFAULT = {
  name: "",
  positioning: "Consumer behavior based brand strategy and marketing executive",
  niche: "",
  target_audience: "",
  painpoints_solved: "",
  tone_samples: "",
  signature_hooks: "",
  past_posts: "",
  scheduler_provider: "manual",
  buffer_api_key: "",
  publer_api_key: "",
  from_email: "",
  leads_per_cycle: 20,
  cycle_hours: 6,
};

export default function Onboarding() {
  const [form, setForm] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfile()
      .then((p) => setForm({ ...DEFAULT, ...p }))
      .finally(() => setLoading(false));
  }, []);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await saveProfile(form);
      toast.success("Positioning saved. The AI will write in your voice from now on.");
    } catch (e) {
      toast.error("Save failed: " + (e?.message || "unknown"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-white/50 font-mono">Loading positioning…</div>;

  return (
    <div className="space-y-8" data-testid="onboarding-page">
      <div>
        <div className="text-[10px] font-mono text-cyber tracking-widest">// TRAIN THE ENGINE</div>
        <h2 className="font-display font-extrabold text-3xl mt-1">Positioning &amp; voice</h2>
        <p className="text-white/60 text-sm mt-2 max-w-2xl">
          Everything the engine writes — posts, emails, lead reasoning — starts from these fields. The more specific, the sharper the output.
        </p>
      </div>

      <Card className="tech-card rounded-none p-6 space-y-6" data-testid="section-identity">
        <div className="text-[10px] font-mono text-white/40 tracking-widest">IDENTITY</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label className="text-xs text-white/60">Your name</Label>
            <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Alex Doe" className="rounded-none bg-transparent mt-1" data-testid="input-name" />
          </div>
          <div>
            <Label className="text-xs text-white/60">Niche / specialty</Label>
            <Input value={form.niche} onChange={(e) => update("niche", e.target.value)} placeholder="e.g. Consumer-behavior led brand strategy" className="rounded-none bg-transparent mt-1" data-testid="input-niche" />
          </div>
        </div>
        <div>
          <Label className="text-xs text-white/60">Positioning statement</Label>
          <Textarea value={form.positioning} onChange={(e) => update("positioning", e.target.value)} rows={2} className="rounded-none bg-transparent mt-1" data-testid="input-positioning" />
        </div>
      </Card>

      <Card className="tech-card rounded-none p-6 space-y-6" data-testid="section-audience">
        <div className="text-[10px] font-mono text-white/40 tracking-widest">AUDIENCE &amp; PAIN</div>
        <div>
          <Label className="text-xs text-white/60">Target audience</Label>
          <Textarea rows={2} value={form.target_audience} onChange={(e) => update("target_audience", e.target.value)} placeholder="e.g. Founders of 5-50 person D2C brands stuck at ₹1-5cr MRR" className="rounded-none bg-transparent mt-1" data-testid="input-audience" />
        </div>
        <div>
          <Label className="text-xs text-white/60">Painpoints you solve</Label>
          <Textarea rows={3} value={form.painpoints_solved} onChange={(e) => update("painpoints_solved", e.target.value)} placeholder="List concrete painpoints, one per line" className="rounded-none bg-transparent mt-1" data-testid="input-painpoints" />
        </div>
      </Card>

      <Card className="tech-card rounded-none p-6 space-y-6" data-testid="section-voice">
        <div className="text-[10px] font-mono text-white/40 tracking-widest">VOICE</div>
        <div>
          <Label className="text-xs text-white/60">Signature hooks (openers you use)</Label>
          <Textarea rows={3} value={form.signature_hooks} onChange={(e) => update("signature_hooks", e.target.value)} placeholder='e.g. "Nobody buys because your product is great. They buy because..."' className="rounded-none bg-transparent mt-1" data-testid="input-hooks" />
        </div>
        <div>
          <Label className="text-xs text-white/60">Past posts (paste 2-3 you're proud of)</Label>
          <Textarea rows={6} value={form.past_posts} onChange={(e) => update("past_posts", e.target.value)} className="rounded-none bg-transparent mt-1" data-testid="input-past-posts" />
        </div>
        <div>
          <Label className="text-xs text-white/60">Tone samples / do-not-say list</Label>
          <Textarea rows={3} value={form.tone_samples} onChange={(e) => update("tone_samples", e.target.value)} placeholder="Words/phrases to avoid, cadence notes, examples" className="rounded-none bg-transparent mt-1" data-testid="input-tone" />
        </div>
      </Card>

      <Card className="tech-card rounded-none p-6 space-y-6" data-testid="section-automation">
        <div className="text-[10px] font-mono text-white/40 tracking-widest">AUTOMATION CADENCE</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <Label className="text-xs text-white/60">Leads per cycle</Label>
            <Input type="number" value={form.leads_per_cycle} onChange={(e) => update("leads_per_cycle", parseInt(e.target.value || 0))} className="rounded-none bg-transparent mt-1 font-mono" data-testid="input-leads-per-cycle" />
          </div>
          <div>
            <Label className="text-xs text-white/60">Cycle interval (hours)</Label>
            <Input type="number" value={form.cycle_hours} onChange={(e) => update("cycle_hours", parseInt(e.target.value || 0))} className="rounded-none bg-transparent mt-1 font-mono" data-testid="input-cycle-hours" />
          </div>
          <div>
            <Label className="text-xs text-white/60">Your sender email</Label>
            <Input value={form.from_email} onChange={(e) => update("from_email", e.target.value)} placeholder="you@domain.com" className="rounded-none bg-transparent mt-1 font-mono" data-testid="input-from-email" />
          </div>
        </div>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-cyber text-black hover:bg-yellow-400 rounded-none font-semibold" data-testid="btn-save-profile">
          <Save size={14} className="mr-2" /> {saving ? "Saving…" : "Save positioning"}
        </Button>
      </div>
    </div>
  );
}
