
import { NextResponse } from "next/server";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import mysqlPool from "@/lib/mysql";
import { requireRole } from "@/lib/session";

type Context = {
  params: Promise<{ id: string }>;
};

const submissionSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.number().int().positive(),
      response: z.enum(["A", "B", "C", "D"]).nullable(),
    })
  ),
});

export async function POST(request: Request, context: Context) {
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
    const attemptId = Number(id);

    if (!Number.isSafeInteger(attemptId) || attemptId <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid attempt ID" },
        { status: 400 }
      );
    }

    const body: unknown = await request.json();
    const validation = submissionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: "Invalid submission data" },
        { status: 400 }
      );
    }

    const submittedAnswers = validation.data.answers;
    const submittedIds = submittedAnswers.map((answer) => answer.questionId);

    if (new Set(submittedIds).size !== submittedIds.length) {
      return NextResponse.json(
        { success: false, message: "Duplicate question IDs are not allowed" },
        { status: 400 }
      );
    }

    await connection.beginTransaction();

    // Lock the attempt and verify that it belongs to this student.
    const [attempts] = await connection.execute<RowDataPacket[]>(
      `SELECT AttemptID, ExamID, Status
       FROM ATTEMPTS
       WHERE AttemptID = ? AND UserID = ?
       FOR UPDATE`,
      [attemptId, session.userId]
    );

    if (attempts.length === 0) {
      await connection.rollback();
      return NextResponse.json(
        { success: false, message: "Attempt not found" },
        { status: 404 }
      );
    }

    const attempt = attempts[0];

    if (attempt.Status !== "IN_PROGRESS") {
      await connection.rollback();
      return NextResponse.json(
        { success: false, message: "This attempt has already been submitted" },
        { status: 409 }
      );
    }

    // Retrieve the correct answers from the database.
    const [questions] = await connection.execute<RowDataPacket[]>(
      `SELECT QuestionID, CorrectOption, Marks
       FROM QUESTIONS
       WHERE ExamID = ?`,
      [attempt.ExamID]
    );

    if (questions.length === 0) {
      await connection.rollback();
      return NextResponse.json(
        { success: false, message: "No questions found for this exam" },
        { status: 409 }
      );
    }

    const questionMap = new Map(
      questions.map((question) => [
        Number(question.QuestionID),
        question,
      ])
    );

    // Reject answers for questions belonging to another exam.
    for (const answer of submittedAnswers) {
      if (!questionMap.has(answer.questionId)) {
        await connection.rollback();
        return NextResponse.json(
          {
            success: false,
            message: `Question ${answer.questionId} does not belong to this exam`,
          },
          { status: 400 }
        );
      }
    }

    const answerMap = new Map(
      submittedAnswers.map((answer) => [
        answer.questionId,
        answer.response,
      ])
    );

    let totalScore = 0;

    // Save an answer row for every question. Missing answers are saved as NULL.
    for (const question of questions) {
      const questionId = Number(question.QuestionID);
      const response = answerMap.get(questionId) ?? null;

      const marks =
        response !== null && response === question.CorrectOption
          ? Number(question.Marks)
          : 0;

      totalScore += marks;

      await connection.execute(
        `INSERT INTO ANSWERS
         (AttemptID, QuestionID, Response, MarksAwarded)
         VALUES (?, ?, ?, ?)`,
        [attemptId, questionId, response, marks]
      );
    }

    // Finish the attempt and save the calculated score.
    await connection.execute(
      `UPDATE ATTEMPTS
       SET Status = 'SUBMITTED',
           EndTime = NOW(),
           Score = ?
       WHERE AttemptID = ?`,
      [totalScore, attemptId]
    );

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: "Exam submitted successfully",
      attemptId,
      totalQuestions: questions.length,
      answeredQuestions: submittedAnswers.filter(
        (answer) => answer.response !== null
      ).length,
      score: totalScore,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Submit exam error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to submit exam" },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}
