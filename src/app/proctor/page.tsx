
"use client";

import { useEffect, useState } from "react";

type Report = {
  ReportID: number;
  AttemptID: number;
  AnomalyType: string;
  EventCount: number;
  Severity: string;
  Status: string;
  StudentName: string;
  ExamTitle: string;
  ReviewNotes: string | null;
};

export default function ProctorDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function loadReports() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/anomaly-reports");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to load reports");
      }

      setReports(data.reports || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load reports");
    } finally {
      setLoading(false);
    }
  }

  async function reviewReport(
    reportId: number,
    status: "REVIEWED" | "DISMISSED"
  ) {
    const reviewNotes = (notes[reportId] || "").trim();

    if (reviewNotes.length < 3) {
      setMessage("Please enter at least 3 characters in review notes.");
      return;
    }

    setSaving(reportId);
    setMessage("");

    try {
      const response = await fetch(`/api/anomaly-reports/${reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNotes }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Review failed");
      }

      setMessage(data.message || "Review saved successfully.");
      setNotes((current) => ({ ...current, [reportId]: "" }));
      await loadReports();
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Unable to review report"
      );
    } finally {
      setSaving(null);
    }
  }

  useEffect(() => {
    loadReports();
  }, []);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="dashboard-container">
      <header className="dashboard-header">
        <h1>ProctorTrace</h1>
        <button onClick={logout}>Logout</button>
      </header>

      <section className="dashboard-content">
        <h2>Proctor Dashboard</h2>
        <p>Monitoring and anomaly reports</p>

        <button onClick={loadReports} disabled={loading}>
          {loading ? "Loading..." : "Refresh Reports"}
        </button>

        {message && <p>{message}</p>}
        {loading && <p>Loading reports...</p>}
        {error && <p className="error-message">{error}</p>}

        {!loading && !error && reports.length === 0 && (
          <p>No anomaly reports found.</p>
        )}

        <div className="exam-grid">
          {reports.map((report) => (
            <article className="exam-card" key={report.ReportID}>
              <h3>Report #{report.ReportID}</h3>
              <p>Student: {report.StudentName}</p>
              <p>Exam: {report.ExamTitle}</p>
              <p>Attempt ID: {report.AttemptID}</p>
              <p>Events: {report.AnomalyType}</p>
              <p>Event count: {report.EventCount}</p>
              <p>Severity: {report.Severity}</p>
              <p>Status: {report.Status}</p>

              {report.ReviewNotes && (
                <p>Review notes: {report.ReviewNotes}</p>
              )}

              {report.Status === "PENDING" && (
                <div style={{ marginTop: "15px" }}>
                  <label>Review Notes</label>
                  <textarea
                    rows={3}
                    value={notes[report.ReportID] || ""}
                    onChange={(e) =>
                      setNotes((current) => ({
                        ...current,
                        [report.ReportID]: e.target.value,
                      }))
                    }
                    placeholder="Enter your observations and review decision..."
                    minLength={3}
                  />

                  <button
                    onClick={() => reviewReport(report.ReportID, "REVIEWED")}
                    disabled={saving === report.ReportID}
                  >
                    {saving === report.ReportID ? "Saving..." : "Mark Reviewed"}
                  </button>

                  {" "}

                  <button
                    onClick={() => reviewReport(report.ReportID, "DISMISSED")}
                    disabled={saving === report.ReportID}
                  >
                    Dismiss Report
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
