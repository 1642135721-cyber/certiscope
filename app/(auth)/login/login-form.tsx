"use client";

import { LockKeyhole, UserRound } from "lucide-react";
import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { message: "" });
  return (
    <form action={action} className="login-form">
      <label className="login-field">
        <UserRound size={21} aria-hidden="true" />
        <span className="login-field-label">账号</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          placeholder="请输入账号"
          required
        />
      </label>
      <label className="login-field">
        <LockKeyhole size={21} aria-hidden="true" />
        <span className="login-field-label">密码</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="请输入密码"
          required
        />
      </label>
      <button className="login-submit" type="submit" disabled={pending}>
        {pending ? "正在登录…" : "登录"}
      </button>
      <p className="login-error" aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
