import { usePermissions } from "@/hooks/usePermissions";
import { DepartmentsSection } from "./team/DepartmentsSection";

export default function Team() {
  const { canWrite } = usePermissions();

  return (
    <div className="p-6 space-y-10">
      <DepartmentsSection canWrite={canWrite} />
    </div>
  );
}
