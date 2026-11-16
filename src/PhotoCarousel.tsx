import { useEffect, useMemo, useRef, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";

type Photo = Schema["Photo"]["type"];

export type SortKey = "date" | "note";

/** A photo date with no hour or minute. */
export function photoDate(createdAt?: string | null) {
  return createdAt ? new Date(createdAt).toLocaleDateString() : "";
}

/** Newest first by date, or alphabetical by note with blank notes last. */
export function sortPhotos(photos: Photo[], sort: SortKey) {
  return [...photos].sort((a, b) => {
    if (sort === "note") {
      const an = (a.note ?? "").trim();
      const bn = (b.note ?? "").trim();
      if (!an && bn) return 1;
      if (an && !bn) return -1;
      return an.localeCompare(bn);
    }
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

/**
 * Full-screen viewer that cycles through a set of photos. The order can be
 * switched between date and note; the photo on screen stays on screen when
 * the order changes.
 */
function PhotoCarousel({
  photos,
  urls,
  startId,
  onClose,
}: {
  photos: Photo[];
  urls: Record<string, string>;
  startId: string;
  onClose: () => void;
}) {
  const [sort, setSort] = useState<SortKey>("date");
  const [currentId, setCurrentId] = useState(startId);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savedValueRef = useRef<Record<string, string>>({});

  const photoModel = client.models.Photo as
    | typeof client.models.Photo
    | undefined;

  const ordered = useMemo(() => sortPhotos(photos, sort), [photos, sort]);
  const index = Math.max(
    0,
    ordered.findIndex((p) => p.id === currentId)
  );
  const photo = ordered[index];

  async function saveNote(targetPhoto: Photo) {
    const next = notes[targetPhoto.id];
    const base =
      savedValueRef.current[targetPhoto.id] ?? targetPhoto.note ?? "";
    if (next === undefined || next === base || !photoModel) return;
    savedValueRef.current[targetPhoto.id] = next;
    setSaving(true);
    try {
      const { errors } = await photoModel.update({
        id: targetPhoto.id,
        note: next,
      });
      if (errors?.length) {
        delete savedValueRef.current[targetPhoto.id];
        alert(
          "Could not save note: " + errors.map((e) => e.message).join("; ")
        );
      }
    } catch (e: unknown) {
      delete savedValueRef.current[targetPhoto.id];
      alert(
        "Could not save note: " + (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (photo) void saveNote(photo);
    onClose();
  }

  function step(delta: number) {
    if (ordered.length === 0) return;
    if (photo) void saveNote(photo);
    const next = (index + delta + ordered.length) % ordered.length;
    setCurrentId(ordered[next].id);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (e.key === "Escape") {
        if (inField) target.blur();
        else handleClose();
      } else if (!inField && e.key === "ArrowLeft") {
        step(-1);
      } else if (!inField && e.key === "ArrowRight") {
        step(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!photo) return null;
  const url = photo.path ? urls[photo.path] : undefined;
  const draftNote = notes[photo.id] ?? photo.note ?? "";
  const baselineNote = savedValueRef.current[photo.id] ?? photo.note ?? "";
  const dirty = draftNote !== baselineNote;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: "rgba(0, 0, 0, 0.82)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 14px",
          color: "#fff",
          flex: "0 0 auto",
        }}
      >
        <span style={{ fontSize: "0.85rem" }}>
          {index + 1} / {ordered.length}
        </span>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: "0.8rem",
          }}
        >
          Sort by
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            style={{
              fontSize: "0.8rem",
              padding: "2px 4px",
              borderRadius: 5,
              border: "1px solid #666",
              fontFamily: "inherit",
            }}
          >
            <option value="date">Date</option>
            <option value="note">Note</option>
          </select>
        </label>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          title="Close (Esc)"
          style={{
            background: "transparent",
            border: "none",
            color: "#fff",
            fontSize: "1.4rem",
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      {/* Stage */}
      <div
        style={{
          flex: "1 1 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          minHeight: 0,
          padding: "0 10px",
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            step(-1);
          }}
          aria-label="Previous photo"
          title="Previous (←)"
          style={arrowBtn}
          disabled={ordered.length < 2}
        >
          ‹
        </button>

        {url ? (
          <img
            onClick={(e) => e.stopPropagation()}
            src={url}
            alt={photo.note ?? "Photo"}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              borderRadius: 6,
            }}
          />
        ) : (
          <div style={{ color: "#bbb", fontSize: "0.9rem" }}>Loading image…</div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            step(1);
          }}
          aria-label="Next photo"
          title="Next (→)"
          style={arrowBtn}
          disabled={ordered.length < 2}
        >
          ›
        </button>
      </div>

      {/* Caption / note editor */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: "0 0 auto",
          padding: "10px 16px 16px",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            width: "min(460px, 100%)",
          }}
        >
          <textarea
            value={draftNote}
            onChange={(e) =>
              setNotes((n) => ({ ...n, [photo.id]: e.target.value }))
            }
            onBlur={() => void saveNote(photo)}
            placeholder="Add a note…"
            rows={2}
            disabled={!photoModel}
            style={{
              flex: "1 1 auto",
              boxSizing: "border-box",
              resize: "vertical",
              border: "1px solid rgba(255, 255, 255, 0.35)",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: "0.88rem",
              fontFamily: "inherit",
              background: "rgba(255, 255, 255, 0.95)",
              color: "#222",
            }}
          />
          <button
            type="button"
            onClick={() => void saveNote(photo)}
            disabled={!dirty || saving || !photoModel}
            style={{
              flex: "0 0 auto",
              height: 34,
              padding: "0 12px",
              borderRadius: 8,
              border: "none",
              background: dirty ? "#1a73e8" : "rgba(255, 255, 255, 0.2)",
              color: "#fff",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: !dirty || saving || !photoModel ? "default" : "pointer",
              opacity: !dirty || saving || !photoModel ? 0.65 : 1,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        <div style={{ fontSize: "0.76rem", color: "#aaa" }}>
          {photoDate(photo.createdAt)}
        </div>
      </div>
    </div>
  );
}

const arrowBtn: React.CSSProperties = {
  flex: "0 0 auto",
  width: 44,
  height: 44,
  borderRadius: "50%",
  border: "none",
  background: "rgba(255, 255, 255, 0.15)",
  color: "#fff",
  fontSize: "1.8rem",
  lineHeight: 1,
  cursor: "pointer",
};

export default PhotoCarousel;
