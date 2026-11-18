import outputs from "../amplify_outputs.json";
import type { Schema } from "../amplify/data/resource";
import { client } from "./client";

type Task = Schema["Task"]["type"];
type Phase = Schema["Phase"]["type"];
type Photo = Schema["Photo"]["type"];

type IntrospectionShape = {
  data?: {
    model_introspection?: {
      models?: {
        Task?: { fields?: Record<string, unknown> };
        Photo?: { fields?: Record<string, unknown> };
      };
    };
  };
};

const modelFields = (outputs as IntrospectionShape).data?.model_introspection
  ?.models;
const supportsTaskPhasesField = Boolean(modelFields?.Task?.fields?.phases);
const supportsPhotoPhaseField = Boolean(modelFields?.Photo?.fields?.phase);

const PATH_PHASE_RE = /^photos\/[^/]+\/p64_([A-Za-z0-9_-]+)\//;

function encodePhaseToken(phase: string): string {
  const bytes = new TextEncoder().encode(phase);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodePhaseToken(token: string): string | null {
  try {
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes).trim() || null;
  } catch {
    return null;
  }
}

export function decodePhaseFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const m = PATH_PHASE_RE.exec(path);
  if (!m) return null;
  return decodePhaseToken(m[1]);
}

export function buildPhotoStoragePath(
  taskId: string,
  phaseName: string,
  fileName: string,
  index = 0
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const trimmed = phaseName.trim();
  if (!trimmed) {
    return `photos/${taskId}/${Date.now()}-${index}-${safe}`;
  }
  const token = encodePhaseToken(trimmed);
  return `photos/${taskId}/p64_${token}/${Date.now()}-${index}-${safe}`;
}

/** Deduplicate and order phase names according to Phase.phaseid when available. */
export function orderPhaseNames(
  names: Iterable<string>,
  definedPhases?: Phase[]
): string[] {
  const unique: string[] = [];
  for (const raw of names) {
    const trimmed = raw.trim();
    if (trimmed && !unique.includes(trimmed)) unique.push(trimmed);
  }
  if (!definedPhases || definedPhases.length === 0) return unique;

  const rank = new Map<string, number>();
  definedPhases.forEach((ph, idx) => {
    const name = (ph.phase ?? "").trim();
    if (name && !rank.has(name)) {
      rank.set(name, ph.phaseid ?? idx);
    }
  });

  return [...unique].sort((a, b) => {
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return 0;
  });
}

function parseLegacyPhaseString(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getDirectTaskPhases(task: Task): string[] {
  const collected: string[] = [];
  if (Array.isArray(task.phases)) {
    for (const item of task.phases) {
      const trimmed = (item ?? "").trim();
      if (trimmed && !collected.includes(trimmed)) collected.push(trimmed);
    }
  }
  for (const legacy of parseLegacyPhaseString(task.phase)) {
    if (!collected.includes(legacy)) collected.push(legacy);
  }
  return collected;
}

/** Resolve which phase a photo belongs to, falling back to the task's primary phase. */
export function getPhotoPhase(photo: Photo, task?: Task): string {
  const explicit = (photo.phase ?? "").trim();
  if (explicit) return explicit;

  const fromPath = decodePhaseFromPath(photo.path);
  if (fromPath) return fromPath;

  if (task) {
    const direct = getDirectTaskPhases(task);
    if (direct.length > 0) return direct[0];
  }
  return "";
}

/** All phases associated with a task (including any phases referenced by its photos). */
export function getTaskPhases(
  task: Task,
  taskPhotos?: Photo[],
  definedPhases?: Phase[]
): string[] {
  const names = getDirectTaskPhases(task);
  if (taskPhotos) {
    for (const p of taskPhotos) {
      if (p.taskId !== task.id) continue;
      const ph = getPhotoPhase(p, task);
      if (ph && !names.includes(ph)) names.push(ph);
    }
  }
  return orderPhaseNames(names, definedPhases);
}

/** Photos belonging to a specific (task, phase) pair, sorted newest first. */
export function getPhotosForTaskPhase(
  task: Task,
  phaseName: string,
  photos: Photo[]
): Photo[] {
  const target = phaseName.trim();
  return photos
    .filter((p) => p.taskId === task.id && getPhotoPhase(p, task) === target)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/** Create a task with one or more phases, compatible before and after backend redeploy. */
export async function createTaskWithPhases(input: {
  taskid: number;
  task: string;
  phases: string[];
  projectId: string;
}) {
  const cleanPhases = orderPhaseNames(input.phases);
  if (supportsTaskPhasesField) {
    return client.models.Task.create({
      taskid: input.taskid,
      task: input.task,
      phases: cleanPhases,
      phase: cleanPhases[0] ?? "",
      projectId: input.projectId,
    });
  }
  return client.models.Task.create({
    taskid: input.taskid,
    task: input.task,
    phase: cleanPhases.join("\n"),
    projectId: input.projectId,
  });
}

/** Update a task's phases (and optional metadata), compatible before and after backend redeploy. */
export async function updateTaskWithPhases(input: {
  id: string;
  phases: string[];
  taskid?: number;
  task?: string;
}) {
  const cleanPhases = orderPhaseNames(input.phases);
  const extra: { taskid?: number; task?: string } = {};
  if (input.taskid !== undefined) extra.taskid = input.taskid;
  if (input.task !== undefined) extra.task = input.task;

  if (supportsTaskPhasesField) {
    return client.models.Task.update({
      id: input.id,
      ...extra,
      phases: cleanPhases,
      phase: cleanPhases[0] ?? "",
    });
  }
  return client.models.Task.update({
    id: input.id,
    ...extra,
    phase: cleanPhases.join("\n"),
  });
}

/** Create a photo in a specific phase, compatible before and after backend redeploy. */
export async function createPhotoInPhase(input: {
  taskId: string;
  phase: string;
  path: string;
  note: string;
}) {
  const photoModel = client.models.Photo as
    | typeof client.models.Photo
    | undefined;
  if (!photoModel) {
    throw new Error("Photo model is not available.");
  }
  const cleanPhase = input.phase.trim();
  if (supportsPhotoPhaseField) {
    return photoModel.create({
      taskId: input.taskId,
      phase: cleanPhase,
      path: input.path,
      note: input.note,
    });
  }
  return photoModel.create({
    taskId: input.taskId,
    path: input.path,
    note: input.note,
  });
}
