import { usePermissions } from "@/hooks/usePermissions";
import { TeamMembersSection } from "./team/TeamMembersSection";
import { DepartmentsSection } from "./team/DepartmentsSection";

export default function Team() {
  const { isOwner, canWrite, canManageTeam } = usePermissions();

  return (
    <div className="p-6 space-y-10 max-w-7xl mx-auto">
      <TeamMembersSection isOwner={isOwner} canManageTeam={canManageTeam} />
      <DepartmentsSection canWrite={canWrite} />
    </div>
  );
}
