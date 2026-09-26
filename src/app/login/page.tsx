"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React clears `currentTarget` once the handler returns, so the form is
    // captured before the first await.
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fields.get("email"),
          password: fields.get("password"),
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error ?? "Sign-in failed. Check your email and password.");
        form.querySelector<HTMLInputElement>('input[name="password"]')?.focus();
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <main className="auth-card" id="main-content">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            CN
          </span>
          <span className="brand-text">
            <span className="brand-name">College Noticeboard</span>
            <span className="brand-sub">Admin workspace</span>
          </span>
        </div>

        <h1 className="auth-title">Staff sign-in</h1>
        <p className="auth-description">
          Sign in to publish notices, manage files and run archive operations.
        </p>

        {error ? (
          <div className="alert auth-error" role="alert" aria-live="assertive">
            <AlertCircle aria-hidden="true" />
            {error}
          </div>
        ) : null}

        <form className="auth-form" onSubmit={submit} ref={formRef} noValidate={false}>
          <div className="field">
            <label className="field-label" htmlFor="login-email">
              Email address
            </label>
            <input
              id="login-email"
              ref={emailRef}
              className="input"
              name="email"
              type="email"
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
              aria-invalid={error ? true : undefined}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className="input"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              disabled={busy}
              aria-invalid={error ? true : undefined}
            />
          </div>

          <button className="btn btn-lg btn-block" type="submit" disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <LogIn aria-hidden="true" />}
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="auth-foot">
          <Link href="/">Return to the public noticeboard</Link>
        </p>
      </main>
    </div>
  );
}
