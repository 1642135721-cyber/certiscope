import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/supabase/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string; fileId: string }> }) {
  const { projectId, fileId } = await params;
  try {
    const { supabase } = await getCurrentActor();
    const { data: project } = await supabase.from("projects")
      .select("id").eq("id", projectId).is("deleted_at", null).maybeSingle();
    if (!project) return new NextResponse("项目不存在或已移入回收站", { status: 404 });
    const { data } = await supabase.from("project_source_files").select("storage_path").eq("project_id", projectId).eq("id", fileId).maybeSingle();
    if (!data) return new NextResponse("文件不存在或无权访问", { status: 404 });
    const { data: url, error } = await supabase.storage.from("gv-intake").createSignedUrl(data.storage_path, 60);
    if (error || !url) return new NextResponse("文件暂时无法打开", { status: 503 });
    return NextResponse.redirect(url.signedUrl);
  } catch { return new NextResponse("请先登录", { status: 401 }); }
}
