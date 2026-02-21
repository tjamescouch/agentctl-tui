# Contributing

Thanks for your interest in improving agenttui. This file contains a minimal guide for running the quick smoke tests and preparing a PR from the prepared branch `oai/fuzzy-filter-enter-chat`.

Running the fuzzy matcher smoke test

1. Ensure dependencies are installed: `npm install`.
2. Run the quick smoke test that demonstrates fuzzy ordering:

   ```bash
   node ./test_fuzzy.js
   ```

Preparing patches / PR

- A patch bundle was prepared at `/tmp/agenttui_patches` in this environment.
- The changes are committed on branch `oai/fuzzy-filter-enter-chat`.
- To open a PR upstream, you can either:
  - Push the branch to your fork and open a PR against `tjamescouch/agenttui`, or
  - Apply the format-patch files locally and create a PR manually.

Notes

- The fuzzy matcher included is intentionally lightweight and dependency-free. If desired, it can be replaced with a library (e.g., fuse.js) in a follow-up PR.
- Interactive UI tests require a terminal environment; the smoke test is non-interactive and suitable for CI.

