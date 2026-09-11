// Synthetic review cases, separate from the prompt's teaching examples.
// References demonstrate valid outputs; they are never supplied to the model.
export const promptSamples = [
  {
    id: 'status',
    original: `## Where the fix stands
The retry fix is implemented locally. It prevents duplicate requests when the connection drops during an upload. This is the local implementation milestone.

## What the checks tell us
I ran \`npm test\`, and all 18 tests passed. Those tests use a simulated connection failure rather than a real network outage.

## What remains outside that evidence
I have not tested staging or production. Existing uploads are unchanged.

## The next validation step
Test an interrupted upload in staging before deploying to production. If the staging check fails, leave production unchanged.

The distinction matters: the local fix is ready, but the production outcome is not established.`,
    reference: 'The retry fix is implemented locally and prevents duplicate requests when the connection drops during an upload. I ran `npm test`, and all 18 tests passed using a simulated connection failure, not a real network outage. Existing uploads are unchanged.\n\nI have not tested staging or production. Test an interrupted upload in staging before deploying to production. If that check fails, leave production unchanged.',
    protected: ['`npm test`', '18'],
    review: ['Local implementation; duplicate requests when a connection drops during upload', 'Assistant ran the command; all tests passed with the original count', 'Simulated failure, not a real outage', 'Neither staging nor production tested; existing uploads unchanged', 'Staging interruption check before production; leave production unchanged on failure'],
  },
  {
    id: 'recommendation',
    original: `## The preferred approach
Use on-demand reports for the trial. They require less maintenance than a background reporting service. That lower maintenance burden is the reason to prefer them for the trial.

## The freshness tradeoff
A report shows the data from when it was requested. It does not refresh while you view it.

## Who can enable it
Only team administrators may enable the reporting feature. Enabling it also requires the security review to pass.

## The fallback that remains available
Keep the existing spreadsheet export available until the trial ends. If report generation fails, use that export.

## The decision in one line
On-demand reports are the recommendation for the trial, with the spreadsheet export retained as the fallback.`,
    reference: 'Use on-demand reports for the trial because they require less maintenance than a background reporting service. A report shows the data from when it was requested and does not refresh while you view it.\n\nOnly team administrators may enable reporting, and the security review must also pass. Keep the existing spreadsheet export available until the trial ends, and use it if report generation fails.',
    protected: [],
    review: ['Recommendation limited to the trial, based on lower maintenance than a background service', 'Data as of request; no refresh during viewing', 'Only team administrators may enable; security review also required, neither alone sufficient', 'Existing spreadsheet export retained until trial ends; use it if generation fails'],
  },
  {
    id: 'procedure',
    original: `## The recovery sequence
The important thing here is to follow these steps in order.

1. Stop the test worker with \`systemctl --user stop demo-worker\`.
2. Run \`npm test\` before continuing.
   - If a test fails, leave the worker stopped and save the test output for the maintainer.
3. Start the worker with \`systemctl --user start demo-worker\` only if all tests pass.

## What this sequence does not do
These steps do not change saved settings. I have not run them on your machine.

## The actual boundary
Do not skip the test step. Passing tests is required before starting the worker again.`,
    reference: 'Follow these steps in order:\n\n1. Stop the test worker with `systemctl --user stop demo-worker`.\n2. Run `npm test` before continuing.\n   - If a test fails, leave the worker stopped and save the test output for the maintainer.\n3. Start the worker with `systemctl --user start demo-worker` only if all tests pass.\n\nThese steps do not change saved settings. I have not run them on your machine.',
    protected: ['1', '`systemctl --user stop demo-worker`', '2', '`npm test`', '3', '`systemctl --user start demo-worker`'],
    review: ['All steps in order, with commands unchanged', 'Failure condition stays attached to testing; worker stays stopped and output saved for maintainer', 'Start only if all tests pass; no skipped test step', 'Saved settings unchanged; assistant did not run steps on the user machine'],
  },
] as const;
