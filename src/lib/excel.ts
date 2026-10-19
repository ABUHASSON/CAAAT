import * as XLSX from "xlsx";
import type { Section, Student, LectureRecord, AttendanceStatus } from "@/types";
import { matchNameColumn, normalizeArabic } from "./normalize";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export interface ImportResult {
  names: string[];
  detectedIndex: number;
  headers: string[];
  rowCount: number;
}

// ============== Existing simple student list parsers ==============

export async function parseStudentFile(file: File): Promise<ImportResult> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  }) as unknown[][];

  if (rows.length === 0) {
    return { names: [], detectedIndex: -1, headers: [], rowCount: 0 };
  }

  let headerRowIdx = 0;
  let detectedIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = (rows[i] || []).map((c) => String(c ?? "").trim());
    const idx = matchNameColumn(row);
    if (idx >= 0) {
      headerRowIdx = i;
      detectedIndex = idx;
      break;
    }
  }

  const headers = (rows[headerRowIdx] || []).map((c) => String(c ?? "").trim());
  const dataStart = headerRowIdx + 1;
  const allRows = rows.slice(dataStart).filter((r) =>
    (r || []).some((c) => String(c ?? "").trim() !== "")
  );

  let names: string[];
  if (detectedIndex >= 0) {
    names = allRows
      .map((r) => String(r[detectedIndex] ?? "").trim())
      .filter((n) => n !== "");
  } else {
    names = allRows
      .map((r) => String(r[0] ?? "").trim())
      .filter((n) => n !== "");
  }

  return {
    names,
    detectedIndex,
    headers,
    rowCount: allRows.length,
  };
}

export function namesFromColumn(
  rows: unknown[][],
  headerRowIndex: number,
  columnIndex: number
): string[] {
  const data = rows.slice(headerRowIndex + 1).filter((r) =>
    (r || []).some((c) => String(c ?? "").trim() !== "")
  );
  return data
    .map((r) => String(r[columnIndex] ?? "").trim())
    .filter((n) => n !== "");
}

export async function parseRawRows(file: File): Promise<unknown[][]> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  }) as unknown[][];
}

// ============== Attendance cell parser (comprehensive) ==============

export interface ParsedCell {
  status: AttendanceStatus;
  participation: number;
}

export function parseAttendanceCell(raw: any): ParsedCell {
  const s = String(raw ?? "").trim();

  if (!s || s === "-" || s === "—" || s === "–") {
    return { status: "present", participation: 0 };
  }

  // Normalize
  const lower = s.toLowerCase();

  // Absent
  if (s.includes("غائب") || lower === "غ" || lower.includes("absent")) {
    return { status: "absent", participation: 0 };
  }
  // Leave
  if (s.includes("إجازة") || s.includes("اجازة") || s.includes("إجازه") || lower.includes("leave")) {
    return { status: "leave", participation: 0 };
  }

  // Participation with plus: حاضر+2, حاضر + 1, حاضر+ 2, -+1
  const plusMatch = s.match(/\+\s*(\d+)/);
  if (plusMatch) {
    const pts = Math.min(2, Math.max(0, parseInt(plusMatch[1], 10) || 0));
    // If cell says غائب+... we already returned absent, so this is present
    return { status: "present", participation: pts };
  }

  // Forms like حاضر (2) or حاضر 2 or حاضر:2
  // Look for number near حاضر
  if (s.includes("حاضر")) {
    const numMatch = s.match(/حاضر[^0-9]*(\d+)/);
    if (numMatch) {
      const pts = Math.min(2, Math.max(0, parseInt(numMatch[1], 10) || 0));
      return { status: "present", participation: pts };
    }
    return { status: "present", participation: 0 };
  }

  // Standalone number 1 or 2 as participation (old files may use)
  if (/^[0-2]$/.test(s)) {
    return { status: "present", participation: parseInt(s, 10) };
  }

  // Default present
  return { status: "present", participation: 0 };
}

