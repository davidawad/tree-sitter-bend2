// scanner.c -- external scanner for tree-sitter-bend2
//
// Handles two things ordinary tree-sitter regex tokens cannot:
//
// 1. Indentation-sensitive layout (NEWLINE / INDENT / DEDENT), the same
//    general technique tree-sitter-python uses: an explicit stack of open
//    indentation columns, with the scanner deciding, each time the parser
//    needs a statement/block separator, whether the next real line of code
//    is more-indented (INDENT), equally-indented (NEWLINE), or
//    less-indented (DEDENT, possibly several times in a row).
//
// 2. Arbitrarily-nested `#{ ... #}` block comments, tracked as a simple
//    depth counter over `#{`/`#}` occurrences. This is a deliberate
//    superset of the real language rule (Bend's own parser additionally
//    requires every continuation line of a multi-line block comment to
//    itself start with `#`, checked empirically against the real `bend`
//    2.0.22 compiler -- see the repo README's Known Limitations). Since a
//    tree-sitter grammar's job is to parse valid programs, not reject
//    invalid ones, accepting a superset here is safe: every real `bend`
//    program still parses correctly, and depth-based nesting is what
//    actually varies across real block comments.
//
// Design note on why comments are sometimes "swallowed": whenever a
// standalone commented-out line could instead be exposed to tree-sitter's
// ordinary `extras`-driven lexer as its own `comment`/`block_comment` node
// (i.e. whenever NEWLINE is a valid next symbol, not just INDENT/DEDENT),
// this scanner stops right at the `#` and lets the surrounding lexer take
// it from there -- that is what makes comments between statements show up
// as real nodes for queries/highlights.scm. The one place this can't
// happen is a comment used as the very first line of a freshly-opened
// block (where only INDENT is a valid next symbol): there, this scanner
// swallows the comment as part of the INDENT token's span, and it will not
// appear as an independent node. This is a deliberate, documented v1
// tradeoff -- see the README's Known Limitations section.

#include "tree_sitter/parser.h"
#include <stdlib.h>
#include <string.h>

enum TokenType {
  NEWLINE,
  INDENT,
  DEDENT,
  BLOCK_COMMENT,
};

#define MAX_INDENTS 256
#define EOF_SENTINEL (-1)

typedef struct {
  uint16_t indents[MAX_INDENTS];
  uint16_t indent_len;
  bool has_pending_column;
  int32_t pending_column;
} Scanner;

static void scanner_init(Scanner *scanner) {
  scanner->indent_len = 1;
  scanner->indents[0] = 0;
  scanner->has_pending_column = false;
  scanner->pending_column = 0;
}

void *tree_sitter_bend2_external_scanner_create(void) {
  Scanner *scanner = (Scanner *)malloc(sizeof(Scanner));
  scanner_init(scanner);
  return scanner;
}

void tree_sitter_bend2_external_scanner_destroy(void *payload) {
  free((Scanner *)payload);
}

unsigned tree_sitter_bend2_external_scanner_serialize(void *payload, char *buffer) {
  Scanner *scanner = (Scanner *)payload;
  unsigned size = 0;

  buffer[size++] = (char)(scanner->has_pending_column ? 1 : 0);

  memcpy(&buffer[size], &scanner->pending_column, sizeof(int32_t));
  size += sizeof(int32_t);

  memcpy(&buffer[size], &scanner->indent_len, sizeof(uint16_t));
  size += sizeof(uint16_t);

  unsigned indents_bytes = scanner->indent_len * sizeof(uint16_t);
  memcpy(&buffer[size], scanner->indents, indents_bytes);
  size += indents_bytes;

  return size;
}

void tree_sitter_bend2_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  Scanner *scanner = (Scanner *)payload;
  scanner_init(scanner);
  if (length == 0) return;

  unsigned pos = 0;
  scanner->has_pending_column = buffer[pos++] != 0;

  memcpy(&scanner->pending_column, &buffer[pos], sizeof(int32_t));
  pos += sizeof(int32_t);

  memcpy(&scanner->indent_len, &buffer[pos], sizeof(uint16_t));
  pos += sizeof(uint16_t);

  unsigned indents_bytes = scanner->indent_len * sizeof(uint16_t);
  memcpy(scanner->indents, &buffer[pos], indents_bytes);
  pos += indents_bytes;
}

