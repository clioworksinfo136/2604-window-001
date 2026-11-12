import { useEffect, useRef, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";
import PhotoModal from "./PhotoModal";
import TaskModal from "./TaskModal";

type Location = Schema["Location"]["type"];
type Project = Schema["Project"]["type"];
type Phase = Schema["Phase"]["type"];

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Modal listing every Project for a given location (matched by locationid). */
function ProjectModal({
  location,
  onClose,
  autoAdd = false,
}: {
  location: Location;
  onClose: () => void;
  /** Open straight into a blank new-project row. */
  autoAdd?: boolean;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
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
  });
  const [busy, setBusy] = useState(false);
  const [photosFor, setPhotosFor] = useState<Project | null>(null);
  const [tasksFor, setTasksFor] = useState<Project | null>(null);

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

  // Phases come from the Phase table and populate the Phase dropdown.
  useEffect(() => {
    const sub = client.models.Phase.observeQuery().subscribe({
      next: ({ items }) =>
        setPhases(
          [...items].sort((a, b) => (a.phaseid ?? 0) - (b.phaseid ?? 0))
        ),
      error: () => setPhases([]),
    });
    return () => sub.unsubscribe();
  }, []);

  const autoAddDone = useRef(false);
  useEffect(() => {
    if (!autoAdd || autoAddDone.current || phases.length === 0) return;
    autoAddDone.current = true;
    startAdd();
    // startAdd only reads phases, which this effect already waits for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdd, phases]);

  // Phase order follows phaseid; keep any existing value as an option.
  const phaseNames = phases.map((p) => p.phase ?? "").filter((p) => p !== "");
  const phaseOptions = phaseNames.includes(draft.phase)
    ? phaseNames
    : draft.phase
      ? [...phaseNames, draft.phase]
      : phaseNames;

  const phaseSelect = (
    <select
      style={editInput}
      value={draft.phase}
      onChange={(e) => setDraft({ ...draft, phase: e.target.value })}
    >
      <option value="">— select —</option>
      {phaseOptions.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  );

  function startEdit(p: Project) {
    setEditingId(p.id);
    setDraft({
      project: p.project ?? "",
      phase: p.phase ?? "",
      startdate: p.startdate ?? "",
      enddate: p.enddate ?? "",
    });
  }

  function startAdd() {
    setEditingId("new");
    setDraft({
      project: "",
      // Default to the first configured phase so the required field starts valid.
      phase: phases[0]?.phase ?? "",
      startdate: "",
      enddate: "",
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
      // AWSDate wants YYYY-MM-DD or null — never an empty string.
      const fields = {
        project: draft.project,
        phase: draft.phase,
        startdate: draft.startdate || null,
        enddate: draft.enddate || null,
      };
      const { errors } =
        editingId === "new"
          ? await client.models.Project.create({
              locationid: location.locationid ?? 0,
              ...fields,
            })
          : await client.models.Project.update({ id: editingId, ...fields });
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

  /** Options for a row's phase dropdown, keeping its current value listed. */
  function rowPhaseOptions(current: string) {
    return current && !phaseNames.includes(current)
      ? [...phaseNames, current]
      : phaseNames;
  }

  /** Change a project's phase straight from the row, without entering edit mode. */
  async function changePhase(p: Project, phase: string) {
    if (!phase) return; // phase is required — ignore the placeholder
    try {
      const { errors } = await client.models.Project.update({
        id: p.id,
        phase,
      });
      if (errors?.length) {
        alert(
          "Could not update phase: " + errors.map((e) => e.message).join("; ")
        );
      }
    } catch (e) {
      alert("Could not update phase: " + errMsg(e));
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: "1.15rem" }}>
              Projects · Location {location.locationid}
            </h2>
            <button
              type="button"
              onClick={startAdd}
              title="Add project"
              aria-label="Add project"
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
              Add project
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
          <p style={{ color: "#b00020" }}>Failed to load projects: {error}</p>
        )}
        {status === "loaded" &&
          projects.length === 0 &&
          editingId !== "new" && (
            <p>No projects at this location yet. Click “Add project”.</p>
          )}

        {status === "loaded" && (projects.length > 0 || editingId === "new") && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellHead}>Project</th>
                <th style={{ ...cellHead, minWidth: 150 }}>Phase</th>
                <th style={cellHead}>Start</th>
                <th style={cellHead}>End</th>
                <th style={{ ...cellHead, width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {editingId === "new" && (
                <tr key="new">
                  <td style={cell}>
                    <input
                      style={editInput}
                      value={draft.project}
                      placeholder="Project name"
                      autoFocus
                      onChange={(e) =>
                        setDraft({ ...draft, project: e.target.value })
                      }
                    />
                  </td>
                  <td style={cell}>
                    {phaseSelect}
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
              )}
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
                      {phaseSelect}
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
                    <td style={cell}>
                      <select
                        style={editInput}
                        value={p.phase ?? ""}
                        disabled={editingId !== null}
                        onChange={(e) => changePhase(p, e.target.value)}
                      >
                        {!p.phase && <option value="">— select —</option>}
                        {rowPhaseOptions(p.phase ?? "").map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={cell}>{p.startdate ?? ""}</td>
                    <td style={cell}>{p.enddate ?? ""}</td>
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
                        onClick={() => setTasksFor(p)}
                        disabled={editingId !== null}
                      >
                        Tasks
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
      {tasksFor && (
        <TaskModal project={tasksFor} onClose={() => setTasksFor(null)} />
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
