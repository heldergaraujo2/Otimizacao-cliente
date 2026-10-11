# third_party

External reference projects are **not vendored** into this repository. `scripts/fetch-references.sh`
clones them at the exact commits recorded in [`PINS.json`](PINS.json) into this directory, which is
git-ignored.

Rationale: they are research references whose licenses differ from this project's (see
`docs/SECURITY_AND_LICENSES.md`). Keeping them out of the tree avoids distributing third-party
code or proprietary game assets with our sources.
