# Why this small experiment exists

Research rechecked on 2026-09-27. HarborDiff is an independently implemented experiment in a well-served category. These references establish existing tools and concrete requests; they do not predict adoption or GitHub stars. The current evidence supports keeping the published experiment available while deferring feature expansion until real workflow feedback arrives.

## Directions considered

| Direction | Evidence | Decision |
| --- | --- | --- |
| README setup checking | [pulp issue #3](https://github.com/Generous-Corp/pulp/issues/3) documents a setup path ending in a failure. [SetupProof](https://github.com/setupproof/setupproof) and [RunDOC](https://github.com/zombocom/rundoc) already execute documented commands. | The proposed source-line reports and configuration convenience were insufficient differentiation. |
| Environment-variable documentation | [Microsoft agent-framework issue #5400](https://github.com/microsoft/agent-framework/issues/5400) identifies missing environment templates in seven samples. [envsniff](https://github.com/harish124/envsniff) already scans code and generates templates. | Concrete demand, but substantial existing coverage. |
| HAR comparison and issue reports | [Compare #149](https://github.com/sitespeedio/compare/issues/149#issuecomment-1435468599) clarifies a need to compare different pages and environments. [Compare #150](https://github.com/sitespeedio/compare/issues/150) requests CSV/Excel export. | Historical demand signals, but HarborDiff currently provides neither explicit environment mapping nor CSV/Excel export. They do not establish an unmet need solved by this project. |

Both issues remained open when rechecked. Compare already offers per-request size, status, and timing differences; its [current request-diff condition](https://github.com/sitespeedio/compare/blob/3e782ee1c515aab131bb555026828c8450839cba/public/js/compare/generate.js#L272) requires equal page URLs. Its [sharing implementation](https://github.com/sitespeedio/compare/blob/3e782ee1c515aab131bb555026828c8450839cba/public/js/compare/share.js#L94) also downloads a bundle containing both original HAR files. That differs from CSV/Excel or HarborDiff's compact Markdown/JSON reports. An open historical issue alone does not validate a new product.

## Existing choices

- [sitespeedio/compare](https://github.com/sitespeedio/compare): a mature HAR comparison application with waterfalls, request differences, timing and size changes, query normalization, and privacy-conscious local input. This is the closest established choice.
- [harlite](https://github.com/brucehart/harlite): a Rust CLI with HAR comparison, SQL analysis, CI budgets, redaction, and self-contained HTML reports. Exporting a report or supporting a CLI is not a novel feature.
- [har-viewer](https://github.com/0xpanadol/har-viewer): an offline browser viewer with rich request inspection, sanitized export, and multi-file summary comparison.
- [Harmask](https://github.com/Async360/harmask/tree/869dc6c3fbee9d8e3aa308f3600c5b208b60867d): a closely related browser-only before/after HAR comparator with no build step or dependencies, redaction before rendering, and status, timing, size, header, and cookie differences. It matches method and path while ignoring origin and query, then pairs duplicates in order. HarborDiff's URL grouping and aggregate reports are different tradeoffs, not proof of a better workflow.
- [HAR Skills](https://github.com/cyberspacesec/har-skills): Go CLI and SDK for analysis, diff, export, and agent-oriented workflows.
- [Google HAR Analyzer](https://toolbox.googleapps.com/apps/har_analyzer/): an existing browser-based analysis choice.

This review inspected current documentation and relevant source; it did not run a comparative usability or performance study. No reliably retrieved HTTP Toolkit diff issue was found in this research.

## Hypothesis to validate

Some developers who cannot share original HAR files may prefer a focused flow: compare two captures, see a few changes worth inspecting, and copy a compact report into an issue. HarborDiff makes local processing, metric coverage, request grouping, and private-by-default reports visible in this flow. Whether the recipient can understand that report without URLs also needs validation.

This is a usability hypothesis rather than a claim of exclusive functionality. Validation should measure whether users can correctly identify relevant changes and produce a useful report faster than with their current process. Observe real feedback, repeat use, reports of incorrect matches, and requests to improve exports. Stars alone are not a usage measure.

Use synthetic captures for public demonstrations. Real HAR files may include confidential URLs, request data, and response content. No claims about performance causes should be inferred from one before/after pair.
