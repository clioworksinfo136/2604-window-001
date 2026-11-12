import { useEffect, useRef, useState } from "react";
import { getUrl, remove, uploadData } from "aws-amplify/storage";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";

type Task = Schema["Task"]["type"];
type Photo = Schema["Photo"]["type"];

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Photos attached to a single task, each with its own note. */
function PhotoModal({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading"
  );
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const resolved = useRef<Set<string>>(new Set());

  // The Photo model only exists once the backend has been deployed; guard so a
  // stale backend shows a message instead of crashing the app.
  const photoModel = client.models.Photo as
    | typeof client.models.Photo
    | undefined;

  useEffect(() => {
    if (!photoModel) {
      setError(
        "Photos need the latest backend. Deploy the Photo model and storage, then reload."
      );
      setStatus("error");
      return;
    }
    const sub = photoModel.observeQuery({
      filter: { taskId: { eq: task.id } },
    }).subscribe({
      next: ({ items }) => {
        setPhotos([...items]);
        setStatus("loaded");
      },
      error: (e: unknown) => {
        setError(errMsg(e));
        setStatus("error");
      },
    });
    return () => sub.unsubscribe();
  }, [task.id, photoModel]);

  // Resolve a signed URL for each photo we haven't fetched yet.
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

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !photoModel) return;
    setUploading(true);
    try {
      for (const file of files) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `photos/${task.id}/${Date.now()}-${safe}`;
        await uploadData({ path, data: file }).result;
        await photoModel.create({
          taskId: task.id,
          path,
          note: "",
        });
      }
    } catch (err) {
      alert("Upload failed: " + errMsg(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function saveNote(photo: Photo) {
    const next = notes[photo.id];
    if (next === undefined || next === (photo.note ?? "") || !photoModel) return;
    try {
      await photoModel.update({ id: photo.id, note: next });
    } catch (e) {
      alert("Could not save note: " + errMsg(e));
    }
  }

  async function deletePhoto(photo: Photo) {
    if (!photoModel) return;
    if (!window.confirm("Delete this photo?")) return;
    try {
      if (photo.path) await remove({ path: photo.path });
    } catch {
      // The object may already be gone; still drop the record.
    }
    try {
      await photoModel.delete({ id: photo.id });
    } catch (e) {
      alert("Could not delete photo: " + errMsg(e));
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photos"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
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
          width: "min(720px, 100%)",
          maxHeight: "85vh",
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
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
            Photos · {task.task ?? "Task"}
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

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#e8f0fe",
            color: "#1a73e8",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: uploading || !photoModel ? "default" : "pointer",
            opacity: uploading || !photoModel ? 0.6 : 1,
            marginBottom: 12,
          }}
        >
          {uploading ? "Uploading…" : "+ Add photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading || !photoModel}
            onChange={handleFiles}
            style={{ display: "none" }}
          />
        </label>

        {status === "loading" && <p>Loading…</p>}
        {status === "error" && (
          <p style={{ color: "#b00020" }}>Failed to load photos: {error}</p>
        )}
        {status === "loaded" && photos.length === 0 && (
          <p style={{ color: "#666" }}>
            No photos yet. Use “+ Add photos” to upload.
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {photos.map((photo) => (
            <div
              key={photo.id}
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 10,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
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

              <div style={{ padding: 8 }}>
                <textarea
                  value={notes[photo.id] ?? photo.note ?? ""}
                  onChange={(e) =>
                    setNotes((n) => ({ ...n, [photo.id]: e.target.value }))
                  }
                  onBlur={() => saveNote(photo)}
                  placeholder="Add a note…"
                  rows={2}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    resize: "vertical",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    padding: "4px 6px",
                    fontSize: "0.82rem",
                    fontFamily: "inherit",
                  }}
                />
                <button
                  type="button"
                  onClick={() => deletePhoto(photo)}
                  style={{
                    marginTop: 6,
                    background: "#fff",
                    color: "#b00020",
                    border: "1px solid #f0c0c8",
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PhotoModal;
