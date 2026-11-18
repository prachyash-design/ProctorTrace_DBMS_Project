
import { NextResponse } from "next/server";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import mysqlPool from "@/lib/mysql";
import { requireRole } from "@/lib/session";

const examSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(5000).optional(),
  durationMinutes: z.number().int().positive().max(600),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
});

interface ExamRow extends RowDataPacket {
  ExamID: number;
  Title: string;
  Description: string | null;
  DurationMinutes: number;
  StartTime: Date;
  EndTime: Date;
  Status: string;
  CreatedBy: number;
}

// View exams: Admin and Proctor
export async function GET() {
  const session = await requireRole(["ADMIN", "PROCTOR", "STUDENT"]);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Access denied." },
      { status: 403 }
    );
  }

  try {
    const [exams] = await mysqlPool.execute<ExamRow[]>(
      `SELECT ExamID, Title, Description, DurationMinutes,
              StartTime, EndTime, Status, CreatedBy
       FROM EXAMS
       ORDER BY StartTime DESC`
    );

    return NextResponse.json({
      success: true,
      exams,
    });
  } catch (error) {
    console.error("Fetch exams error:", error);

    return NextResponse.json(
      { success: false, message: "Could not retrieve exams." },
      { status: 500 }
    );
  }
}

// Create exam: Admin only
export async function POST(request: Request) {
  const session = await requireRole(["ADMIN"]);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Only Admins can create exams." },
      { status: 403 }
    );
  }

  try {
    const body: unknown = await request.json();
    const validation = examSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid exam details.",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      title,
      description,
      durationMinutes,
      startTime,
      endTime,
    } = validation.data;

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Please provide valid dates. End time must be after start time.",
        },
        { status: 400 }
      );
    }

    const [result] = await mysqlPool.execute<ResultSetHeader>(
      `INSERT INTO EXAMS
       (Title, Description, DurationMinutes, StartTime, EndTime, CreatedBy, Status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        description ?? null,
        durationMinutes,
        start,
        end,
        session.userId,
        "SCHEDULED",
      ]
    );

    return NextResponse.json(
      {
        success: true,
        message: "Exam created successfully.",
        examId: result.insertId,
      },
      { status: 201 }
    );

  } catch (error) {
    console.error("Create exam error:", error);

    return NextResponse.json(
      { success: false, message: "Could not create exam." },
      { status: 500 }
    );
  }
}
