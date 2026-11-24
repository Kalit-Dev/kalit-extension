import { useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import { EntryForm } from "@/features/entry-form";
import { Dialog } from "@/shared/ui/dialog";

/** Yangi yozuv (/vault/new) va tahrirlash (/vault/:id/edit): ro'yxat ustida ochiladigan dialog. */
export function EntryFormPage() {
  const editing = useParams().id !== undefined;
  const navigate = useNavigate();
  const close = useCallback(() => navigate("/vault"), [navigate]);
  return (
    <Dialog
      title={editing ? "Yozuvni tahrirlash" : "Yangi yozuv"}
      description={editing ? "O'zgarishlar qurilmada tugma bilan tasdiqlanadi." : undefined}
      onClose={close}
    >
      <EntryForm onClose={close} />
    </Dialog>
  );
}
