import { useState } from "react";
import type { FormEvent } from "react";
import { useAskAboutSpending } from "../lib/analytics";

interface Exchange {
  question: string;
  answer: string;
}

export function AskBox() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  const ask = useAskAboutSpending();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    ask.mutate(question, {
      onSuccess: (data) => setHistory((h) => [...h, { question, answer: data.answer }]),
    });
    setQuestion("");
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.6rem" }}>
        <input
          id="ask-question"
          className="input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='e.g. "Why was March so expensive?"'
        />
        <button type="submit" className="btn btn-primary" disabled={ask.isPending || !question.trim()}>
          {ask.isPending ? "Thinking…" : "Ask"}
        </button>
      </form>
      {ask.isError && <p className="error-text">Couldn't get an answer. Try again.</p>}
      {history.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {history
            .slice()
            .reverse()
            .map((exchange, i) => (
              <div key={i} className="card" style={{ background: "var(--surface-sunken)", boxShadow: "none" }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{exchange.question}</div>
                <div style={{ whiteSpace: "pre-wrap", color: "var(--text-2)", fontSize: "0.92rem" }}>
                  {exchange.answer}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
