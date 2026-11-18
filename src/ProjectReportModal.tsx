import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { photoDate } from "./PhotoCarousel";
import {
  getPhotoPhase,
  getPhotosForTaskPhase,
  getTaskPhases,
} from "./taskPhases";

type Project = Schema["Project"]["type"];
type Task = Schema["Task"]["type"];
type Phase = Schema["Phase"]["type"];
type Photo = Schema["Photo"]["type"];

/**
 * Waterfall report modal for a single project: phases across the X-axis,
 * the project's tasks down the Y-axis, and each cell showing all photos with
 * their notes.
 */
function ProjectReportModal({
  project,
  tasks,
  phases,
  photos,
  urls,
  viewerOpen,
  onViewPhoto,
  onClose,
}: {
  project: Project;
  tasks: Task[];
  phases: Phase[];
  photos: Photo[];
  urls: Record<string, string>;
  viewerOpen: boolean;
  onViewPhoto: (taskId: string, phase: string, startId: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (viewerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerOpen, onClose]);

  const [hiddenPhases, setHiddenPhases] = useState<Set<string>>(
    () => new Set()
  );
  const [hiddenPhotoIds, setHiddenPhotoIds] = useState<Set<string>>(
    () => new Set()
  );
  const [exportingPdf, setExportingPdf] = useState(false);

  function hideColumn(phaseName: string) {
    setHiddenPhases((prev) => {
      const next = new Set(prev);
      next.add(phaseName);
      return next;
    });
  }

  function hidePhoto(photoId: string) {
    setHiddenPhotoIds((prev) => {
      const next = new Set(prev);
      next.add(photoId);
      return next;
    });
  }

  function showAll() {
    setHiddenPhases(new Set());
    setHiddenPhotoIds(new Set());
  }

  const projectTasks = tasks
    .filter((t) => t.projectId === project.id)
    .sort((a, b) => (a.taskid ?? 0) - (b.taskid ?? 0));
  const taskById = new Map(projectTasks.map((t) => [t.id, t]));

  // Ordered phases from the Phase table, plus any extra phase names referenced
  // by tasks or photos on this project so no task's photos are ever omitted.
  const phaseColumns: string[] = [];
  for (const ph of phases) {
    const name = (ph.phase ?? "").trim();
    if (name && !phaseColumns.includes(name)) phaseColumns.push(name);
  }
  for (const t of projectTasks) {
    for (const name of getTaskPhases(t, photos, phases)) {
      if (name && !phaseColumns.includes(name)) phaseColumns.push(name);
    }
  }

  const visiblePhaseColumns = phaseColumns.filter(
    (name) => !hiddenPhases.has(name)
  );
  const visiblePhaseSet = new Set(visiblePhaseColumns);

  const visibleProjectPhotos = photos.filter((p) => {
    if (!p.taskId || hiddenPhotoIds.has(p.id)) return false;
    const owner = taskById.get(p.taskId);
    if (!owner) return false;
    return visiblePhaseSet.has(getPhotoPhase(p, owner));
  });
  const totalPhotos = visibleProjectPhotos.length;
  const hiddenCount = hiddenPhases.size + hiddenPhotoIds.size;

  async function handleExportPdf() {
    if (exportingPdf) return;
    const rawTitle = (project.project || "Project").trim();
    const safeTitle =
      rawTitle.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") ||
      "Project";
    const fileName = `Report-${safeTitle}.pdf`;

    type SavePickerWindow = Window & {
      showSaveFilePicker?: (options?: {
        suggestedName?: string;
        types?: {
          description?: string;
          accept: Record<string, string[]>;
        }[];
      }) => Promise<{
        createWritable: () => Promise<{
          write: (data: Blob) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    };

    let fileHandle:
      | {
          createWritable: () => Promise<{
            write: (data: Blob) => Promise<void>;
            close: () => Promise<void>;
          }>;
        }
      | null = null;

    const picker = (window as SavePickerWindow).showSaveFilePicker;
    if (typeof picker === "function") {
      try {
        fileHandle = await picker({
          suggestedName: fileName,
          types: [
            {
              description: "PDF Document",
              accept: { "application/pdf": [".pdf"] },
            },
          ],
        });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        fileHandle = null;
      }
    }

    setExportingPdf(true);
    try {
      const { exportReportPdf } = await import("./reportPdf");
      await exportReportPdf({
        project,
        projectTasks,
        visiblePhaseColumns,
        visiblePhotos: visibleProjectPhotos,
        urls,
        fileHandle,
        fileName,
      });
    } catch (err: unknown) {
      alert(
        "Could not generate PDF: " +
          (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setExportingPdf(false);
    }
  }

  function cellPhotos(task: Task, phaseName: string) {
    return getPhotosForTaskPhase(task, phaseName, visibleProjectPhotos);
  }

  return (
    <div
      className="report-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Report for ${project.project || "project"}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 30,
        background: "rgba(0, 0, 0, 0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "36px 16px 24px",
        boxSizing: "border-box",
        animation: "report-backdrop-fade 180ms ease-out",
      }}
    >
      <div
        className="report-waterfall-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 12px 36px rgba(0, 0, 0, 0.35)",
          width: "min(1140px, 100%)",
          maxHeight: "calc(100vh - 60px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          textAlign: "left",
          color: "#222",
          transformOrigin: "top center",
          animation:
            "report-waterfall-drop 320ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "1rem 1.25rem 0.85rem",
            borderBottom: "1px solid #eee",
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.12rem", color: "#222" }}>
              Report · {project.project || "Project"}
            </h2>
            <div style={{ marginTop: 2, fontSize: "0.78rem", color: "#777" }}>
              {projectTasks.length} task{projectTasks.length === 1 ? "" : "s"} ·{" "}
              {totalPhotos} photo{totalPhotos === 1 ? "" : "s"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={showAll}
                style={{
                  background: "#e8f0fe",
                  color: "#1a73e8",
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Show all ({hiddenCount} hidden)
              </button>
            )}
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exportingPdf}
              title="Generate and save PDF report"
              style={{
                background: "#1a73e8",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "5px 12px",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: exportingPdf ? "default" : "pointer",
                opacity: exportingPdf ? 0.7 : 1,
              }}
            >
              {exportingPdf ? "Generating…" : "PDF"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close report"
              title="Close"
              style={{
                background: "transparent",
                color: "#555",
                border: "none",
                padding: "4px 6px",
                fontSize: "1.2rem",
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ overflow: "auto", padding: "0.75rem 1.25rem 1.25rem" }}>
          {projectTasks.length === 0 ? (
            <p style={{ color: "#888", margin: "0.5rem 0" }}>
              This project has no tasks yet.
            </p>
          ) : phaseColumns.length === 0 ? (
            <p style={{ color: "#888", margin: "0.5rem 0" }}>
              No phases defined yet.
            </p>
          ) : visiblePhaseColumns.length === 0 ? (
            <p style={{ color: "#888", margin: "0.5rem 0" }}>
              All phase columns are hidden.
            </p>
          ) : (
            <table
              style={{
                borderCollapse: "collapse",
                width: "100%",
                minWidth: Math.max(360, 170 + visiblePhaseColumns.length * 180),
                tableLayout: "fixed",
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...headCell, width: 170, borderLeft: "none" }}>
                    Task \ Phase
                  </th>
                  {visiblePhaseColumns.map((phaseName) => (
                    <th key={phaseName} style={headCell}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {phaseName}
                        </span>
                        <input
                          type="checkbox"
                          checked={!hiddenPhases.has(phaseName)}
                          onChange={() => hideColumn(phaseName)}
                          title={`Uncheck to hide ${phaseName}`}
                          aria-label={`Show ${phaseName} column`}
                          style={{
                            margin: 0,
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projectTasks.map((t, idx) => {
                  const taskPhases = getTaskPhases(t, photos, phases);
                  const taskPhaseSet = new Set(taskPhases);
                  return (
                    <tr
                      key={t.id}
                      className="report-waterfall-row"
                      style={{
                        animation: "report-row-cascade 260ms ease-out both",
                        animationDelay: `${Math.min(idx * 40, 320)}ms`,
                      }}
                    >
                      <th style={rowHead}>
                        <div>{t.task || `Task ${t.taskid}`}</div>
                        {taskPhases.length > 0 && (
                          <div
                            style={{
                              marginTop: 2,
                              fontWeight: 400,
                              color: "#888",
                              fontSize: "0.73rem",
                            }}
                          >
                            {taskPhases.join(", ")}
                          </div>
                        )}
                      </th>
                      {visiblePhaseColumns.map((phaseName) => {
                        const isTaskPhase = taskPhaseSet.has(phaseName);
                        const mine = cellPhotos(t, phaseName);
                        return (
                          <td
                            key={phaseName}
                            style={{
                              ...bodyCell,
                              background: isTaskPhase ? "#f8fbff" : "#fff",
                            }}
                          >
                            {!isTaskPhase ? (
                              <span
                                style={{ color: "#d0d0d5", fontSize: "0.75rem" }}
                              >
                                —
                              </span>
                            ) : mine.length === 0 ? (
                              <span
                                style={{ color: "#999", fontSize: "0.74rem" }}
                              >
                                No photos
                              </span>
                            ) : (
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 8,
                                }}
                              >
                                {mine.map((photo) => (
                                  <figure
                                    key={photo.id}
                                    style={{
                                      margin: 0,
                                      width: 112,
                                      border: "1px solid #e4e4e7",
                                      borderRadius: 8,
                                      overflow: "hidden",
                                      background: "#fff",
                                    }}
                                  >
                                    {photo.path && urls[photo.path] ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onViewPhoto(t.id, phaseName, photo.id)
                                        }
                                        title="Open photo viewer"
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
                                        alt={photo.note ?? "Task photo"}
                                        style={{
                                          width: "100%",
                                          height: 74,
                                          objectFit: "cover",
                                          display: "block",
                                        }}
                                      />
                                    </button>
                                  ) : (
                                    <div
                                      style={{
                                        height: 74,
                                        background: "#f4f4f6",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "#aaa",
                                        fontSize: "0.66rem",
                                      }}
                                    >
                                      Loading…
                                    </div>
                                  )}
                                  <figcaption
                                    style={{
                                      padding: "5px 6px",
                                      fontSize: "0.72rem",
                                      color: "#333",
                                      lineHeight: 1.3,
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "flex-start",
                                        justifyContent: "space-between",
                                        gap: 6,
                                      }}
                                    >
                                      <span
                                        style={{
                                          flex: 1,
                                          minWidth: 0,
                                          whiteSpace: "pre-wrap",
                                          wordBreak: "break-word",
                                        }}
                                      >
                                        {photo.note?.trim() || (
                                          <em style={{ color: "#aaa" }}>
                                            No note
                                          </em>
                                        )}
                                      </span>
                                      <input
                                        type="checkbox"
                                        checked={!hiddenPhotoIds.has(photo.id)}
                                        onChange={() => hidePhoto(photo.id)}
                                        title="Uncheck to hide photo in report"
                                        aria-label="Show photo in report"
                                        style={{
                                          margin: "1px 0 0",
                                          cursor: "pointer",
                                          flexShrink: 0,
                                        }}
                                      />
                                    </div>
                                    <div
                                      style={{
                                        marginTop: 3,
                                        color: "#999",
                                        fontSize: "0.65rem",
                                      }}
                                    >
                                      {photoDate(photo.createdAt)}
                                    </div>
                                  </figcaption>
                                </figure>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const headCell: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: "#fff",
  textAlign: "left",
  borderBottom: "2px solid #ddd",
  borderLeft: "1px solid #f0f0f0",
  padding: "8px 10px",
  fontWeight: 600,
  fontSize: "0.82rem",
  color: "#222",
  verticalAlign: "bottom",
};

const rowHead: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #eee",
  padding: "10px 8px",
  fontWeight: 700,
  fontSize: "0.82rem",
  color: "#222",
  verticalAlign: "top",
  wordBreak: "break-word",
};

const bodyCell: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  borderLeft: "1px solid #f0f0f0",
  padding: "8px 10px",
  verticalAlign: "top",
};

export default ProjectReportModal;
