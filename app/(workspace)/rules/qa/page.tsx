import { redirect } from "next/navigation";
import { connection } from "next/server";
import { GvQaChat } from "@/components/workspace/gv-qa-chat";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { getCurrentActor } from "@/lib/supabase/auth";

export default async function GvQaPage() {
  await connection();
  let context: Awaited<ReturnType<typeof getCurrentActor>>;
  try {
    context = await getCurrentActor();
  } catch {
    redirect("/login");
  }
  return (
    <WorkspaceFrame actor={context.actor} active="rulesQa">
      <GvQaChat />
    </WorkspaceFrame>
  );
}
