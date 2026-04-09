import { z } from "zod";

import { getServerSupabaseClient } from "@/lib/supabase/serverClient";
import { unwrapResponse } from "@/lib/tools/shared";

const ReviewRequestSchema = z.object({
  expenseId: z.string().uuid(),
  reviewStatus: z.enum(["unreviewed", "verified"])
});

function isMissingReviewColumnsError(message: string): boolean {
  return message.includes("anomaly_review_status") || message.includes("anomaly_reviewed_at");
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = ReviewRequestSchema.parse(await request.json());
    const supabase = getServerSupabaseClient();

    const anomalyRow = await unwrapResponse(
      supabase
        .from("expense_anomalies_v")
        .select("expense_id, anomaly_flag")
        .eq("expense_id", body.expenseId)
        .maybeSingle(),
      "Failed loading anomaly review target"
    );

    if (!anomalyRow || anomalyRow.anomaly_flag !== true) {
      return Response.json({ error: "Only flagged anomalies can be reviewed." }, { status: 400 });
    }

    const updatePayload =
      body.reviewStatus === "verified"
        ? {
            anomaly_review_status: "verified",
            anomaly_reviewed_at: new Date().toISOString()
          }
        : {
            anomaly_review_status: "unreviewed",
            anomaly_reviewed_at: null
          };

    try {
      await unwrapResponse(
        supabase.from("expenses").update(updatePayload).eq("id", body.expenseId),
        "Failed saving anomaly review"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed saving anomaly review";
      if (isMissingReviewColumnsError(message)) {
        return Response.json(
          { error: "Verification is not enabled until the latest database migration is applied." },
          { status: 409 }
        );
      }

      throw error;
    }

    return Response.json({
      expenseId: body.expenseId,
      reviewStatus: body.reviewStatus
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed saving anomaly review";
    return Response.json({ error: message }, { status: 400 });
  }
}
