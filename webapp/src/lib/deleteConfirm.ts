export function confirmDeleteAction(targetLabel?: string): boolean {
  const subject = targetLabel ? ` ${targetLabel}` : "";
  const typed = window.prompt(
    `Delete${subject}? This is permanent.\n\nType DELETE to confirm.`
  );
  return typed?.trim() === "DELETE";
}

export function confirmDeleteOrganizationByName(orgName: string): boolean {
  const expected = `DELETE ${orgName}`;
  const typed = window.prompt(
    `DO YOU WANT TO DELETE "${orgName}"?\n\nType exactly:\n${expected}`
  );
  return typed?.trim() === expected;
}
