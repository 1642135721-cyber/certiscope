"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  message: string;
}

export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { message: "请输入账号和密码。" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { message: "登录失败，请核对账号和密码。" };
    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, active")
      .eq("id", auth.user?.id ?? "")
      .maybeSingle();
    if (
      !profile?.active ||
      !["auditor", "admin", "rule_maintainer"].includes(profile.role)
    ) {
      await supabase.auth.signOut();
      return { message: "账号尚未获得使用权限，请联系管理员。" };
    }
  } catch {
    return { message: "登录服务暂时不可用，请稍后重试。" };
  }
  redirect("/welcome");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
