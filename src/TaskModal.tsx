import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";

type Task = Schema["Task"]["type"];

/** Modal popup that lists every row in the Task table. */
function TaskModal({ onClose }: { onClose: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading"
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    client.models.Task.list()
      .then(({ data, errors }) => {
        if (!active) return;
        if (errors?.length) {
          setError(errors.map((e) => e.message).join("; "));
          setStatus("error");
          return;
        }
        setTasks(data ?? []);
        setStatus("loaded");
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tasks"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10,
        background: "rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35)",
          width: "min(560px, 100%)",
          maxHeight: "80vh",
          overflow: "auto",
          padding: "1.25rem",
          textAlign: "left",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.75rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Tasks</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            style={{
              background: "transparent",
              color: "#555",
              border: "none",
              padding: "0 4px",
              fontSize: "1.2rem",
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {status === "loading" && <p>Loading…</p>}
        {status === "error" && (
          <p style={{ color: "#b00020" }}>Failed to load tasks: {error}</p>
        )}
        {status === "loaded" && tasks.length === 0 && <p>No tasks found.</p>}
        {status === "loaded" && tasks.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellHead}>Task ID</th>
                <th style={cellHead}>Task</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td style={cell}>{t.taskid}</td>
                  <td style={cell}>{t.task ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const cellHead: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "2px solid #ddd",
  padding: "8px 10px",
  fontWeight: 600,
};

const cell: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: "8px 10px",
};

export default TaskModal;
