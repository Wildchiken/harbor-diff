# Security and privacy

HarborDiff parses local files. It does not execute HAR content or fetch request URLs. The web app has no backend, accounts, analytics, CDN scripts, or remote fonts.

Capture contents are held in browser memory until the page is reset or closed. Input HARs can contain highly sensitive data. Default reports use resource IDs and omit URLs, file names, cookies, headers, and bodies. The optional URL output retains host names and paths, which can themselves be sensitive; query values are redacted. Reports still reveal aggregate counts, HTTP statuses, sizes, and timings.

Report a vulnerability using GitHub's private vulnerability reporting when available. Please do not put secrets, real HARs, or exploit details involving a private system in a public issue. A minimal synthetic reproduction helps us resolve a problem without exposing anyone's data.
