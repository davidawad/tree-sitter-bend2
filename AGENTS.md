# AGENTS.md -- tree-sitter-bend2

Standalone, publishable **tree-sitter grammar** for Bend 2
(https://github.com/bendlang/bend). Grammar and nothing else: `grammar.js`,
the external scanner in `src/scanner.c`, the committed generated sources
under `src/`, the highlight queries under `queries/bend2/`, and the test
corpus.

This repo is consumed by editors, not by people's vimrcs. The Vim/Neovim
plugin is a separate repo, [bend.vim](https://github.com/davidawad/bend.vim),
and the Emacs package is
[bend-mode.el](https://github.com/davidawad/bend-mode.el).

## For agents

- Read `README.md` first; it is the complete feature, install-per-consumer,
  and known-limitations reference.
- Regenerate the parser after any `grammar.js` or `src/scanner.c` change:
  `tree-sitter generate`, then `tree-sitter test` (corpus in
  `test/corpus/`), then `tree-sitter parse examples/*.bend` and confirm
  zero `(ERROR)` nodes before considering a change done.
- `src/scanner.c`'s file header explains the external-scanner design in
  full (indentation NEWLINE/INDENT/DEDENT tracking, nested `#{ #}` block
  comments) -- read it before touching the scanner; it also documents a
  non-obvious tree-sitter GLR fact that the fix history depended on:
  mutating scanner state before a `false` return is not reliably observed
  on a later call (tree-sitter can revive a different parse version from
  an earlier *successful* checkpoint), which is why every state
  transition that must persist happens on a `true`-returning path.
- The `examples/*.bend` files are real, `bend --check-only`-verified Bend
  2.0.22 source (six were the original acceptance fixtures; three more were
  added for corpus breadth -- block comments, templates/`@unsafe`/holes, a
  foreign effect def). Any new corpus addition should be similarly verified
  against a real `bend` binary before being trusted, not just eyeballed as
  "looks right". Files `08` and `09` intentionally report a TODO and
  unsafe/foreign defs respectively, so their `--check-only` output is not
  clean and is not supposed to be.
- **Grammar correctness and consumer discovery are different problems.**
  `tree-sitter test` passing says nothing about whether an editor can find
  the parser or the queries. Every bug this project actually shipped was a
  discovery bug (query under the wrong directory, `.so` built to a path
  nothing searches, a plugin manager's default-branch mismatch), and all of
  them failed silently. When you change layout, verify resolution by name
  (see README's "Testing / verification"), not by eye.
- The language name is `bend2`, not `bend` -- deliberately, to avoid
  colliding with any revival of the abandoned Bend-1 grammar. Consumers
  bridge it (`grammar = "bend2"` in Helix, `language.register` in Neovim).
- Known, deliberately out-of-scope limitations (multi-line infix expression
  continuation, standalone comment lines swallowed by the indentation
  scanner in a couple of narrow positions, no `locals.scm`/`indents.scm`/
  `textobjects.scm`) are documented in README.md's Roadmap -- don't be
  surprised by them, and don't silently "fix" them without updating that
  section to match reality.
- Keeping the generated sources (`src/parser.c`, `src/grammar.json`,
  `src/node-types.json`) committed is deliberate: consumers that build
  without running `tree-sitter generate` depend on them.
- Zero references to the owner's dotfiles are allowed here -- the repo
  must remain publishable as-is.
- Authorized: david, swe.

## Provenance

Extracted from bend.vim on 2026-09-21; commit history for these files lives
there.