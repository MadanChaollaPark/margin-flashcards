export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

// Run in the page's MAIN world to read YouTube's player response.
export function readCaptionTracks(): CaptionTrack[] {
  type PlayerResponse = { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } } };
  const player = document.getElementById("movie_player") as HTMLElement & {
    getPlayerResponse?: () => PlayerResponse;
  } | null;
  const initial = (window as Window & { ytInitialPlayerResponse?: PlayerResponse }).ytInitialPlayerResponse;
  const tracks = player?.getPlayerResponse?.()?.captions?.playerCaptionsTracklistRenderer?.captionTracks ??
    initial?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  return Array.isArray(tracks) ? tracks : [];
}

export function parseCaptions(payload: string, parser = new DOMParser()): string {
  const input = payload.trim();
  if (!input) return "";
  let lines: string[];
  if (input.startsWith("{")) {
    const data = JSON.parse(input) as { events?: { segs?: { utf8?: string }[] }[] };
    lines = (data.events ?? []).map(({ segs }) => (segs ?? []).map(({ utf8 }) => utf8 ?? "").join(""));
  } else {
    const doc = parser.parseFromString(input, "text/xml");
    lines = [...doc.querySelectorAll("transcript > text, body > p")]
      .map((node) => node.textContent ?? "");
  }
  return lines.map((line) => line.replace(/\s+/gu, " ").trim())
    .filter((line, index, entries) => line && (index === 0 || line !== entries[index - 1])).join("\n");
}

export function youtubeVideoUrl(url: string): string | undefined {
  const page = new URL(url);
  const youtube = ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(page.hostname);
  const id = youtube && page.pathname === "/watch" ? page.searchParams.get("v")
    : youtube && /^\/(shorts|live)\//u.test(page.pathname) ? page.pathname.split("/")[2]
    : page.hostname === "youtu.be" ? page.pathname.split("/")[1] : undefined;
  if (id && /^[\w-]{11}$/u.test(id)) return `https://www.youtube.com/watch?v=${id}`;
}

export async function fetchTranscript(tracks: CaptionTrack[]): Promise<string> {
  const preferred = [...tracks].sort((a, b) => Number(a.kind === "asr") - Number(b.kind === "asr"));
  for (const track of preferred.slice(0, 3)) {
    try {
      const url = new URL(track.baseUrl);
      if (url.protocol !== "https:" || !["www.youtube.com", "youtube.com", "video.google.com"].includes(url.hostname)) continue;
      const response = await fetch(url, { credentials: "include", redirect: "error", signal: AbortSignal.timeout(10_000) });
      const text = response.ok ? parseCaptions(await response.text()) : "";
      if (text) return text;
    } catch {
      // Some tracks are restricted or no longer match the playing video.
    }
  }
  return "";
}
