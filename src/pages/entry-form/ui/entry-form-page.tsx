import { useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import { EntryForm } from "@/features/entry-form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

/** Yangi yozuv (/vault/new) va tahrirlash (/vault/:id/edit): ro'yxat ustida ochiladigan dialog. */
export function EntryFormPage() {
  const editing = useParams().id !== undefined;
  const navigate = useNavigate();
  const close = useCallback(() => navigate("/vault"), [navigate]);
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex max-h-[min(90vh,52rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle>{editing ? "Yozuvni tahrirlash" : "Yangi yozuv"}</DialogTitle>
          <DialogDescription className="sr-only">
            O'zgarishlar qurilmada tugma bilan tasdiqlanadi.
          </DialogDescription>
        </DialogHeader>
        <EntryForm onClose={close} />
      </DialogContent>
    </Dialog>
  );
}
