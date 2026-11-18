
import { NextResponse } from "next/server";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import mysqlPool from "@/lib/mysql";
import { requireRole } from "@/lib/session";

type Context = {
  params: Promise<{ id: string }>;
};

const questionSchema = z.object({
  questionText: z.string().trim().min(5).max(5000),
  optionA: z.string().trim().min(1).max(500),
  optionB: z.string().trim().min(1).max(500),
  optionC: z.string().trim().min(1).max(500),
  optionD: z.string().trim().min(1).max(500),
  correctOption: z.enum(["A", "B", "C", "D"]),
  marks: z.number().int().positive().max(100),
});

// GET: View questions belonging to an exam.
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
    const examId = Number(id);

    if (!Number.isSafeInteger(examId) || examId <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid exam ID" },
        { status: 400 }
      );
    }

    // Students must never receive the correct answers.
    const columns =
      session.role === "ADMIN" || session.role === "PROCTOR"
        ? "QuestionID, QuestionText, OptionA, OptionB, OptionC, OptionD, CorrectOption, Marks"
        : "QuestionID, QuestionText, OptionA, OptionB, OptionC, OptionD, Marks";

    const [questions] = await mysqlPool.execute<RowDataPacket[]>(
      `SELECT ${columns}
       FROM QUESTIONS
       WHERE ExamID = ?
       ORDER BY QuestionID ASC`,
      [examId]
    );

    return NextResponse.json({
      success: true,
      questions,
    });
  } catch (error) {
    console.error("Get questions error:", error);
    return NextResponse.json(
      { success: false, message: "Unable to retrieve questions" },
      { status: 500 }
    );
  }
}

// POST: Add a question. Only admins can do this.
export async function POST(request: Request, context: Context) {
  const session = await requireRole(["ADMIN"]);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Admin access required" },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const examId = Number(id);

    if (!Number.isSafeInteger(examId) || examId <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid exam ID" },
        { status: 400 }
      );
    }

    const body: unknown = await request.json();
    const validation = questionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid question data",
          errors: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    // Only allow questions to be added before the exam starts.
    const [exams] = await mysqlPool.execute<RowDataPacket[]>(
      `SELECT ExamID
       FROM EXAMS
       WHERE ExamID = ? AND Status IN ('DRAFT', 'SCHEDULED')`,
      [examId]
    );

    if (exams.length === 0) {
      return NextResponse.json(
        { success: false, message: "Exam not found or cannot be edited" },
        { status: 404 }
      );
    }

    const data = validation.data;

    const [result] = await mysqlPool.execute<ResultSetHeader>(
      `INSERT INTO QUESTIONS
       (ExamID, QuestionText, OptionA, OptionB, OptionC, OptionD, CorrectOption, Marks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        examId,
        data.questionText,
        data.optionA,
        data.optionB,
        data.optionC,
        data.optionD,
        data.correctOption,
        data.marks,
      ]
    );

    return NextResponse.json(
      {
        success: true,
        message: "Question added successfully",
        questionId: result.insertId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Add question error:", error);
    return NextResponse.json(
      { success: false, message: "Unable to add question" },
      { status: 500 }
    );
  }
}
