import { useEffect, useRef, useState } from "react";
import { getUrl } from "aws-amplify/storage";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";
import { photoDate } from "./PhotoCarousel";

type Project = Schema["Project"]["type"];
type Task = Schema["Task"]["type"];
type Photo = Schema["Photo"]["type"];

type SortKey = "date" | "note";

/**
 * Top-centre "Project" button. Picking a project from its dropdown opens a
 * gallery of every photo on that project, grouped by task, each with its note.
 * Photos within a task can be sorted by note or by date.
 */
function ProjectGallery() {
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
          }}
        >
          Project
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
        <GalleryModal project={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

/** Every photo on a project, grouped by task. */
function GalleryModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [sorts, setSorts] = useState<Record<string, SortKey>>({});
  const resolved = useRef<Set<string>>(new Set());

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

  function photosFor(taskId: string, sort: SortKey) {
    const mine = photos.filter((p) => p.taskId === taskId);
    return mine.sort((a, b) => {
      if (sort === "note") {
        const an = (a.note ?? "").trim();
        const bn = (b.note ?? "").trim();
        // Photos without a note sink to the bottom.
        if (!an && bn) return 1;
        if (an && !bn) return -1;
        return an.localeCompare(bn);
      }
      // Newest first.
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
  }

  const totalPhotos = photos.filter((p) =>
    tasks.some((t) => t.id === p.taskId)
  ).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Project photos"
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
          width: "min(860px, 100%)",
          maxHeight: "86vh",
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
            Photos · {project.project || "Project"}{" "}
            <span
              style={{ color: "#888", fontWeight: 400, fontSize: "0.85rem" }}
            >
              {totalPhotos} photo{totalPhotos === 1 ? "" : "s"}
            </span>
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

        {tasks.length === 0 && (
          <p style={{ color: "#888" }}>This project has no tasks yet.</p>
        )}

        {tasks.map((t) => {
          const sort = sorts[t.id] ?? "date";
          const mine = photosFor(t.id, sort);
          return (
            <section key={t.id} style={{ marginBottom: "1.4rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  borderBottom: "1px solid #eee",
                  paddingBottom: 6,
                  marginBottom: 10,
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {t.task || "(untitled task)"}{" "}
                  <span
                    style={{
                      color: "#888",
                      fontWeight: 400,
                      fontSize: "0.82rem",
                    }}
                  >
                    {t.phase} · {mine.length} photo
                    {mine.length === 1 ? "" : "s"}
                  </span>
                </div>
                {mine.length > 1 && (
                  <label
                    style={{
                      fontSize: "0.78rem",
                      color: "#555",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Sort by
                    <select
                      value={sort}
                      onChange={(e) =>
                        setSorts((s) => ({
                          ...s,
                          [t.id]: e.target.value as SortKey,
                        }))
                      }
                      style={{
                        fontSize: "0.78rem",
                        padding: "2px 4px",
                        border: "1px solid #ccc",
                        borderRadius: 5,
                        fontFamily: "inherit",
                      }}
                    >
                      <option value="date">Date</option>
                      <option value="note">Note</option>
                    </select>
                  </label>
                )}
              </div>

              {mine.length === 0 ? (
                <div style={{ color: "#999", fontSize: "0.82rem" }}>
                  No photos for this task.
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(190px, 1fr))",
                    gap: 12,
                  }}
                >
                  {mine.map((photo) => (
                    <figure
                      key={photo.id}
                      style={{
                        margin: 0,
                        border: "1px solid #e4e4e7",
                        borderRadius: 10,
                        overflow: "hidden",
                      }}
                    >
                      {photo.path && urls[photo.path] ? (
                        <a
                          href={urls[photo.path]}
                          target="_blank"
                          rel="noreferrer"
                          title="Open full size"
                        >
                          <img
                            src={urls[photo.path]}
                            alt={photo.note ?? "Project photo"}
                            style={{
                              width: "100%",
                              height: 140,
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                        </a>
                      ) : (
                        <div
                          style={{
                            height: 140,
                            background: "#f4f4f6",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#999",
                            fontSize: "0.8rem",
                          }}
                        >
                          Loading image…
                        </div>
                      )}
                      <figcaption style={{ padding: 8 }}>
                        <div style={{ fontSize: "0.82rem", color: "#222" }}>
                          {photo.note?.trim() || (
                            <em style={{ color: "#999" }}>No note</em>
                          )}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: "0.72rem",
                            color: "#999",
                          }}
                        >
                          {photoDate(photo.createdAt)}
                        </div>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default ProjectGallery;
