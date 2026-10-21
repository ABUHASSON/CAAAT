import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Database,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  Moon,
  Plus,
  Share2,
  Sun,
  Trash2,
  Upload,
  Users,
  X,
  BarChart3,
} from "lucide-react";
import type { Section, Student } from "@/types";
import { normalizeArabic } from "@/lib/normalize";
import { parseStudentFile, parseRawRows, namesFromColumn, buildJsonBackup, buildExcelBackup, parseBackupFile } from "@/lib/excel";
import { saveSection, deleteSection, getAllSections } from "@/lib/db";
import { shareFile } from "@/lib/share";
import { useTheme } from "@/lib/theme";

interface Props {
  onOpenSection: (id: string) => void;
  onOpenReports?: () => void;
}

const STAGES = ["الأولى", "الثانية", "الثالثة", "الرابعة"];

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export default function SetupScreen({ onOpenSection, onOpenReports }: Props) {
  const [theme, toggleTheme] = useTheme();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  const [subject, setSubject] = useState("");
  const [stage, setStage] = useState<string>("");
  const [semester, setSemester] = useState<"1" | "2">("1");
  const [studyType, setStudyType] = useState<"morning" | "evening">("morning");
  const [totalLectures, setTotalLectures] = useState<string>("");

  const [file, setFile] = useState<File | null>(null);
  const [parsedNames, setParsedNames] = useState<string[]>([]);
  const [importError, setImportError] = useState<string>("");
  const [importing, setImporting] = useState(false);

  const [showMapper, setShowMapper] = useState(false);
  const [mapperHeaders, setMapperHeaders] = useState<string[]>([]);
  const [mapperRows, setMapperRows] = useState<unknown[][]>([]);
  const [mapperSelected, setMapperSelected] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [backupImporting, setBackupImporting] = useState(false);

  const loadSections = useCallback(async () => {
    setLoading(true);
    try {
      setSections(await getAllSections());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  const resetForm = () => {
    setSubject("");
    setStage("");
    setSemester("1");
    setStudyType("morning");
    setTotalLectures("");
    setFile(null);
    setParsedNames([]);
    setImportError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (f: File) => {
    setImporting(true);
    setImportError("");
    setParsedNames([]);
    setFile(f);
    try {
      const result = await parseStudentFile(f);
      if (result.detectedIndex >= 0 && result.names.length > 0) {
        setParsedNames(result.names);
      } else if (result.headers.length > 0) {
        const allRows = await parseRawRows(f);
        setMapperHeaders((allRows[0] || []).map((c) => String(c ?? "").trim()));
        setMapperRows(allRows);
        setMapperSelected(0);
        setShowMapper(true);
      } else if (result.rowCount === 0) {
        setImportError("الملف فارغ.");
      } else {
        setImportError("تعذّر اكتشاف عمود الأسماء. استخدم المحدّد اليدوي.");
      }
    } catch {
      setImportError("حدث خطأ أثناء قراءة الملف. تأكد من صحة التنسيق.");
    } finally {
      setImporting(false);
    }
  };

  const confirmMapper = () => {
    const names = namesFromColumn(mapperRows, 0, mapperSelected);
    setParsedNames(names);
    setShowMapper(false);
    if (names.length === 0) setImportError("لا توجد أسماء في العمود المحدد.");
  };

  const handleSave = async () => {
    if (!subject.trim() || !stage) {
      setImportError("يرجى إدخال اسم المادة واختيار المرحلة.");
      return;
    }
    if (parsedNames.length === 0) {
      setImportError("يرجى استيراد ملف الطلاب أولاً.");
      return;
    }
    const students: Student[] = parsedNames
      .map((n, i) => ({
        id: uid(),
        name: n,
        normName: normalizeArabic(n),
        order: i,
      }))
      .filter((s, _i, arr) => arr.findIndex((x) => x.normName === s.normName) === _i);

    const tl = totalLectures.trim() ? Math.max(1, Math.floor(Number(totalLectures))) : undefined;

    const section: Section = {
      id: uid(),
      subject: subject.trim(),
      stage,
      semester,
      studyType,
      createdAt: Date.now(),
      students,
      lectures: [],
      ...(tl ? { totalLectures: tl } : {}),
    };
    await saveSection(section);
    resetForm();
    await loadSections();
    onOpenSection(section.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل تريد حذف هذا الشعبة وكل بياناته؟")) return;
    await deleteSection(id);
    await loadSections();
  };

  const handleBackup = async (format: "json" | "excel") => {
    if (sections.length === 0) {
      setImportError("لا توجد بيانات لتصديرها.");
      return;
    }
    const file = format === "json" ? buildJsonBackup(sections) : buildExcelBackup(sections);
    const text = `نسخة احتياطية لنظام الحضور — ${sections.length} شعبة`;
    await shareFile(file, text, "نسخة احتياطية");
  };

  const handleBackupImport = async (f: File) => {
    setBackupImporting(true);
    setImportError("");
    try {
      const imported = await parseBackupFile(f);
      if (imported.length === 0) {
        setImportError("الملف لا يحتوي على مواد صالحة للاستيراد.");
        return;
      }
      for (const sec of imported) {
        await saveSection(sec);
      }
      await loadSections();
      setImportError(`تم استيراد ${imported.length} مادة بنجاح: ${imported.map(s => s.subject).join("، ")}`);
    } catch (e: any) {
      setImportError(e?.message || "حدث خطأ أثناء استيراد النسخة الاحتياطية.");
    } finally {
      setBackupImporting(false);
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 pb-6">
      <header className="safe-top sticky top-0 z-20 bg-gradient-to-b from-primary-800 to-primary-700 text-white shadow-md">
        <div className="mx-auto max-w-2xl px-3 pt-3 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/15">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-bold leading-none">نظام الحضور</h1>
                <p className="mt-1 text-[11px] opacity-80">إدارة الشعب والمحاضرات</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {onOpenReports && sections.length > 0 && (
                <button onClick={onOpenReports} className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-primary-800 active:scale-95">
                  <BarChart3 className="h-4 w-4" /> التقارير
                </button>
              )}
              <button onClick={toggleTheme} className="grid h-9 w-9 place-items-center rounded-xl bg-white/15">
                <span className="dark:hidden"><Moon className="h-4 w-4" /></span>
                <span className="hidden dark:grid"><Sun className="h-4 w-4" /></span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-3 py-4 space-y-4">
        {/* Form - نفس الكود الأصلي مع اختصار */}
        <section className="rounded-3xl bg-white dark:bg-slate-800 p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
            <Plus className="h-4 w-4 text-primary-700" /> إضافة شعبة جديدة
          </h2>

          <div className="space-y-3">
            <Field label="اسم المادة" icon={<BookOpen className="h-4 w-4" />}>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مثال: برمجة" className="input input-dark" />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="المرحلة" icon={<Layers className="h-4 w-4" />}>
                <select value={stage} onChange={(e) => setStage(e.target.value)} className="input input-dark">
                  <option value="">اختر</option>
                  {["الأولى","الثانية","الثالثة","الرابعة"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="عدد المحاضرات الكلي" icon={<CalendarDays className="h-4 w-4" />}>
                <input type="number" value={totalLectures} onChange={(e) => setTotalLectures(e.target.value)} placeholder="مثال: 15" className="input input-dark" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Segmented value={semester} onChange={setSemester} options={[{value:"1",label:"كورس أول"},{value:"2",label:"كورس ثاني"}]} />
              <Segmented value={studyType} onChange={setStudyType} options={[{value:"morning",label:"صباحي"},{value:"evening",label:"مسائي"}]} />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <FileSpreadsheet className="h-4 w-4 text-primary-700" /> ملف الطلاب (Excel)
              </label>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.json" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="block w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-primary-700 file:px-3 file:py-2 file:text-white" />
              {importing && <p className="mt-2 text-xs text-slate-400">جاري القراءة...</p>}
              {parsedNames.length > 0 && <p className="mt-2 text-xs text-emerald-600 font-bold">تم اكتشاف {parsedNames.length} طالب</p>}
              {importError && <p className="mt-2 text-xs text-red-500">{importError}</p>}
            </div>

            <button onClick={handleSave} className="w-full rounded-2xl bg-primary-700 py-3 text-sm font-bold text-white active:scale-[0.99]">حفظ وفتح الشعبة</button>
          </div>
        </section>

        {/* Sections List */}
        <section className="rounded-3xl bg-white dark:bg-slate-800 p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
            <Database className="h-4 w-4 text-primary-700" /> الشعب المحفوظة ({sections.length})
          </h2>
          {loading ? <p className="text-xs text-slate-400">جاري التحميل...</p> : sections.length === 0 ? <p className="text-xs text-slate-400">لا توجد شعب</p> : (
            <ul className="space-y-2">
              {sections.map(s => (
                <li key={s.id} className="flex items-center gap-2 rounded-2xl bg-slate-50 dark:bg-slate-700/50 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{s.subject} - {s.stage}</p>
                    <p className="text-[11px] text-slate-500">{s.students.length} طالب • {s.lectures.length} محاضرة</p>
                  </div>
                  <button onClick={() => onOpenSection(s.id)} className="rounded-xl bg-primary-700 px-3 py-2 text-xs font-bold text-white">فتح</button>
                  <button onClick={() => handleDelete(s.id)} className="grid h-8 w-8 place-items-center text-slate-400"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 space-y-2">
            <input ref={backupInputRef} type="file" accept=".json,.xlsx" onChange={(e) => e.target.files?.[0] && handleBackupImport(e.target.files[0])} className="hidden" />
            <button onClick={() => backupInputRef.current?.click()} disabled={backupImporting} className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">
              <Upload className="h-4 w-4" /> {backupImporting ? "جاري الاستيراد..." : "استيراد نسخة احتياطية (Excel / JSON)"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handleBackup("json")} disabled={sections.length===0} className="flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold disabled:opacity-40"><Share2 className="h-3.5 w-3.5" /> تصدير JSON</button>
              <button onClick={() => handleBackup("excel")} disabled={sections.length===0} className="flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold disabled:opacity-40"><Download className="h-3.5 w-3.5" /> تصدير Excel</button>
            </div>
          </div>
        </section>
      </main>

      <style>{`.input{width:100%;border-radius:0.75rem;border:1px solid #e2e8f0;background:#f8fafc;padding:0.6rem 0.75rem;font-size:0.875rem;outline:none}.input:focus{border-color:#0f766e;background:#fff}.input-dark{border-color:#334155;background:#1e293b;color:#e2e8f0}`}</style>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div><label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span className="text-primary-700">{icon}</span>{label}</label>{children}</div>;
}
function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-xl bg-slate-100 dark:bg-slate-700 p-1">{options.map(o => <button key={o.value} onClick={() => onChange(o.value)} className={`rounded-lg py-2 text-xs font-bold ${value===o.value ? "bg-white dark:bg-slate-600 text-primary-800 shadow-sm" : "text-slate-500"}`}>{o.label}</button>)}</div>;
}
