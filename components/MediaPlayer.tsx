'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { AlertCircle, RotateCcw, Loader2 } from 'lucide-react';

interface MediaPlayerProps {
  src: string;
  poster?: string | null;
  title?: string;
}

export default function MediaPlayer({ src, poster, title }: MediaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setPlaybackError(null);
    setIsBuffering(true);

    let hls: Hls | null = null;
    const isHls = src.toLowerCase().includes('.m3u8');

    if (isHls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
        video.play().catch(() => {
          // Autoplay policy prevented playback without interaction
        });
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError();
              break;
            default:
              setPlaybackError('Fatal playback error encountered. Stream may have expired or is blocked.');
              hls?.destroy();
              break;
          }
        }
      });
    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Apple / Safari HLS support
      video.src = src;
      video.play().catch(() => {});
    } else {
      // Standard MP4 direct streaming
      video.src = src;
      video.play().catch(() => {});
    }

    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => {
      setIsBuffering(false);
      setPlaybackError(null);
    };
    const handleError = () => {
      setIsBuffering(false);
      setPlaybackError('Failed to play video. The direct CDN link might have expired or requires a proxy.');
    };

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError);
      if (hls) {
        hls.destroy();
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [src, retryKey]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex items-center justify-center group">
      {/* Video Element */}
      <video
        ref={videoRef}
        controls
        playsInline
        poster={poster || undefined}
        aria-label={title || 'Media player'}
        className="w-full h-full object-contain"
      />

      {/* Buffering Indicator */}
      {isBuffering && !playbackError && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/80 border border-slate-700/60 text-slate-300 text-xs font-medium shadow-lg">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span>Buffering stream...</span>
          </div>
        </div>
      )}

      {/* Error Overlay with Retry */}
      {playbackError && (
        <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center z-10">
          <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
          <h3 className="text-white font-semibold text-base mb-1">Playback Error</h3>
          <p className="text-slate-400 text-xs max-w-md mb-4">{playbackError}</p>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retry Stream
          </button>
        </div>
      )}
    </div>
  );
}