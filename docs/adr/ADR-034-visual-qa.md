# ADR-034: Visual QA is a gate, not an afterthought

Status: accepted. v7.

**Decision.** Generated designs are rendered in a real browser (390 px and 1280 px), measured (overflow, console, failed
requests, axe WCAG 2 A/AA) and looked at, and artifacts are rasterised with the bundled fonts and checked for safe
zones. Cross-industry and same-industry diversity are asserted numerically. Pixel-diff baselines are not used (dynamic
imagery); layout metrics, contrast and budgets are. Passing DOM tests alone is never taken as design acceptance.
