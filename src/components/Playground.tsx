'use client';

import { useRef, useState } from 'react';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  escalated?: boolean;
  flags?: string[];
  model?: string;
}

const SUGGESTIONS = [
  'Sunday ko clinic khula rehta hai kya?',
  'How much does a cleaning cost?',
  'My son has a dark spot on his tooth, is it a cavity?',
  'Can I book a kids check-up this week?',
];

export function Playground() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const visitorId = useRef(`pg-${Math.random().toString(36).slice(2, 10)}`);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    const history = turns.map((turn) => ({ role: turn.role, content: turn.content }));
    setTurns((prev) => [...prev, { role: 'user', content: message }]);
    setInput('');
    setBusy(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          visitorId: visitorId.current,
          widgetKey: 'alcadent',
          history,
        }),
      });

      const data = await response.json();
      setTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply ?? data.error ?? 'No reply.',
          escalated: data.escalated,
          flags: data.guardrailFlags,
          model: data.model,
        },
      ]);
    } catch {
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', content: 'Could not reach the agent endpoint.' },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card chat">
      <div className="card-head">
        <h2>Front desk agent</h2>
        <span className="hint">Same runtime, guardrails and tools as the live channel</span>
      </div>

      <div className="log">
        {turns.length === 0 ? (
          <div className="stack" style={{ gap: 10 }}>
            <p className="small muted">
              Try one of these. The third is deliberately clinical — watch it escalate instead of
              answering.
            </p>
            <div className="row">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  className="btn"
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {turns.map((turn, index) => (
          <div
            key={index}
            className={`bubble ${turn.role === 'assistant' ? 'outbound' : ''}`}
            style={turn.role === 'user' ? { alignSelf: 'flex-start' } : undefined}
          >
            {turn.content}
            {turn.role === 'assistant' ? (
              <div className="meta">
                {turn.escalated ? 'escalated to staff · ' : ''}
                {turn.model ?? 'agent'}
                {turn.flags?.length ? ` · ${turn.flags.join(', ')}` : ''}
              </div>
            ) : null}
          </div>
        ))}

        {busy ? <div className="bubble system">thinking…</div> : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <input
          type="text"
          value={input}
          placeholder="Type as a customer would…"
          onChange={(event) => setInput(event.target.value)}
          disabled={busy}
          aria-label="Message"
        />
        <button className="btn primary" type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
