import { useEffect, useRef, useState } from "react";
import { getUrl, uploadData } from "aws-amplify/storage";
import { InfoWindow, Map, Marker } from "@vis.gl/react-google-maps";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";
import PhotoCarousel, { photoDate } from "./PhotoCarousel";
import ProjectReportModal from "./ProjectReportModal";
import {
  buildPhotoStoragePath,
  createPhotoInPhase,
  createTaskWithPhases,
  getPhotosForTaskPhase,
  getTaskPhases,
  orderPhaseNames,
  updateTaskWithPhases,
} from "./taskPhases";

type Location = Schema["Location"]["type"];
type Project = Schema["Project"]["type"];
type Task = Schema["Task"]["type"];
type Phase = Schema["Phase"]["type"];
type Photo = Schema["Photo"]["type"];

/** Editable fields on a location (coordinates come from the map pin). */
export type LocationEdits = {
  locationid: number;
  address: string;
  contact: string;
  phone: string;
  email: string;
  comments: string;
};

const EMPTY_DRAFT = {
  locationid: "",
  address: "",
  contact: "",
  phone: "",
  email: "",
  comments: "",
};

// Hollywood, Florida
const HOLLYWOOD_FL = { lat: 26.0112, lng: -80.1495 };

/** Full-viewport map canvas with the Hollywood marker and an optional
 * searched-location marker. Must be rendered inside an <APIProvider>. */
