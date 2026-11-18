"use client";

import { useEffect, useState } from "react";

type Exam = {
  ExamID: number;
  Title: string;
  Description: string | null;
  DurationMinutes: number;
  Status: string;
};

export default function StudentDashboard() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadExams() {
      try {
        const response = await fetch("/api/exams", {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to load exams");
        }

        setExams(data.exams ?? []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load exams"
        );
      } finally {
        setLoading(false);
      }
    }

    loadExams();
  }, []);

  return (
    <main className="dashboard-container">
      <header className="dashboard-header">
        <h1>ProctorTrace</h1>
        <button
          onClick={async () => {
            await fetch("/api/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        >
          Logout
        </button>
      </header>

      <section className="dashboard-content">
        <h2>Student Dashboard</h2>
        <p>Available examinations</p>

        {loading && <p>Loading examinations...</p>}
        {error && <p className="error-message">{error}</p>}

        {!loading && !error && exams.length === 0 && (
          <p>No examinations available.</p>
        )}

        <div className="exam-grid">
          {exams.map((exam) => (
            <article className="exam-card" key={exam.ExamID}>
              <h3>{exam.Title}</h3>
              <p>{exam.Description}</p>
              <p>Duration: {exam.DurationMinutes} minutes</p>
              <p>Status: {exam.Status}</p>
              <a href={`/student/exam/${exam.ExamID}`}>
                View Exam
              </a>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}