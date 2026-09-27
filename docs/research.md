# Why this small experiment exists

Research checked on 2026-09-26. HarborDiff is an independently implemented experiment in a well-served category. These references establish existing tools and concrete requests; they do not predict adoption or GitHub stars.

## Directions considered

| Direction | Evidence | Decision |
| --- | --- | --- |
| README setup checking | [pulp issue #3](https://github.com/Generous-Corp/pulp/issues/3) documents a setup path ending in a failure. [SetupProof](https://github.com/setupproof/setupproof) and [RunDOC](https://github.com/zombocom/rundoc) already execute documented commands. | The proposed source-line reports and configuration convenience were insufficient differentiation. |
| Environment-variable documentation | [Microsoft agent-framework issue #5400](https://github.com/microsoft/agent-framework/issues/5400) identifies missing environment templates in seven samples. [envsniff](https://github.com/harish124/envsniff) already scans code and generates templates. | Concrete demand, but substantial existing coverage. |
| HAR comparison and issue reports | [sitespeedio/compare issue #149](https://github.com/sitespeedio/compare/issues/149) contains a request to compare individual response sizes. [Its issue list](https://github.com/sitespeedio/compare/issues) also lists export-results request #150. | A bounded experiment with an immediate visual demo, straightforward static hosting, and no account requirement. |

The comparison issues are historical demand signals. The present compare README already describes per-request size, status, and timing differences. We have not established that either request remains unmet in its current release. The available issue-list snapshot was old, and the body of #150 could not be retrieved.

## Existing choices

- [sitespeedio/compare](https://github.com/sitespeedio/compare): a mature HAR comparison application with waterfalls, request differences, timing and size changes, query normalization, and privacy-conscious local input. This is the closest established choice.
- [harlite](https://github.com/brucehart/harlite): a Rust CLI with HAR comparison, SQL analysis, CI budgets, redaction, and self-contained HTML reports. Exporting a report or supporting a CLI is not a novel feature.
- [har-viewer](https://github.com/0xpanadol/har-viewer): an offline browser viewer with rich request inspection, sanitized export, and multi-file summary comparison.
- [HAR Skills](https://github.com/cyberspacesec/har-skills): Go CLI and SDK for analysis, diff, export, and agent-oriented workflows.
- [Google HAR Analyzer](https://toolbox.googleapps.com/apps/har_analyzer/): an existing browser-based analysis choice.

Search also surfaced Async360/harmask, described in GitHub's HAR topic listing as a client-side HAR diff tool with redaction. Its repository content could not be retrieved, so no detailed feature claims are made here. No reliably retrieved HTTP Toolkit diff issue was found in this research.

## Hypothesis to validate

Some developers may prefer a focused flow: compare two captures, see a few changes worth inspecting, and copy a compact report into an issue. HarborDiff makes local processing, metric coverage, request grouping, and private-by-default reports visible in this flow.

This is a usability hypothesis rather than a claim of exclusive functionality. Validation should measure whether users can correctly identify relevant changes and produce a useful report faster than with their current process. Observe real feedback, repeat use, reports of incorrect matches, and requests to improve exports. Stars alone are not a usage measure.

Use synthetic captures for public demonstrations. Real HAR files may include confidential URLs, request data, and response content. No claims about performance causes should be inferred from one before/after pair.
