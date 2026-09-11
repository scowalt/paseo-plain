// Harder synthetic cases: no user messages, project history, or real operations.
// Review points are an independent checklist, never included in model input.
export const hardPromptSamples = [
  {
    id: 'interleaved-engineering-update',
    original: `The changes are implemented locally and ready for review. Nothing has been deployed. The important distinction is that this is an implementation milestone, not a claim about production behavior.

## What changed at the implementation layer
- **Cache repair**
  - The repair removes empty cache entries only from the namespace owned by the importer.
  - Entries in other namespaces are left alone. This ownership boundary is the central constraint on what repair is allowed to touch.
- **Upload retry coordination**
  - Concurrent retries for the same file and destination now share the pending request.
  - Different destinations still receive separate requests. The destination is part of the matching rule, rather than something the coordinator ignores.

## What the checks establish
- **Cache evidence**
  - I tested repair with isolated fixtures containing both importer-owned entries and unrelated entries.
  - The expected empty entries were removed, and unrelated entries survived. These were synthetic fixtures, not a copy of production data.
- **Retry evidence**
  - I tested simultaneous retries with a fake transport.
  - Matching retries shared a request, while retries to different destinations remained separate.

## Where that evidence stops
- **Cache limitations**
  - A malformed cache is reported and left unchanged; the repair does not attempt to reconstruct it.
  - Large-cache performance has not been measured.
- **Retry limitations**
  - Coordination exists only within the current process. After a process restart, a retry can submit a new request.
  - A real network outage has not been tested, so the fixture result does not establish behavior during one.

## What remains untouched
- The cache repair does not change user preferences or credentials.
- The retry change does not cancel uploads that were already running before a retry was requested.
- I have not changed the production service or restarted any worker.

## The next decision point
Review both changes, then run \`npm test\` before testing an interrupted upload in a disposable environment. If that interruption test fails, leave production unchanged. Passing these checks does not authorize a production deployment; that still requires the service owner's approval.

That is the overall shape: the local work is complete, the fixture evidence is bounded, and production remains a separate approval decision.`,
    review: [
      'Local implementation ready for review; nothing deployed; production service and workers unchanged',
      'Cache removes empty importer-owned entries only; other namespaces preserved',
      'Cache fixture checks by the assistant: expected removals and preservation; synthetic, not production data',
      'Malformed cache reported and unchanged, no reconstruction; large-cache performance unmeasured',
      'Cache repair preserves user preferences and credentials',
      'Concurrent retry matching includes both file and destination; different destinations separate',
      'Fake-transport tests confirmed request sharing and separation, but no real outage tested',
      'Retry coordination is process-local; restart can allow a new submission',
      'Already-running uploads are not canceled',
      'Review both changes, run the protected test command, then test interruption in a disposable environment',
      'On interruption-test failure leave production unchanged; passing checks is not authorization; owner approval still required',
    ],
  },
  {
    id: 'causal-explanation',
    original: `The stale display is consistent with the reader retaining an old snapshot of \`state/index.json\`. That is a working explanation, not a proven diagnosis. The distinction between a plausible explanation and an established cause matters here.

## The write-side picture
- **What the observation actually shows**
  - The writer finished saving the updated index before sending the refresh event.
  - A separate read from disk includes the newly added record.
- **What that rules out for this observation**
  - The new record is not missing from the saved index.
  - This does not tell us whether every other write path is correct; it describes the write that was inspected.

## The reader-side picture
- **The existing reader**
  - A reader that was already open continues to show the old list after the event.
  - Closing that reader and opening it again shows the new record.
- **The newly connected reader**
  - A reader opened after the save sees the new record immediately.
  - The mismatch is therefore between these readers' displayed results, not between two different saved versions observed on disk.

## The mechanism that would connect those observations
- **The proposed explanation**
  - The existing reader may be keeping its in-memory snapshot rather than re-reading the index when the event arrives.
  - Reopening would then obtain a fresh snapshot, which fits the observed recovery.
- **The remaining uncertainty**
  - We have not yet traced the event handler, so we do not know whether the event is missed or handled without updating the snapshot.
  - Both possibilities remain open. The current evidence does not choose between them.

## The operation that sounds relevant but does not answer the question
- Rebuilding the index would repeat work whose saved result was already checked.
- It would not show whether the existing reader received or acted on the event.
- Deleting the saved index is not recommended on this evidence.

## The next useful observation
Trace the refresh handler on an already-open reader and check whether it runs and replaces that reader's snapshot. If it does not run, investigate event delivery. If it runs but keeps the old snapshot, investigate the snapshot update. I have not performed that tracing or changed the reader.

In short, the disk state and displayed state are different observations, and the next investigation should distinguish the two remaining reader-side possibilities rather than assume either one is already proven.`,
    review: [
      'Reader retaining old snapshot is a working explanation, not a proven diagnosis',
      'Saved index write finished before refresh event; independent disk read contains new record',
      'Observation applies to inspected write, not all write paths',
      'Already-open reader stays stale; closing/reopening fixes its display',
      'New reader opened after save sees record immediately; difference is displayed results, not observed saved versions',
      'Proposed in-memory snapshot explanation fits recovery but is unproven',
      'Handler not traced; missed event and handled event without snapshot update both remain possible',
      'Rebuilding repeats checked saved work and does not distinguish event delivery from handling',
      'Do not recommend deleting index on this evidence',
      'Trace already-open reader: no handler run means investigate delivery; handler without replacement means investigate snapshot update',
      'Assistant has not traced or changed reader',
    ],
  },
  {
    id: 'mixed-reference-and-procedure',
    original: `The import tool is ready for a local review, not an unrestricted live run. Its modes have different effects, so the mode distinction needs to remain explicit rather than being flattened into a generic instruction to run the tool.

## The behavior map
| Mode | Reads | Writes |
| --- | --- | --- |
| Preview | Saved snapshot | None |
| Check | Saved snapshot | Temporary files only |
| Apply | Current data | Approved changes only |

The table is the mode contract. In particular, Check can write temporary files even though it does not modify current data. Preview does not refresh its snapshot while it is open. Reopening Preview loads the latest saved snapshot, which can still be older than current data.

## The review sequence
The following steps are ordered. They are not interchangeable options.

1. Open Preview and inspect the proposed changes.
   - If the snapshot is too old for the review, obtain a new saved snapshot before continuing.
2. Run \`node tools/check-import.mjs\` against that snapshot.
   - If Check fails, keep its temporary output for review and do not use Apply.
   - If Check passes, review its report rather than treating the pass as approval.
3. Use Apply only after a data owner approves the reviewed changes.
   - If current data changed after the snapshot was taken, repeat the review with a new snapshot before Apply.

## The authorization boundary
Only data owners may approve changes. Being a data owner does not waive the required review, and passing Check does not grant approval. The approval applies to the reviewed changes, not to any later changes that happen to be present.

## What the evidence covers
I exercised Preview and Check with synthetic data. I did not run Apply, inspect production data, or test concurrent edits. The current checks do not establish that a live import is safe under concurrent modification.

## The closing distinction
This is a reviewed-change workflow, not a blanket permission to write. Keep the mode behavior, the ordered review steps, and the limits of the test evidence separate enough to use correctly.`,
    review: [
      'Ready for local review, not unrestricted live run',
      'Retain every mode/table cell: Preview saved snapshot/no writes, Check saved snapshot/temp files, Apply current data/approved changes only',
      'Check can write temporary files but does not modify current data',
      'Preview does not refresh while open; reopen uses latest saved snapshot, possibly older than current data',
      'Ordered steps and protected command/numbers intact',
      'Outdated snapshot requires a new saved snapshot before continuing',
      'Failed Check: preserve temporary output and do not Apply; passed Check: report review still required',
      'Apply only after data-owner approval of reviewed changes',
      'Data changes after snapshot require repeat review with new snapshot before Apply',
      'Only data owners approve; ownership does not waive review; checks do not grant approval or authorize later changes',
      'Assistant tested only Preview/Check with synthetic data, not Apply, production data, or concurrent edits',
      'Live-import safety under concurrent modification is not established',
    ],
  },
] as const;
