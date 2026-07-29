# Accessibility-oriented prototype review

Use this checklist after a local build. It is a reproducible review aid, not a
claim of formal WCAG conformance or certification.

- Navigate the landing, evaluation form, error summary, controls, results, and
  tabs using only Tab, Shift+Tab, Enter, Space, Arrow keys, Home, and End.
- Confirm every focused control has a high-contrast visible focus ring against
  the dark background, including disabled-control distinction.
- Submit an empty form, follow each error-summary link, correct fields, and
  confirm no request begins until the form is valid.
- With a screen reader, verify labels, character-limit help, error text,
  scenario-generation updates, pipeline status, error banner, and results
  announcement are understandable without relying on placeholder text.
- Check the pairing switch announces its name, checked state, and explanation.
- In results, verify tab roles, selected tab, panel relationship, and arrow,
  Home, and End navigation.
- Enable reduced motion in the operating system and confirm running indicators
  stop pulsing while status text remains visible, including a `0.0s` duration.
- Review at 200% browser zoom and a narrow viewport for clipped controls,
  hidden labels, overlapping error text, or inaccessible remove controls.
- Inspect text, focus-ring, and error-state color contrast with browser devtools.
- Trigger scenario-generation and evaluation failures, then confirm focus lands
  on the safe error message once and recovery remains possible.
