import { useParams } from "react-router";
import { EntryForm } from "@/features/entry-form";
import { PageTitle } from "@/shared/ui/page-title";

/** Yangi yozuv (/vault/new) va tahrirlash (/vault/:id/edit). */
export function EntryFormPage() {
  const editing = useParams().id !== undefined;
  return (
    <div>
      <PageTitle
        back={{ to: "/vault", label: "Parollar" }}
        title={editing ? "Yozuvni tahrirlash" : "Yangi yozuv"}
        description={
          editing
            ? "O'zgarishlar qurilmada tugma bilan tasdiqlanadi."
            : "Yozuv qurilmaga saqlanadi; parol kompyuterda saqlanmaydi."
        }
      />
      <EntryForm />
    </div>
  );
}
