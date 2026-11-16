import { downloadData } from "aws-amplify/storage";
import { jsPDF } from "jspdf";
import type { Schema } from "../amplify/data/resource";
import { photoDate } from "./PhotoCarousel";

type Project = Schema["Project"]["type"];
type Task = Schema["Task"]["type"];
type Photo = Schema["Photo"]["type"];

export type SaveFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

export type ExportReportPdfParams = {
  project: Project;
  projectTasks: Task[];
  visiblePhaseColumns: string[];
  visiblePhotos: Photo[];
  urls: Record<string, string>;
  fileHandle?: SaveFileHandle | null;
  fileName: string;
};

/** Normalize punctuation outside WinAnsi/Latin-1 so standard Helvetica renders cleanly. */
function pdfText(input: string): string {
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "?");
}

function loadImage(src: string, anonymous = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (anonymous) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = src;
  });
}

async function renderCoverJpeg(
  photo: Photo,
  urls: Record<string, string>,
  widthPt: number,
  heightPt: number
): Promise<string | null> {
  if (!photo.path) return null;

  let img: HTMLImageElement | null = null;
  try {
    const { body } = await downloadData({ path: photo.path }).result;
    const blob = await body.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      img = await loadImage(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    const signed = urls[photo.path];
    if (signed) {
      try {
        img = await loadImage(signed, true);
      } catch {
        img = null;
      }
    }
  }

  if (!img || img.naturalWidth <= 0 || img.naturalHeight <= 0) return null;

  const pxW = Math.max(1, Math.round(widthPt * 2.5));
  const pxH = Math.max(1, Math.round(heightPt * 2.5));
  const canvas = document.createElement("canvas");
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pxW, pxH);

  const srcRatio = img.naturalWidth / img.naturalHeight;
  const dstRatio = pxW / pxH;
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (srcRatio > dstRatio) {
    sw = img.naturalHeight * dstRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / dstRatio;
    sy = (img.naturalHeight - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, pxW, pxH);
  return canvas.toDataURL("image/jpeg", 0.88);
}

type PreparedCard = {
  photo: Photo;
  jpeg: string | null;
  noteLines: string[];
  hasNote: boolean;
  dateText: string;
  height: number;
};

export async function exportReportPdf({
  project,
  projectTasks,
  visiblePhaseColumns,
  visiblePhotos,
  urls,
  fileHandle,
  fileName,
}: ExportReportPdfParams): Promise<void> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "letter",
  });

  const pageW = doc.internal.pageSize.getWidth(); // 792
  const pageH = doc.internal.pageSize.getHeight(); // 612
  const marginX = 32;
  const marginTop = 32;
  const pageBottom = pageH - 32;
  const usableW = pageW - marginX * 2;

  // Report title & summary on page 1
  const titleText = pdfText(`Report - ${project.project || "Project"}`);
  const summaryText = pdfText(
    `${projectTasks.length} task${projectTasks.length === 1 ? "" : "s"}  |  ` +
      `${visiblePhotos.length} photo${visiblePhotos.length === 1 ? "" : "s"}  |  ` +
      new Date().toLocaleDateString()
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(34, 34, 34);
  doc.text(titleText, marginX, marginTop + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(summaryText, marginX, marginTop + 28);

  let cursorY = marginTop + 42;

  if (projectTasks.length === 0 || visiblePhaseColumns.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(136, 136, 136);
    doc.text(
      projectTasks.length === 0
        ? "This project has no tasks yet."
        : "No visible phase columns in this report.",
      marginX,
      cursorY + 16
    );
    await saveOutput(doc, fileHandle, fileName);
    return;
  }

  const taskColW = Math.min(130, Math.max(96, usableW * 0.18));
  const phaseColW = (usableW - taskColW) / visiblePhaseColumns.length;
  const cellPad = 6;
  const innerPhaseW = Math.max(36, phaseColW - cellPad * 2);
  const cardGap = 6;
  const targetCardW = 102;
  const cardsPerRow =
    innerPhaseW < targetCardW
      ? 1
      : Math.max(
          1,
          Math.floor((innerPhaseW + cardGap) / (targetCardW + cardGap))
        );
  const cardW = Math.min(
    114,
    (innerPhaseW - cardGap * (cardsPerRow - 1)) / cardsPerRow
  );
  const imgH = Math.max(32, Math.round(cardW * 0.66));

  // Preload thumbnails only for photos that will actually appear in visible phase columns
  const visiblePhaseSet = new Set(visiblePhaseColumns);
  const activeTaskIds = new Set(
    projectTasks
      .filter((t) => visiblePhaseSet.has((t.phase ?? "").trim()))
      .map((t) => t.id)
  );
  const photosToRender = visiblePhotos.filter(
    (p) => p.taskId && activeTaskIds.has(p.taskId)
  );

  const jpegByPhotoId = new Map<string, string | null>();
  await Promise.all(
    photosToRender.map(async (p) => {
      const dataUrl = await renderCoverJpeg(p, urls, cardW, imgH);
      jpegByPhotoId.set(p.id, dataUrl);
    })
  );

  function drawTableHeader(startY: number): number {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);

    const taskHeaderLines = doc.splitTextToSize(
      "Task \\ Phase",
      taskColW - cellPad * 2
    ) as string[];
    const phaseHeaderLines = visiblePhaseColumns.map(
      (col) =>
        doc.splitTextToSize(pdfText(col), phaseColW - cellPad * 2) as string[]
    );

    const maxLines = Math.max(
      taskHeaderLines.length,
      ...phaseHeaderLines.map((l) => l.length),
      1
    );
    const lineH = 11;
    const headerH = Math.max(24, maxLines * lineH + 10);

    doc.setFillColor(247, 248, 250);
    doc.rect(marginX, startY, usableW, headerH, "F");

    doc.setDrawColor(230, 230, 234);
    doc.setLineWidth(0.6);
    doc.rect(marginX, startY, usableW, headerH, "S");

    doc.setTextColor(34, 34, 34);
    doc.text(taskHeaderLines, marginX + cellPad, startY + 13);

    visiblePhaseColumns.forEach((_, i) => {
      const colX = marginX + taskColW + i * phaseColW;
      doc.setDrawColor(230, 230, 234);
      doc.line(colX, startY, colX, startY + headerH);
      doc.text(phaseHeaderLines[i], colX + cellPad, startY + 13);
    });

    doc.setDrawColor(200, 200, 206);
    doc.setLineWidth(1.1);
    doc.line(
      marginX,
      startY + headerH,
      marginX + usableW,
      startY + headerH
    );

    return startY + headerH;
  }

  let pageHasRows = false;
  cursorY = drawTableHeader(cursorY);

  const noteLineH = 9.2;
  const dateLineH = 8.5;

  for (const task of projectTasks) {
    const taskPhase = (task.phase ?? "").trim();
    const isPhaseVisible = visiblePhaseSet.has(taskPhase);
    const mine = isPhaseVisible
      ? visiblePhotos
          .filter((p) => p.taskId === task.id)
          .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      : [];

    const preparedCards: PreparedCard[] = mine.map((photo) => {
      const rawNote = (photo.note ?? "").trim();
      const hasNote = rawNote.length > 0;
      doc.setFont("helvetica", hasNote ? "normal" : "italic");
      doc.setFontSize(7.5);
      const noteLines = doc.splitTextToSize(
        hasNote ? pdfText(rawNote) : "No note",
        Math.max(24, cardW - 8)
      ) as string[];
      const dateText = pdfText(photoDate(photo.createdAt));
      const captionH =
        5 +
        noteLines.length * noteLineH +
        (dateText ? 2 + dateLineH : 0) +
        5;
      return {
        photo,
        jpeg: jpegByPhotoId.get(photo.id) ?? null,
        noteLines,
        hasNote,
        dateText,
        height: imgH + captionH,
      };
    });

    const cardRows: { cards: PreparedCard[]; height: number }[] = [];
    for (let i = 0; i < preparedCards.length; i += cardsPerRow) {
      const slice = preparedCards.slice(i, i + cardsPerRow);
      const rowH = Math.max(...slice.map((c) => c.height));
      cardRows.push({ cards: slice, height: rowH });
    }

    // Split cardRows into page-fitting slices so tall rows never clip
    let rowIdx = 0;
    let isContinuation = false;
    do {
      const label = pdfText(
        (task.task || `Task ${task.taskid}`) +
          (isContinuation ? " (cont.)" : "")
      );
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      const taskNameLines = doc.splitTextToSize(
        label,
        taskColW - cellPad * 2
      ) as string[];

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      const taskSubLines = taskPhase
        ? (doc.splitTextToSize(
            pdfText(taskPhase),
            taskColW - cellPad * 2
          ) as string[])
        : [];

      const leftTextH =
        cellPad * 2 +
        taskNameLines.length * 10.5 +
        (taskSubLines.length > 0 ? 2 + taskSubLines.length * 9 : 0);

      if (cardRows.length === 0) {
        const neededH = Math.max(28, leftTextH);
        if (cursorY + neededH > pageBottom && pageHasRows) {
          doc.addPage();
          pageHasRows = false;
          cursorY = drawTableHeader(marginTop);
        }
        drawTaskSlice(
          cursorY,
          neededH,
          taskNameLines,
          taskSubLines,
          taskPhase,
          []
        );
        cursorY += neededH;
        pageHasRows = true;
        break;
      }

      // Check if at least the first remaining cardRow fits on this page
      const firstRowNeeded = Math.max(
        leftTextH,
        cellPad * 2 + cardRows[rowIdx].height
      );
      if (cursorY + firstRowNeeded > pageBottom && pageHasRows) {
        doc.addPage();
        pageHasRows = false;
        cursorY = drawTableHeader(marginTop);
      }

      // Greedily pack cardRows that fit on the current page
      const chosen: { cards: PreparedCard[]; height: number }[] = [];
      let cardsContentH = 0;
      while (rowIdx < cardRows.length) {
        const nextRow = cardRows[rowIdx];
        const addH = (chosen.length > 0 ? cardGap : 0) + nextRow.height;
        const candidateH = Math.max(
          leftTextH,
          cellPad * 2 + cardsContentH + addH
        );
        if (chosen.length > 0 && cursorY + candidateH > pageBottom) {
          break;
        }
        chosen.push(nextRow);
        cardsContentH += addH;
        rowIdx++;
      }

      const sliceH = Math.max(28, leftTextH, cellPad * 2 + cardsContentH);
      drawTaskSlice(
        cursorY,
        sliceH,
        taskNameLines,
        taskSubLines,
        taskPhase,
        chosen
      );
      cursorY += sliceH;
      pageHasRows = true;
      isContinuation = true;
    } while (rowIdx < cardRows.length);
  }

  function drawTaskSlice(
    startY: number,
    rowH: number,
    taskNameLines: string[],
    taskSubLines: string[],
    taskPhase: string,
    chosenCardRows: { cards: PreparedCard[]; height: number }[]
  ) {
    // Highlight the active phase cell background
    visiblePhaseColumns.forEach((col, i) => {
      const colX = marginX + taskColW + i * phaseColW;
      if (col === taskPhase) {
        doc.setFillColor(248, 251, 255);
        doc.rect(colX, startY, phaseColW, rowH, "F");
      }
    });

    // Outer row border + column dividers
    doc.setDrawColor(232, 232, 236);
    doc.setLineWidth(0.6);
    doc.rect(marginX, startY, usableW, rowH, "S");

    // Task header cell text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(34, 34, 34);
    const nameY = startY + cellPad + 8;
    doc.text(taskNameLines, marginX + cellPad, nameY);

    if (taskSubLines.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(136, 136, 136);
      doc.text(
        taskSubLines,
        marginX + cellPad,
        nameY + taskNameLines.length * 10.5 + 1
      );
    }

    // Phase cells
    visiblePhaseColumns.forEach((col, i) => {
      const colX = marginX + taskColW + i * phaseColW;
      doc.setDrawColor(232, 232, 236);
      doc.setLineWidth(0.6);
      doc.line(colX, startY, colX, startY + rowH);

      if (col !== taskPhase) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(200, 200, 206);
        doc.text("-", colX + cellPad, startY + cellPad + 9);
        return;
      }

      if (chosenCardRows.length === 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 155);
        doc.text("No photos", colX + cellPad, startY + cellPad + 9);
        return;
      }

      let cardY = startY + cellPad;
      for (const cardRow of chosenCardRows) {
        cardRow.cards.forEach((card, cIdx) => {
          const cardX = colX + cellPad + cIdx * (cardW + cardGap);

          // Card box
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(224, 224, 228);
          doc.setLineWidth(0.5);
          doc.roundedRect(cardX, cardY, cardW, card.height, 4, 4, "FD");

          // Photo image or placeholder
          if (card.jpeg) {
            doc.addImage(card.jpeg, "JPEG", cardX + 0.5, cardY + 0.5, cardW - 1, imgH);
          } else {
            doc.setFillColor(244, 244, 246);
            doc.rect(cardX + 0.5, cardY + 0.5, cardW - 1, imgH, "F");
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.5);
            doc.setTextColor(160, 160, 165);
            doc.text("Image unavailable", cardX + 4, cardY + imgH / 2 + 2);
          }

          // Divider below image
          doc.setDrawColor(236, 236, 240);
          doc.line(cardX, cardY + imgH, cardX + cardW, cardY + imgH);

          // Note text
          doc.setFont("helvetica", card.hasNote ? "normal" : "italic");
          doc.setFontSize(7.5);
          doc.setTextColor(card.hasNote ? 51 : 165, card.hasNote ? 51 : 165, card.hasNote ? 51 : 165);
          const noteStartY = cardY + imgH + 10;
          doc.text(card.noteLines, cardX + 4, noteStartY);

          // Date
          if (card.dateText) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.5);
            doc.setTextColor(150, 150, 155);
            doc.text(
              card.dateText,
              cardX + 4,
              noteStartY + card.noteLines.length * noteLineH + 1
            );
          }
        });
        cardY += cardRow.height + cardGap;
      }
    });
  }

  await saveOutput(doc, fileHandle, fileName);
}

async function saveOutput(
  doc: jsPDF,
  fileHandle: SaveFileHandle | null | undefined,
  fileName: string
) {
  if (fileHandle) {
    const blob = doc.output("blob");
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  doc.save(fileName);
}
