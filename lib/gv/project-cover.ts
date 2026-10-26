export interface ProjectCoverSource {
  file_name: string;
  storage_path: string;
}

function coverPriority(fileName: string): number {
  const name = fileName.toLowerCase();
  const image = /\.(?:png|jpe?g)$/.test(name);
  const pdf = name.endsWith(".pdf");
  const buildingView =
    /效果图|建筑外观|外立面|建筑照片|render|perspective|exterior|facade|elevation|building[\s_-]*(?:photo|image)/i.test(
      name,
    );
  if (image && buildingView) return 0;
  if (pdf && buildingView) return 1;
  if (pdf && /site[\s_-]*plan|总平面|场地平面|landscape[\s_-]*plan/i.test(name))
    return 2;
  if (image && !/设备|充电|charger|product|manual|logo/i.test(name)) return 3;
  if (pdf && /floor[\s_-]*plan|garage[\s_-]*plan|车库平面|停车平面/i.test(name))
    return 4;
  return Number.POSITIVE_INFINITY;
}

export function selectProjectCoverSource<T extends ProjectCoverSource>(
  files: T[],
): T | null {
  return (
    files
      .map((file) => ({ file, priority: coverPriority(file.file_name) }))
      .filter((item) => Number.isFinite(item.priority))
      .sort((a, b) => a.priority - b.priority)[0]?.file ?? null
  );
}

export function projectCoverAlt(fileName: string): string {
  return /site[\s_-]*plan|总平面|场地平面|landscape[\s_-]*plan/i.test(fileName)
    ? "项目总平面图"
    : /floor[\s_-]*plan|garage[\s_-]*plan|车库平面|停车平面/i.test(fileName)
      ? "项目平面图"
      : "项目材料图片";
}
