'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Link2, FileVideo, Loader2, AlertCircle, Radio, Scissors } from 'lucide-react';
import { api, uploadFile } from '@/lib/api';

interface Props {
  onJobCreated: (jobId: string) => void;
}

const ACCEPTED = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],
  'video/webm': ['.webm'],
  'audio/mpeg': ['.mp3'],
  'audio/mp4': ['.m4a'],
  'audio/wav': ['.wav'],
};

// How far back to go when the link is a stream that is live right now.
const LIVE_MINUTE_OPTIONS = [5, 10, 20, 30, 60];

export default function UploadZone({ onJobCreated }: Props) {
  const [mode, setMode] = useState<'youtube' | 'file'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [liveMinutes, setLiveMinutes] = useState(10);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return;
    setError('');
    setUploading(true);
    setUploadProgress(0);
    try {
      const jobId = await uploadFile(accepted[0], setUploadProgress);
      onJobCreated(jobId);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onJobCreated]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    disabled: uploading,
  });

  async function handleYouTube(e: React.FormEvent) {
    e.preventDefault();
    if (!youtubeUrl.trim()) return;
    setError('');
    setUploading(true);
    try {
      const res = await api.post<{ jobId: string }>('/upload/youtube', {
        url: youtubeUrl.trim(),
        liveMinutes,
      });
      onJobCreated(res.data.jobId);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Could not open that link');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Mode toggle */}
      <div className="flex bg-surface-1 border border-white/5 rounded-xl p-1 mb-6">
        {(['youtube', 'file'] as const).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(''); }}
            disabled={uploading}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              mode === m
                ? 'bg-brand-500 text-white shadow-lg'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            {m === 'file' ? <FileVideo size={16} /> : <Link2 size={16} />}
            {m === 'file' ? 'Upload a file' : 'Paste a link'}
          </button>
        ))}
      </div>

      {mode === 'file' ? (
        <div
          {...getRootProps()}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200
            ${isDragActive
              ? 'border-brand-500 bg-brand-500/5 glow-brand-sm'
              : 'border-white/10 hover:border-brand-500/50 hover:bg-white/2'
            }
            ${uploading ? 'pointer-events-none opacity-60' : ''}
          `}
        >
          <input {...getInputProps()} />

          {uploading ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 size={40} className="text-brand-500 animate-spin" />
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-sm text-white/60 mb-2">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-4">
                <Upload size={28} className="text-brand-400" />
              </div>
              <p className="text-lg font-semibold text-white mb-1">
                {isDragActive ? 'Drop it here' : 'Drop a video or audio file'}
              </p>
              <p className="text-white/40 text-sm mb-4">or click to browse</p>
              <p className="text-white/25 text-xs">
                MP4, MOV, AVI, MKV, WebM, MP3, M4A, WAV &nbsp;&middot;&nbsp; Up to 2GB
              </p>
            </>
          )}
        </div>
      ) : (
        <form onSubmit={handleYouTube} className="space-y-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Link2 size={20} className="text-brand-500" />
            </div>
            <input
              type="url"
              value={youtubeUrl}
              onChange={e => setYoutubeUrl(e.target.value)}
              placeholder="Paste a YouTube link (video or live stream)"
              disabled={uploading}
              className="w-full pl-12 pr-4 py-4 bg-surface-1 border border-white/10 rounded-xl text-white placeholder-white/25 focus:border-brand-500 focus:outline-none transition-colors text-sm"
            />
          </div>

          {/* Live stream option */}
          <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 bg-surface-1 border border-white/5 rounded-xl">
            <div className="flex items-center gap-3">
              <Radio size={16} className="text-brand-400 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">If the stream is live right now</p>
                <p className="text-white/40 text-xs">Finished videos are always clipped in full.</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-white/60">
              Go back
              <select
                value={liveMinutes}
                onChange={e => setLiveMinutes(Number(e.target.value))}
                disabled={uploading}
                className="bg-surface border border-white/10 rounded-lg text-white text-sm px-3 py-2 focus:border-brand-500 focus:outline-none"
              >
                {LIVE_MINUTE_OPTIONS.map(m => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="submit"
            disabled={uploading || !youtubeUrl.trim()}
            className="w-full py-4 bg-brand-500 hover:bg-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {uploading ? (
              <><Loader2 size={18} className="animate-spin" /> Starting...</>
            ) : (
              <><Scissors size={18} /> Find my clips</>
            )}
          </button>
        </form>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}