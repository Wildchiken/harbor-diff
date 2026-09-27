# HarborDiff capture comparison

9 → 12 requests; 8 flagged groups out of 10.

Coverage before: 9/9 body sizes; 9/9 durations; 9/9 statuses.
Coverage after: 11/12 body sizes; 11/12 durations; 12/12 statuses.

| Request | Changes | Count | Body bytes | Median duration | HTTP errors |
| --- | --- | --- | --- | --- | --- |
| R002 GET | errors, duration | 1 → 1 | 760 → 280 (-480; 1/1 → 1/1 known) | 140 ms → 820 ms (+680 ms; 1/1 → 1/1 known) | 0 → 1 (1/1 → 1/1 known) |
| R010 POST | added, bytes, count | 0 → 1 | unknown → 420 (+420; 0/0 → 1/1 known) | unknown → 215 ms (unknown; 0/0 → 1/1 known) | 0 → 0 (0/0 → 1/1 known) |
| R009 GET | removed | 1 → 0 | 18000 → unknown (-18000; 1/1 → 0/0 known) | 150 ms → unknown (unknown; 1/1 → 0/0 known) | 0 → 0 (1/1 → 0/0 known) |
| R008 GET | bytes, duration | 1 → 1 | 44000 → 1244000 (+1200000; 1/1 → 1/1 known) | 240 ms → 790 ms (+550 ms; 1/1 → 1/1 known) | 0 → 0 (1/1 → 1/1 known) |
| R005 GET | bytes, duration | 1 → 1 | 2600 → 2700 (+100; 1/1 → 1/1 known) | 180 ms → 1260 ms (+1080 ms; 1/1 → 1/1 known) | 0 → 0 (1/1 → 1/1 known) |
| R003 GET | bytes, count | 1 → 4 | 8500 → 34000 (+25500; 1/1 → 4/4 known) | 175 ms → 181.5 ms (+6.5 ms; 1/1 → 4/4 known) | 0 → 0 (1/1 → 4/4 known) |
| R007 GET | bytes | 1 → 1 | 82000 → 84000 (+2000; 1/1 → 1/1 known) | 230 ms → 238 ms (+8 ms; 1/1 → 1/1 known) | 0 → 0 (1/1 → 1/1 known) |
| R001 GET | bytes | 1 → 1 | 9400 → 9600 (+200; 1/1 → 1/1 known) | 184 ms → 179 ms (-5 ms; 1/1 → 1/1 known) | 0 → 0 (1/1 → 1/1 known) |
| R004 GET | no flagged change | 1 → 1 | 4000 → unknown (unknown; 1/1 → 0/1 known) | 120 ms → unknown (unknown; 1/1 → 0/1 known) | 0 → 0 (1/1 → 1/1 known) |
| R006 GET | no flagged change | 1 → 1 | 7200 → 7100 (-100; 1/1 → 1/1 known) | 88 ms → 83 ms (-5 ms; 1/1 → 1/1 known) | 0 → 0 (1/1 → 1/1 known) |

Notes:

- These are observations from two captures. Cache state, network conditions, devices, and user actions can differ; the comparison does not establish a cause.
- Unknown or negative values remain unknown. Totals sum known values only. Byte and duration changes are withheld when either group has incomplete coverage; medians use known durations only.
- Requests are grouped by case-sensitive HTTP method and URL, including query values unless explicitly ignored. Credentials and fragments do not determine grouping. Query keys are sorted, preserving the order of repeated values. Repeated requests, including POST requests with different payloads, are aggregated; payloads are not inspected or retained.
- An errors flag means HTTP errors on an added request group, more observed errors, or an error status not observed before. For matched groups, error flags and error-count deltas are withheld if either capture has unknown statuses; observed error counts remain visible.
- Flagged groups have one or more selected kinds of increase, newly observed errors, additions, or removals. Improvements and other differences can exist without a flag. The legacy summary.changed field is an alias for summary.flagged.
- This report uses request aliases. It excludes URLs, hosts, paths, query parameters, headers, cookies, bodies, and input filenames.
- Explicitly ignored query parameter names: 0.
