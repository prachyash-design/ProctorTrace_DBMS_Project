
import { NextResponse } from "next/server";
import { z } from "zod";
import mysqlPool from "@/lib/mysql";
import { requireRole } from "@/lib/session";

const updateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(5000).optional(),
  durationMinutes: z.number().int().positive().max(600),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
});

type Context = {
  params: Promise<{ id: string }>;
};

// UPDATE EXAM
export async function PUT(request: Request, context: Context) {
  const session = await requireRole(["ADMIN"]);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Admin access required." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const examId = Number(id);

    if (!Number.isSafeInteger(examId) || examId <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid exam ID." },
        { status: 400 }
      );
    }

    const body: unknown = await request.json();
    const validation = updateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: "Invalid exam details." },
        { status: 400 }
      );
    }

    const data = validation.data;
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid exam dates." },
        { status: 400 }
      );
    }

    const [result] = await mysqlPool.execute(
      `UPDATE EXAMS
       SET Title = ?,
           Description = ?,
           DurationMinutes = ?,
           StartTime = ?,
           EndTime = ?
       WHERE ExamID = ?
         AND Status IN ('DRAFT', 'SCHEDULED')`,
      [
        data.title,
        data.description ?? null,
        data.durationMinutes,
        start,
        end,
        examId,
      ]
    );

    const affectedRows = (result as { affectedRows: number }).affectedRows;

    if (affectedRows === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Exam not found or cannot be edited in its current status.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Exam updated successfully.",
    });

  } catch (error) {
    console.error("Update exam error:", error);

    return NextResponse.json(
      { success: false, message: "Could not update exam." },
      { status: 500 }
    );
  }
}

// CANCEL EXAM
export async function DELETE(request: Request, context: Context) {
  const session = await requireRole(["ADMIN"]);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Admin access required." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const examId = Number(id);

    if (!Number.isSafeInteger(examId) || examId <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid exam ID." },
        { status: 400 }
      );
    }

    const [result] = await mysqlPool.execute(
      `UPDATE EXAMS
       SET Status = 'CANCELLED'
       WHERE ExamID = ?
         AND Status IN ('DRAFT', 'SCHEDULED')`,
      [examId]
    );

    const affectedRows = (result as { affectedRows: number }).affectedRows;

    if (affectedRows === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Exam not found or cannot be cancelled.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Exam cancelled successfully.",
    });

  } catch (error) {
    console.error("Cancel exam error:", error);

    return NextResponse.json(
      { success: false, message: "Could not cancel exam." },
      { status: 500 }
    );
  }
}
