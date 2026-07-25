"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The dashboard thread — the live conversation, full size. Same API as the
 * marketing showcase's embedded thread (/api/thread), grown up a little:
 * day stamps grouped by date, a thinking indicator while Homie composes,
 * and a calm error line that never eats a message.
 */

type ThreadMessage = { who: "homie" | "her"; text: string; at: string | null };

type Loaded = {
  linked: boolean;
  name?: string | null;
  onboarded?: boolean;
  messages: ThreadMessage[];
};

function dayLabel(at: string | null): string | null {
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return d
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();
}

export default function ThreadChat() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [onboarded, setOnboarded] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/thread")
      .then((r) => r.json())
      .then((d: Loaded) => {
        if (cancelled) return;
        setMessages(d.messages ?? []);
        setOnboarded(d.onboarded ?? false);
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages, sending, scrollToEnd]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setNotice(null);
    setMessages((m) => [...m, { who: "her", text, at: new Date().toISOString() }]);
    setDraft("");
    try {
      const res = await fetch("/api/thread", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !d.reply) {
        setNotice(d.error ?? "Homie could not answer just now.");
      } else {
        setMessages((m) => [
          ...m,
          { who: "homie", text: d.reply as string, at: new Date().toISOString() },
        ]);
      }
    } catch {
      setNotice("Homie could not answer just now.");
    } finally {
      setSending(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="thread" style={{ minHeight: 320 }}>
        <div className="day-stamp">OPENING YOUR THREAD…</div>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="thread" style={{ minHeight: 320 }}>
        <div className="day-stamp">THE THREAD DID NOT LOAD. REFRESH WHEN YOU LIKE.</div>
      </div>
    );
  }

  let lastDay: string | null = null;

  return (
    <div
      className="thread"
      ref={scrollRef}
      style={{ maxHeight: "70vh", minHeight: 420, overflowY: "auto" }}
    >
      {messages.length === 0 ? (
        <div className="day-stamp">NOTHING HERE YET — SAY ANYTHING</div>
      ) : null}

      {messages.map((m, i) => {
        const label = dayLabel(m.at);
        const stamp = label && label !== lastDay ? label : null;
        if (stamp) lastDay = label;
        return (
          <div key={i} style={{ display: "contents" }}>
            {stamp ? <div className="day-stamp">{stamp}</div> : null}
            <div className={`bubble ${m.who}`}>{m.text}</div>
          </div>
        );
      })}

      {sending ? (
        <div className="typing-bubble" aria-label="Homie is thinking">
          <i />
          <i />
          <i />
        </div>
      ) : null}

      {notice ? (
        <div className="day-stamp" role="status">
          {notice}
        </div>
      ) : null}

      <form className="composer" onSubmit={send}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="say anything"
          aria-label="Message Homie"
          disabled={sending}
        />
        <button type="submit" disabled={sending || !draft.trim()} aria-label="Send">
          ↑
        </button>
      </form>
    </div>
  );
}
