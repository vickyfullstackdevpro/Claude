import { NextResponse } from 'next/server';

function unpackPacker(code: string): string {
  try {
    const packerRegex = /eval\(function\(p,a,c,k,e,[rd]\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([^']*)'\.split\('\|'\)[\s\S]*?\)\)/;
    const match = code.match(packerRegex);
    if (!match) return '';

    const [, payload, aStr, cStr, keyStr] = match;
    const radix = parseInt(aStr, 10);
    let count = parseInt(cStr, 10);
    const keywords = keyStr.split('|');

    const encode = (c: number): string => {
      const prefix = c >= radix ? encode(Math.floor(c / radix)) : '';
      const remainder = c % radix;
      const char = remainder > 35 ? String.fromCharCode(remainder + 29) : remainder.toString(36);
      return prefix + char;
    };

    const dict: Record<string, string> = {};
    while (count--) {
      dict[encode(count)] = keywords[count] || encode(count);
    }

    return payload.replace(/\b\w+\b/g, (w) => dict[w] || w);
  } catch {
    return '';
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    let rawUrl = body?.url;

    console.log('[Extract API] Received extraction request with input:', rawUrl);

    if (!rawUrl || typeof rawUrl !== 'string') {
      return NextResponse.json({ error: 'Please provide a valid URL' }, { status: 400 });
    }

    rawUrl = rawUrl.trim();

    // Extract URL if user passed extra text (e.g., from WhatsApp or Telegram share)
    const urlMatch = rawUrl.match(/(https?:\/\/[^\s]+)/i);
    if (urlMatch) {
      rawUrl = urlMatch[1];
    } else if (/^[a-f0-9]{20,40}$/i.test(rawUrl)) {
      rawUrl = `https://www.diskwala.com/app/${rawUrl}`;
    } else if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      rawUrl = `https://${rawUrl}`;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    console.log('[Extract API] Normalized target URL:', rawUrl);

    // Direct stream link bypass (if user directly pasted a .mp4 or .m3u8 URL)
    if (parsedUrl.pathname.endsWith('.mp4') || parsedUrl.pathname.endsWith('.m3u8')) {
      const filename = parsedUrl.pathname.split('/').pop() || 'Media File';
      const isHls = parsedUrl.pathname.endsWith('.m3u8');
      return NextResponse.json({
        title: decodeURIComponent(filename),
        streamUrl: rawUrl,
        downloadUrl: rawUrl,
        mediaType: isHls ? 'hls' : 'mp4',
        thumbnail: null,
      });
    }

    let upstreamError = '';

    // Strategy 1: Dedicated DiskWala Resolvers (thediskwala.com & playdiskwala.in)
    const resolverEndpoints = [
      'https://thediskwala.com/api/diskwala-free?url=',
      'https://playdiskwala.in/api/diskwala-free?url=',
    ];

    for (const endpoint of resolverEndpoints) {
      try {
        console.log(`[Extract API] Querying resolver: ${endpoint}`);
        const resolverController = new AbortController();
        const resolverTimeout = setTimeout(() => resolverController.abort(), 8000);

        const resolverRes = await fetch(`${endpoint}${encodeURIComponent(rawUrl)}`, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Referer': endpoint.startsWith('https://thediskwala.com')
              ? 'https://thediskwala.com/'
              : 'https://playdiskwala.in/',
            'Accept': 'application/json, text/plain, */*',
          },
          signal: resolverController.signal,
          cache: 'no-store',
        });
        clearTimeout(resolverTimeout);

        console.log(`[Extract API] Resolver status: ${resolverRes.status}`);

        const resolverData = await resolverRes.json().catch(() => null);
        if (resolverRes.ok && resolverData && resolverData.success && resolverData.url) {
          const isHls = resolverData.url.toLowerCase().includes('.m3u8');
          console.log('[Extract API] Successfully resolved stream URL:', resolverData.url);
          return NextResponse.json({
            title: resolverData.title || 'DiskWala Media',
            streamUrl: resolverData.url,
            downloadUrl: resolverData.url,
            mediaType: isHls ? 'hls' : 'mp4',
            thumbnail: resolverData.thumb || null,
          });
        } else if (resolverData && resolverData.error) {
          upstreamError = resolverData.error;
          console.log(`[Extract API] Resolver error message: ${upstreamError}`);
        }
      } catch (resolverErr) {
        console.warn(`[Extract API] Resolver ${endpoint} failed:`, resolverErr);
      }
    }

    // Strategy 2: Direct HTML Scraping Fallback
    console.log('[Extract API] Falling back to direct HTML scraping for:', rawUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(rawUrl, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept':
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': `${parsedUrl.origin}/`,
        },
        redirect: 'follow',
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId);
      const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      return NextResponse.json(
        { error: isAbort ? 'Connection timed out while fetching link.' : 'Failed to reach the target server.' },
        { status: 504 }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Target server returned status ${response.status} (${response.statusText})` },
        { status: 502 }
      );
    }

    const html = await response.text();
    const unescapedHtml = html.replace(/\\\//g, '/');

    // Title Extraction
    const ogTitleMatch = unescapedHtml.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
    const titleTagMatch = unescapedHtml.match(/<title>(.*?)<\/title>/i);
    let title = (ogTitleMatch ? ogTitleMatch[1] : titleTagMatch ? titleTagMatch[1] : 'DiskWala Media')
      .replace(/\s*-\s*DiskWala.*/gi, '')
      .replace(/\s*\|\s*DiskWala.*/gi, '')
      .replace(/\s*-\s*Watch Online.*/gi, '')
      .trim();

    if (!title || title.includes('Unlimited Cloud Storage')) {
      title = 'DiskWala Video';
    }

    // Thumbnail Extraction
    const ogImageMatch = unescapedHtml.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i);
    const posterMatch = unescapedHtml.match(/poster=["'](https?:\/\/[^"']+)["']/i);
    const thumbnail = ogImageMatch ? ogImageMatch[1] : posterMatch ? posterMatch[1] : null;

    let streamUrl = '';
    let downloadUrl = '';

    // Check JSON player configurations
    const jsonPlayerMatch = unescapedHtml.match(/var\s+(?:playerData|videoData|config|jwsettings)\s*=\s*({[\s\S]*?});/i);
    if (jsonPlayerMatch) {
      try {
        const parsed = JSON.parse(jsonPlayerMatch[1]);
        if (parsed.file || parsed.url || parsed.src || parsed.streamUrl) {
          streamUrl = parsed.file || parsed.url || parsed.src || parsed.streamUrl;
        }
        if (parsed.downloadUrl || parsed.download_url) {
          downloadUrl = parsed.downloadUrl || parsed.download_url;
        }
        if (parsed.title) {
          title = parsed.title;
        }
      } catch {
        // Continue
      }
    }

    // Check packed javascript (Dean Edwards Packer)
    if (!streamUrl) {
      const unpacked = unpackPacker(unescapedHtml);
      if (unpacked) {
        const packedStreamMatch = unpacked.match(/(https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)(?:\?[^\s"'<>]*)?)/i);
        if (packedStreamMatch) {
          streamUrl = packedStreamMatch[1];
        }
      }
    }

    // Video or source tag
    if (!streamUrl) {
      const sourceTagMatch = unescapedHtml.match(/<source[^>]+src=["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
      const videoTagMatch = unescapedHtml.match(/<video[^>]+src=["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
      if (sourceTagMatch) {
        streamUrl = sourceTagMatch[1];
      } else if (videoTagMatch) {
        streamUrl = videoTagMatch[1];
      }
    }

    // JS variable assignment
    if (!streamUrl) {
      const jsUrlMatch = unescapedHtml.match(/(?:file|source|src|stream_url|video_url)\s*[:=]\s*["'](https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)["']/i);
      if (jsUrlMatch) {
        streamUrl = jsUrlMatch[1];
      }
    }

    // Generic .mp4 or .m3u8 URL in document
    if (!streamUrl) {
      const genericStreamRegex = /(https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)(?:\?[^\s"'<>]*)?)/i;
      const genericMatch = unescapedHtml.match(genericStreamRegex);
      if (genericMatch) {
        streamUrl = genericMatch[1];
      }
    }

    // Base64 encoded media stream strings
    if (!streamUrl) {
      const b64Regex = /["'](aHR0c[A-Za-z0-9+/=]{20,})["']/g;
      let b64Match: RegExpExecArray | null;
      while ((b64Match = b64Regex.exec(unescapedHtml)) !== null) {
        try {
          const decoded = Buffer.from(b64Match[1], 'base64').toString('utf-8');
          if (decoded.startsWith('http') && (decoded.includes('.mp4') || decoded.includes('.m3u8'))) {
            streamUrl = decoded;
            break;
          }
        } catch {
          // ignore
        }
      }
    }

    // Look for download links
    const downloadLinkMatch = unescapedHtml.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>(?:[\s\S]*?(?:Download|Direct\s*Download|Save\s*File)[\s\S]*?)<\/a>/i);
    if (downloadLinkMatch) {
      downloadUrl = downloadLinkMatch[1];
    }

    if (!streamUrl) {
      const finalError = upstreamError
        ? `DiskWala upstream error: ${upstreamError}`
        : 'Unable to extract video stream. The file may have expired, been deleted by the uploader, or removed.';
      console.log('[Extract API] Returning error to client:', finalError);
      return NextResponse.json({ error: finalError }, { status: 404 });
    }

    const isHls = streamUrl.toLowerCase().includes('.m3u8');
    const mediaType: 'hls' | 'mp4' = isHls ? 'hls' : 'mp4';

    console.log('[Extract API] Extraction successful for title:', title);
    return NextResponse.json({
      title,
      streamUrl,
      downloadUrl: downloadUrl || streamUrl,
      mediaType,
      thumbnail,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[Extract API] Unexpected internal error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}