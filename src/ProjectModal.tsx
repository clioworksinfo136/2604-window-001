import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";
import PhotoModal from "./PhotoModal";

type Location = Schema["Location"]["type"];
type Project = Schema["Project"]["type"];

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Modal listing every Project for a given location (matched by locationid). */
function ProjectModal({
  location,
  onClose,
}: {
  location: Location;
  onClose: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading"
  );
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    project: "",
    phase: "",
    startdate: "",
    enddate: "",
    task: "",
  });
  const [busy, setBusy] = useState(false);
  const [photosFor, setPhotosFor] = useState<Project | null>(null);

  useEffect(() => {
    const sub = client.models.Project.observeQuery({
      filter: { locationid: { eq: location.locationid ?? 0 } },
    }).subscribe({
      next: ({ items }) => {
        setProjects([...items]);
        setStatus("loaded");
      },
      error: (e: unknown) => {
        setError(errMsg(e));
        setStatus("error");
      },
    });
    return () => sub.unsubscribe();
  }, [location.locationid]);

  function startEdit(p: Project) {
    setEditingId(p.id);
    setDraft({
      project: p.project ?? "",
      phase: p.phase ?? "",
      startdate: p.startdate ?? "",
      enddate: p.enddate ?? "",
      task: p.task ?? "",
    });
  }

  async function save() {
    if (!editingId) return;
    if (!draft.phase.trim()) {
      alert("Phase is required.");
      return;
    }
    setBusy(true);
    try {
      const { errors } = await client.models.Project.update({
        id: editingId,
        project: draft.project,
        phase: draft.phase,
        // AWSDate wants YYYY-MM-DD or null — never an empty string.
        startdate: draft.startdate || null,
        enddate: draft.enddate || null,
        task: draft.task,
      });
      if (errors?.length) {
        alert("Could not save: " + errors.map((e) => e.message).join("; "));
        return;
      }
      setEditingId(null);
    } catch (e) {
      alert("Could not save: " + errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeProject(p: Project) {
    if (!window.confirm(`Delete project "${p.project ?? ""}"?`)) return;
    try {
      await client.models.Project.delete({ id: p.id });
    } catch (e) {
      alert("Could not delete project: " + errMsg(e));
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Projects"
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
          width: "min(860px, 100%)",
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
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>
            Projects · Location {location.locationid}
          </h2>
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
          <p style={{ color: "#b00020" }}>Failed to load projects: {error}</p>
        )}
        {status === "loaded" && projects.length === 0 && (
          <p>No projects at this location yet.</p>
        )}

        {status === "loaded" && projects.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellHead}>Project</th>
                <th style={cellHead}>Phase</th>
                <th style={cellHead}>Start</th>
                <th style={cellHead}>End</th>
                <th style={cellHead}>Task</th>
                <th style={{ ...cellHead, width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) =>
                editingId === p.id ? (
                  <tr key={p.id}>
                    <td style={cell}>
                      <input
                        style={editInput}
                        value={draft.project}
                        onChange={(e) =>
                          setDraft({ ...draft, project: e.target.value })
                        }
                      />
                    </td>
                    <td style={cell}>
                      <input
                        style={editInput}
                        value={draft.phase}
                        onChange={(e) =>
                          setDraft({ ...draft, phase: e.target.value })
                        }
                      />
                    </td>
                    <td style={cell}>
                      <input
                        type="date"
                        style={editInput}
                        value={draft.startdate}
                        onChange={(e) =>
                          setDraft({ ...draft, startdate: e.target.value })
                        }
                      />
                    </td>
                    <td style={cell}>
                      <input
                        type="date"
                        style={editInput}
                        value={draft.enddate}
                        onChange={(e) =>
                          setDraft({ ...draft, enddate: e.target.value })
                        }
                      />
                    </td>
                    <td style={cell}>
                      <input
                        style={editInput}
                        value={draft.task}
                        onChange={(e) =>
                          setDraft({ ...draft, task: e.target.value })
                        }
                      />
                    </td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>
                      <button style={actionBtn} onClick={save} disabled={busy}>
                        Save
                      </button>
                      <button
                        style={actionBtn}
                        onClick={() => setEditingId(null)}
                        disabled={busy}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id}>
                    <td style={cell}>{p.project ?? ""}</td>
                    <td style={cell}>{p.phase ?? ""}</td>
                    <td style={cell}>{p.startdate ?? ""}</td>
                    <td style={cell}>{p.enddate ?? ""}</td>
                    <td style={cell}>{p.task ?? ""}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>
                      <button
                        style={actionBtn}
                        onClick={() => startEdit(p)}
                        disabled={editingId !== null}
                      >
                        Modify
                      </button>
                      <button
                        style={actionBtn}
                        onClick={() => setPhotosFor(p)}
                        disabled={editingId !== null}
                      >
                        Photos
                      </button>
                      <button
                        style={{ ...actionBtn, color: "#b00020" }}
                        onClick={() => removeProject(p)}
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

      {photosFor && (
        <PhotoModal project={photosFor} onClose={() => setPhotosFor(null)} />
      )}
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

const editInput: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "4px 6px",
  fontSize: "0.9rem",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontFamily: "inherit",
};

const actionBtn: React.CSSProperties = {
  background: "#fff",
  color: "#222",
  border: "1px solid #ddd",
  borderRadius: 6,
  padding: "3px 9px",
  marginRight: 5,
  fontSize: "0.82rem",
  cursor: "pointer",
};

export default ProjectModal;
