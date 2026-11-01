# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | yes |
| 1.1.0-beta.x | pre-release for testing; fixes go into the next beta or 1.1.0 |
| internal builds (3.x / 4.0) | no — update to 1.0.x |

Only the latest release receives fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private vulnerability reporting:
the **Report a vulnerability** button on the repository's **Security → Advisories** page.

Include the plugin version (the console line `AdaptiveSubs v… initialized` or `window.AdaptiveSubs.version`), your platform and
the steps to reproduce. Do not include your IP addresses, server URLs, TorrServer credentials or Lampa/CUB account data.

## Scope

- `dist/adaptive_subs.js` — runs inside Lampa on your device. It only sends the requests listed in the README ("Privacy"):
  to your own TorrServer, to the HLS playlist of the stream that is already playing and, on LG webOS, to the TV's local media service.
- The build, test and E2E scripts in this repository are development tools; they are not shipped to devices.