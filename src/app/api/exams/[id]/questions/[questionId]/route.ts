
import { NextResponse } from "next/server";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import mysqlPool from "@/lib/mysql";
import { requireRole } from "@/lib/session";

type Context = {
  params: Promise<{ id: string; questionId: string }>;
};

const updateSchema = z.object({
  questionText: z.string().trim().min(5).max(5000),
  optionA: z.string().trim().min(1).max(500),
  optionB: z.string().trim().min(1).max(500),
  optionC: z.string().trim().min(1).max(500),
  optionD: z.string().trim().min(1).max(500),
  correctOption: z.enum(["A", "B", "C", "D"]),
  marks: z.number().int().positive().max(100),
});

// PUT: Update an existing question.
export async function PUT(request: Request, context: Context) {
  const session = await requireRole(["ADMIN"]);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Admin access required" },
      { status: 403 }
    );
  }

  try {
    const { id, questionId: questionIdText } = await context.params;
    const examId = Number(id);
    const questionId = Number(questionIdText);

    if (
      !Number.isSafeInteger(examId) || examId <= 0 ||
      !Number.isSafeInteger(questionId) || questionId <= 0
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid exam or question ID" },
        { status: 400 }
      );
    }

    const body: unknown = await request.json();
    const validation = updateSchema.safeParse(body);

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

    const [exams] = await mysqlPool.execute<RowDataPacket[]>(
      `SELECT ExamID FROM EXAMS
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
      `UPDATE QUESTIONS
       SET QuestionText = ?, OptionA = ?, OptionB = ?,
           OptionC = ?, OptionD = ?, CorrectOption = ?, Marks = ?
       WHERE QuestionID = ? AND ExamID = ?`,
      [
        data.questionText,
        data.optionA,
        data.optionB,
        data.optionC,
        data.optionD,
        data.correctOption,
        data.marks,
        questionId,
        examId,
      ]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json(
        { success: false, message: "Question not found in this exam" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Question updated successfully",
    });
  } catch (error) {
    console.error("Update question error:", error);
    return NextResponse.json(
      { success: false, message: "Unable to update question" },
      { status: 500 }
    );
  }
}

// DELETE: Delete a question if no student has answered it.
export async function DELETE(_request: Request, context: Context) {
  const session = await requireRole(["ADMIN"]);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Admin access required" },
      { status: 403 }
    );
  }

  const connection = await mysqlPool.getConnection();

  try {
    const { id, questionId: questionIdText } = await context.params;
    const examId = Number(id);
    const questionId = Number(questionIdText);

    if (
      !Number.isSafeInteger(examId) || examId <= 0 ||
      !Number.isSafeInteger(questionId) || questionId <= 0
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid exam or question ID" },
        { status: 400 }
      );
    }

    await connection.beginTransaction();

    const [exams] = await connection.execute<RowDataPacket[]>(
      `SELECT ExamID FROM EXAMS
       WHERE ExamID = ? AND Status IN ('DRAFT', 'SCHEDULED')
       FOR UPDATE`,
      [examId]
    );

    if (exams.length === 0) {
      await connection.rollback();
      return NextResponse.json(
        { success: false, message: "Exam not found or cannot be edited" },
        { status: 404 }
      );
    }

    const [answers] = await connection.execute<RowDataPacket[]>(
      `SELECT AnswerID FROM ANSWERS
       WHERE QuestionID = ? LIMIT 1`,
      [questionId]
    );

    if (answers.length > 0) {
      await connection.rollback();
      return NextResponse.json(
        {
          success: false,
          message: "Cannot delete this question because student answers already exist",
        },
        { status: 409 }
      );
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `DELETE FROM QUESTIONS
       WHERE QuestionID = ? AND ExamID = ?`,
      [questionId, examId]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return NextResponse.json(
        { success: false, message: "Question not found in this exam" },
        { status: 404 }
      );
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: "Question deleted successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Delete question error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to delete question" },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}
