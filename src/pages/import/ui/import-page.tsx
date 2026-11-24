import { ImportEntries } from "@/features/import-entries";
import { PageTitle } from "@/shared/ui/page-title";

export function ImportPage() {
  return (
    <div>
      <PageTitle
        title="Import"
        description="Parol menejeridan eksport qilingan fayldan yozuvlarni qurilmaga ko'chirish."
      />
      <ImportEntries />
    </div>
  );
}
