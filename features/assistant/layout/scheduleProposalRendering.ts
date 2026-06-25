export type RenderableScheduleProposalState = {
  id: string;
  status: "draft" | "confirmed" | "applied" | "superseded" | "canceled";
};

export type ScheduleProposalConflictState = {
  title: string;
  detail: string;
};

export function getRenderableScheduleProposals<
  Proposal extends RenderableScheduleProposalState,
>(
  proposals: Proposal[],
  latestProposalsById?: Map<string, Proposal>,
): Proposal[] {
  return proposals.flatMap((proposal) => {
    const latestProposal = latestProposalsById?.get(proposal.id) ?? proposal;

    return isRenderableScheduleProposal(latestProposal) ? [latestProposal] : [];
  });
}

export function isRenderableScheduleProposal(
  proposal: RenderableScheduleProposalState,
) {
  return (
    proposal.status === "draft" ||
    proposal.status === "confirmed" ||
    proposal.status === "applied"
  );
}

export function shouldRenderScheduleProposalMessageContent(input: {
  role: string;
  scheduleProposalCount: number;
}) {
  return input.role !== "assistant" || input.scheduleProposalCount === 0;
}

export function getScheduleProposalConflictNotice(input: {
  conflictAnnotations: ScheduleProposalConflictState[];
}) {
  const conflicts = input.conflictAnnotations.filter(
    (conflict) =>
      conflict.title.trim().length > 0 || conflict.detail.trim().length > 0,
  );

  if (conflicts.length === 0) {
    return null;
  }

  if (conflicts.length === 1) {
    const conflict = conflicts[0];
    const label = conflict?.title.trim() || conflict?.detail.trim();

    return label ? `Conflict: ${label}` : "Conflicts with saved preferences";
  }

  return `${conflicts.length} conflicts with saved preferences`;
}
