import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 300_000,
});

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
  momentOverrides?: Record<string, MomentOverride>
) {
  await api.post(`/jobs/${jobId}/generate`, { selectedMoments, momentOverrides });
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
  status: 'queued' | 'downloading' | 'transcribing' | 'analyzing' | 'ready' | 'generating' | 'complete' | 'error';
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
