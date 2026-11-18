import { NextResponse } from "next/server";
import mysqlPool from "@/lib/mysql";
import neo4jDriver from "@/lib/neo4j";

export async function GET() {
  let session;

  try {
    // Test MySQL
    const [mysqlResult] = await mysqlPool.query(
      "SELECT 1 AS connected"
    );

    // Test Neo4j
    session = neo4jDriver.session();

    const neo4jResult = await session.run(
      "RETURN 1 AS connected"
    );

    return NextResponse.json({
      success: true,
      mysql: "Connected successfully",
      neo4j: "Connected successfully",
    });

  } catch (error) {
    console.error("Database connection error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Database connection failed. Check the server terminal.",
      },
      { status: 500 }
    );

  } finally {
    if (session) {
      await session.close();
    }
  }
}