// Consumes a `#{ ... #}` body, given the lexer has already advanced past
// the opening `#{` (depth starts at 1). Arbitrary nesting depth, tracked
// by counting further `#{`/`#}` occurrences anywhere inside.
static void consume_block_comment_body(TSLexer *lexer) {
  int depth = 1;
  while (depth > 0) {
    if (lexer->eof(lexer)) return;
    if (lexer->lookahead == '#') {
      lexer->advance(lexer, false);
      if (lexer->lookahead == '{') {
        lexer->advance(lexer, false);
        depth++;
      } else if (lexer->lookahead == '}') {
        lexer->advance(lexer, false);
        depth--;
      }
    } else {
      lexer->advance(lexer, false);
    }
  }
}

// Swallows one comment (line or block form) starting at the current `#`,
// used while hunting forward for the next real line when NEWLINE is not a
// valid next symbol (so the comment cannot be exposed as its own node --
// see the file header comment).
static void swallow_comment(TSLexer *lexer) {
  lexer->advance(lexer, false); // consume '#'
  if (lexer->lookahead == '{') {
    lexer->advance(lexer, false); // consume '{'
    consume_block_comment_body(lexer);
  } else {
    while (!lexer->eof(lexer) && lexer->lookahead != '\n') {
      lexer->advance(lexer, false);
    }
  }
}

static bool scan_block_comment_token(TSLexer *lexer) {
  // Assumes lexer->lookahead == '#'.
  lexer->advance(lexer, false); // consume '#'
  if (lexer->lookahead != '{') return false;
  lexer->advance(lexer, false); // consume '{'
  consume_block_comment_body(lexer);
  lexer->mark_end(lexer);
  return true;
}

