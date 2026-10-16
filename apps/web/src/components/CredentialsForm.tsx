import { useState } from "react";
import type { FormEvent } from "react";

interface CredentialsFormProps {
  submitLabel: string;
  pending: boolean;
  errorMessage: string | null;
  onSubmit: (credentials: { email: string; password: string }) => void;
}

export function CredentialsForm({
  submitLabel,
  pending,
  errorMessage,
  onSubmit,
}: CredentialsFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ email, password });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          className="input"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {errorMessage && <p className="field-error">{errorMessage}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Please wait…" : submitLabel}
      </button>
    </form>
  );
}
