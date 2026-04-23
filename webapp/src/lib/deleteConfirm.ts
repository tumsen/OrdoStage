export function confirmDeleteAction(targetLabel?: string): boolean {
  const subject = targetLabel ? ` ${targetLabel}` : "";
  const typed = window.prompt(
    `Delete${subject}? This action is permanent.\n\nType DELETE to confirm.`
  );
  return typed?.trim() === "DELETE";
}

export function confirmDeleteOrganizationByName(orgName: string): boolean {
  const expected = `DELETE ${orgName}`;
  const typed = window.prompt(
    `Delete organization "${orgName}"? This action is permanent.\n\nType ${expected} to confirm.`
  );
  return typed?.trim() === expected;
}