function MapView({
  searched,
  picking = false,
  onMapClick,
  locations = [],
  onDeleteLocation,
  onAddProject,
  onUpdateLocation,
}: {
  searched: google.maps.LatLngLiteral | null;
  picking?: boolean;
  onMapClick?: (latLng: google.maps.LatLngLiteral) => void;
  locations?: Location[];
  onDeleteLocation?: (location: Location) => void;
  onAddProject?: (location: Location) => void;
  onUpdateLocation?: (
    location: Location,
    edits: LocationEdits
  ) => Promise<void> | void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const resolved = useRef<Set<string>>(new Set());
  const [viewer, setViewer] = useState<{
    taskId: string;
    phase: string;
    startId: string;
  } | null>(null);
  const [reportProjectId, setReportProjectId] = useState<string | null>(null);

  // All projects, tasks, phases, and photos, so the popup can expand projects
  // into tasks, add tasks inline, and show/upload task photos.
  useEffect(() => {
    const sub = client.models.Project.observeQuery().subscribe({
      next: ({ items }) => setProjects([...items]),
      error: () => setProjects([]),
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = client.models.Task.observeQuery().subscribe({
      next: ({ items }) => setTasks([...items]),
      error: () => setTasks([]),
    });
    return () => sub.unsubscribe();
  }, []);

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
    const photoModel = client.models.Photo as
      | typeof client.models.Photo
      | undefined;
    if (!photoModel) return;
    const sub = photoModel.observeQuery().subscribe({
      next: ({ items }) => setPhotos([...items]),
      error: () => setPhotos([]),
    });
    return () => sub.unsubscribe();
  }, []);
  // Closing the hover card is delayed slightly: the card is drawn right
  // above the dot, so a brief mouseout as it opens must not close it.
  const hoverTimer = useRef<number | null>(null);

  function showHover(id: string) {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setHoveredId(id);
  }

  function hideHover() {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setHoveredId(null);
      hoverTimer.current = null;
    }, 150);
  }

  useEffect(
    () => () => {
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    },
    []
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  // Resolve against the live list so the popup reflects the latest data.
  const selected = locations.find((l) => l.id === selectedId) ?? null;
  const selectedLocationId = selected?.locationid ?? null;
  const reportProject = reportProjectId
    ? (projects.find((p) => p.id === reportProjectId) ?? null)
    : null;

  // Resolve signed S3 URLs for photos belonging to the selected location's
  // tasks or an open project report.
  useEffect(() => {
    if (selectedLocationId === null && !reportProjectId) return;
    const projectIds = new Set<string>();
    if (selectedLocationId !== null) {
      for (const p of projects) {
        if (p.locationid === selectedLocationId) projectIds.add(p.id);
      }
    }
    if (reportProjectId) projectIds.add(reportProjectId);
    const taskIds = new Set(
      tasks
        .filter((t) => t.projectId && projectIds.has(t.projectId))
        .map((t) => t.id)
    );
    let active = true;
    (async () => {
      for (const p of photos) {
        if (!p.taskId || !taskIds.has(p.taskId)) continue;
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
  }, [selectedLocationId, reportProjectId, projects, tasks, photos]);
  // Hover preview, suppressed while that same point's popup is already open.
  const hovered =
    hoveredId && hoveredId !== selectedId
      ? (locations.find((l) => l.id === hoveredId) ?? null)
      : null;

  function startEdit(l: Location) {
    setDraft({
      locationid: String(l.locationid ?? ""),
      address: l.address ?? "",
      contact: l.contact ?? "",
      phone: l.phone ?? "",
      email: l.email ?? "",
      comments: l.comments ?? "",
    });
    setEditing(true);
  }

  async function saveLocation() {
    if (!selected) return;
    const idNum = Number.parseInt(draft.locationid, 10);
    // locationid is a 32-bit GraphQL Int.
    if (!Number.isInteger(idNum) || idNum > 2147483647 || idNum < -2147483648) {
      alert("Location ID must be a whole number within the 32-bit range.");
      return;
    }
    setBusy(true);
    try {
      await onUpdateLocation?.(selected, {
        locationid: idNum,
        address: draft.address,
        contact: draft.contact,
        phone: draft.phone,
        email: draft.email,
        comments: draft.comments,
      });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh" }}>
      <Map
        defaultCenter={HOLLYWOOD_FL}
        defaultZoom={14}
        gestureHandling="greedy"
        disableDefaultUI={false}
        draggableCursor={picking ? "crosshair" : undefined}
        onClick={(e) => {
          const latLng = e.detail.latLng;
          if (latLng) onMapClick?.(latLng);
        }}
      >
        {locations.map((location) =>
          location.latitude != null && location.longitude != null ? (
            <Marker
              key={location.id}
              position={{ lat: location.latitude, lng: location.longitude }}
              onMouseOver={() => showHover(location.id)}
              onMouseOut={hideHover}
              onClick={() => {
                setSelectedId(location.id);
                setEditing(false);
              }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: "#e00",
                fillOpacity: 1,
                strokeColor: "#fff",
                strokeWeight: 2,
              }}
            />
          ) : null
        )}

        {hovered &&
          hovered.latitude != null &&
          hovered.longitude != null && (
            <InfoWindow
              position={{ lat: hovered.latitude, lng: hovered.longitude }}
              pixelOffset={[0, -18]}
              disableAutoPan
              headerDisabled
            >
              <HoverCard location={hovered} />
            </InfoWindow>
          )}

        {selected &&
          selected.latitude != null &&
          selected.longitude != null && (
            <InfoWindow
              position={{ lat: selected.latitude, lng: selected.longitude }}
              onCloseClick={() => {
                setSelectedId(null);
                setEditing(false);
              }}
            >
              {editing ? (
                <LocationEditor
                  draft={draft}
                  setDraft={setDraft}
                  busy={busy}
                  onSave={saveLocation}
                  onCancel={() => setEditing(false)}
                />
              ) : (
                <>
              <LocationDetails
                location={selected}
                onEdit={() => startEdit(selected)}
              />
              <ProjectList
                key={selected.id}
                projects={projects.filter(
                  (p) => p.locationid === selected.locationid
                )}
                tasks={tasks}
                phases={phases}
                photos={photos}
                urls={urls}
                onViewPhoto={(taskId, phase, startId) =>
                  setViewer({ taskId, phase, startId })
                }
                onOpenReport={(projectId) => setReportProjectId(projectId)}
              />
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => onAddProject?.(selected)}
                  style={{
                    background: "#e8f0fe",
                    color: "#1a73e8",
                    border: "none",
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteLocation?.(selected)}
                  style={{
                    background: "#fff",
                    color: "#b00020",
                    border: "1px solid #f0c0c8",
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
                </>
              )}
            </InfoWindow>
          )}

        {searched && <Marker position={searched} title="Search result" />}
      </Map>

      {reportProject && (
        <ProjectReportModal
          key={reportProject.id}
          project={reportProject}
          tasks={tasks}
          phases={phases}
          photos={photos}
          urls={urls}
          viewerOpen={viewer !== null}
          onViewPhoto={(taskId, phase, startId) =>
            setViewer({ taskId, phase, startId })
          }
          onClose={() => setReportProjectId(null)}
        />
      )}

      {viewer && (() => {
        const viewerTask = tasks.find((t) => t.id === viewer.taskId);
        const viewerPhotos = viewerTask
          ? getPhotosForTaskPhase(viewerTask, viewer.phase, photos)
          : [];
        return (
          <PhotoCarousel
            photos={viewerPhotos}
            urls={urls}
            startId={viewer.startId}
            onClose={() => setViewer(null)}
          />
        );
      })()}
    </div>
  );
}

function LocationDetails({
  location,
  onEdit,
}: {
  location: Location;
  onEdit?: () => void;
}) {
  // The popup is headed by the address, with the contact beneath it.
  // Falls back to the location number only when there is no address.
  const heading = location.address || `Location ${location.locationid}`;

  return (
    <div style={{ minWidth: 180, color: "#222", fontSize: "0.85rem" }}>
      <button
        type="button"
        onClick={onEdit}
        title="Click to edit this location"
        style={{
          display: "block",
          textAlign: "left",
          background: "transparent",
          border: "none",
          padding: 0,
          font: "inherit",
          fontWeight: 700,
          color: "#1a73e8",
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          cursor: "pointer",
        }}
      >
        {heading}
      </button>
      {location.contact && (
        <div style={{ marginTop: 2, color: "#555" }}>{location.contact}</div>
      )}
      {!location.address && !location.contact && (
        <div style={{ marginTop: 2, color: "#777" }}>No details yet.</div>
      )}
    </div>
  );
}

/** Projects at this point, listed under the heading. Clicking a project
 * expands or collapses its tasks beneath it, and clicking a task expands or
 * collapses that task's details and photos beneath the task. */
function ProjectList({
  projects,
  tasks,
  phases,
  photos,
  urls,
  onViewPhoto,
  onOpenReport,
}: {
  projects: Project[];
  tasks: Task[];
  phases: Phase[];
  photos: Photo[];
  urls: Record<string, string>;
  onViewPhoto: (taskId: string, phase: string, startId: string) => void;
  onOpenReport: (projectId: string) => void;
}) {
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [activePhaseByTask, setActivePhaseByTask] = useState<
    Record<string, string>
  >({});
  const [addingProjectId, setAddingProjectId] = useState<string | null>(null);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskPhases, setNewTaskPhases] = useState<string[]>([]);
  const [newTaskCustomPhase, setNewTaskCustomPhase] = useState("");
  const [savingTask, setSavingTask] = useState(false);

  const phaseNames = phases
    .map((ph) => (ph.phase ?? "").trim())
    .filter(Boolean);

  function toggleProject(projectId: string, projectTasks: Task[]) {
    const closing = expandedProjectIds.has(projectId);
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
    if (closing && projectTasks.some((t) => t.id === expandedTaskId)) {
      setExpandedTaskId(null);
    }
  }

  function startAddTask(projectId: string) {
    setAddingProjectId(projectId);
    setNewTaskName("");
    setNewTaskPhases(phaseNames[0] ? [phaseNames[0]] : []);
    setNewTaskCustomPhase("");
  }

  function toggleNewTaskPhase(name: string) {
    setNewTaskPhases((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  }

  async function saveNewTask(projectId: string, projectTasks: Task[]) {
    const chosenPhases =
      phaseNames.length > 0
        ? orderPhaseNames(newTaskPhases, phases)
        : orderPhaseNames(
            newTaskCustomPhase
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            phases
          );
    if (chosenPhases.length === 0) {
      alert("Select at least one phase.");
      return;
    }
    const nextId = projectTasks.length
      ? Math.max(...projectTasks.map((t) => t.taskid ?? 0)) + 1
      : 1;
    setSavingTask(true);
    try {
      const { errors } = await createTaskWithPhases({
        taskid: nextId,
        task: newTaskName.trim(),
        phases: chosenPhases,
        projectId,
      });
      if (errors?.length) {
        alert(
          "Could not create task: " + errors.map((e) => e.message).join("; ")
        );
        return;
      }
      setAddingProjectId(null);
    } catch (e: unknown) {
      alert(
        "Could not create task: " +
          (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setSavingTask(false);
    }
  }

  if (projects.length === 0) {
    return (
      <div style={{ marginTop: 6, fontSize: "0.8rem", color: "#888" }}>
        No projects yet.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column" }}>
      {projects.map((p) => {
        const open = expandedProjectIds.has(p.id);
        const projectTasks = tasks
          .filter((t) => t.projectId === p.id)
          .sort((a, b) => (a.taskid ?? 0) - (b.taskid ?? 0));

        return (
          <div key={p.id} style={{ borderTop: "1px solid #eee" }}>
            <button
              type="button"
              onClick={() => toggleProject(p.id, projectTasks)}
              aria-expanded={open}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                padding: "4px 0",
                font: "inherit",
                fontSize: "0.8rem",
                fontWeight: open ? 600 : 400,
                color: "#222",
                cursor: "pointer",
              }}
            >
              <span>{p.project || "(untitled)"}</span>
              <span
                aria-hidden="true"
                style={{ color: "#888", fontSize: "0.72rem", lineHeight: 1 }}
              >
                {open ? "▾" : "▸"}
              </span>
            </button>

            {open && (
              <div style={{ paddingBottom: 6 }}>
                {projectTasks.length === 0 ? (
                  <div
                    style={{
                      padding: "2px 0 2px 12px",
                      fontSize: "0.76rem",
                      color: "#888",
                    }}
                  >
                    No tasks yet.
                  </div>
                ) : (
                  projectTasks.map((t) => {
                    const taskOpen = expandedTaskId === t.id;
                    const taskPhotos = photos.filter(
                      (ph) => ph.taskId === t.id
                    );
                    const taskPhases = getTaskPhases(t, taskPhotos, phases);
                    const storedPhase = activePhaseByTask[t.id];
                    const activePhase =
                      storedPhase && taskPhases.includes(storedPhase)
                        ? storedPhase
                        : (taskPhases[0] ?? "");
                    const summaryLabel =
                      taskPhases.length === 0
                        ? ""
                        : taskPhases.length === 1
                          ? taskPhases[0]
                          : `${activePhase} +${taskPhases.length - 1}`;

                    return (
                      <div key={t.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTaskId((prev) =>
                              prev === t.id ? null : t.id
                            )
                          }
                          aria-expanded={taskOpen}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            width: "100%",
                            textAlign: "left",
                            background: "transparent",
                            border: "none",
                            padding: "2px 0 2px 12px",
                            font: "inherit",
                            fontSize: "0.76rem",
                            fontWeight: taskOpen ? 600 : 400,
                            color: "#333",
                            cursor: "pointer",
                          }}
                        >
                          <span>{t.task || `Task ${t.taskid}`}</span>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              color: "#888",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {summaryLabel && <span>{summaryLabel}</span>}
                            <span
                              aria-hidden="true"
                              style={{ fontSize: "0.7rem", lineHeight: 1 }}
                            >
                              {taskOpen ? "▾" : "▸"}
                            </span>
                          </span>
                        </button>

                        {taskOpen && (
                          <TaskDetails
                            task={t}
                            taskPhases={taskPhases}
                            activePhase={activePhase}
                            onSelectPhase={(ph) =>
                              setActivePhaseByTask((prev) => ({
                                ...prev,
                                [t.id]: ph,
                              }))
                            }
                            definedPhases={phases}
                            taskPhotos={taskPhotos}
                            urls={urls}
                            onViewPhoto={(phaseName, startId) =>
                              onViewPhoto(t.id, phaseName, startId)
                            }
                          />
                        )}
                      </div>
                    );
                  })
                )}

                {addingProjectId === p.id ? (
                  <div
                    style={{
                      marginLeft: 12,
                      marginTop: 5,
                      padding: 6,
                      background: "#f8f9fb",
                      border: "1px solid #e4e4e7",
                      borderRadius: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                    }}
                  >
                    <input
                      type="text"
                      value={newTaskName}
                      onChange={(e) => setNewTaskName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveNewTask(p.id, projectTasks);
                        else if (e.key === "Escape") setAddingProjectId(null);
                      }}
                      placeholder="Task name"
                      autoFocus
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "3px 6px",
                        fontSize: "0.76rem",
                        border: "1px solid #ccc",
                        borderRadius: 5,
                        fontFamily: "inherit",
                      }}
                    />
                    {phaseNames.length > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 4,
                        }}
                      >
                        {phaseNames.map((name) => {
                          const checked = newTaskPhases.includes(name);
                          return (
                            <label
                              key={name}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 6px",
                                borderRadius: 999,
                                border: checked
                                  ? "1px solid #1a73e8"
                                  : "1px solid #d4d4d8",
                                background: checked ? "#e8f0fe" : "#fff",
                                color: checked ? "#1a73e8" : "#444",
                                fontSize: "0.72rem",
                                fontWeight: checked ? 600 : 400,
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleNewTaskPhase(name)}
                                style={{ margin: 0, cursor: "pointer" }}
                              />
                              {name}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={newTaskCustomPhase}
                        onChange={(e) => setNewTaskCustomPhase(e.target.value)}
                        placeholder="Phase(s), comma-separated"
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "3px 6px",
                          fontSize: "0.76rem",
                          border: "1px solid #ccc",
                          borderRadius: 5,
                          fontFamily: "inherit",
                        }}
                      />
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => saveNewTask(p.id, projectTasks)}
                        disabled={savingTask}
                        style={{
                          background: "#e8f0fe",
                          color: "#1a73e8",
                          border: "none",
                          borderRadius: 5,
                          padding: "3px 9px",
                          fontSize: "0.74rem",
                          fontWeight: 600,
                          cursor: savingTask ? "default" : "pointer",
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingProjectId(null)}
                        disabled={savingTask}
                        style={{
                          background: "#fff",
                          color: "#444",
                          border: "1px solid #ddd",
                          borderRadius: 5,
                          padding: "3px 9px",
                          fontSize: "0.74rem",
                          fontWeight: 600,
                          cursor: savingTask ? "default" : "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      marginLeft: 12,
                      marginTop: 5,
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => startAddTask(p.id)}
                      style={{
                        background: "#e8f0fe",
                        color: "#1a73e8",
                        border: "none",
                        borderRadius: 5,
                        padding: "3px 9px",
                        fontSize: "0.74rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      New Task
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenReport(p.id)}
                      style={{
                        background: "#fff",
                        color: "#1a73e8",
                        border: "1px solid #c6dafc",
                        borderRadius: 5,
                        padding: "3px 9px",
                        fontSize: "0.74rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      New Report
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Inline details shown directly beneath an expanded task.
 * Displays 1 active phase at a time and only the photos in that phase. */
function TaskDetails({
  task,
  taskPhases,
  activePhase,
  onSelectPhase,
  definedPhases,
  taskPhotos,
  urls,
  onViewPhoto,
}: {
  task: Task;
  taskPhases: string[];
  activePhase: string;
  onSelectPhase: (phase: string) => void;
  definedPhases: Phase[];
  taskPhotos: Photo[];
  urls: Record<string, string>;
  onViewPhoto: (phaseName: string, startId: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [addingPhase, setAddingPhase] = useState(false);
  const [phaseDraft, setPhaseDraft] = useState("");
  const [savingPhase, setSavingPhase] = useState(false);

  const photoModel = client.models.Photo as
    | typeof client.models.Photo
    | undefined;

  const availableToAdd = definedPhases
    .map((ph) => (ph.phase ?? "").trim())
    .filter((name) => name !== "" && !taskPhases.includes(name));

  const phasePhotos = activePhase
    ? getPhotosForTaskPhase(task, activePhase, taskPhotos)
    : [];

  function openAddPhase() {
    setPhaseDraft(availableToAdd[0] ?? "");
    setAddingPhase(true);
  }

  async function handleAddPhase() {
    const chosen = phaseDraft.trim();
    if (!chosen) return;
    if (taskPhases.includes(chosen)) {
      onSelectPhase(chosen);
      setAddingPhase(false);
      return;
    }
    const nextPhases = orderPhaseNames([...taskPhases, chosen], definedPhases);
    setSavingPhase(true);
    try {
      const { errors } = await updateTaskWithPhases({
        id: task.id,
        phases: nextPhases,
      });
      if (errors?.length) {
        alert(
          "Could not add phase: " + errors.map((e) => e.message).join("; ")
        );
        return;
      }
      onSelectPhase(chosen);
      setAddingPhase(false);
      setPhaseDraft("");
    } catch (err: unknown) {
      alert(
        "Could not add phase: " +
          (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setSavingPhase(false);
    }
  }

  async function handleRemoveCurrentPhase() {
    if (!activePhase || taskPhases.length <= 1 || phasePhotos.length > 0) return;
    const nextPhases = taskPhases.filter((ph) => ph !== activePhase);
    setSavingPhase(true);
    try {
      const { errors } = await updateTaskWithPhases({
        id: task.id,
        phases: nextPhases,
      });
      if (errors?.length) {
        alert(
          "Could not remove phase: " + errors.map((e) => e.message).join("; ")
        );
        return;
      }
      onSelectPhase(nextPhases[0] ?? "");
    } catch (err: unknown) {
      alert(
        "Could not remove phase: " +
          (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setSavingPhase(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !photoModel) return;
    if (!activePhase) {
      alert("Please add or select a phase first.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = buildPhotoStoragePath(
          task.id,
          activePhase,
          file.name,
          i
        );
        await uploadData({ path, data: file }).result;
        const { errors } = await createPhotoInPhase({
          taskId: task.id,
          phase: activePhase,
          path,
          note: "",
        });
        if (errors?.length) {
          throw new Error(errors.map((err) => err.message).join("; "));
        }
      }
    } catch (err: unknown) {
      alert(
        "Upload failed: " + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div
      style={{
        marginLeft: 16,
        marginTop: 2,
        marginBottom: 6,
        padding: "4px 0 4px 8px",
        borderLeft: "2px solid #e8f0fe",
        fontSize: "0.74rem",
        color: "#444",
      }}
    >
      <div style={{ lineHeight: 1.45 }}>
        <div>
          <span style={{ color: "#777" }}>Task ID: </span>
          <span style={{ color: "#222" }}>{task.taskid}</span>
        </div>
        <div
          style={{
            marginTop: 3,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 5,
          }}
        >
          <span style={{ color: "#777" }}>Phase:</span>
          {taskPhases.length > 0 ? (
            <select
              value={activePhase}
              onChange={(e) => onSelectPhase(e.target.value)}
              aria-label="Active phase"
              style={{
                padding: "2px 6px",
                fontSize: "0.73rem",
                fontFamily: "inherit",
                color: "#222",
                background: "#fff",
                border: "1px solid #cbd5e1",
                borderRadius: 5,
                cursor: "pointer",
              }}
            >
              {taskPhases.map((ph) => {
                const count = getPhotosForTaskPhase(
                  task,
                  ph,
                  taskPhotos
                ).length;
                return (
                  <option key={ph} value={ph}>
                    {ph} ({count})
                  </option>
                );
              })}
            </select>
          ) : (
            <span style={{ color: "#888" }}>None</span>
          )}

          {taskPhases.length > 1 && phasePhotos.length === 0 && (
            <button
              type="button"
              onClick={handleRemoveCurrentPhase}
              disabled={savingPhase}
              title={`Remove empty phase "${activePhase}"`}
              aria-label={`Remove phase ${activePhase}`}
              style={{
                background: "transparent",
                color: "#888",
                border: "1px solid #e4e4e7",
                borderRadius: 4,
                padding: "1px 5px",
                fontSize: "0.7rem",
                lineHeight: 1.2,
                cursor: savingPhase ? "default" : "pointer",
              }}
            >
              ✕
            </button>
          )}

          {!addingPhase && (
            <button
              type="button"
              onClick={openAddPhase}
              style={{
                background: "#e8f0fe",
                color: "#1a73e8",
                border: "none",
                borderRadius: 5,
                padding: "2px 7px",
                fontSize: "0.7rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Phase
            </button>
          )}
        </div>

        {addingPhase && (
          <div
            style={{
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            {availableToAdd.length > 0 ? (
              <select
                value={phaseDraft}
                onChange={(e) => setPhaseDraft(e.target.value)}
                style={{
                  padding: "2px 6px",
                  fontSize: "0.72rem",
                  fontFamily: "inherit",
                  background: "#fff",
                  border: "1px solid #ccc",
                  borderRadius: 5,
                }}
              >
                {availableToAdd.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={phaseDraft}
                onChange={(e) => setPhaseDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddPhase();
                  else if (e.key === "Escape") setAddingPhase(false);
                }}
                placeholder="New phase name"
                autoFocus
                style={{
                  width: 120,
                  padding: "2px 6px",
                  fontSize: "0.72rem",
                  fontFamily: "inherit",
                  border: "1px solid #ccc",
                  borderRadius: 5,
                }}
              />
            )}
            <button
              type="button"
              onClick={handleAddPhase}
              disabled={savingPhase || !phaseDraft.trim()}
              style={{
                background: "#e8f0fe",
                color: "#1a73e8",
                border: "none",
                borderRadius: 5,
                padding: "2px 7px",
                fontSize: "0.7rem",
                fontWeight: 600,
                cursor:
                  savingPhase || !phaseDraft.trim() ? "default" : "pointer",
              }}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAddingPhase(false)}
              disabled={savingPhase}
              style={{
                background: "#fff",
                color: "#555",
                border: "1px solid #ddd",
                borderRadius: 5,
                padding: "2px 7px",
                fontSize: "0.7rem",
                fontWeight: 600,
                cursor: savingPhase ? "default" : "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {phasePhotos.length === 0 ? (
        <div style={{ marginTop: 4, fontSize: "0.72rem", color: "#888" }}>
          {activePhase ? `No photos in ${activePhase}.` : "No photos."}
        </div>
      ) : (
        <div
          style={{
            marginTop: 6,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            maxWidth: 268,
          }}
        >
          {phasePhotos.map((photo) => (
            <figure
              key={photo.id}
              style={{
                margin: 0,
                width: 84,
                border: "1px solid #e4e4e7",
                borderRadius: 6,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              {photo.path && urls[photo.path] ? (
                <button
                  type="button"
                  onClick={() => onViewPhoto(activePhase, photo.id)}
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
                      height: 56,
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </button>
              ) : (
                <div
                  style={{
                    height: 56,
                    background: "#f4f4f6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#aaa",
                    fontSize: "0.62rem",
                  }}
                >
                  Loading…
                </div>
              )}
              <figcaption
                style={{
                  padding: "3px 5px",
                  fontSize: "0.68rem",
                  color: "#333",
                  lineHeight: 1.25,
                  wordBreak: "break-word",
                }}
              >
                {photo.note?.trim() || (
                  <em style={{ color: "#aaa" }}>No note</em>
                )}
                <div
                  style={{
                    marginTop: 2,
                    color: "#999",
                    fontSize: "0.62rem",
                  }}
                >
                  {photoDate(photo.createdAt)}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <label
        title={
          uploading
            ? "Uploading…"
            : activePhase
              ? `Upload photo to ${activePhase}`
              : "Add a phase first"
        }
        aria-label="Upload photo"
        style={{
          marginTop: 6,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid #d2e3fc",
          background: "#f4f8fe",
          color: "#1a73e8",
          fontSize: "0.72rem",
          fontWeight: 600,
          cursor:
            uploading || !photoModel || !activePhase ? "default" : "pointer",
          opacity: uploading || !photoModel || !activePhase ? 0.6 : 1,
        }}
      >
        <CameraIcon />
        {uploading && <span>Uploading…</span>}
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={uploading || !photoModel || !activePhase}
          onChange={handleUpload}
          style={{ display: "none" }}
        />
      </label>
    </div>
  );
}

function CameraIcon() {
  return (
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
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

/** Compact address + contact summary shown while hovering a point. */
function HoverCard({ location }: { location: Location }) {
  const contactLines = [location.contact, location.phone, location.email].filter(
    (v): v is string => Boolean(v)
  );

  return (
    <div
      style={{
        minWidth: 150,
        color: "#222",
        fontSize: "0.82rem",
        // Never let the card itself take the pointer away from the marker.
        pointerEvents: "none",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 2 }}>
        Location {location.locationid}
      </div>
      <div>{location.address || <em style={{ color: "#888" }}>No address</em>}</div>
      {contactLines.length > 0 && (
        <div style={{ marginTop: 4, color: "#555" }}>
          {contactLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inline form for editing a location's details inside the InfoWindow. */
function LocationEditor({
  draft,
  setDraft,
  busy,
  onSave,
  onCancel,
}: {
  draft: typeof EMPTY_DRAFT;
  setDraft: React.Dispatch<React.SetStateAction<typeof EMPTY_DRAFT>>;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const field = (
    label: string,
    key: keyof typeof EMPTY_DRAFT,
    type = "text"
  ) => (
    <label style={{ display: "block", marginBottom: 6 }}>
      <span style={{ display: "block", color: "#777", fontSize: "0.72rem" }}>
        {label}
      </span>
      <input
        type={type}
        value={draft[key]}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "3px 6px",
          fontSize: "0.85rem",
          border: "1px solid #ccc",
          borderRadius: 5,
          fontFamily: "inherit",
        }}
      />
    </label>
  );

  return (
    <div style={{ minWidth: 230, color: "#222", fontSize: "0.85rem" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Edit location</div>
      {field("Location ID", "locationid", "number")}
      {field("Address", "address")}
      {field("Contact", "contact")}
      {field("Phone", "phone", "tel")}
      {field("Email", "email", "email")}
      <label style={{ display: "block", marginBottom: 6 }}>
        <span style={{ display: "block", color: "#777", fontSize: "0.72rem" }}>
          Comments
        </span>
        <textarea
          value={draft.comments}
          onChange={(e) =>
            setDraft((d) => ({ ...d, comments: e.target.value }))
          }
          rows={2}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "3px 6px",
            fontSize: "0.85rem",
            border: "1px solid #ccc",
            borderRadius: 5,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          style={{
            background: "#e8f0fe",
            color: "#1a73e8",
            border: "none",
            borderRadius: 6,
            padding: "4px 12px",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
          }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            background: "#fff",
            color: "#444",
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: "4px 12px",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default MapView;