bool tree_sitter_bend2_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  Scanner *scanner = (Scanner *)payload;

  // Block comments can appear almost anywhere (they are in `extras`), and
  // take priority whenever the lookahead really is `#{`.
  if (valid_symbols[BLOCK_COMMENT] && lexer->lookahead == '#') {
    if (scan_block_comment_token(lexer)) {
      lexer->result_symbol = BLOCK_COMMENT;
      return true;
    }
    // Lone '#' (an ordinary line comment): not our token, let the plain
    // `comment` regex rule (or, inside the newline-family logic below,
    // this same scanner) handle it instead. tree-sitter resets lexer
    // position on a `false` return, so this is safe.
  }

  bool want_newline_family = valid_symbols[NEWLINE] || valid_symbols[INDENT] || valid_symbols[DEDENT];
  if (!want_newline_family) return false;

  bool newline_valid = valid_symbols[NEWLINE];

  int32_t col;
  bool hit_eof;

  if (scanner->has_pending_column) {
    // Continuing a multi-level DEDENT sequence measured by an earlier call;
    // the lexer position has not moved since, so re-measuring would give a
    // wrong (zero) column. Reuse what we already know.
    col = scanner->pending_column;
    hit_eof = (col == EOF_SENTINEL);
  } else {
    bool crossed_newline = false;
    hit_eof = false;
    col = 0;

    for (;;) {
      col = 0;
      while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
        col++;
        lexer->advance(lexer, true);
      }

      if (lexer->eof(lexer)) {
        hit_eof = true;
        break;
      }

      if (lexer->lookahead == '\r') {
        lexer->advance(lexer, true);
        continue;
      }

      if (lexer->lookahead == '\n') {
        lexer->advance(lexer, true);
        crossed_newline = true;
        continue;
      }

      if (lexer->lookahead == '#') {
        if (newline_valid) {
          // Stop right here (before consuming the comment) so the
          // surrounding lexer gets a chance to lex it as its own node.
          break;
        }
        swallow_comment(lexer);
        continue;
      }

      // Real content.
      break;
    }

    if (!hit_eof && lexer->lookahead == '#' && newline_valid) {
      // We stopped at a comment start without having found real content.
      // A genuine logical line break must already have happened to get
      // here (otherwise the ordinary lexer would have matched the
      // trailing comment via `extras` before this scanner ever ran for a
      // NEWLINE-family symbol) -- but guard defensively anyway.
      if (!crossed_newline) return false;
      lexer->mark_end(lexer);
      lexer->result_symbol = NEWLINE;
      return true;
    }

    if (!hit_eof && !crossed_newline) {
      // No newline was actually crossed: we are sitting directly at real
      // content immediately after whatever the previous token already
      // consumed. Emitting NEWLINE/INDENT/DEDENT here would be a
      // zero-progress token; refuse so the parser tries a different
      // (progressing) branch instead.
      return false;
    }

    if (newline_valid) {
      // Real content (or true EOF) was found, and this scan is allowed to
      // close out the *current* statement/line with a plain NEWLINE. That
      // must happen before any INDENT/DEDENT resolution against what
      // follows -- a statement always gets its own terminator first
      // (including the very last statement in a file with no trailing
      // newline, or one immediately followed only by EOF), and only once
      // that is consumed does the enclosing block get asked "does it
      // continue, or does it close" (which is where INDENT/DEDENT, or the
      // final EOF-driven DEDENTs, belong).
      //
      // Only cache the column (asking a *later* call to resolve
      // INDENT/DEDENT against it) when that will actually be needed --
      // i.e. `col` differs from the current top (or, at EOF, when any
      // block is still open). If nothing more is needed, don't set
      // `has_pending_column`. This matters because a `false` return does
      // not reliably persist scanner-state changes across GLR retries
      // (tree-sitter can revive a *different* parse version from this
      // call's own now-stale pre-mutation checkpoint), so a pending flag
      // left set here with nothing to ever resolve it would leak into a
      // later, unrelated scan and be read back as bogus cached data. Only
      // state set on a *successful* (true-returning) call is reliably
      // observed again -- see the DEDENT branch below for the same
      // reasoning.
      bool more_to_resolve = hit_eof
        ? scanner->indent_len > 1
        : col != scanner->indents[scanner->indent_len - 1];
      if (more_to_resolve) {
        scanner->has_pending_column = true;
        scanner->pending_column = hit_eof ? EOF_SENTINEL : col;
      }
      lexer->mark_end(lexer);
      lexer->result_symbol = NEWLINE;
      return true;
    }
  }

  // Resolve against the indent stack.
  if (hit_eof || col == EOF_SENTINEL) {
    if (scanner->indent_len > 1) {
      if (!valid_symbols[DEDENT]) return false;
      scanner->indent_len--;
      // Same eager-resolution reasoning as the ordinary DEDENT branch
      // below: only keep pending state set while more levels remain.
      scanner->has_pending_column = scanner->indent_len > 1;
      scanner->pending_column = EOF_SENTINEL;
      lexer->mark_end(lexer);
      lexer->result_symbol = DEDENT;
      return true;
    }
    scanner->has_pending_column = false;
    return false;
  }

  int32_t top = scanner->indents[scanner->indent_len - 1];

  if (col > top) {
    if (!valid_symbols[INDENT]) return false;
    if (scanner->indent_len >= MAX_INDENTS) return false;
    scanner->indents[scanner->indent_len++] = (uint16_t)col;
    scanner->has_pending_column = false;
    lexer->mark_end(lexer);
    lexer->result_symbol = INDENT;
    return true;
  }

  if (col < top) {
    if (!valid_symbols[DEDENT]) return false;
    scanner->indent_len--;
    // Resolve eagerly: only keep `has_pending_column` set (asking for yet
    // another DEDENT on the next call) if the new top is *still* deeper
    // than `col`. If this pop already reaches the right level, clear it
    // now, inside this same successful (true-returning) call. This
    // matters because a `false` return does not reliably persist scanner
    // state across GLR retries -- tree-sitter can re-invoke `scan` from
    // the last *successful* serialization point, which would otherwise
    // replay a stale cached column forever. See the file header note on
    // why every state transition that must stick lives on a `true` path.
    int32_t new_top = scanner->indents[scanner->indent_len - 1];
    scanner->has_pending_column = col < new_top;
    scanner->pending_column = col;
    lexer->mark_end(lexer);
    lexer->result_symbol = DEDENT;
    return true;
  }

  // col == top: no indentation change needed. A statement-terminating
  // NEWLINE for this line, if one was needed, was already emitted earlier
  // (either directly above, or by a previous call now continued via
  // `has_pending_column`) -- nothing left for this scanner to produce.
  scanner->has_pending_column = false;
  return false;
}
