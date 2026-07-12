import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listLeads, discoverLeads, updateLead, deleteLead, exportLeadsCsv, generateEmail } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Plus, ExternalLink, Trash2, Mail, Download, Linkedin } from "lucide-react";

const SOURCE_OPTIONS = [
  { id: "company_sites", label: "Company /about pages" },
  { id: "reddit", label: "Reddit" },
  { id: "hn", label: "Hacker News" },
  { id: "indiehackers", label: "IndieHackers" },
  { id: "whois", label: "WHOIS records" },
  { id: "podcast_guests", label: "Podcast guest lists" },
  { id: "product_launches", label: "Product launch pages" },
];

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const [criteria, setCriteria] = useState({
    ideal_customer: "",
    industry: "",
    company_size: "",
    geography: "",
    seniority: "",
    keywords: "",
    sources: ["company_sites", "reddit", "hn", "indiehackers", "whois"],
  });

  const load = () => {
    setLoading(true);
    listLeads()
      .then(setLeads)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggleSource = (id) => {
    setCriteria((c) => ({
      ...c,
      sources: c.sources.includes(id) ? c.sources.filter((s) => s !== id) : [...c.sources, id],
    }));
  };

  const discover = async () => {
    if (!criteria.ideal_customer.trim()) {
      toast.error("Describe your ideal customer first.");
      return;
    }
    setRunning(true);
    try {
      const res = await discoverLeads(criteria);
      toast.success(`${res.count} leads discovered.`);
      setOpen(false);
      load();
    } catch (e) {
      toast.error("Discovery failed: " + (e?.response?.data?.detail || e.message));
    } finally {
      setRunning(false);
    }
  };

  const setStatus = async (id, status) => {
    await updateLead(id, { status });
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status } : l)));
  };

  const remove = async (id) => {
    await deleteLead(id);
    setLeads((ls) => ls.filter((l) => l.id !== id));
  };

  const draftEmail = async (id) => {
    toast.loading("Drafting email…", { id: `e-${id}` });
    try {
      await generateEmail({ lead_id: id });
      toast.success("Draft ready in Emails →", { id: `e-${id}` });
    } catch (e) {
      toast.error("Draft failed", { id: `e-${id}` });
    }
  };

  const exportCsv = async () => {
    const { csv } = await exportLeadsCsv();
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leads-${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6" data-testid="leads-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] font-mono text-cyber tracking-widest">// LEAD ENGINE</div>
          <h2 className="font-display font-extrabold text-3xl">Lead pipeline</h2>
          <p className="text-white/60 text-sm mt-1">
            Public-source scraping only. WHOIS · company /team pages · Reddit · HN · IndieHackers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} className="rounded-none border-white/15 hover:border-cyber hover:text-cyber" data-testid="btn-export-csv">
            <Download size={14} className="mr-2" /> CSV
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-cyber text-black hover:bg-yellow-400 rounded-none font-semibold" data-testid="btn-discover-open">
                <Plus size={14} className="mr-2" /> New discovery run
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl bg-[#0a0a0a] border-white/10 rounded-none" data-testid="dialog-discover">
              <DialogHeader>
                <DialogTitle className="font-display font-extrabold text-xl">Configure discovery run</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-white/60">Ideal customer profile *</Label>
                  <Textarea rows={3} value={criteria.ideal_customer} onChange={(e) => setCriteria({ ...criteria, ideal_customer: e.target.value })} placeholder="e.g. Founders of D2C brands doing ₹50L-5cr MRR, obsessed with retention" className="rounded-none bg-transparent mt-1" data-testid="input-icp" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-white/60">Industry</Label>
                    <Input value={criteria.industry} onChange={(e) => setCriteria({ ...criteria, industry: e.target.value })} className="rounded-none bg-transparent mt-1" data-testid="input-industry" />
                  </div>
                  <div>
                    <Label className="text-xs text-white/60">Company size</Label>
                    <Input value={criteria.company_size} onChange={(e) => setCriteria({ ...criteria, company_size: e.target.value })} className="rounded-none bg-transparent mt-1" data-testid="input-size" />
                  </div>
                  <div>
                    <Label className="text-xs text-white/60">Geography</Label>
                    <Input value={criteria.geography} onChange={(e) => setCriteria({ ...criteria, geography: e.target.value })} className="rounded-none bg-transparent mt-1" data-testid="input-geo" />
                  </div>
                  <div>
                    <Label className="text-xs text-white/60">Seniority</Label>
                    <Input value={criteria.seniority} onChange={(e) => setCriteria({ ...criteria, seniority: e.target.value })} placeholder="Founder / CMO / Head of" className="rounded-none bg-transparent mt-1" data-testid="input-seniority" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-white/60">Keywords</Label>
                  <Input value={criteria.keywords} onChange={(e) => setCriteria({ ...criteria, keywords: e.target.value })} className="rounded-none bg-transparent mt-1" data-testid="input-keywords" />
                </div>
                <div>
                  <Label className="text-xs text-white/60 mb-2 block">Public sources</Label>
                  <div className="flex flex-wrap gap-2">
                    {SOURCE_OPTIONS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => toggleSource(s.id)}
                        className={`px-3 py-1.5 text-xs rounded-none border transition-colors ${criteria.sources.includes(s.id) ? "bg-cyber text-black border-cyber" : "border-white/15 text-white/70 hover:border-white/40"}`}
                        data-testid={`source-${s.id}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Button onClick={discover} disabled={running} className="w-full bg-cyber text-black hover:bg-yellow-400 rounded-none font-semibold" data-testid="btn-run-discovery">
                  {running ? <><Loader2 size={14} className="mr-2 animate-spin" />Scraping…</> : "Run discovery"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="tech-card rounded-none overflow-x-auto" data-testid="leads-table-wrap">
        <Table>
          <TableHeader>
            <TableRow className="border-white/8 hover:bg-transparent">
              <TableHead className="text-[10px] font-mono tracking-widest text-white/40">FIT</TableHead>
              <TableHead className="text-[10px] font-mono tracking-widest text-white/40">NAME</TableHead>
              <TableHead className="text-[10px] font-mono tracking-widest text-white/40">ROLE / COMPANY</TableHead>
              <TableHead className="text-[10px] font-mono tracking-widest text-white/40">EMAIL</TableHead>
              <TableHead className="text-[10px] font-mono tracking-widest text-white/40">PAINPOINT</TableHead>
              <TableHead className="text-[10px] font-mono tracking-widest text-white/40">STATUS</TableHead>
              <TableHead className="text-[10px] font-mono tracking-widest text-white/40 text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={7} className="text-center text-white/40 py-8 font-mono">Loading…</TableCell></TableRow>
            )}
            {!loading && leads.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-white/40 py-16 font-mono">No leads yet. Run a discovery.</TableCell></TableRow>
            )}
            {leads.map((l) => (
              <TableRow key={l.id} className="border-white/8 hover:bg-white/[0.02]" data-testid={`lead-row-${l.id}`}>
                <TableCell className="font-mono text-cyber">{l.fit_score ?? "—"}</TableCell>
                <TableCell>
                  <div className="text-white font-medium">{l.name}</div>
                  <div className="text-[11px] text-white/40 font-mono">{l.location}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-white/90">{l.role}</div>
                  <div className="text-xs text-white/50">
                    {l.company_url ? (
                      <a href={l.company_url.startsWith("http") ? l.company_url : `https://${l.company_url}`} target="_blank" rel="noreferrer" className="hover:text-cyber inline-flex items-center gap-1">
                        {l.company} <ExternalLink size={10} />
                      </a>
                    ) : l.company}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs text-white/90 truncate max-w-[200px]">{l.email || "—"}</div>
                  {l.email_confidence && (
                    <Badge variant="outline" className={`rounded-none mt-1 font-mono text-[9px] border-white/15 ${l.email_confidence === "verified" ? "text-emerald-400" : "text-yellow-500"}`}>
                      {l.email_confidence?.toUpperCase()}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-[280px]">
                  <div className="text-xs text-white/70 line-clamp-2">{l.painpoint}</div>
                </TableCell>
                <TableCell>
                  <Select value={l.status} onValueChange={(v) => setStatus(l.id, v)}>
                    <SelectTrigger className="h-8 w-[110px] rounded-none bg-transparent border-white/15 text-xs" data-testid={`status-${l.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0a0a0a] border-white/10 rounded-none">
                      {["new", "contacted", "qualified", "archived"].map((s) => (
                        <SelectItem key={s} value={s} className="font-mono text-xs">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {l.linkedin_url && (
                      <a href={l.linkedin_url} target="_blank" rel="noreferrer" className="p-1.5 hover:text-cyber text-white/50" data-testid={`li-${l.id}`}>
                        <Linkedin size={14} />
                      </a>
                    )}
                    <button className="p-1.5 hover:text-cyber text-white/50" onClick={() => draftEmail(l.id)} data-testid={`email-${l.id}`}>
                      <Mail size={14} />
                    </button>
                    <button className="p-1.5 hover:text-destructive text-white/50" onClick={() => remove(l.id)} data-testid={`del-${l.id}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
