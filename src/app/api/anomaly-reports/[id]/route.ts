
import { NextResponse } from "next/server";
import { z } from "zod";
import mysqlPool from "@/lib/mysql";
import { requireRole } from "@/lib/session";

type Context = {
  params: Promise<{ id: string }>;
};

const reviewSchema = z.object({
  status: z.enum(["REVIEWED", "DISMISSED"]),
  reviewNotes: z.string().trim().min(3).max(2000),
});

export async function PUT(
  request: Request,
  context: Context
) {
  const session = await requireRole(["PROCTOR"]);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Admin or proctor login required" },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const reportId = Number(id);

    if (!Number.isSafeInteger(reportId) || reportId <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid report ID" },
        { status: 400 }
      );
    }

    const body: unknown = await request.json();
    const validation = reviewSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid review data",
          errors: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { status, reviewNotes } = validation.data;

    const [result] = await mysqlPool.execute(
      `UPDATE ANOMALY_REPORTS
       SET Status = ?,
           ReviewedBy = ?,
           ReviewNotes = ?
       WHERE ReportID = ?
         AND Status = 'PENDING'`,
      [status, session.userId, reviewNotes, reportId]
    );

    const affectedRows = (result as { affectedRows: number }).affectedRows;

    if (affectedRows === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Report not found or already reviewed",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Anomaly report reviewed successfully",
      reportId,
      status,
    });
  } catch (error) {
    console.error("Anomaly review error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to review anomaly report",
      },
      { status: 500 }
    );
  }
}
