'use client';

import { useState } from 'react';
import MediaPlayer from '@/components/MediaPlayer';
import {
  Play,
  Download,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Film,
  Radio,
} from 'lucide-react';

interface MediaInfo {
  title: string;
  streamUrl: string;
  downloadUrl: string;
  mediaType: 'hls' | 'mp4';
  thumbnail: string | null;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError('');
    setMedia(null);
    setCopied(false);

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract stream from URL');
      }

      setMedia(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resolve link';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!media?.streamUrl) return;
    try {
      await navigator.clipboard.writeText(media.streamUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setError('Unable to copy to clipboard.');
    }
  };

  const resetForm = () => {
    setUrl('');
    setMedia(null);
    setError('');
    setCopied(false);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start px-4 py-12 md:py-16 selection:bg-blue-500/30">
      <div className="w-full max-w-4xl space-y-8">
        {/* Header / Hero */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            Ad-Free Stream Extractor
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
            DiskWala Player & Bypasser
          </h1>
          <p className="text-slate-400 text-sm md:text-base max-w-xl mx-auto">
            Bypass popups, timers, and app redirects. Extract clean direct streams for immediate web playback and downloading.
          </p>
        </div>

        {/* Input Form Card */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl backdrop-blur-sm">
          <form onSubmit={handleResolve} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                required
                placeholder="Paste DiskWala link (e.g., https://diskwala.com/...)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm md:text-base"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="flex items-center justify-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl transition shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Extracting...</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  <span>Stream</span>
                </>
              )}
            </button>
          </form>

          {/* Helper notes */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
            <span>Supports standard links, .m3u8 playlists, direct CDN links, and mirror domains.</span>
            {media && (
              <button
                onClick={resetForm}
                className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear & Reset
              </button>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-950/60 border border-red-800/80 rounded-2xl text-red-200 text-sm shadow-lg">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
            <div className="space-y-1">
              <span className="font-semibold text-red-300">Extraction Error:</span>
              <p className="text-red-200/90 text-xs leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Media Player Card */}
        {media && (
          <div className="space-y-5 bg-slate-900/60 border border-slate-800 p-5 md:p-6 rounded-3xl shadow-2xl backdrop-blur-md">
            {/* Title & Media Type Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/60">
              <div className="min-w-0">
                <h2 className="text-lg md:text-xl font-bold truncate text-white tracking-tight" title={media.title}>
                  {media.title}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wider ${
                      media.mediaType === 'hls'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    {media.mediaType === 'hls' ? <Radio className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                    {media.mediaType === 'hls' ? 'HLS Adaptive (.m3u8)' : 'MP4 Direct Video'}
                  </span>
                </div>
              </div>

              {/* Action Buttons Top */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={copyToClipboard}
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Stream URL</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Media Player */}
            <MediaPlayer
              src={media.streamUrl}
              poster={media.thumbnail}
              title={media.title}
            />

            {/* Bottom Controls / Download */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="text-xs text-slate-500 truncate max-w-md w-full sm:w-auto font-mono">
                Source: <span className="text-slate-400">{media.streamUrl}</span>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <a
                  href={media.downloadUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs md:text-sm font-semibold rounded-xl transition shadow-lg shadow-emerald-600/20 cursor-pointer w-full sm:w-auto"
                >
                  <Download className="w-4 h-4" />
                  <span>Direct Download File</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}