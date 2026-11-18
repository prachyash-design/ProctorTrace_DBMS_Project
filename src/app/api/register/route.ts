
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { ResultSetHeader } from "mysql2";
import mysqlPool from "@/lib/mysql";

const registrationSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(150),
  password: z.string().min(8).max(72),
});

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    // Validate registration details
    const validation = registrationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid registration details.",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { fullName, email, password } = validation.data;
    const normalizedEmail = email.toLowerCase();

    // Hash the password before saving it
    const passwordHash = await bcrypt.hash(password, 12);

    // Public registration always creates a STUDENT
    const [result] = await mysqlPool.execute<ResultSetHeader>(
      `INSERT INTO USERS (FullName, Email, PasswordHash, Role)
       VALUES (?, ?, ?, ?)`,
      [fullName, normalizedEmail, passwordHash, "STUDENT"]
    );

    return NextResponse.json(
      {
        success: true,
        message: "Registration successful!",
        user: {
          userId: result.insertId,
          fullName,
          email: normalizedEmail,
          role: "STUDENT",
        },
      },
      { status: 201 }
    );

  } catch (error: unknown) {
    // Handle duplicate email
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ER_DUP_ENTRY"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "This email is already registered.",
        },
        { status: 409 }
      );
    }

    console.error("Registration error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Registration failed. Please try again.",
      },
      { status: 500 }
    );
  }
}
