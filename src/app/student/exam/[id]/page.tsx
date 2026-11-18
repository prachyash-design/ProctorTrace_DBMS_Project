
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

type Question = {
  QuestionID: number;
  QuestionText: string;
  OptionA: string;
  OptionB: string;
  OptionC: string;
  OptionD: string;
  Marks: number;
};

export default function ExamPage() {
  const params = useParams();
  const router = useRouter();
  const examId = String(params.id);

  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const recordEvent = useCallback(async (eventType: string) => {
    if (!attemptId) return;

    try {
      await fetch(`/api/attempts/${attemptId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType }),
        keepalive: true,
      });
    } catch (err) {
      console.error("Monitoring event could not be recorded:", err);
    }
  }, [attemptId]);

  useEffect(() => {
    async function startExam() {
      try {
        const response = await fetch(`/api/exams/${examId}/start`, {
          method: "POST",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to start exam");
        }

        const id = data.attemptId ?? data.attempt?.AttemptID;
        if (!id) throw new Error("Attempt ID missing from server response");

        setAttemptId(Number(id));

        const questionResponse = await fetch(
          `/api/exams/${examId}/questions`
        );
        const questionData = await questionResponse.json();

        if (!questionResponse.ok) {
          throw new Error(questionData.message || "Unable to load questions");
        }

        setQuestions(
          Array.isArray(questionData)
            ? questionData
            : questionData.questions || []
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to start exam");
      } finally {
        setLoading(false);
      }
    }

    startExam();
  }, [examId]);

  useEffect(() => {
    if (!attemptId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void recordEvent("TAB_SWITCH");
      }
    };

    const handleBlur = () => {
      void recordEvent("WINDOW_BLUR");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [attemptId, recordEvent]);

  async function submitExam() {
    if (!attemptId) return;

    const confirmed = window.confirm("Are you sure you want to submit?");
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: Object.entries(answers).map(([questionId, response]) => ({
            questionId: Number(questionId),
            response,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Submission failed");
      }

      alert("Exam submitted successfully!");
      router.push("/student");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Submission failed");
    }
  }

  if (loading) {
    return <main className="dashboard-container">Loading exam...</main>;
  }

  if (error) {
    return <main className="dashboard-container">{error}</main>;
  }

  return (
    <main className="dashboard-container">
      <section className="dashboard-content">
        <h1>Online Examination</h1>

        {questions.map((question, index) => (
          <article className="exam-card" key={question.QuestionID}>
            <h3>
              Question {index + 1} ({question.Marks} marks)
            </h3>
            <p>{question.QuestionText}</p>

            {(["A", "B", "C", "D"] as const).map((option) => (
              <label key={option} className="answer-option">
                <input
                  type="radio"
                  name={`question-${question.QuestionID}`}
                  checked={answers[question.QuestionID] === option}
                  onChange={() =>
                    setAnswers((previous) => ({
                      ...previous,
                      [question.QuestionID]: option,
                    }))
                  }
                />
                {option}. {question[`Option${option}`]}
              </label>
            ))}
          </article>
        ))}

        <button onClick={submitExam} disabled={!attemptId}>
          Submit Examination
        </button>
      </section>
    </main>
  );
}
