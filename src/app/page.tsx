
"use client";

import { useEffect, useState } from "react";

type AnomalyReport = {
  ReportID: number;
  AttemptID: number;
  AnomalyType: string;
  EventCount: number;
  Severity: string;
  Status: string;
  ReviewNotes: string | null;
  CreatedAt: string;
  StudentName: string;
  ExamTitle: string;
};

type QuestionDraft = {
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: "A" | "B" | "C" | "D";
  marks: string;
};

const emptyQuestion: QuestionDraft = {
  questionText: "",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  correctOption: "A",
  marks: "5",
};

export default function Home() {
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    { ...emptyQuestion },
  ]);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [reports, setReports] = useState<AnomalyReport[]>([]);
  const [reportError, setReportError] = useState("");
  const [reportsLoading, setReportsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch("/api/profile");
        const data = await response.json();

        if (!response.ok || !data.user?.role) {
          window.location.replace("/login");
          return;
        }

        if (data.user.role === "PROCTOR") {
          window.location.replace("/proctor");
          return;
        }

        if (data.user.role === "STUDENT") {
          window.location.replace("/student");
          return;
        }

        if (data.user.role === "ADMIN") {
          setAuthorized(true);
          return;
        }

        window.location.replace("/login");
      } catch {
        window.location.replace("/login");
      } finally {
        setCheckingAuth(false);
      }
    }

    checkAuth();
  }, []);

  async function loadReports() {
    setReportsLoading(true);
    setReportError("");

    try {
      const response = await fetch("/api/anomaly-reports");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load reports");
      }

      setReports(data.reports || []);
    } catch (error) {
      setReportError(
        error instanceof Error ? error.message : "Unable to load reports"
      );
    } finally {
      setReportsLoading(false);
    }
  }
  async function generateReport(attemptId: number) {
  setMessage("Generating anomaly report...");
  try {
    const response = await fetch(`/api/attempts/${attemptId}/analyze`, {
      method: "POST",
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.message || "Report generation failed");
      return;
    }

    setMessage(data.message || "Anomaly report generated successfully!");
    await loadReports();
  } catch {
    setMessage("Unable to generate anomaly report");
  }
}


  useEffect(() => {
    loadReports();
  }, []);

  function updateQuestion(
    index: number,
    field: keyof QuestionDraft,
    value: string
  ) {
    setQuestions((current) =>
      current.map((question, i) =>
        i === index ? { ...question, [field]: value } : question
      )
    );
  }

  function addQuestion() {
    setQuestions((current) => [...current, { ...emptyQuestion }]);
  }

  function removeQuestion(index: number) {
    setQuestions((current) =>
      current.length > 1
        ? current.filter((_, i) => i !== index)
        : current
    );
  }

  async function createExam(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (new Date(endTime) <= new Date(startTime)) {
      setMessage("End time must be later than start time.");
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      if (
        q.questionText.trim().length < 5 ||
        !q.optionA.trim() ||
        !q.optionB.trim() ||
        !q.optionC.trim() ||
        !q.optionD.trim() ||
        !Number.isInteger(Number(q.marks)) ||
        Number(q.marks) < 1 ||
        Number(q.marks) > 100
      ) {
        setMessage(`Please complete all fields for Question ${i + 1}.`);
        return;
      }
    }

    setLoading(true);

    try {
      const response = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          durationMinutes: Number(durationMinutes),
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Could not create exam");
        return;
      }

      const examId = data.examId;

      if (!examId) {
        setMessage("Exam was created, but its ID was not returned.");
        return;
      }

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];

        const questionResponse = await fetch(
          `/api/exams/${examId}/questions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              questionText: q.questionText,
              optionA: q.optionA,
              optionB: q.optionB,
              optionC: q.optionC,
              optionD: q.optionD,
              correctOption: q.correctOption,
              marks: Number(q.marks),
            }),
          }
        );

        const questionData = await questionResponse.json();

        if (!questionResponse.ok) {
          setMessage(
            `Exam #${examId} was created, but Question ${i + 1} could not be saved: ${
              questionData.message || "Unknown error"
            }. Please contact support before creating another exam.`
          );
          return;
        }
      }

      setMessage(
        `Exam and ${questions.length} question(s) created successfully! Exam ID: ${examId}`
      );

      setTitle("");
      setDescription("");
      setDurationMinutes("60");
      setStartTime("");
      setEndTime("");
      setQuestions([{ ...emptyQuestion }]);
    } catch {
      setMessage("Unable to create exam. Check the entered dates and server.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (checkingAuth || !authorized) {
    return <main className="dashboard-container">Checking login...</main>;
  }

  return (
    <main className="dashboard-container">
      <header className="dashboard-header">
        <h1>ProctorTrace — Admin</h1>
        <button onClick={logout}>Logout</button>
      </header>

      <section className="dashboard-content">
        <h2>Admin Dashboard</h2>
        <p>Manage examinations and monitor student activity.</p>

        <form onSubmit={createExam} className="auth-card">
          <h2>Create New Examination</h2>

          <label>Exam Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter exam title"
            minLength={3}
            required
          />

          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter exam description"
          />

          <label>Duration (minutes)</label>
          <input
            type="number"
            min="1"
            max="600"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            required
          />

          <label>Start Date and Time</label>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />

          <label>End Date and Time</label>
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />

          <hr />

          <h2>Examination Questions</h2>

          {questions.map((question, index) => (
            <section
              key={index}
              className="exam-card"
              style={{ marginTop: "20px", padding: "20px" }}
            >
              <h3>Question {index + 1}</h3>

              <label>Question Text</label>
              <textarea
                value={question.questionText}
                onChange={(e) =>
                  updateQuestion(index, "questionText", e.target.value)
                }
                placeholder="Enter your question"
                minLength={5}
                required
              />

              <label>Option A</label>
              <input
                value={question.optionA}
                onChange={(e) =>
                  updateQuestion(index, "optionA", e.target.value)
                }
                required
              />

              <label>Option B</label>
              <input
                value={question.optionB}
                onChange={(e) =>
                  updateQuestion(index, "optionB", e.target.value)
                }
                required
              />

              <label>Option C</label>
              <input
                value={question.optionC}
                onChange={(e) =>
                  updateQuestion(index, "optionC", e.target.value)
                }
                required
              />

              <label>Option D</label>
              <input
                value={question.optionD}
                onChange={(e) =>
                  updateQuestion(index, "optionD", e.target.value)
                }
                required
              />

              <label>Correct Option</label>
              <select
                value={question.correctOption}
                onChange={(e) =>
                  updateQuestion(index, "correctOption", e.target.value)
                }
              >
                <option value="A">Option A</option>
                <option value="B">Option B</option>
                <option value="C">Option C</option>
                <option value="D">Option D</option>
              </select>

              <label>Marks</label>
              <input
                type="number"
                min="1"
                max="100"
                value={question.marks}
                onChange={(e) =>
                  updateQuestion(index, "marks", e.target.value)
                }
                required
              />

              <button
                type="button"
                onClick={() => removeQuestion(index)}
                disabled={questions.length === 1 || loading}
              >
                Remove Question
              </button>
            </section>
          ))}

          <button
            type="button"
            onClick={addQuestion}
            disabled={loading}
            style={{ marginTop: "15px" }}
          >
            + Add Another Question
          </button>

          <hr />

          <button type="submit" disabled={loading}>
            {loading ? "Creating Exam and Questions..." : "Create Exam"}
          </button>

          {message && <p>{message}</p>}
        </form>

        <section className="auth-card" style={{ marginTop: "30px" }}>
          <h2>Student Anomaly Reports</h2>
          <p>View monitoring events and reports generated for student exams.</p>
         <div style={{ marginTop: "15px" }}>
  <label>Enter Attempt ID</label>
  <input
    type="number"
    id="attemptId"
    min="1"
    placeholder="Enter attempt ID"
  />
  <button
    type="button"
    onClick={() => {
      const input = document.getElementById("attemptId") as HTMLInputElement;
      const id = Number(input.value);

      if (Number.isInteger(id) && id > 0) {
        generateReport(id);
      } else {
        setMessage("Please enter a valid Attempt ID.");
      }
    }}
  >
    Generate Anomaly Report
  </button>
  {message && <p>{message}</p>}
</div>
          <button onClick={loadReports} disabled={reportsLoading}>
            {reportsLoading ? "Loading..." : "Refresh Reports"}
          </button>

          {reportError && <p className="error-message">{reportError}</p>}

          {!reportsLoading && !reportError && reports.length === 0 && (
            <p>No anomaly reports available yet.</p>
          )}

          {reports.map((report) => (
            <article
              key={report.ReportID}
              className="exam-card"
              style={{ marginTop: "20px" }}
            >
              <h3>Report #{report.ReportID}</h3>
              <p><strong>Student:</strong> {report.StudentName}</p>
              <p><strong>Exam:</strong> {report.ExamTitle}</p>
              <p><strong>Attempt ID:</strong> {report.AttemptID}</p>
              <p><strong>Events:</strong> {report.AnomalyType}</p>
              <p><strong>Event count:</strong> {report.EventCount}</p>
              <p><strong>Severity:</strong> {report.Severity}</p>
              <p><strong>Status:</strong> {report.Status}</p>
              <p>
                <strong>Created:</strong>{" "}
                {new Date(report.CreatedAt).toLocaleString()}
              </p>
              <p>
                <strong>Review notes:</strong>{" "}
                {report.ReviewNotes || "No review notes"}
              </p>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
