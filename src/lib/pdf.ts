import type { Section } from "@/types";

function todayAR(): string {
  try {
    return new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return new Date().toISOString().slice(0,10);
  }
}

export function buildOfficialPdfHtml(section: Section, teacherName: string = ""): string {
  const dateStr = todayAR();
  const total = section.totalLectures ?? section.lectures.length;
  const completed = section.lectures.length;
  
  // حساب الغيابات لكل طالب
  const rows = section.students
    .slice()
    .sort((a,b)=>a.order-b.order)
    .map((s, idx) => {
      let abs = 0;
      for (const lec of section.lectures) {
        if (lec.attendance[s.id] === "absent") abs++;
      }
      let status = "مستمر";
      if (abs === 0) status = "مستمر";
      else if (abs === 1 || abs === 2) status = "إنذار";
      else if (abs >= 3) status = "متجاوز";
      return { idx: idx+1, name: s.name, abs, status };
    });

  const infoLine = `المادة: ${section.subject} | المرحلة: ${section.stage} - ${section.studyType === "morning" ? "صباحي" : "مسائي"} | عدد المحاضرات: ${completed} / ${total} | التاريخ: ${dateStr}`;

  const tableRows = rows.map(r => `
      <tr>
        <td>${r.idx}</td>
        <td class="name">${r.name}</td>
        <td>${r.abs}</td>
        <td>${r.status}</td>
      </tr>`).join("");

  // 6 سم فراغ علوي + جدول مبسط + توقيع وسط-يسار بدون نقاط
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>كشف غياب - ${section.subject}</title>
<style>
  @page { size: A4; margin: 1cm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; background: white; margin:0; padding:0; color:#111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .paper { width: 100%; max-width: 210mm; min-height: 277mm; margin: 0 auto; padding: 0 15mm 10mm 15mm; background: white; }
  .top-space { height: 6cm; width: 100%; }
  h2 { text-align:center; font-size:16px; margin:10px 0 6px; font-weight:bold; color:#111; }
  .info { text-align:center; font-size:11px; color:#333; margin-bottom:16px; background:#f8fafc; padding:8px 10px; border-radius:6px; border:1px solid #e2e8f0; }
  table { width:100%; border-collapse:collapse; font-size:12px; margin-top:12px; }
  th { background:#0f766e; color:white; padding:7px 6px; font-size:11px; font-weight:bold; }
  td { padding:6px 8px; border:1px solid #999; text-align:center; font-size:11px; }
  td.name { text-align:right; }
  tr:nth-child(even) { background:#f9fafb; }
  .footer-left { margin-top:70px; text-align:right; direction:rtl; font-size:13px; line-height:2.4; width:fit-content; margin-left:auto; margin-right:auto; transform: translateX(-40px); }
  @media print {
    .no-print { display:none; }
    body { background:white; }
  }
</style>
</head>
<body>
<div class="paper">
  <div class="top-space"></div>
  <h2>كشف غياب الطلبة</h2>
  <div class="info">${infoLine}</div>
  <table>
    <thead><tr><th style="width:40px">ت</th><th style="text-align:right">اسم الطالب</th><th style="width:80px">الغيابات</th><th style="width:90px">الحالة</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="footer-left">
    <div>التوقيع :</div>
    <div>مدرس المادة : ${teacherName}</div>
    <div>التاريخ :</div>
  </div>
</div>
<script>
  window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };
</script>
</body>
</html>`;
}

export function openOfficialPdf(section: Section) {
  const teacher = window.prompt("اسم مدرس المادة:", "د. جليل غضبان شكر") ?? "";
  const html = buildOfficialPdfHtml(section, teacher);
  const w = window.open("", "_blank");
  if (!w) {
    alert("يرجى السماح بالنوافذ المنبثقة لتصدير PDF");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
