import assert from "node:assert/strict";
import test from "node:test";

import {
  getRenderableScheduleProposals,
  getScheduleProposalConflictNotice,
  shouldRenderScheduleProposalMessageContent,
} from "./scheduleProposalRendering.ts";

type TestProposal = {
  id: string;
  status: "draft" | "confirmed" | "applied" | "superseded" | "canceled";
};

test("getRenderableScheduleProposals uses latest proposal status", () => {
  const proposal = { id: "proposal-1", status: "draft" } satisfies TestProposal;
  const latestProposalsById = new Map<string, TestProposal>([
    ["proposal-1", { ...proposal, status: "superseded" }],
  ]);

  assert.deepEqual(
    getRenderableScheduleProposals([proposal], latestProposalsById),
    [],
  );
});

test("getRenderableScheduleProposals keeps draft and applied proposal cards", () => {
  const draft = { id: "proposal-draft", status: "draft" } satisfies TestProposal;
  const applied = {
    id: "proposal-applied",
    status: "applied",
  } satisfies TestProposal;
  const canceled = {
    id: "proposal-canceled",
    status: "canceled",
  } satisfies TestProposal;

  assert.deepEqual(
    getRenderableScheduleProposals([draft, applied, canceled]).map(
      (proposal) => proposal.id,
    ),
    ["proposal-draft", "proposal-applied"],
  );
});

test("shouldRenderScheduleProposalMessageContent treats proposal cards as assistant body", () => {
  assert.equal(
    shouldRenderScheduleProposalMessageContent({
      role: "assistant",
      scheduleProposalCount: 1,
    }),
    false,
  );
  assert.equal(
    shouldRenderScheduleProposalMessageContent({
      role: "assistant",
      scheduleProposalCount: 0,
    }),
    true,
  );
  assert.equal(
    shouldRenderScheduleProposalMessageContent({
      role: "user",
      scheduleProposalCount: 1,
    }),
    true,
  );
});

test("getScheduleProposalConflictNotice keeps conflict context compact", () => {
  assert.equal(
    getScheduleProposalConflictNotice({
      conflictAnnotations: [
        {
          title: "Work hours",
          detail: "This overlaps work.",
        },
      ],
    }),
    "Conflict: Work hours",
  );
  assert.equal(
    getScheduleProposalConflictNotice({
      conflictAnnotations: [
        {
          title: "Work hours",
          detail: "This overlaps work.",
        },
        {
          title: "Sleep window",
          detail: "This overlaps sleep.",
        },
      ],
    }),
    "2 conflicts with saved preferences",
  );
  assert.equal(
    getScheduleProposalConflictNotice({
      conflictAnnotations: [
        {
          title: "",
          detail: "",
        },
      ],
    }),
    null,
  );
});
