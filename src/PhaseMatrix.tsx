import { useEffect, useRef, useState } from "react";
import { getUrl } from "aws-amplify/storage";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";
import PhotoCarousel from "./PhotoCarousel";

type Project = Schema["Project"]["type"];
type Task = Schema["Task"]["type"];
type Phase = Schema["Phase"]["type"];
type Photo = Schema["Photo"]["type"];

/**
 * "Phase" button. Picking a project opens a grid with the phases across the
 * top and that project's tasks down the side; each cell holds the photos for
 * that task/phase pair, with their notes.
 */
function PhaseMatrix() {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);

  useEffect(() => {
    const sub = client.models.Project.observeQuery().subscribe({
      next: ({ items }) => setProjects([...items]),
      error: () => setProjects([]),
    });
    return () => sub.unsubscribe();
  }, []);

  const sortedProjects = [...projects].sort((a, b) =>
    (a.project ?? "").localeCompare(b.project ?? "")
  );

  return (
    <>
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 40,
            padding: "0 16px",
            borderRadius: 10,
            border: "1px solid #e0e0e0",
            background: open ? "#1a73e8" : "#fff",
            color: open ? "#fff" : "#222",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 12px rgba(0, 0, 0, 0.25)",
            whiteSpace: "nowrap",
          }}
        >
          Phase
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              marginTop: 6,
              zIndex: 4,
              minWidth: 220,
              maxHeight: "60vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 10,
              boxShadow: "0 4px 18px rgba(0, 0, 0, 0.3)",
              padding: 6,
            }}
          >
            {sortedProjects.length === 0 ? (
              <div
                style={{
                  padding: "8px 10px",
                  color: "#888",
                  fontSize: "0.85rem",
                }}
              >
                No projects yet.
              </div>
            ) : (
              sortedProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelected(p);
                    setOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    borderRadius: 6,
                    padding: "7px 10px",
                    font: "inherit",
                    fontSize: "0.88rem",
                    color: "#222",
                    cursor: "pointer",
                  }}
                >
                  {p.project || "(untitled)"}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selected && (
        <MatrixModal project={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

/** Phases across the top, tasks down the side, photos in the cells. */
function MatrixModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const resolved = useRef<Set<string>>(new Set());
  // Which cell is open in the carousel, and which photo it started on.
  const [viewer, setViewer] = useState<{
    photos: Photo[];
    startId: string;
  } | null>(null);

  useEffect(() => {
    const sub = client.models.Task.observeQuery({
      filter: { projectId: { eq: project.id } },
    }).subscribe({
      next: ({ items }) =>
        setTasks([...items].sort((a, b) => (a.taskid ?? 0) - (b.taskid ?? 0))),
      error: () => setTasks([]),
    });
    return () => sub.unsubscribe();
  }, [project.id]);

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

  useEffect(() => {
    const sub = client.models.Photo.observeQuery().subscribe({
      next: ({ items }) => setPhotos([...items]),
      error: () => setPhotos([]),
    });
    return () => sub.unsubscribe();
  }, []);

  // Resolve a signed URL for each photo not fetched yet.
  useEffect(() => {
    let active = true;
    (async () => {
      for (const p of photos) {
        if (!p.path || resolved.current.has(p.path)) continue;
        resolved.current.add(p.path);
        try {
          const { url } = await getUrl({ path: p.path });
          if (!active) return;
          setUrls((u) => ({ ...u, [p.path]: url.toString() }));
        } catch {
          resolved.current.delete(p.path);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [photos]);

  /** Photos in a cell: a task only carries photos under its own phase. */
  function cellPhotos(task: Task, phaseName: string) {
    if ((task.phase ?? "") !== phaseName) return [];
    return photos
      .filter((p) => p.taskId === task.id)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Phase matrix"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 30,
        background: "rgba(0, 0, 0, 0.45)",
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
          width: "min(1100px, 100%)",
          maxHeight: "88vh",
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
            marginBottom: "0.9rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>
            Phases · {project.project || "Project"}
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

        {tasks.length === 0 ? (
          <p style={{ color: "#888" }}>This project has no tasks yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                borderCollapse: "collapse",
                width: "100%",
                tableLayout: "fixed",
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...headCell, width: 150 }}>Task</th>
                  {phases.map((ph) => (
                    <th key={ph.id} style={headCell}>
                      {ph.phase}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <th style={rowHead}>
                      {t.task || "(untitled task)"}
                      <div
                        style={{
                          fontWeight: 400,
                          color: "#888",
                          fontSize: "0.74rem",
                        }}
                      >
                        {t.phase}
                      </div>
                    </th>
                    {phases.map((ph) => {
                      const mine = cellPhotos(t, ph.phase ?? "");
                      return (
                        <td key={ph.id} style={bodyCell}>
                          {mine.length === 0 ? (
                            <span style={{ color: "#ccc", fontSize: "0.75rem" }}>
                              —
                            </span>
                          ) : (
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 6,
                              }}
                            >
                              {mine.map((photo) => (
                                <figure
                                  key={photo.id}
                                  style={{
                                    margin: 0,
                                    width: 96,
                                    border: "1px solid #e4e4e7",
                                    borderRadius: 8,
                                    overflow: "hidden",
                                  }}
                                >
                                  {photo.path && urls[photo.path] ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setViewer({
                                          photos: mine,
                                          startId: photo.id,
                                        })
                                      }
                                      title="Open viewer"
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        padding: 0,
                                        border: "none",
                                        background: "transparent",
                                        cursor: "pointer",
                                      }}
                                    >
                                      <img
                                        src={urls[photo.path]}
                                        alt={photo.note ?? "Photo"}
                                        style={{
                                          width: "100%",
                                          height: 64,
                                          objectFit: "cover",
                                          display: "block",
                                        }}
                                      />
                                    </button>
                                  ) : (
                                    <div
                                      style={{
                                        height: 64,
                                        background: "#f4f4f6",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "#aaa",
                                        fontSize: "0.65rem",
                                      }}
                                    >
                                      Loading…
                                    </div>
                                  )}
                                  <figcaption
                                    style={{
                                      padding: "4px 5px",
                                      fontSize: "0.7rem",
                                      color: "#333",
                                      lineHeight: 1.3,
                                    }}
                                  >
                                    {photo.note?.trim() || (
                                      <em style={{ color: "#aaa" }}>No note</em>
                                    )}
                                  </figcaption>
                                </figure>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewer && (
        <PhotoCarousel
          photos={viewer.photos}
          urls={urls}
          startId={viewer.startId}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

const headCell: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "2px solid #ddd",
  borderLeft: "1px solid #f0f0f0",
  padding: "6px 8px",
  fontWeight: 600,
  fontSize: "0.82rem",
  verticalAlign: "bottom",
};

const rowHead: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #eee",
  padding: "8px",
  fontWeight: 700,
  fontSize: "0.82rem",
  verticalAlign: "top",
};

const bodyCell: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  borderLeft: "1px solid #f0f0f0",
  padding: "8px",
  verticalAlign: "top",
};

export default PhaseMatrix;
