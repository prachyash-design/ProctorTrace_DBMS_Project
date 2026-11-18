
import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import { z } from "zod";

import mysqlPool  from "@/lib/mysql";
import  neo4jDriver from "@/lib/neo4j";
import { requireRole } from "@/lib/session";

type Context = {
  params: Promise<{ id: string }>;
};

const attemptSchema = z.object({
  id: z.number().int().positive(),
});

type EventRecord = {
  eventType: string;
  severity: string;
  eventCount: number;
};

export async function POST(
  request: Request,
  context: Context
) {
  const session = await requireRole(["ADMIN", "PROCTOR"]);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Admin or proctor login required" },
      { status: 403 }
    );
  }

  let graphSession;

  try {
    const { id } = await context.params;
    const attemptId = Number(id);

    const validation = attemptSchema.safeParse({
      id: attemptId,
    });

    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: "Invalid attempt ID" },
        { status: 400 }
      );
    }

    // Confirm that the attempt exists.
    const [attempts] = await mysqlPool.execute<RowDataPacket[]>(
      `SELECT AttemptID, UserID, ExamID, Status
       FROM ATTEMPTS
       WHERE AttemptID = ?`,
      [attemptId]
    );

    if (attempts.length === 0) {
      return NextResponse.json(
        { success: false, message: "Attempt not found" },
        { status: 404 }
      );
    }

    // Read monitoring events from Neo4j.
    graphSession = neo4jDriver.session();

    const graphResult = await graphSession.run(
      `
      MATCH (a:Attempt {attemptId: $attemptId})
            -[:GENERATED]->(ev:MonitoringEvent)
      RETURN
        ev.eventType AS eventType,
        ev.severity AS severity,
        count(ev) AS eventCount
      `,
      { attemptId }
    );

    if (graphResult.records.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No monitoring events found for this attempt",
        },
        { status: 404 }
      );
    }

    // Convert Neo4j results into ordinary JavaScript values.
    const eventCounts: EventRecord[] = graphResult.records.map(
      (record) => ({
        eventType: record.get("eventType") as string,
        severity: record.get("severity") as string,
        eventCount: (record.get("eventCount") as { toNumber: () => number }).toNumber(),
      })
    );

    const totalEvents = eventCounts.reduce(
      (total, event) => total + event.eventCount,
      0
    );

    // Initial project severity rules.
    let overallSeverity: string;

    if (totalEvents >= 8) {
      overallSeverity = "CRITICAL";
    } else if (totalEvents >= 5) {
      overallSeverity = "HIGH";
    } else if (totalEvents >= 3) {
      overallSeverity = "MEDIUM";
    } else {
      overallSeverity = "LOW";
    }

    const anomalyTypes = eventCounts
      .map((event) => event.eventType)
      .join(", ");

    // Save the anomaly report in MySQL.
    const [insertResult] = await mysqlPool.execute(
      `INSERT INTO ANOMALY_REPORTS
       (AttemptID, AnomalyType, EventCount, Severity, Status, CreatedAt)
       VALUES (?, ?, ?, ?, 'PENDING', NOW())`,
      [
        attemptId,
        anomalyTypes,
        totalEvents,
        overallSeverity,
      ]
    );

    const reportId = (
      insertResult as { insertId: number }
    ).insertId;

    return NextResponse.json(
      {
        success: true,
        message: "Anomaly analysis completed successfully",
        report: {
          reportId,
          attemptId,
          totalEvents,
          overallSeverity,
          eventCounts,
          status: "PENDING",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Anomaly analysis error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to analyze monitoring events",
      },
      { status: 500 }
    );
  } finally {
    if (graphSession) {
      await graphSession.close();
    }
  }
}
