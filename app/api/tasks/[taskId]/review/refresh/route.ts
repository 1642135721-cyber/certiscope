import { POST as runFullAssessment } from "../run/route";

// Reuse the full pipeline while selecting stored-material mode for this endpoint.
export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  return runFullAssessment(
    new Request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reuseParsedMaterials: true }),
    }),
    context,
  );
}
