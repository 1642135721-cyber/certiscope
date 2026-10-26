export function projectDisplayName(name: string): string {
  return name;
}

export function projectDisplayValue(value: string): string {
  return value;
}

export function userDisplayName(name: string, role: string): string {
  if (name.startsWith("测试"))
    return role === "admin"
      ? "审核管理员"
      : role === "auditor"
        ? "审核员"
        : "规则维护人员";
  return name;
}
