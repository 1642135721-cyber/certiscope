import { NextResponse } from "next/server";
import { AuthorizationError, requireRole } from "@/lib/supabase/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const { supabase } = await requireRole("admin");
    const input = (await request.json()) as Record<string, unknown>;
    const fields = [
      "name",
      "projectType",
      "location",
      "areaUnit",
      "targetLevel",
    ] as const;
    if (
      fields.some(
        (key) => typeof input[key] !== "string" || !String(input[key]).trim(),
      ) ||
      typeof input.areaValue !== "number" ||
      !Number.isFinite(input.areaValue) ||
      input.areaValue <= 0
    )
      return NextResponse.json(
        {
          ok: false,
          message: "请填写有效的项目名称、类型、地点、面积和申报等级。",
        },
        { status: 400 },
      );
    const { data, error } = await supabase
      .from("projects")
      .update({
        name: String(input.name).trim(),
        project_type: String(input.projectType).trim(),
        location: String(input.location).trim(),
        area_value: input.areaValue,
        area_unit: String(input.areaUnit).trim(),
        target_level: String(input.targetLevel).trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error || !data)
      return NextResponse.json(
        { ok: false, message: "项目不存在或保存失败。" },
        { status: error ? 503 : 404 },
      );
    return NextResponse.json({ ok: true, message: "项目信息已更新。" });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof AuthorizationError ? error.message : "保存失败。",
      },
      { status: error instanceof AuthorizationError ? error.status : 500 },
    );
  }
}
