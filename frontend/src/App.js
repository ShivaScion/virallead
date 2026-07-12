import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Onboarding from "@/pages/Onboarding";
import Leads from "@/pages/Leads";
import Research from "@/pages/Research";
import Posts from "@/pages/Posts";
import Insights from "@/pages/Insights";
import Emails from "@/pages/Emails";
import Voice from "@/pages/Voice";
import Settings from "@/pages/Settings";
import { Toaster } from "sonner";

function App() {
  return (
    <div className="App min-h-screen bg-background text-foreground grain">
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/research" element={<Research />} />
            <Route path="/posts" element={<Posts />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/emails" element={<Emails />} />
            <Route path="/voice" element={<Voice />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster theme="dark" position="top-right" richColors closeButton />
    </div>
  );
}

export default App;
