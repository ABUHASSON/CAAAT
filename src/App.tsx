import { useEffect, useState } from "react";
import SetupScreen from "@/components/SetupScreen";
import ClassroomScreen from "@/components/ClassroomScreen";
import ReportsScreen from "@/components/ReportsScreen";

export default function App() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showReports, setShowReports] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [newWorker, setNewWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (navigator.storage && (navigator.storage as any).persist) {
      (navigator.storage as any).persist();
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        reg.update();
        if (reg.waiting) {
          setNewWorker(reg.waiting);
          setUpdateReady(true);
        }
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setNewWorker(worker);
              setUpdateReady(true);
            }
          });
        });
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });
    }
  }, []);

  const applyUpdate = () => {
    if (newWorker) newWorker.postMessage("SKIP_WAITING");
    else window.location.reload();
  };

  const UpdateBanner = updateReady ? (
    <div className="fixed top-0 inset-x-0 z-[100] bg-emerald-600 text-white px-4 py-3 flex items-center justify-between text-sm font-bold shadow-lg animate-slide-down">
      <span>تحديث جديد متوفر</span>
      <button onClick={applyUpdate} className="bg-white text-emerald-700 px-3 py-1 rounded-full text-xs active:scale-95">تحديث الآن</button>
    </div>
  ) : null;

  if (showReports) {
    return (
      <>
        {UpdateBanner}
        <div className={updateReady ? "pt-12" : ""}>
          <ReportsScreen onBack={() => setShowReports(false)} />
        </div>
      </>
    );
  }

  if (openId) {
    return (
      <>
        {UpdateBanner}
        <div className={updateReady ? "pt-12" : ""}>
          <ClassroomScreen sectionId={openId} onBack={() => setOpenId(null)} />
        </div>
      </>
    );
  }

  return (
    <>
      {UpdateBanner}
      <div className={updateReady ? "pt-12" : ""}>
        <SetupScreen onOpenSection={setOpenId} onOpenReports={() => setShowReports(true)} />
      </div>
    </>
  );
}
