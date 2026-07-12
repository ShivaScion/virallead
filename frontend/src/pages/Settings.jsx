import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getProfile, saveProfile } from "@/lib/api";
import { toast } from "sonner";
import { Save, ExternalLink } from "lucide-react";

export default function Settings() {
  const [form, setForm] = useState({
    scheduler_provider: "manual",
    buffer_api_key: "",
    publer_api_key: "",
    from_email: "",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProfile()
      .then((p) => setForm((f) => ({ ...f, ...p })))
      .finally(() => setLoading(false));
  }, []);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await saveProfile(form);
      toast.success("Settings saved.");
    } catch (e) {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-white/50 font-mono">Loading…</div>;

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <div className="text-[10px] font-mono text-cyber tracking-widest">// CONFIG</div>
        <h2 className="font-display font-extrabold text-3xl">Settings</h2>
      </div>

      <Card className="tech-card rounded-none p-6 space-y-5" data-testid="section-scheduler">
        <div>
          <div className="text-[10px] font-mono text-white/40 tracking-widest">SCHEDULER</div>
          <p className="text-xs text-white/50 mt-1">Pick a free scheduler. Paste the API key once, we won't ask again.</p>
        </div>

        <div>
          <Label className="text-xs text-white/60">Provider</Label>
          <Select value={form.scheduler_provider} onValueChange={(v) => update("scheduler_provider", v)}>
            <SelectTrigger className="rounded-none bg-transparent mt-1 border-white/15" data-testid="select-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a0a] border-white/10 rounded-none">
              <SelectItem value="manual">Manual (copy → paste into LinkedIn)</SelectItem>
              <SelectItem value="buffer">Buffer</SelectItem>
              <SelectItem value="publer">Publer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.scheduler_provider === "buffer" && (
          <div>
            <Label className="text-xs text-white/60">Buffer access token</Label>
            <Input type="password" value={form.buffer_api_key} onChange={(e) => update("buffer_api_key", e.target.value)} className="rounded-none bg-transparent mt-1 font-mono" data-testid="input-buffer" />
            <a href="https://publish.buffer.com/developers/apps" target="_blank" rel="noreferrer" className="text-[11px] text-cyber inline-flex items-center gap-1 mt-1 hover:underline">
              Get a token <ExternalLink size={10} />
            </a>
          </div>
        )}

        {form.scheduler_provider === "publer" && (
          <div>
            <Label className="text-xs text-white/60">Publer API key</Label>
            <Input type="password" value={form.publer_api_key} onChange={(e) => update("publer_api_key", e.target.value)} className="rounded-none bg-transparent mt-1 font-mono" data-testid="input-publer" />
            <a href="https://app.publer.io/settings/integrations" target="_blank" rel="noreferrer" className="text-[11px] text-cyber inline-flex items-center gap-1 mt-1 hover:underline">
              Grab your Publer API key <ExternalLink size={10} />
            </a>
          </div>
        )}
      </Card>

      <Card className="tech-card rounded-none p-6 space-y-5" data-testid="section-email">
        <div>
          <div className="text-[10px] font-mono text-white/40 tracking-widest">EMAIL SENDER</div>
          <p className="text-xs text-white/50 mt-1">We build one-click Gmail-compose links. No OAuth needed.</p>
        </div>
        <div>
          <Label className="text-xs text-white/60">Your Gmail address</Label>
          <Input value={form.from_email || ""} onChange={(e) => update("from_email", e.target.value)} placeholder="you@gmail.com" className="rounded-none bg-transparent mt-1 font-mono" data-testid="input-email" />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-cyber text-black hover:bg-yellow-400 rounded-none font-semibold" data-testid="btn-save-settings">
          <Save size={14} className="mr-2" /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
