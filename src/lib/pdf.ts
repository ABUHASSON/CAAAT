import type { Section } from "@/types";

function todayAR(): string {
  try {
    return new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function fmtDateShort(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    const day = d.getDate();
    const month = d.toLocaleDateString("en-GB", { month: "short" });
    return `${day}-${month}`;
  } catch { return iso; }
}

export function buildOfficialPdfHtml(section: Section, teacherName: string = ""): string {
  const dateStr = todayAR();
  const total = section.totalLectures ?? section.lectures.length;
  const completed = section.lectures.length;
  const allRows = section.students.slice().sort((a,b)=>a.order-b.order).map((s) => {
      let abs = 0;
      for (const lec of section.lectures) if (lec.attendance[s.id] === "absent") abs++;
      let status = "متجاوز";
      if (abs >= 3 && abs < 5) status = "إنذار";
      else if (abs >= 5) status = "متجاوز نهائي";
      return { name: s.name, abs, status };
    }).filter(r => r.abs >= 3);
  const rows = allRows.map((r, i) => ({ idx: i+1, ...r }));
  const infoLine = `المادة: ${section.subject} | المرحلة: ${section.stage} - ${section.studyType === "morning" ? "صباحي" : "مسائي"} | عدد المحاضرات: ${completed} / ${total} | الطلبة المتجاوزون 3 غيابات فأكثر | التاريخ: ${dateStr}`;
  const tableRows = rows.length > 0 ? rows.map(r => `<tr><td>${r.idx}</td><td class="name">${r.name}</td><td>${r.abs}</td><td>${r.status}</td></tr>`).join("") : `<tr><td colspan="4" style="padding:20px; text-align:center; color:#666">لا يوجد طلبة متجاوزين 3 غيابات فأكثر</td></tr>`;
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كشف غياب - ${section.subject}</title><style>@page{size:A4;margin:1cm} *{box-sizing:border-box} body{font-family:'Segoe UI',Tahoma,sans-serif;background:white;margin:0;padding:0;color:#111} .paper{width:100%;max-width:210mm;min-height:277mm;margin:0 auto;padding:0 15mm 10mm 15mm;background:white} .top-space{height:6cm;width:100%} h2{text-align:center;font-size:16px;margin:10px 0 6px;font-weight:bold} .info{text-align:center;font-size:11px;color:#333;margin-bottom:16px;background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid #e2e8f0} table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px} th{background:#0f766e;color:white;padding:7px 6px;font-size:11px;font-weight:bold} td{padding:6px 8px;border:1px solid #999;text-align:center;font-size:11px} td.name{text-align:right} tr:nth-child(even){background:#f9fafb} .footer-left{margin-top:70px;text-align:right;direction:rtl;font-size:13px;line-height:2.4;width:fit-content;margin-left:auto;margin-right:auto;transform:translateX(-40px)} @media print{.no-print{display:none}body{background:white}}</style></head><body><div class="paper"><div class="top-space"></div><h2>كشف غياب الطلبة</h2><div class="info">${infoLine}</div><table><thead><tr><th style="width:40px">ت</th><th style="text-align:right">اسم الطالب</th><th style="width:80px">الغيابات</th><th style="width:90px">الحالة</th></tr></thead><tbody>${tableRows}</tbody></table><div class="footer-left"><div>التوقيع :</div><div>مدرس المادة : ${teacherName}</div><div>التاريخ :</div></div></div><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
}

export function openOfficialPdf(section: Section) {
  const teacher = window.prompt("اسم مدرس المادة:", "") ?? "";
  const html = buildOfficialPdfHtml(section, teacher);
  const w = window.open("", "_blank");
  if (!w) { alert("يرجى السماح بالنوافذ المنبثقة لتصدير PDF"); return; }
  w.document.open(); w.document.write(html); w.document.close();
}


// ===== مصفوفة الغياب - تصدير كصورة PNG واحدة (بدون طباعة) =====
export function buildMatrixElement(section: Section, teacherName: string = ""): HTMLDivElement {
  const sortedLectures = [...section.lectures].sort((a,b)=>a.date.localeCompare(b.date));
  const dates = sortedLectures.map(l => l.date);
  const headerTitle = `${section.subject} - ${section.stage} / ${section.studyType === "morning" ? "صباحي" : "مسائي"} / الكورس ${section.semester === "2" ? "الثاني" : "الأول"}`;
  const fmt = (iso: string) => {
    try { const d = new Date(iso + "T00:00:00"); return `${d.getDate()}-${d.toLocaleDateString("en-GB", { month: "short" })}`; } catch { return iso; }
  };
  const div = document.createElement("div");
  div.style.cssText = "width:900px; background:white; font-family:'Segoe UI',Tahoma,sans-serif; color:#111; padding:0; direction:rtl;";
  const headerRow = `<tr><th style="width:36px;background:#0f766e;color:white;padding:8px 2px;font-size:13px;border:1px solid #0f766e">ت</th><th style="background:#0f766e;color:white;padding:8px;text-align:center;font-size:14px;border:1px solid #0f766e;min-width:220px">اسم الطالب</th>${dates.map(d=>`<th style="background:#0f766e;color:white;padding:8px 2px;font-size:12px;border:1px solid #0f766e">${fmt(d)}</th>`).join("")}</tr>`;
  const bodyRows = section.students.slice().sort((a,b)=>a.order-b.order).map((s, idx) => {
    const cells = dates.map(d => {
      const lec = sortedLectures.find(l=>l.date===d);
      const st = lec?.attendance[s.id] ?? "present";
      if (st === "absent") return `<td style="color:#dc2626;font-weight:900;font-size:15px;border:1px solid #cbd5e1;padding:6px 2px;text-align:center">✕</td>`;
      if (st === "leave") return `<td style="color:#d97706;font-weight:700;font-size:13px;border:1px solid #cbd5e1;padding:6px 2px;text-align:center">إ</td>`;
      return `<td style="color:#059669;font-weight:900;font-size:15px;border:1px solid #cbd5e1;padding:6px 2px;text-align:center">✓</td>`;
    }).join("");
    const bg = idx % 2 === 0 ? "#a5f3fc" : "#ffffff";
    return `<tr style="background:${bg}"><td style="font-weight:bold;border:1px solid #cbd5e1;padding:6px 2px;text-align:center;font-size:13px">${idx+1}</td><td style="border:1px solid #cbd5e1;padding:6px 8px;text-align:right;font-size:13px">${s.name}</td>${cells}</tr>`;
  }).join("");
  const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  div.innerHTML = `
    <div style="background:#0f766e;color:white;text-align:center;padding:12px 10px;font-size:18px;font-weight:bold">${headerTitle}</div>
    <div style="text-align:center;font-size:12px;color:#333;padding:8px;background:#f8fafc;border:1px solid #e2e8f0">عدد المحاضرات: ${dates.length} | التاريخ: ${dateStr} | ✓ حاضر &nbsp; ✕ غائب &nbsp; إ إجازة</div>
    <table style="width:100%;border-collapse:collapse"><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>
    <div style="text-align:center;font-size:11px;color:#444;margin-top:10px">مصفوفة الغياب الكاملة للمادة - كل عمود يمثل محاضرة واحدة</div>
    <div style="margin-top:30px;text-align:center;font-size:13px;line-height:2.2"><div>التوقيع : </div><div>مدرس المادة : ${teacherName}</div><div>التاريخ : </div></div>
  `;
  return div;
}

export async function exportMatrixAsImage(section: Section) {
  const teacher = window.prompt("اسم مدرس المادة:", "") ?? "";
  // عنصر مؤقت خارج الشاشة
  const el = buildMatrixElement(section, teacher);
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "0";
  document.body.appendChild(el);
  try {
    // @ts-ignore - يتم تحميلها ديناميكياً
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png", 1));
    if (!blob) throw new Error("فشل إنشاء الصورة");
    const fileName = `غياب-${section.subject}-${section.stage}.png`;
    const file = new File([blob], fileName, { type: "image/png" });
    // مشاركة مباشرة على الموبايل (واتساب - تليجرام - حفظ)
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: fileName }); return; } catch {}
    }
    // بديل: تحميل الصورة
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    // عرض الصورة في نافذة جديدة للمعاينة والحفظ اليدوي
    const w = window.open("", "_blank");
    if (w) { w.document.write(`<img src="${url}" style="width:100%">`); }
  } catch (e) {
    alert("حدث خطأ أثناء تصدير الصورة. تأكد من تثبيت html2canvas: npm install html2canvas");
    console.error(e);
  } finally {
    el.remove();
  }
}

// اسم قديم للتوافق - الآن يصدّر كصورة
export const openMatrixPdf = exportMatrixAsImage;
export const buildMatrixPdfHtml = (section: Section, teacherName: string = "") => {
  const el = buildMatrixElement(section, teacherName);
  return el.outerHTML;
};
