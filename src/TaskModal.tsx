import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";

type Task = Schema["Task"]["type"];

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Modal popup listing every Task row with add / edit / delete. */
function TaskModal({ onClose }: { onClose: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading"
  );
  const [error, setError] = useState("");

  // Inline editor state. editingId is a task's id, "new" for a new row, or null.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTaskId, setDraftTaskId] = useState("");
  const [draftTask, setDraftTask] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sub = client.models.Task.observeQuery().subscribe({
      next: ({ items }) => {
        setTasks([...items]);
        setStatus("loaded");
      },
      error: (e: unknown) => {
        setError(errMsg(e));
        setStatus("error");
      },
    });
    return () => sub.unsubscribe();
  }, []);

  function startAdd() {
    const nextId = tasks.length
      ? Math.max(...tasks.map((t) => t.taskid ?? 0)) + 1
      : 1;
    setEditingId("new");
    setDraftTaskId(String(nextId));
    setDraftTask("");
  }

  function startEdit(t: Task) {
    setEditingId(t.id);
    setDraftTaskId(String(t.taskid ?? ""));
    setDraftTask(t.task ?? "");
  }

  function cancel() {
    setEditingId(null);
  }

  async function save() {
    const idNum = Number.parseInt(draftTaskId, 10);
    if (Number.isNaN(idNum)) {
      alert("Task ID must be a number.");
      return;
    }
    setBusy(true);
    try {
      if (editingId === "new") {
        await client.models.Task.create({ taskid: idNum, task: draftTask });
      } else if (editingId) {
        await client.models.Task.update({
          id: editingId,
          taskid: idNum,
          task: draftTask,
        });
      }
      setEditingId(null);
    } catch (e) {
      alert("Save failed: " + errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: Task) {
    if (!window.confirm(`Delete task ${t.taskid ?? ""}?`)) return;
    try {
      await client.models.Task.delete({ id: t.id });
    } catch (e) {
      alert("Delete failed: " + errMsg(e));
    }
  }

  const editorRow = (
    <tr>
      <td style={cell}>
        <input
          type="number"
          value={draftTaskId}
          onChange={(e) => setDraftTaskId(e.target.value)}
          style={{ ...editInput, width: 80 }}
        />
      </td>
      <td style={cell}>
        <input
          type="text"
          value={draftTask}
          onChange={(e) => setDraftTask(e.target.value)}
          placeholder="Task"
          style={editInput}
          autoFocus
        />
      </td>
      <td style={{ ...cell, whiteSpace: "nowrap" }}>
        <button style={actionBtn} onClick={save} disabled={busy}>
          Save
        </button>
        <button style={actionBtn} onClick={cancel} disabled={busy}>
          Cancel
        </button>
      </td>
    </tr>
  );

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
          width: "min(620px, 100%)",
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Tasks</h2>
            <button
              type="button"
              onClick={startAdd}
              title="Add task"
              aria-label="Add task"
              disabled={editingId !== null}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 30,
                padding: "0 12px",
                borderRadius: 999,
                border: "none",
                background: "#e8f0fe",
                color: "#1a73e8",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: editingId !== null ? "default" : "pointer",
                opacity: editingId !== null ? 0.5 : 1,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v8M8 12h8" />
              </svg>
              Add task
            </button>
          </div>
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

        {status !== "loading" && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellHead}>Task ID</th>
                <th style={cellHead}>Task</th>
                <th style={{ ...cellHead, width: 150 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {editingId === "new" && editorRow}
              {tasks.length === 0 && editingId !== "new" && (
                <tr>
                  <td style={cell} colSpan={3}>
                    No tasks yet. Click + to add one.
                  </td>
                </tr>
              )}
              {tasks.map((t) =>
                editingId === t.id ? (
                  <EditorRowWrapper key={t.id}>{editorRow}</EditorRowWrapper>
                ) : (
                  <tr key={t.id}>
                    <td style={cell}>{t.taskid}</td>
                    <td style={cell}>{t.task ?? ""}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>
                      <button
                        style={actionBtn}
                        onClick={() => startEdit(t)}
                        disabled={editingId !== null}
                      >
                        Edit
                      </button>
                      <button
                        style={{ ...actionBtn, color: "#b00020" }}
                        onClick={() => remove(t)}
                        disabled={editingId !== null}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Renders the shared editor row markup in place of an existing row.
function EditorRowWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
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

const editInput: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "4px 6px",
  fontSize: "0.95rem",
  border: "1px solid #ccc",
  borderRadius: 6,
};

const actionBtn: React.CSSProperties = {
  background: "#fff",
  color: "#222",
  border: "1px solid #ddd",
  borderRadius: 6,
  padding: "3px 10px",
  marginRight: 6,
  fontSize: "0.85rem",
  cursor: "pointer",
};

export default TaskModal;
