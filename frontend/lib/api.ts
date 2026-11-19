import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 300_000,
});

// ─── Access code (private demo gate) ─────────────────────────────────────────
const ACCESS_KEY = 'clip-factory:access-code';

export function getAccessCode(): string {
  try { return localStorage.getItem(ACCESS_KEY) || ''; } catch { return ''; }
}
export function setAccessCode(code: string) {
  try { localStorage.setItem(ACCESS_KEY, code); } catch {}
}

// Attach the stored access code to every API request.
api.interceptors.request.use(cfg => {
  const code = getAccessCode();
  if (code) cfg.headers['x-access-code'] = code;
  return cfg;
});

export async function getConfig(): Promise<{ accessRequired: boolean; valid: boolean }> {
  const res = await api.get<{ accessRequired: boolean; valid: boolean }>('/config');
  return res.data;
}

export async function uploadFile(file: File, onProgress?: (pct: number) => void) {
  const form = new FormData();
  form.append('file', file);
  const res = await api.post<{ jobId: string }>('/upload/file', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return res.data.jobId;
}

export async function uploadYouTube(url: string) {
  const res = await api.post<{ jobId: string }>('/upload/youtube', { url });
  return res.data.jobId;
}

export async function getJob(jobId: string) {
  const res = await api.get<Job>(`/jobs/${jobId}`);
  return res.data;
}

export async function generateClips(
  jobId: string,
  selectedMoments: string[],
  momentOverrides?: Record<string, MomentOverride>,
  layout?: LayoutOptions
) {
  await api.post(`/jobs/${jobId}/generate`, { selectedMoments, momentOverrides, layout });
}

export async function cancelJob(jobId: string) {
  await api.post(`/jobs/${jobId}/cancel`);
}

export async function joinWaitlist(email: string, plan?: string) {
  await api.post('/waitlist', { email, plan });
}

export async function refindMoments(jobId: string, guidance?: string) {
  const res = await api.post<{ moments: Moment[] }>(`/jobs/${jobId}/refind`, { guidance });
  return res.data.moments;
}

export function getDownloadUrl(jobId: string) {
  return `${API_URL}/api/jobs/${jobId}/download`;
}

export function getClipUrl(jobId: string, filename: string) {
  return `${API_URL}/api/jobs/${jobId}/clips/${encodeURIComponent(filename)}`;
}

// ─── Saved Clips (localStorage) ───────────────────────────────────────────────

const SAVED_CLIPS_KEY = 'clip-factory:saved-clips';

export function getSavedClips(): SavedClip[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_CLIPS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveClip(entry: SavedClip) {
  const existing = getSavedClips().filter(c => c.id !== entry.id);
  localStorage.setItem(SAVED_CLIPS_KEY, JSON.stringify([entry, ...existing]));
}

export function deleteSavedClip(id: string) {
  const updated = getSavedClips().filter(c => c.id !== id);
  localStorage.setItem(SAVED_CLIPS_KEY, JSON.stringify(updated));
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export type LayoutType = 'fill' | 'fit' | 'split' | 'wide';
export type FaceCamCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type FaceCamSize = 'small' | 'medium' | 'large';

export interface LayoutOptions {
  type: LayoutType;
  captions: boolean;
  faceCamCorner: FaceCamCorner;
  faceCamSize: FaceCamSize;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  type: 'fill',
  captions: true,
  faceCamCorner: 'top-right',
  faceCamSize: 'medium',
};

export interface MomentOverride {
  startTime?: number;
  endTime?: number;
  hook?: string;
  suggestedCaption?: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface Transcript {
  text: string;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
  language: string;
  duration: number;
}

export interface Moment {
  id: string;
  hook: string;
  summary: string;
  startTime: number;
  endTime: number;
  viralScore: number;
  viralReasons: string[];
  platform: string[];
  contentType: string;
  targetAudience: string;
  suggestedCaption: string;
}

export interface Clip {
  momentId: string;
  file: string;
  status: 'done' | 'error';
  error?: string;
}

export interface Job {
  id: string;
  status: 'queued' | 'downloading' | 'transcribing' | 'analyzing' | 'ready' | 'generating' | 'complete' | 'error' | 'interrupted';
  progress: number;
  statusMessage: string;
  createdAt: string;
  updatedAt: string;
  inputType: 'file' | 'youtube';
  originalName?: string;
  youtubeUrl?: string;
  transcript: Transcript | null;
  moments: Moment[] | null;
  clips: Clip[] | null;
  error: string | null;
}

export interface SavedClip {
  id: string;       // `${jobId}-${momentId}`
  jobId: string;
  filename: string;
  hook: string;
  savedAt: string;
  platform: string[];
  viralScore: number;
}
