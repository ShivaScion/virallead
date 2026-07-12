import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, timeout: 120000 });

// Profile
export const getProfile = () => api.get("/profile").then((r) => r.data);
export const saveProfile = (data) => api.post("/profile", data).then((r) => r.data);

// Leads
export const listLeads = (params) => api.get("/leads", { params }).then((r) => r.data);
export const discoverLeads = (criteria) => api.post("/leads/discover", criteria).then((r) => r.data);
export const updateLead = (id, patch) => api.patch(`/leads/${id}`, patch).then((r) => r.data);
export const deleteLead = (id) => api.delete(`/leads/${id}`).then((r) => r.data);
export const exportLeadsCsv = () => api.get("/leads/export.csv").then((r) => r.data);

// Research
export const listResearch = () => api.get("/research").then((r) => r.data);
export const generateResearch = (payload) => api.post("/research/generate", payload).then((r) => r.data);
export const deleteResearch = (id) => api.delete(`/research/${id}`).then((r) => r.data);

// Posts
export const listPosts = (params) => api.get("/posts", { params }).then((r) => r.data);
export const generatePost = (payload) => api.post("/posts/generate", payload).then((r) => r.data);
export const updatePost = (id, patch) => api.patch(`/posts/${id}`, patch).then((r) => r.data);
export const deletePost = (id) => api.delete(`/posts/${id}`).then((r) => r.data);
export const schedulePost = (id, payload) => api.post(`/posts/${id}/schedule`, payload).then((r) => r.data);
export const refreshMetrics = (id, post_url) =>
  api.post(`/posts/${id}/metrics/refresh`, { post_id: id, post_url }).then((r) => r.data);
export const strategyNext = () => api.post("/posts/strategy").then((r) => r.data);
export const generatePostImage = (id, prompt) =>
  api.post(`/posts/${id}/generate-image`, { prompt }).then((r) => r.data);

// Buffer
export const bufferChannels = () => api.get("/buffer/channels").then((r) => r.data);
export const bufferSyncPast = () => api.post("/buffer/sync-past-posts", {}).then((r) => r.data);
export const bufferAnalytics = (days = 30) => api.post("/buffer/analytics", { days }).then((r) => r.data);

// Voice Q&A
export const listVoice = () => api.get("/voice-questions").then((r) => r.data);
export const generateVoice = (n = 4) => api.post("/voice-questions/generate", { n }).then((r) => r.data);
export const answerVoice = (id, answer) =>
  api.post(`/voice-questions/${id}/answer`, { answer }).then((r) => r.data);

// Emails
export const listEmails = () => api.get("/emails").then((r) => r.data);
export const generateEmail = (payload) => api.post("/emails/generate", payload).then((r) => r.data);
export const updateEmail = (id, patch) => api.patch(`/emails/${id}`, patch).then((r) => r.data);
export const markEmailSent = (id) => api.post(`/emails/${id}/mark-sent`).then((r) => r.data);
export const deleteEmail = (id) => api.delete(`/emails/${id}`).then((r) => r.data);

// Dashboard
export const dashboardSummary = () => api.get("/dashboard/summary").then((r) => r.data);
