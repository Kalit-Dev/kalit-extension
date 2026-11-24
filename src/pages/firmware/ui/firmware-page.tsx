import { useNavigate } from "react-router";
import { useDevice } from "@/entities/device";
import { FirmwareUpdate, useFirmware } from "@/features/update-firmware";
import { PageTitle } from "@/shared/ui/page-title";

/**
 * Qurilma holatidan mustaqil sahifa (/firmware): yangilash paytida engine uziladi, shuning uchun u
 * faza bo'yicha yo'naltirishdan chiqarilgan. Qulflanmagan holatda ham, qurilma ulanmagan bo'lsa ham ochiladi.
 */
export function FirmwarePage() {
  const unlocked = useDevice((s) => s.phase === "unlocked");
  const working = useFirmware((s) => s.view.step === "working");
  const navigate = useNavigate();
  const exit = unlocked ? { to: "/settings/general", label: "Sozlamalar" } : { to: "/", label: "Orqaga" };

  if (!unlocked) {
    // Ulanmagan/qulflangan: qobiq markaziy kartochka beradi.
    return (
      <div className="grid gap-0">
        <FirmwareUpdate flat onDone={() => navigate("/", { replace: true })} />
        {!working && (
          <button
            type="button"
            className="border-t px-6 py-3 text-left text-sm text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/", { replace: true })}
          >
            ← {exit.label}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="max-w-2xl">
      <PageTitle title="Firmware" description="Qurilma dasturini yangilash." back={working ? undefined : exit} />
      <FirmwareUpdate onDone={() => navigate("/", { replace: true })} />
    </div>
  );
}
