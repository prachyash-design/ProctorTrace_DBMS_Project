
import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import mysqlPool from "@/lib/mysql";
import { requireRole } from "@/lib/session";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: Context) {
  const session = await requireRole(["STUDENT"]);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Student login required" },
      { status: 403 }
    );
  }

  const connection = await mysqlPool.getConnection();

  try {
    const { id } = await context.params;
    const examId = Number(id);

    if (!Number.isSafeInteger(examId) || examId <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid exam ID" },
        { status: 400 }
      );
    }

    await connection.beginTransaction();

    const [exams] = await connection.execute<RowDataPacket[]>(
      `SELECT ExamID, DurationMinutes, StartTime, EndTime, Status
       FROM EXAMS WHERE ExamID = ? FOR UPDATE`,
      [examId]
    );

    if (exams.length === 0) {
      await connection.rollback();
      return NextResponse.json(
        { success: false, message: "Exam not found" },
        { status: 404 }
      );
    }

    const exam = exams[0];

    const [existing] = await connection.execute<RowDataPacket[]>(
      `SELECT AttemptID, Status
       FROM ATTEMPTS
       WHERE UserID = ? AND ExamID = ?`,
      [session.userId, examId]
    );

    if (existing.length > 0) {
      const existingAttempt = existing[0];
      await connection.rollback();

      if (existingAttempt.Status === "IN_PROGRESS") {
        return NextResponse.json({
          success: true,
          message: "Resuming existing examination",
          attemptId: existingAttempt.AttemptID,
          durationMinutes: Number(exam.DurationMinutes),
        });
      }

      return NextResponse.json(
        {
          success: false,
          message: "You have already completed this exam",
        },
        { status: 409 }
      );
    }

    const now = new Date();
    const startTime = new Date(exam.StartTime);
    const endTime = new Date(exam.EndTime);

    if (
      exam.Status !== "SCHEDULED" ||
      now < startTime ||
      now >= endTime
    ) {
      await connection.rollback();
      return NextResponse.json(
        { success: false, message: "This exam is not currently available" },
        { status: 409 }
      );
    }

    const [questionCount] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM QUESTIONS WHERE ExamID = ?`,
      [examId]
    );

    if (Number(questionCount[0].total) === 0) {
      await connection.rollback();
      return NextResponse.json(
        { success: false, message: "This exam has no questions yet" },
        { status: 409 }
      );
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ATTEMPTS (UserID, ExamID, Status, Score)
       VALUES (?, ?, 'IN_PROGRESS', 0)`,
      [session.userId, examId]
    );

    await connection.commit();

    return NextResponse.json(
      {
        success: true,
        message: "Exam started successfully",
        attemptId: result.insertId,
        durationMinutes: Number(exam.DurationMinutes),
      },
      { status: 201 }
    );
  } catch (error) {
    await connection.rollback();
    console.error("Start exam error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to start exam" },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}
