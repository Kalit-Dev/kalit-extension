import { BackupExport, BackupRestore } from "@/features/backup";

export function SettingsBackupPage() {
  return (
    <div className="grid max-w-2xl gap-5">
      <BackupExport />
      <BackupRestore />
    </div>
  );
}
