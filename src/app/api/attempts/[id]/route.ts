
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import mysqlPool from "@/lib/mysql";
import { requireRole } from "@/lib/session";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: Context) {
  const session = await requireRole(["ADMIN", "PROCTOR", "STUDENT"]);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { id } = await context.params;
    const attemptId = Number(id);

    if (!Number.isSafeInteger(attemptId) || attemptId <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid attempt ID" },
        { status: 400 }
      );
    }

    const [attempts] = await mysqlPool.execute<RowDataPacket[]>(
      `SELECT
          a.AttemptID,
          a.UserID,
          u.FullName,
          e.ExamID,
          e.Title AS ExamTitle,
          a.StartTime,
          a.EndTime,
          a.Status,
          a.Score
       FROM ATTEMPTS a
       JOIN USERS u ON a.UserID = u.UserID
       JOIN EXAMS e ON a.ExamID = e.ExamID
       WHERE a.AttemptID = ?`,
      [attemptId]
    );

    if (attempts.length === 0) {
      return NextResponse.json(
        { success: false, message: "Attempt not found" },
        { status: 404 }
      );
    }

    const attempt = attempts[0];

    // Students can only view their own attempts.
    if (
      session.role === "STUDENT" &&
      Number(attempt.UserID) !== session.userId
    ) {
      return NextResponse.json(
        { success: false, message: "You cannot view another student's result" },
        { status: 403 }
      );
    }

    // Do not reveal marks or answers while an exam is in progress.
    if (attempt.Status === "IN_PROGRESS") {
      return NextResponse.json({
        success: true,
        message: "Exam is still in progress",
        attempt: {
          attemptId: attempt.AttemptID,
          examTitle: attempt.ExamTitle,
          status: attempt.Status,
          startTime: attempt.StartTime,
        },
      });
    }

    const [answers] = await mysqlPool.execute<RowDataPacket[]>(
      `SELECT
          ans.AnswerID,
          ans.QuestionID,
          q.QuestionText,
          ans.Response,
          q.CorrectOption,
          q.Marks,
          ans.MarksAwarded
       FROM ANSWERS ans
       JOIN QUESTIONS q ON ans.QuestionID = q.QuestionID
       WHERE ans.AttemptID = ?
       ORDER BY ans.AnswerID ASC`,
      [attemptId]
    );

    return NextResponse.json({
      success: true,
      attempt,
      answers,
    });
  } catch (error) {
    console.error("Get attempt result error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to retrieve attempt result" },
      { status: 500 }
    );
  }
}
