
import { NextResponse } from "next/server";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { randomUUID } from "crypto";
import mysqlPool from "@/lib/mysql";
import neo4jDriver from "@/lib/neo4j";
import { requireRole } from "@/lib/session";

type Context = {
  params: Promise<{ id: string }>;
};

const eventSchema = z.object({
  eventType: z.enum([
    "TAB_SWITCH",
    "WINDOW_BLUR",
    "MULTIPLE_FACE_DETECTED",
    "NO_FACE_DETECTED",
    "FACE_DISAPPEARED",
    "EXAM_EXIT",
    "CAMERA_UNAVAILABLE",
  ]),
  details: z.string().trim().max(1000).optional(),
});

const severityMap = {
  TAB_SWITCH: "MEDIUM",
  WINDOW_BLUR: "LOW",
  MULTIPLE_FACE_DETECTED: "HIGH",
  NO_FACE_DETECTED: "MEDIUM",
  FACE_DISAPPEARED: "MEDIUM",
  EXAM_EXIT: "HIGH",
  CAMERA_UNAVAILABLE: "MEDIUM",
} as const;

export async function POST(request: Request, context: Context) {
  const session = await requireRole(["STUDENT"]);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Student login required" },
      { status: 403 }
    );
  }

  let graphSession;

  try {
    const { id } = await context.params;
    const attemptId = Number(id);

    if (!Number.isSafeInteger(attemptId) || attemptId <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid attempt ID" },
        { status: 400 }
      );
    }

    const validation = eventSchema.safeParse(await request.json());

    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: "Invalid event data" },
        { status: 400 }
      );
    }

    const [attempts] = await mysqlPool.execute<RowDataPacket[]>(
      `SELECT AttemptID, UserID, ExamID, Status
       FROM ATTEMPTS
       WHERE AttemptID = ? AND UserID = ?`,
      [attemptId, session.userId]
    );

    if (attempts.length === 0) {
      return NextResponse.json(
        { success: false, message: "Attempt not found" },
        { status: 404 }
      );
    }

    const attempt = attempts[0];

    if (attempt.Status !== "IN_PROGRESS") {
      return NextResponse.json(
        { success: false, message: "This exam attempt is not active" },
        { status: 409 }
      );
    }

    const { eventType, details } = validation.data;
    const eventId = randomUUID();
    const severity = severityMap[eventType];

    graphSession = neo4jDriver.session();

    await graphSession.run(
      `
      MERGE (u:User {userId: $userId})
      MERGE (e:Exam {examId: $examId})
      MERGE (a:Attempt {attemptId: $attemptId})

      SET u.role = 'STUDENT',
          a.status = 'IN_PROGRESS'

      MERGE (u)-[:MADE]->(a)
      MERGE (a)-[:FOR_EXAM]->(e)

      CREATE (ev:MonitoringEvent {
        eventId: $eventId,
        eventType: $eventType,
        severity: $severity,
        details: $details,
        eventTime: datetime({timezone: 'UTC'}),
        timestamp: datetime({timezone: 'UTC'})
      })

      MERGE (a)-[:GENERATED]->(ev)

      RETURN ev.eventId AS eventId
      `,
      {
        userId: session.userId,
        examId: Number(attempt.ExamID),
        attemptId,
        eventId,
        eventType,
        severity,
        details: details || "No additional details",
      }
    );

    return NextResponse.json(
      {
        success: true,
        message: "Monitoring event recorded successfully",
        eventId,
        eventType,
        severity,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Monitoring event error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to record monitoring event" },
      { status: 500 }
    );
  } finally {
    if (graphSession) {
      await graphSession.close();
    }
  }
}
