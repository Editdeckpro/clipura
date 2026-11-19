'use client';

import { useState, useEffect } from 'react';
import { Download, Trash2, Play, Film, Bookmark } from 'lucide-react';
import { getSavedClips, deleteSavedClip, getClipUrl, SavedClip } from '@/lib/api';

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'Just now';
}

export default function SavedClips() {
  const [clips, setClips] = useState<SavedClip[]>([]);
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    setClips(getSavedClips());
  }, []);

  const handleDelete = (id: string) => {
    deleteSavedClip(id);
    setClips(prev => prev.filter(c => c.id !== id));
    if (previewing === id) setPreviewing(null);
  };

  if (clips.length === 0) {
    return (
      <div className="text-center py-24">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/5 border border-white/8 mb-5">
          <Bookmark size={24} className="text-white/20" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">No saved clips yet</h2>
        <p className="text-white/40 text-sm max-w-xs mx-auto">
          Generate clips from a podcast and click &ldquo;Save&rdquo; to build your library.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">My Clips</h1>
          <p className="text-white/40 text-sm mt-0.5">{clips.length} saved clip{clips.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="space-y-3">
        {clips.map(clip => {
          const clipUrl = getClipUrl(clip.jobId, clip.filename);
          const isPreviewOpen = previewing === clip.id;

          return (
            <div
              key={clip.id}
              className="bg-surface-1 border border-white/7 rounded-2xl overflow-hidden transition-colors hover:border-white/12"
            >
              {/* Preview panel */}
              {isPreviewOpen && (
                <div className="bg-black flex justify-center border-b border-white/5">
                  <video
                    src={clipUrl}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-80 object-contain"
                    style={{ aspectRatio: '9/16' }}
                  />
                </div>
              )}

              <div className="p-4 flex items-center gap-4">
                {/* Thumbnail placeholder */}
                <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center flex-shrink-0">
                  <Film size={16} className="text-white/30" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-snug line-clamp-1">
                    {clip.hook}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-white/30">
                    <span>{timeAgo(clip.savedAt)}</span>
                    {clip.viralScore > 0 && (
                      <span className={`font-semibold ${clip.viralScore >= 80 ? 'text-green-400/70' : clip.viralScore >= 60 ? 'text-brand-400/70' : 'text-yellow-400/70'}`}>
                        {clip.viralScore} score
                      </span>
                    )}
                    {clip.platform.map(p => (
                      <span key={p} className="bg-white/5 px-1.5 py-0.5 rounded">{p}</span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setPreviewing(isPreviewOpen ? null : clip.id)}
                    title={isPreviewOpen ? 'Close preview' : 'Preview'}
                    className={`p-2 rounded-lg border transition-colors text-sm ${
                      isPreviewOpen
                        ? 'bg-brand-500/15 border-brand-500/30 text-brand-400'
                        : 'bg-white/5 border-white/8 text-white/40 hover:text-white hover:border-white/20'
                    }`}
                  >
                    <Play size={14} />
                  </button>
                  <a
                    href={clipUrl}
                    download={clip.filename}
                    title="Download"
                    className="p-2 rounded-lg border bg-white/5 border-white/8 text-white/40 hover:text-white hover:border-white/20 transition-colors"
                  >
                    <Download size={14} />
                  </a>
                  <button
                    onClick={() => handleDelete(clip.id)}
                    title="Remove from library"
                    className="p-2 rounded-lg border bg-white/5 border-white/8 text-white/30 hover:text-red-400 hover:border-red-400/20 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
