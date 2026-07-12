import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listEmails, updateEmail, deleteEmail, markEmailSent, getProfile } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, Trash2, Send, ExternalLink, Copy } from "lucide-react";

const gmailComposeUrl = ({ to, subject, body, from }) => {
  const params = new URLSearchParams();
  if (to) params.set("to", to);
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  if (from) params.set("authuser", from);
  return `https://mail.google.com/mail/?view=cm&fs=1&${params.toString()}`;
};

const mailtoUrl = ({ to, subject, body }) => {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  return `mailto:${to || ""}?${params.toString()}`;
};

export default function Emails() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({});
  const [filter, setFilter] = useState("all");

  const load = () => {
    setLoading(true);
    Promise.all([listEmails(), getProfile()])
      .then(([e, p]) => {
        setEmails(e);
        setProfile(p || {});
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const patch = async (id, data) => {
    const updated = await updateEmail(id, data);
    setEmails((es) => es.map((e) => (e.id === id ? updated : e)));
  };

  const approve = (id) => patch(id, { status: "approved" });

  const openInGmail = (e) => {
    const url = gmailComposeUrl({ to: e.lead_email, subject: e.subject, body: e.body, from: profile.from_email });
    window.open(url, "_blank");
    markEmailSent(e.id).then(load);
    toast.success("Opened Gmail compose. Hit send when ready — I'll mark it sent.");
  };

  const openMailto = (e) => {
    window.location.href = mailtoUrl({ to: e.lead_email, subject: e.subject, body: e.body });
  };

  const copyBody = (e) => {
    navigator.clipboard.writeText(`Subject: ${e.subject}\n\n${e.body}`);
    toast.success("Email copied.");
  };

  const filtered = filter === "all" ? emails : emails.filter((e) => e.status === filter);

  return (
    <div className="space-y-6" data-testid="emails-page">
      <div>
        <div className="text-[10px] font-mono text-cyber tracking-widest">// COLD OUTREACH</div>
        <h2 className="font-display font-extrabold text-3xl">Email queue</h2>
        <p className="text-white/60 text-sm mt-1">Drafts generated per lead. Approve, then send via one-click Gmail compose (no OAuth).</p>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="bg-transparent border-b border-white/8 rounded-none p-0 h-auto w-full justify-start" data-testid="emails-tabs">
          {["all", "draft", "approved", "sent"].map((f) => (
            <TabsTrigger key={f} value={f} className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-cyber data-[state=active]:border-b-2 data-[state=active]:border-cyber font-mono text-xs px-4 py-2 border-b-2 border-transparent">
              {f.toUpperCase()}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={filter} className="mt-6 space-y-3">
          {loading && <div className="text-white/40 font-mono">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="tech-card rounded-none p-10 text-center text-white/40 font-mono border border-dashed border-white/10">
              No emails. Draft one from the Leads page.
            </div>
          )}
          {filtered.map((e, i) => (
            <Card key={e.id} className="tech-card rounded-none p-5 reveal" style={{ animationDelay: `${i * 30}ms` }} data-testid={`email-${e.id}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <Badge variant="outline" className="rounded-none font-mono text-[10px] border-white/15">{e.status?.toUpperCase()}</Badge>
                  <div className="mt-1.5">
                    <div className="text-xs text-white/50 font-mono">TO</div>
                    <div className="text-sm text-white/90">{e.lead_name} <span className="text-white/40 font-mono text-xs">· {e.lead_email || "(no email on file)"}</span></div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="p-1.5 hover:text-cyber text-white/50" onClick={() => copyBody(e)} data-testid={`copy-${e.id}`}><Copy size={14} /></button>
                  <button className="p-1.5 hover:text-destructive text-white/50" onClick={async () => { await deleteEmail(e.id); load(); }} data-testid={`del-${e.id}`}><Trash2 size={14} /></button>
                </div>
              </div>

              <div className="mb-3">
                <div className="text-[10px] font-mono text-white/40 tracking-widest">SUBJECT</div>
                <Input value={e.subject} onChange={(ev) => setEmails((es) => es.map((x) => (x.id === e.id ? { ...x, subject: ev.target.value } : x)))} onBlur={(ev) => patch(e.id, { subject: ev.target.value })} className="rounded-none bg-transparent font-display font-bold mt-1" data-testid={`subject-${e.id}`} />
              </div>
              <div>
                <div className="text-[10px] font-mono text-white/40 tracking-widest">BODY</div>
                <Textarea rows={7} value={e.body} onChange={(ev) => setEmails((es) => es.map((x) => (x.id === e.id ? { ...x, body: ev.target.value } : x)))} onBlur={(ev) => patch(e.id, { body: ev.target.value })} className="rounded-none bg-transparent mt-1" data-testid={`body-${e.id}`} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {e.status === "draft" && (
                  <Button size="sm" onClick={() => approve(e.id)} className="bg-emerald-500 hover:bg-emerald-400 text-black rounded-none" data-testid={`approve-${e.id}`}>
                    <CheckCircle2 size={12} className="mr-1.5" /> Approve
                  </Button>
                )}
                <Button size="sm" onClick={() => openInGmail(e)} className="bg-cyber text-black hover:bg-yellow-400 rounded-none font-semibold" data-testid={`gmail-${e.id}`}>
                  <ExternalLink size={12} className="mr-1.5" /> Open in Gmail
                </Button>
                <Button size="sm" variant="outline" onClick={() => openMailto(e)} className="rounded-none border-white/15" data-testid={`mailto-${e.id}`}>
                  <Send size={12} className="mr-1.5" /> Mailto
                </Button>
                {e.status !== "sent" && (
                  <Button size="sm" variant="ghost" onClick={() => markEmailSent(e.id).then(load)} className="rounded-none text-white/60 hover:text-cyber" data-testid={`sent-${e.id}`}>
                    Mark as sent
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
