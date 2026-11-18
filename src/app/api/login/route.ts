
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import mysqlPool from "@/lib/mysql";
import { createSession } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(72),
});

interface UserRow extends RowDataPacket {
  UserID: number;
  FullName: string;
  Email: string;
  PasswordHash: string;
  Role: "ADMIN" | "PROCTOR" | "STUDENT";
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: "Invalid email or password." },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    const [users] = await mysqlPool.execute<UserRow[]>(
      `SELECT UserID, FullName, Email, PasswordHash, Role
       FROM USERS
       WHERE Email = ?
       LIMIT 1`,
      [email.toLowerCase()]
    );

    const user = users[0];

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Invalid email or password." },
        { status: 401 }
      );
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.PasswordHash
    );

    if (!passwordMatches) {
      return NextResponse.json(
        { success: false, message: "Invalid email or password." },
        { status: 401 }
      );
    }

    const token = await createSession({
      userId: user.UserID,
      email: user.Email,
      role: user.Role,
    });

    const response = NextResponse.json({
      success: true,
      message: "Login successful!",
      user: {
        userId: user.UserID,
        fullName: user.FullName,
        email: user.Email,
        role: user.Role,
      },
    });

    response.cookies.set("proctortrace_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return response;

  } catch (error) {
    console.error("Login error:", error);

    return NextResponse.json(
      { success: false, message: "Login failed. Please try again." },
      { status: 500 }
    );
  }
}
