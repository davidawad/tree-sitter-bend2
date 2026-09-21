# tree-sitter-bend2

A [tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for
[Bend 2](https://github.com/bendlang/bend), a dependently typed, affine,
Python-shaped functional language whose compiler targets native CPU,
Metal/CUDA and JS.

This repo is the **grammar**, and nothing else. It exists separately because
three different consumers need it and none of them is a Vim plugin: the
[Helix](https://helix-editor.com/) editor fetches a grammar repo directly
from `languages.toml`, [nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter)
does the same from a parser registry entry, and the Vim/Neovim plugin
[bend.vim](https://github.com/davidawad/bend.vim) builds a parser from it at
install time. A grammar-only consumer should not have to point at a repo
named after an editor, so this is named the way grammar repos are named
(`tree-sitter-<lang>`; in Helix's own `languages.toml` 276 of 283 GitHub
sources follow it, the exceptions being language servers rather than
grammars).

Editor support for Bend 2, by editor:

| editor | package | what you install |
| --- | --- | --- |
| Helix | **this repo** | a `languages.toml` entry + the queries (see below) |
| Neovim | [bend.vim](https://github.com/davidawad/bend.vim) (+ this grammar for the parser) | a vim-plug/lazy plugin; its build hook fetches this repo |
| Vim | [bend.vim](https://github.com/davidawad/bend.vim) | a vim-plug plugin; no grammar needed at all |
| Emacs | [bend-mode.el](https://github.com/davidawad/bend-mode.el) | an Emacs package; no grammar needed |

Bend 2 is a fresh rewrite: the compiler repo now belongs entirely to Bend 2,
and the editor ecosystem that existed for Bend 1
([LaBatata101/tree-sitter-bend](https://github.com/LaBatata101/tree-sitter-bend),
[SergioBonatto/bend-vim](https://github.com/SergioBonatto/bend-vim)) targets
the old syntax and does not apply. As of 2.0.22 Bend ships only a Sublime
Text grammar (for the docs site).

## Language name: `bend2`, not `bend`

The tree-sitter language this grammar registers itself as is **`bend2`**. It
is deliberately not `bend`, to avoid colliding with any future revival of
the abandoned Bend-1 grammar under that name. Consumers bridge it: Helix
does it with a `[[language]] name = "bend"` entry whose `grammar = "bend2"`,
and bend.vim does it with
`vim.treesitter.language.register('bend2', 'bend')`.

## Install

### Helix

Helix has **no plugin system** (the project's own FAQ: "While there is
currently no plugin system available, we do intend to eventually have one"),
so there is nothing to install *into* — support means a language entry, the
query files, and a build step.

Add to `~/.config/helix/languages.toml`:

```toml
[[language]]
name = "bend"
scope = "source.bend"
injection-regex = "bend"
file-types = ["bend"]
comment-token = "#"
indent = { tab-width = 2, unit = "  " }
grammar = "bend2"

[[grammar]]
name = "bend2"
source = { git = "https://github.com/davidawad/tree-sitter-bend2", rev = "<pin a commit>" }
```

Put the queries where Helix looks for them -- **Helix does not read queries
out of a grammar repo**:

```sh
mkdir -p ~/.config/helix/runtime/queries/bend
cp queries/bend2/highlights.scm ~/.config/helix/runtime/queries/bend/highlights.scm
```

Then build and check:

```sh
hx --grammar fetch
hx --grammar build
hx --health bend
```

Expected: `Tree-sitter parser: ✓` and `Highlight queries: ✓`.
`Textobject queries` and `Indent queries` show ✘ -- those query files are not
implemented (see Known Limitations).

### nvim-treesitter

```lua
require('nvim-treesitter.parsers').get_parser_configs().bend2 = {
  install_info = {
    url = 'https://github.com/davidawad/tree-sitter-bend2',
    files = { 'src/parser.c', 'src/scanner.c' },
    branch = 'main',
  },
  filetype = 'bend',
}
```

then `:TSInstall bend2`. Note `src/scanner.c` must be listed -- the
indentation-sensitive externals live there, so a query that omits it builds a
parser that mis-parses every indented block.

### Any other tree-sitter editor

Compile the parser and point the editor at it:

```sh
tree-sitter generate                      # only if you edited grammar.js/scanner.c
mkdir -p parser
tree-sitter build -o parser/bend2.so
```

The output must be named `parser/bend2.so`: runtimepath-style consumers search
for `parser/<language>.so`, and a `bend2.so` in the repo root is silently
never found. The `.so` is a build artifact and is gitignored here.

## What it parses

The full top-level (`import`, `type`, `def`, `law`, `@unsafe def`,
foreign-effect defs), statements (`let`, destructuring `let`, parallel
`let`, array writes, `match`/`case`, `do` blocks with `bind`/`let`/`return`),
the full pattern grammar (`Nat` successor patterns, cons, tuple, constructor,
wildcard), and the type/term grammar (function/pair/either/dependent/equality
types, lambdas, calls, templates, arrays, rewrites `%e : P`, holes).

`queries/bend2/highlights.scm` covers line comments (`# ...`) and nested
block comments (`#{ ... #}`, arbitrary nesting depth), strings, char
literals, all reserved keywords (`def law type is match case do return for
exs where import as`), `@unsafe`, the kind-former keywords (`Type Data Kind
Quant`), `def NAME`/`law NAME` as a function name, uppercase
type/constructor identifiers, numeric literals (`U32`, `F32`, `Nat` with its
`n` suffix), quantity markers (`&0 &1 &2`), and `?hole`/`?TODO` goals.
`queries/highlights.scm` is a symlink to it, for tools that use the bare
tree-sitter convention.

## Testing / verification

```sh
tree-sitter generate               # regenerate src/parser.c from grammar.js
tree-sitter test                   # run test/corpus/*.txt -> 9/9
tree-sitter parse examples/*.bend  # zero (ERROR) nodes on all 9 files
```

All 9 files under `examples/` are real Bend 2 source verified against the
actual `bend` 2.0.22 compiler (`bend FILE --check-only`), not
plausible-looking syntax. `08` intentionally contains a hole (its check
reports `1 TODO found`), and `09` intentionally uses unsafe/foreign defs.

Those three commands prove the **grammar**. They say nothing about whether a
given editor can *find* it, which is a different failure mode and the one
that actually bit this project: the grammar was correct from the first
commit, while three separate discovery bugs shipped around it (query in the
wrong directory, `.so` built in the wrong directory, and a plugin-manager
default-branch mismatch). All of them failed silently. If you are wiring a
new consumer, assert resolution by name before trusting anything visual:

```sh
nvim --clean --headless \
  --cmd 'set runtimepath+=<path to this repo>' \
  -c 'lua print(vim.inspect(vim.api.nvim_get_runtime_file("parser/bend2.so", true)))' \
  -c 'lua print(vim.inspect(vim.treesitter.query.get_files("bend2", "highlights")))' \
  -c 'qall!'
```

Both must print a non-empty path list. Note also that a **headless** Neovim
cannot prove highlighting *renders*: it reports `highlighter_active=true`
and applies zero highlight extmarks, because highlighting happens on window
redraw. That check needs a real terminal.

## Known Limitations / Roadmap

- **Multi-line infix expressions are not supported.** Bend allows an
  operator at the start of a continuation line; this grammar's
  indentation-sensitive external scanner treats every physical newline as
  significant and does not suppress it inside an open expression the way
  e.g. tree-sitter-python suppresses newlines inside brackets. A call or
  operator chain must fit on one logical line. A real fix needs
  bracket/operator-aware newline suppression in `src/scanner.c`.
- **Standalone comment lines are sometimes absorbed as insignificant
  whitespace instead of becoming their own node.** Only in one narrow
  position: a comment as the very first line of a freshly-opened block
  (right after a `:` opening a `def`/`type`/`law`/`match`/`case`/`do`
  body). Comments between statements, and trailing comments after code on
  the same line, always get real `comment`/`block_comment` nodes. See
  `src/scanner.c`'s header for why.
- **The real compiler's per-line-`#` rule for multi-line block comments is
  not enforced.** This grammar accepts a superset (arbitrary `#{`/`#}`
  depth counting) rather than also requiring every continuation line to
  start with `#`. A grammar's job is to parse valid programs, not reject
  invalid ones, so this is safe: every real multi-line block comment still
  parses correctly.
- **`locals.scm` and `indents.scm` are not implemented**, only
  `highlights.scm`. Document-local-aware highlighting and tree-sitter-driven
  indentation are both future work. Editors fall back to their own
  indentation logic (that is what Helix's `Indent queries: ✘` means).
- **No textobjects queries** (`textobjects.scm`) -- Helix and Neovim
  text-object integrations will not work until they exist.

## Provenance

Extracted from [bend.vim](https://github.com/davidawad/bend.vim) on
2026-09-21, where the grammar was originally developed alongside the Vim
plugin (its commit history for these files lives there). Both repos are MIT.

## License

MIT -- see [LICENSE](LICENSE).