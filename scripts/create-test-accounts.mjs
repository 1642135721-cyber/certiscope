import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envFile = readFileSync(".env.local", "utf8");
function env(name) {
  const line = envFile.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, "");
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const secret = env("SECRET_KEY");
if (!url || !secret) throw new Error("Supabase 配置不完整。");

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const accounts = [
  { email: "certiscope-admin@example.com", role: "admin", name: "测试审核管理员" },
  { email: "certiscope-auditor@example.com", role: "auditor", name: "测试审核员" },
];

const { data: existing, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw new Error(`无法检查账号：${listError.message}`);
const alreadyPresent = accounts.filter((account) => existing.users.some((user) => user.email === account.email));
if (alreadyPresent.length) {
  throw new Error(`测试账号已存在，停止以避免覆盖密码：${alreadyPresent.map((account) => account.email).join(", ")}`);
}

for (const account of accounts) {
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const { data, error } = await supabase.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`${account.email} 创建失败：${error?.message ?? "未知错误"}`);
  const { error: profileError } = await supabase
    .from("user_profiles")
    .update({ role: account.role, display_name: account.name })
    .eq("id", data.user.id);
  if (profileError) throw new Error(`${account.email} 角色配置失败：${profileError.message}`);
  process.stdout.write(`${JSON.stringify({ email: account.email, password, role: account.role })}\n`);
}
