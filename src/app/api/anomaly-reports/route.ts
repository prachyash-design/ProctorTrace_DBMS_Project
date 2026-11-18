import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import mysqlPool from "@/lib/mysql";
import { requireRole } from "@/lib/session";

export async function GET() {
  const session = await requireRole(["ADMIN", "PROCTOR"]);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Admin or proctor login required" },
      { status: 403 }
    );
  }

  try {
    const [reports] = await mysqlPool.execute<RowDataPacket[]>(
      `SELECT
          ar.ReportID,
          ar.AttemptID,
          ar.AnomalyType,
          ar.EventCount,
          ar.Severity,
          ar.Status,
          ar.ReviewNotes,
          ar.CreatedAt,
          u.FullName AS StudentName,
          e.Title AS ExamTitle
       FROM ANOMALY_REPORTS ar
       JOIN ATTEMPTS a ON ar.AttemptID = a.AttemptID
       JOIN USERS u ON a.UserID = u.UserID
       JOIN EXAMS e ON a.ExamID = e.ExamID
       ORDER BY ar.CreatedAt DESC`
    );

    return NextResponse.json({
      success: true,
      reports,
    });
  } catch (error) {
    console.error("Report retrieval error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to retrieve reports" },
      { status: 500 }
    );
  }
}