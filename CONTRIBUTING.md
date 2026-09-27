# Contributing to HarborDiff

Run `npm test` with Node.js 20 or newer. Run `npm start` to open the app locally. There is no dependency installation or build step.

For a change to matching, unknown metrics, or report output, include a small synthetic HAR fixture and a regression test. Keep browser rendering separate from the comparison engine so the CLI and browser stay consistent.

Please explain the user task your change helps. Larger changes benefit from an issue first. Fixes, examples, accessibility improvements, translations, and documentation are welcome.

Never commit real browsing captures or credentials. Keep all examples synthetic. Avoid external scripts, fonts, analytics, and network calls in the app. The browser application must work without uploading capture contents.

Use the MIT license for contributions. Be considerate when discussing bugs or proposals, and address the work rather than the person.
