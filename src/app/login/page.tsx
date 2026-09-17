"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export default function LoginPage() {
  const router = useRouter(); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(""); const form=new FormData(e.currentTarget); const r=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:form.get("email"),password:form.get("password")})}); const data=await r.json(); setBusy(false); if(!r.ok){setError(data.error??"Login failed");return;} router.push("/admin"); router.refresh(); }
  return <div className="shell"><main className="card auth-card"><h1>Admin login</h1><p className="muted">Sign in to manage notices and files.</p>{error&&<div className="alert">{error}</div>}<form className="form" onSubmit={submit}><label>Email<input name="email" type="email" required autoComplete="username"/></label><label>Password<input name="password" type="password" required autoComplete="current-password"/></label><button className="btn" disabled={busy}>{busy?"Signing in…":"Sign in"}</button></form></main></div>;
}