function formatAttendanceCell(status: AttendanceStatus, participation: number): string {
  if (status === "absent") return "غائب";
  if (status === "leave") return "إجازة";
  // present
  if (participation > 0) return `حاضر+${participation}`;
  return "حاضر";
}

// ============== Export single section (comprehensive) ==============

export function exportSectionReport(section: Section): void {
  const sortedLectures = [...section.lectures].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const header = [
    "ت",
    "اسم الطالب",
    ...sortedLectures.map((l) => l.date),
    "مجموع الغياب",
    "مجموع الإجازات",
    "مجموع المشاركات",
  ];

  const body = section.students
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s, i) => {
      let absences = 0;
      let leaves = 0;
      let participationTotal = 0;
      const cells: (string | number)[] = [i + 1, s.name];
      for (const lec of sortedLectures) {
        const st = (lec.attendance[s.id] ?? "present") as AttendanceStatus;
        const pts = lec.participation[s.id] || 0;
        cells.push(formatAttendanceCell(st, pts));
        if (st === "absent") absences++;
        else if (st === "leave") leaves++;
        participationTotal += pts;
      }
      cells.push(absences, leaves, participationTotal);
      return cells;
    });

  const aoa = [header, ...body];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 5 },
    { wch: 28 },
    ...sortedLectures.map(() => ({ wch: 14 })),
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "التقرير");

  const safeName = section.subject.replace(/[\\/:*?"<>|]/g, "_");
  const fileName = `تقرير_${safeName}_${section.stage}_${section.studyType}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// ============== Build full backup (comprehensive, no loss) ==============

export function buildBackupWorkbook(sections: Section[]): Blob {
  const wb = XLSX.utils.book_new();

  // Summary sheet with more metadata
  const summaryHeader = [
    "ت",
    "المادة",
    "المرحلة",
    "نوع الدراسة",
    "الفصل",
    "عدد الطلاب",
    "عدد المحاضرات",
    "عدد المحاضرات الكلي",
    "المعرف",
    "تاريخ الإنشاء",
  ];
  const summaryBody = sections.map((s, i) => [
    i + 1,
    s.subject,
    s.stage,
    s.studyType === "morning" ? "صباحي" : "مسائي",
    s.semester || "1",
    s.students.length,
    s.lectures.length,
    s.totalLectures ?? "",
    s.id,
    s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : "",
  ]);
  const summaryWs = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryBody]);
  summaryWs["!cols"] = [
    { wch: 5 },
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 8 },
    { wch: 10 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, summaryWs, "الملخص");

  // One detailed sheet per section - comprehensive
  for (const section of sections) {
    const sortedLectures = [...section.lectures].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const header = [
      "ت",
      "اسم الطالب",
      ...sortedLectures.map((l) => l.date),
      "مجموع الغياب",
      "مجموع الإجازات",
      "مجموع المشاركات",
    ];
    const body = section.students
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s, i) => {
        let absences = 0;
        let leaves = 0;
        let participationTotal = 0;
        const cells: (string | number)[] = [i + 1, s.name];
        for (const lec of sortedLectures) {
          const st = (lec.attendance[s.id] ?? "present") as AttendanceStatus;
          const pts = lec.participation[s.id] || 0;
          cells.push(formatAttendanceCell(st, pts));
          if (st === "absent") absences++;
          else if (st === "leave") leaves++;
          participationTotal += pts;
        }
        cells.push(absences, leaves, participationTotal);
        return cells;
      });
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws["!cols"] = [
      { wch: 5 },
      { wch: 28 },
      ...sortedLectures.map(() => ({ wch: 14 })),
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
    ];
    const sheetName = (section.subject || "شعبة")
      .replace(/[\\/:*?"<>|[\]]/g, "_")
      .slice(0, 28);
    XLSX.utils.book_append_sheet(wb, ws, sheetName || "شعبة");
  }

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function buildJsonBackup(sections: Section[]): File {
  const payload = {
    app: "student-attendance",
    version: 2, // upgraded to comprehensive
    exportedAt: new Date().toISOString(),
    sections,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return new File([blob], `نسخة_احتياطية_${stamp}.json`, {
    type: "application/json",
  });
}

export function buildExcelBackup(sections: Section[]): File {
  const blob = buildBackupWorkbook(sections);
  const stamp = new Date().toISOString().slice(0, 10);
  return new File([blob], `نسخة_احتياطية_${stamp}.xlsx`, { type: blob.type });
}

// ============== NEW: Import backup Excel (handles old and new formats) ==============

interface SummaryMeta {
  subject: string;
  stage: string;
  studyType: "morning" | "evening";
  semester: string;
  totalLectures?: number;
}

export async function parseBackupExcel(file: File): Promise<Section[]> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });

  // Parse summary sheet if exists
  const summaryMap = new Map<string, SummaryMeta>();
  const summarySheetName = wb.SheetNames.find((n) => n.includes("الملخص") || n.toLowerCase().includes("summary"));
  if (summarySheetName) {
    const sheet = wb.Sheets[summarySheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    }) as unknown[][];
    if (rows.length > 1) {
      const header = (rows[0] || []).map((c) => String(c ?? "").trim());
      const idxSubject = header.findIndex((h) => h.includes("المادة"));
      const idxStage = header.findIndex((h) => h.includes("المرحلة"));
      const idxStudy = header.findIndex((h) => h.includes("نوع الدراسة") || h.includes("الدراسة"));
      const idxSemester = header.findIndex((h) => h.includes("الفصل") || h.includes("سمستر"));
      const idxTotalLectures = header.findIndex((h) => h.includes("الكلي") || h.includes("الاجمالي") || h.includes("الإجمالي"));

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        const subject = String(r[idxSubject >= 0 ? idxSubject : 1] ?? "").trim();
        if (!subject) continue;
        const stage = String(r[idxStage >= 0 ? idxStage : 2] ?? "").trim() || "الرابعة";
        const studyRaw = String(r[idxStudy >= 0 ? idxStudy : 3] ?? "").trim();
        const studyType: "morning" | "evening" = studyRaw.includes("مسائي") ? "evening" : "morning";
        const semester = String(r[idxSemester >= 0 ? idxSemester : 4] ?? "").trim() || "1";
        const tlRaw = idxTotalLectures >= 0 ? r[idxTotalLectures] : undefined;
        const totalLectures = tlRaw ? Number(tlRaw) || undefined : undefined;

        summaryMap.set(subject, { subject, stage, studyType, semester: semester === "2" ? "2" : "1", totalLectures });
      }
    }
  }

  const sections: Section[] = [];

  for (const sheetName of wb.SheetNames) {
    if (sheetName === summarySheetName) continue;
    if (sheetName.toLowerCase().includes("summary")) continue;

    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    }) as unknown[][];

    if (rows.length < 2) continue;

    const header = (rows[0] || []).map((c) => String(c ?? "").trim());
    if (header.length < 2) continue;
    // Detect if this looks like a student sheet: second column should contain اسم الطالب or similar
    const secondCol = header[1] || "";
    if (!secondCol.includes("اسم") && !secondCol.includes("الطالب") && secondCol !== "" ) {
      // Might still be valid if data rows contain names, but we try to be permissive
      // Skip sheets that don't have at least one name column indicator and not date-like headers
      // We'll still try if rows contain names
    }

    // Find totals columns indexes
    let idxAbs = header.findIndex((h) => h.includes("مجموع الغياب") || h.includes("الغياب"));
    let idxLeave = header.findIndex((h) => h.includes("الإجازات") || h.includes("الاجازات") || h.includes("إجاز"));
    let idxPart = header.findIndex((h) => h.includes("المشاركات") || h.includes("مشاركة"));

    let lectureEndIdx = header.length;
    if (idxAbs >= 0) lectureEndIdx = Math.min(lectureEndIdx, idxAbs);
    if (idxLeave >= 0) lectureEndIdx = Math.min(lectureEndIdx, idxLeave);
    if (idxPart >= 0) lectureEndIdx = Math.min(lectureEndIdx, idxPart);

    if (lectureEndIdx <= 2) {
      // If no totals found, assume last 3 are totals if header contains them, else all after 2 are lectures
      if (header.length > 5) lectureEndIdx = header.length - 3;
      else lectureEndIdx = header.length;
    }

    const lectureHeaders = header.slice(2, lectureEndIdx).map((h) => h.trim()).filter(Boolean);
    if (lectureHeaders.length === 0) continue;

    // Normalize lecture dates: keep as is, but try to convert to YYYY-MM-DD if possible
    const normalizedDates = lectureHeaders.map((h) => {
      // If already YYYY-MM-DD keep
      if (/^\d{4}-\d{2}-\d{2}$/.test(h)) return h;
      // Try parse DD/MM/YYYY
      const dmy = h.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (dmy) {
        const [_, d, m, y] = dmy;
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
      return h; // keep original
    });

    // Prepare student data
    type RowInfo = {
      name: string;
      cells: ParsedCell[];
      totalAbs: number;
      totalLeave: number;
      totalPart: number;
    };
    const rowInfos: RowInfo[] = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      const name = String(row[1] ?? "").trim();
      if (!name) continue;

      const cells: ParsedCell[] = [];
      for (let c = 0; c < lectureHeaders.length; c++) {
        const raw = row[2 + c];
        cells.push(parseAttendanceCell(raw));
      }

      let totalPart = 0;
      if (idxPart >= 0) {
        const raw = row[idxPart];
        const num = Number(String(raw ?? "").trim());
        if (!isNaN(num)) totalPart = num;
      }
      let totalAbs = 0;
      if (idxAbs >= 0) {
        const num = Number(String(row[idxAbs] ?? "").trim());
        if (!isNaN(num)) totalAbs = num;
      }
      let totalLeave = 0;
      if (idxLeave >= 0) {
        const num = Number(String(row[idxLeave] ?? "").trim());
        if (!isNaN(num)) totalLeave = num;
      }

      // Old format handling: if all cells have 0 participation but totalPart >0, distribute to first lectures
      const sumParsedPart = cells.reduce((acc, cur) => acc + cur.participation, 0);
      if (sumParsedPart === 0 && totalPart > 0) {
        let remaining = totalPart;
        for (let i = 0; i < cells.length && remaining > 0; i++) {
          if (cells[i].status === "present") {
            const assign = Math.min(2, remaining);
            cells[i].participation = assign;
            remaining -= assign;
          }
        }
        // If still remaining (all absent), assign to first present or first lecture anyway
        if (remaining > 0 && cells.length > 0) {
          cells[0].participation = Math.min(2, cells[0].participation + remaining);
        }
      }

      rowInfos.push({ name, cells, totalAbs, totalLeave, totalPart });
    }

    if (rowInfos.length === 0) continue;

    // Build students
    const students: Student[] = rowInfos.map((ri, idx) => ({
      id: uid(),
      name: ri.name,
      normName: normalizeArabic(ri.name),
      order: idx,
    }));

    // Build lectures
    const lectures: LectureRecord[] = normalizedDates.map((date, lecIdx) => {
      const attendance: Record<string, AttendanceStatus> = {};
      const participation: Record<string, number> = {};
      rowInfos.forEach((ri, stuIdx) => {
        const stuId = students[stuIdx].id;
        const cell = ri.cells[lecIdx];
        if (!cell) return;
        // Only store non-default? For comprehensive, store all but present with 0 can be omitted to keep backward compat
        // We'll store absent/leave explicitly, present only if participation>0 or to be explicit
        if (cell.status !== "present") {
          attendance[stuId] = cell.status;
        } else if (cell.participation > 0) {
          // Store present explicitly when has participation to make it clear
          attendance[stuId] = "present";
        }
        // If present is default, we may not need to store, but store for safety when participation>0
        if (cell.status === "present" && cell.participation > 0) {
          participation[stuId] = cell.participation;
        } else if (cell.status !== "present") {
          participation[stuId] = 0;
        } else if (cell.participation > 0) {
          participation[stuId] = cell.participation;
        }
      });
      return { date, attendance, participation };
    });

    const meta = summaryMap.get(sheetName) || summaryMap.get(sheetName.trim());
    const subject = sheetName.trim();
    const stage = meta?.stage || "الرابعة";
    const studyType = meta?.studyType || "morning";
    const semester = meta?.semester || "1";
    const totalLectures = meta?.totalLectures;

    const section: Section = {
      id: uid(),
      subject,
      stage,
      semester: semester as "1" | "2",
      studyType,
      createdAt: Date.now(),
      students,
      lectures,
      ...(totalLectures ? { totalLectures } : {}),
    };

    sections.push(section);
  }

  return sections;
}

export async function parseJsonBackupFile(file: File): Promise<Section[]> {
  const text = await file.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("ملف JSON غير صالح");
  }

  let rawSections: any[] = [];
  if (Array.isArray(json)) {
    rawSections = json;
  } else if (json.sections && Array.isArray(json.sections)) {
    rawSections = json.sections;
  } else if (json.data && Array.isArray(json.data)) {
    rawSections = json.data;
  } else {
    throw new Error("تنسيق JSON غير معروف");
  }

  const sections: Section[] = [];

  for (const raw of rawSections) {
    if (!raw.subject || !raw.students) continue;

    // Remap student IDs to new ones to avoid collisions, keep lecture mappings
    const oldToNew = new Map<string, string>();
    const newStudents: Student[] = (raw.students as any[]).map((s: any, idx: number) => {
      const newId = uid();
      if (s.id) oldToNew.set(s.id, newId);
      return {
        id: newId,
        name: String(s.name || "").trim(),
        normName: s.normName || normalizeArabic(String(s.name || "")),
        order: typeof s.order === "number" ? s.order : idx,
      };
    });

    const newLectures: LectureRecord[] = (raw.lectures || []).map((lec: any) => {
      const newAtt: Record<string, AttendanceStatus> = {};
      const newPart: Record<string, number> = {};
      if (lec.attendance) {
        for (const [oldId, status] of Object.entries(lec.attendance)) {
          const newId = oldToNew.get(oldId) || oldId;
          newAtt[newId] = status as AttendanceStatus;
        }
      }
      if (lec.participation) {
        for (const [oldId, pts] of Object.entries(lec.participation)) {
          const newId = oldToNew.get(oldId) || oldId;
          newPart[newId] = Number(pts) || 0;
        }
      }
      return {
        date: String(lec.date || ""),
        attendance: newAtt,
        participation: newPart,
      };
    });

    const section: Section = {
      id: uid(),
      subject: String(raw.subject).trim(),
      stage: String(raw.stage || "الرابعة"),
      semester: (raw.semester === "2" ? "2" : "1") as "1" | "2",
      studyType: raw.studyType === "evening" ? "evening" : "morning",
      createdAt: Date.now(),
      students: newStudents,
      lectures: newLectures,
      totalLectures: raw.totalLectures ? Number(raw.totalLectures) : undefined,
    };
    sections.push(section);
  }

  return sections;
}

// Unified parser for backup (Excel or JSON) - used by SetupScreen
export async function parseBackupFile(file: File): Promise<Section[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json")) {
    return parseJsonBackupFile(file);
  } else {
    return parseBackupExcel(file);
  }
}
