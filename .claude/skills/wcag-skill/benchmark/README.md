# Optional AI-WCAG-Gauntlet extension

This directory supports the AI-WCAG-Gauntlet experiment. It is separate from
the production WCAG workflow because tag-count coverage is a benchmark
constraint, not evidence of WCAG conformance.

## Use only for an explicit benchmark request

1. Run the Gauntlet setup in its own repository to create a fresh submission
   directory.
2. Write original HTML, CSS, and scripts in that submission directory.
3. Run the local pre-check from this extension:

   ```bash
   python3 benchmark/scripts/check-tag-coverage.py <submission-directory>/index.html
   ```

4. Run the Gauntlet test suite and retain its output separately from production
   accessibility reports.

## Integrity rule

`benchmark/templates/` is reference material only. Do not copy a template or
the bare starter into a benchmark submission. A valid benchmark run must contain
an original implementation tailored to its prompt.

The tag checker uses `benchmark/resources/html_tags.json` and no longer relies
on an absent root-level `resources/` directory.
