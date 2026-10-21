import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Download, Search, Moon, Sun, FileSpreadsheet, AlertTriangle } from "lucide-react";
import type { Section } from "@/types";
import { getAllSections } from "@/lib/db";
import { normalizeArabic } from "@/lib/normalize";
import { exportSectionReport } from "@/lib/excel";
import { useTheme } from "@/lib/theme";

interface Props {
  onBack: () => void;
}

export default function ReportsScreen({ onBack }: Props) {
  const [theme, toggleTheme] = useTheme();
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const all = await getAllSections();
      setSections(all);
      if (all.length > 0) setSelectedId(all[0].id);
      setLoading(false);
    })();
  }, []);

  const selected = useMemo(() => sections.find(s => s.id === selectedId) || null, [sections, selectedId]);

  const reportData = useMemo(() => {
    if (!selected) return [];
    return selected.students
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(s => {
        const absents = selected.lectures.filter(l => l.attendance[s.id] === "absent").length;
        const leaves = selected.lectures.filter(l => l.attendance[s.id] === "leave").length;
        const part = selected.lectures.reduce((sum, l) => sum + (l.participation[s.id] ?? 0), 0);
        const pct = selected.totalLectures ? (absents / selected.totalLectures) * 100 : 0;
        return {
          id: s.id,
          order: s.order + 1,
          name: s.name,
          normName: s.normName,
          absents,
          leaves,
          part,
          pct,
          warned: pct >= 10,
        };
      });
  }, [selected]);

  const normQuery = normalizeArabic(query);
  const filtered = useMemo(() => {
    if (!normQuery) return reportData;
    return reportData.filter(r => r.normName.includes(normQuery));
  }, [reportData, normQuery]);

  const totals = useMemo(() => {
    if (!selected) return { students: 0, lectures: 0, totalParts: 0 };
    return {
      students: selected.students.length,
      lectures: selected.lectures.length,
      totalParts: reportData.reduce((a, b) => a + b.part, 0),
    };
  }, [selected, reportData]);

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-slate-100 dark:bg-slate-900 text-sm text-slate-400">جاري تحميل التقارير...</div>;
  }

  if (sections.length === 0) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 pb-6">
        <header className="safe-top sticky top-0 z-20 bg-gradient-to-b from-primary-800 to-primary-700 text-white shadow-md">
          <div className="mx-auto max-w-3xl px-3 py-3 flex items-center gap-3">
            <button onClick={onBack} className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><ArrowRight className="h-5 w-5" /></button>
            <h1 className="font-bold">التقارير</h1>
          </div>
        </header>
        <div className="mx-auto max-w-3xl px-4 py-20 text-center text-slate-500">لا توجد شعب للعرض</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 pb-6">
      {/* Header */}
      <header className="safe-top sticky top-0 z-20 bg-gradient-to-b from-primary-800 to-primary-700 text-white shadow-md">
        <div className="mx-auto max-w-3xl px-3 pt-3 pb-3">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 active:scale-95"><ArrowRight className="h-5 w-5" /></button>
            <div className="flex-1">
              <h1 className="text-base font-bold leading-none">التقارير الشاملة</h1>
              <p className="mt-1 text-[11px] opacity-80">مجموع الغياب والمشاركات لكل طالب</p>
            </div>
            <button onClick={toggleTheme} className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><span className="dark:hidden"><Moon className="h-4 w-4" /></span><span className="hidden dark:grid"><Sun className="h-4 w-4" /></span></button>
          </div>

          {/* Section selector */}
          <div className="mt-3 flex gap-2">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="flex-1 rounded-xl border-0 bg-white/15 px-3 py-2.5 text-sm font-bold text-white outline-none backdrop-blur"
            >
              {sections.map(s => (
                <option key={s.id} value={s.id} className="text-slate-800">
                  {s.subject} - {s.stage} ({s.students.length} طالب)
                </option>
              ))}
            </select>
            {selected && (
              <button
                onClick={() => exportSectionReport(selected)}
                className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-primary-800 active:scale-95"
              >
                <Download className="h-4 w-4" /> تصدير
              </button>
            )}
          </div>

          {/* Stats */}
          {selected && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white/15 px-2 py-2 text-center">
                <div className="text-lg font-bold leading-none">{totals.students}</div>
                <div className="mt-1 text-[10px] opacity-80">طالب</div>
              </div>
              <div className="rounded-xl bg-white/15 px-2 py-2 text-center">
                <div className="text-lg font-bold leading-none">{totals.lectures}</div>
                <div className="mt-1 text-[10px] opacity-80">محاضرة مسجلة</div>
              </div>
              <div className="rounded-xl bg-white/15 px-2 py-2 text-center">
                <div className="text-lg font-bold leading-none">{totals.totalParts}</div>
                <div className="mt-1 text-[10px] opacity-80">مجموع المشاركات</div>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 py-4">
        {/* Search */}
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-white dark:bg-slate-800 px-3 py-2 shadow-sm">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن طالب..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
        </div>

        {/* Table Header */}
        <div className="mb-2 flex items-center gap-1 px-2 text-[10px] font-bold text-slate-400">
          <span className="w-8 text-center">#</span>
          <span className="flex-1">اسم الطالب</span>
          <span className="w-12 text-center">غياب</span>
          <span className="w-12 text-center">مشاركة</span>
          <span className="w-14 text-center">نسبة</span>
        </div>

        {/* List */}
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li key={r.id} className={`flex items-center gap-1.5 rounded-2xl p-2.5 shadow-sm ${r.warned ? "bg-red-50 dark:bg-red-900/20 ring-1 ring-red-200 dark:ring-red-800" : "bg-white dark:bg-slate-800"}`}>
              <div className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${r.warned ? "bg-red-500 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500"}`}>
                {r.order}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100" dir="auto">{r.name}</p>
              </div>
              <div className="flex items-center gap-1">
                <span className={`grid h-7 w-10 place-items-center rounded-lg text-xs font-bold ${r.absents > 0 ? "bg-red-500 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-400"}`}>
                  {r.absents}
                </span>
                <span className={`grid h-7 w-10 place-items-center rounded-lg text-xs font-bold ${r.part > 0 ? "bg-emerald-500 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-400"}`}>
                  {r.part}
                </span>
                <span className={`grid h-7 w-12 place-items-center rounded-lg text-[11px] font-bold ${r.warned ? "bg-red-500 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500"}`}>
                  {r.pct ? `${Math.round(r.pct)}%` : "0%"}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {filtered.length === 0 && (
          <div className="mt-10 text-center text-sm text-slate-400">لا يوجد طلاب يطابقون البحث</div>
        )}

        <div className="mt-6 rounded-2xl bg-white dark:bg-slate-800 p-3 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-200">
            <FileSpreadsheet className="h-4 w-4" /> ملاحظة
          </div>
          <p className="mt-1 leading-relaxed">
            • <b>غياب:</b> مجموع المحاضرات اللي كان الطالب غائب فيها<br/>
            • <b>مشاركة:</b> مجموع نقاط المشاركة في كل المحاضرات<br/>
            • <b>نسبة:</b> نسبة الغياب من العدد الكلي للمحاضرات المحدد للمادة<br/>
            • الصف الأحمر يعني الطالب تجاوز 10% انذار
          </p>
        </div>
      </main>
    </div>
  );
}
