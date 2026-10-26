import { NextResponse } from "next/server";
import { AuthorizationError, requireRole } from "@/lib/supabase/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string; materialId: string }> },
) {
  try {
    const { projectId, materialId } = await params;
    const { supabase } = await requireRole("admin");
    const kind = new URL(request.url).searchParams.get("kind");
    if (kind !== "source" && kind !== "version")
      return NextResponse.json(
        { ok: false, message: "材料类型无效。" },
        { status: 400 },
      );
    const { error } = await supabase.rpc("admin_remove_material", {
      p_project_id: projectId,
      p_source_file_id: kind === "source" ? materialId : null,
      p_version_id: kind === "version" ? materialId : null,
    });
    if (error)
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 409 },
      );
    return NextResponse.json({
      ok: true,
      message: "材料已从当前项目移除；历史审核引用保留。",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof AuthorizationError
            ? error.message
            : "移除材料失败。",
      },
      { status: error instanceof AuthorizationError ? error.status : 500 },
    );
  }
}
