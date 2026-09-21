// grammar.js -- tree-sitter grammar for Bend 2 (https://github.com/bendlang/bend)
//
// Bend 2 is Python-shaped (indentation-sensitive, off-side rule blocks) with
// Lean/Haskell-flavored dependent types and Rust-like affine resources. The
// indentation handling (NEWLINE / INDENT / DEDENT) lives in src/scanner.c,
// modeled on tree-sitter-python's external scanner. See that file's header
// comment for the exact algorithm and its documented limitations.
//
// This grammar deliberately keeps *types* (`_type`) and *terms* (`_term`) as
// two separate sub-grammars rather than one unified expression grammar. Real
// Bend syntax supports this split cleanly: `<...>` type-argument application
// (`List<U32>`) only ever appears in type position, while `<`/`<=` as
// comparison operators only ever appear in term position -- keeping them
// separate avoids the classic C++/TypeScript "angle bracket" ambiguity
// entirely, rather than fighting it with GLR conflicts and dynamic
// precedence.

const PREC = {
  CALL: 20,
  INDEX: 20,
  UNARY_GLUED: 19,
  MUL: 12,
  ADD: 11,
  SHIFT: 10,
  BITAND: 9,
  BITXOR: 8,
  BITOR: 7,
  CONS: 6,
  CMP: 5,
  AND: 4,
  OR: 3,
  TYPE_PAIR: 2,
  ARROW: 1,
  LAMBDA: 0,
};

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}

function commaSep(rule) {
  return optional(commaSep1(rule));
}

// A block/suite: an indented sequence of one-or-more items, opened and
// closed by the external scanner's INDENT/DEDENT tokens (see scanner.c).
function block($, itemRule) {
  return seq($._indent, repeat1(itemRule), $._dedent);
}

module.exports = grammar({
  name: 'bend2',

  extras: $ => [
    /[ \t]/,
    $.comment,
    $.block_comment,
  ],

  externals: $ => [
    $._newline,
    $._indent,
    $._dedent,
    $.block_comment,
  ],

  word: $ => $.identifier,

  // `a b = f(x) g(y)` (parallel let): after the last call in the RHS
  // sequence, the grammar locally cannot tell -- without runtime lookahead
  // -- whether a following binary operator continues that last call into a
  // larger `_term`, or whether the parallel-let statement simply ends
  // there (the only path that can actually complete). GLR resolves this by
  // trying both and discarding whichever fails to parse further.
  conflicts: $ => [
    [$.parallel_let_statement, $._term],
  ],

  rules: {
    source_file: $ => seq(
      repeat($._newline),
      repeat($._top_level_item),
    ),

    _top_level_item: $ => choice(
      $.import_statement,
      $.type_declaration,
      $.def_declaration,
      $.law_declaration,
    ),

    // ---------------------------------------------------------------
    // Lexical primitives
    // ---------------------------------------------------------------

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,

    qualified_identifier: $ => prec(1, seq(
      $.identifier, repeat1(seq('.', $.identifier)),
    )),

    _name: $ => choice($.identifier, $.qualified_identifier),

    comment: $ => token(seq('#', optional(seq(/[^{\n]/, /.*/)))),

    nat_literal: $ => /[0-9]+n/,
    u32_literal: $ => /[0-9]+/,
    float_literal: $ => /[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?/,

    char_literal: $ => token(seq(
      "'",
      choice(
        seq('\\', choice(seq('u', '{', /[0-9a-fA-F]+/, '}'), /./)),
        /[^'\\\n]/,
      ),
      "'",
    )),

    string_literal: $ => token(seq(
      '"',
      repeat(choice(
        seq('\\', choice(seq('u', '{', /[0-9a-fA-F]+/, '}'), /./)),
        /[^"\\\n]/,
      )),
      '"',
    )),

    quantity: $ => choice('&0', '&1', '&2'),

    hole: $ => seq('?', $.identifier),

    // ---------------------------------------------------------------
    // Top level: import
    // ---------------------------------------------------------------

    import_statement: $ => seq(
      'import',
      field('path', choice($._import_target, $.string_literal)),
      optional(seq('as', field('alias', $.identifier))),
      $._nl,
    ),

    _import_target: $ => choice(
      $._name,
      $.relative_path,
      $.hash_path,
    ),

    relative_path: $ => token(seq('./', /[^\s]+/)),
    hash_path: $ => token(seq('0x', /[0-9a-fA-F]+/, '/', /[^\s]+/)),

    // ---------------------------------------------------------------
    // Top level: type declaration
    // ---------------------------------------------------------------

    unsafe_annotation: $ => '@unsafe',

    type_declaration: $ => seq(
      'type', field('name', $.identifier),
      optional($.type_parameters),
      optional(seq('is', field('kind', $._type))),
      ':',
      block($, $.constructor_definition),
    ),

    type_parameters: $ => seq(
      '<', commaSep1($.type_parameter), '>',
    ),

    type_parameter: $ => seq(
      optional(choice('-', '+')),
      field('name', $.identifier),
      optional(seq(':', field('bound', $._type))),
    ),

    constructor_definition: $ => seq(
      field('name', $.identifier),
      '{', commaSep($.field_definition), '}',
      $._nl,
    ),

    field_definition: $ => seq(
      field('name', $.identifier), ':', field('type', $._type),
    ),

    // ---------------------------------------------------------------
    // Top level: def declaration
    // ---------------------------------------------------------------

    def_declaration: $ => seq(
      optional($.unsafe_annotation),
      'def', field('name', $._name),
      '(', commaSep($.parameter), ')',
      optional(seq('->', field('return_type', $._type))),
      ':',
      block($, $._def_body_item),
    ),

    parameter: $ => seq(
      optional(field('quantity', choice('-', '+', '~'))),
      field('name', $.identifier),
      optional(seq(':', field('type', $._type))),
    ),

    _def_body_item: $ => choice($.statement, $.foreign_import_statement),

    foreign_import_statement: $ => seq('import', $.string_literal, $._nl),

    // ---------------------------------------------------------------
    // Top level: law declaration
    // ---------------------------------------------------------------

    law_declaration: $ => seq(
      'law', field('name', $.identifier), ':',
      block($, $._law_line),
    ),

    _law_line: $ => choice($.for_clause, $.exs_clause, $.claim_statement),

    for_clause: $ => seq(
      'for', field('name', $.identifier), ':', field('type', $._type),
      optional(seq('where', field('condition', $._term))),
      $._nl,
    ),

    exs_clause: $ => seq(
      'exs', field('name', $.identifier), ':', field('type', $._type),
      $._nl,
    ),

    claim_statement: $ => seq($._type, $._nl),

    // ---------------------------------------------------------------
    // Statements (inside a def / case / do / lambda body)
    // ---------------------------------------------------------------

    statement: $ => choice(
      $._simple_statement,
      $.match_statement,
      $.do_statement,
    ),

    _simple_statement: $ => seq(
      choice(
        $.let_statement,
        $.destructure_statement,
        $.parallel_let_statement,
        $.array_write_statement,
        $.foreign_import_statement_inline,
        $.return_statement,
        $.expression_statement,
      ),
      $._nl,
    ),

    // `import "./e.c"` also appears as an ordinary statement line (not just
    // as the very first lines of a def body) in more permissive real code;
    // kept as a distinct alias so highlights.scm can target it uniformly.
    foreign_import_statement_inline: $ => prec(1, seq(
      'import', field('path', $.string_literal),
    )),

    let_statement: $ => prec(2, seq(
      optional(field('quantity', choice('+', '-'))),
      field('name', $.identifier),
      optional(seq(':', field('type', $._type))),
      '=',
      field('value', $._term),
    )),

    destructure_statement: $ => prec(1, seq(
      field('pattern', choice($.tuple_expression, $.constructor_expression)),
      '=',
      field('value', $._term),
    )),

    parallel_let_statement: $ => prec(3, seq(
      field('names', seq($.identifier, repeat1($.identifier))),
      '=',
      field('values', seq($.call_expression, repeat1($.call_expression))),
    )),

    array_write_statement: $ => prec(1, seq(
      field('target', $.index_expression),
      '<-',
      field('value', $._term),
    )),

    return_statement: $ => seq('return', field('value', $._term)),

    expression_statement: $ => $._term,

    // ---------------------------------------------------------------
    // match
    // ---------------------------------------------------------------

    match_statement: $ => seq(
      'match', field('scrutinee', repeat1($._term)), ':',
      block($, $.case_clause),
    ),

    case_clause: $ => seq(
      'case', field('pattern', repeat1($._pattern)), ':',
      block($, $.statement),
    ),

    // ---------------------------------------------------------------
    // do
    // ---------------------------------------------------------------

    do_statement: $ => seq(
      'do', field('monad', $._type), ':',
      block($, $._do_line),
    ),

    _do_line: $ => choice(
      $.bind_statement,
      $.do_let_statement,
      $.return_statement_line,
      $.expression_statement_line,
    ),

    bind_statement: $ => seq(
      field('name', $.identifier), ':', field('type', $._type), '<-',
      field('value', $._term), $._nl,
    ),

    do_let_statement: $ => prec(2, seq(
      field('name', $.identifier), ':', field('type', $._type), '=',
      field('value', $._term), $._nl,
    )),

    return_statement_line: $ => seq($.return_statement, $._nl),
    expression_statement_line: $ => seq($.expression_statement, $._nl),

    // ---------------------------------------------------------------
    // Patterns (case clauses only -- see grammar.js header comment)
    // ---------------------------------------------------------------

    _pattern: $ => choice(
      $.wildcard_pattern,
      $.nat_zero_pattern,
      $.nat_succ_pattern,
      $.nat_succ_reusable_pattern,
      $.u32_pattern,
      $.constructor_pattern,
      $.list_pattern,
      $.cons_pattern,
      $.tuple_pattern,
      $.binder_pattern,
    ),

    wildcard_pattern: $ => '_',
    nat_zero_pattern: $ => '0n',

    nat_succ_pattern: $ => prec(1, seq($.nat_literal, '+', $.identifier)),
    nat_succ_reusable_pattern: $ => prec(1, seq($.nat_literal, '++', $.identifier)),

    u32_pattern: $ => $.u32_literal,

    constructor_pattern: $ => seq(
      field('name', $._name), '{', commaSep($.field_pattern), '}',
    ),

    field_pattern: $ => seq(
      optional(choice('+', '-')),
      choice($.identifier, $.wildcard_pattern),
    ),

    list_pattern: $ => seq('[', commaSep($._pattern), ']'),

    cons_pattern: $ => prec.right(PREC.CONS, seq(
      field('head', $._pattern), '<>', field('tail', $._pattern),
    )),

    tuple_pattern: $ => seq('(', $._pattern, repeat1(seq(',', $._pattern)), ')'),

    binder_pattern: $ => seq(
      optional(field('quantity', choice('+', '-'))),
      field('name', $.identifier),
    ),

    // ---------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------

    _type: $ => choice(
      $._name,
      $.quantity,
      $.nat_literal,
      $.u32_literal,
      $.hole,
      $.type_application,
      $.type_call_application,
      $.reusable_type,
      $.function_type,
      $.dependent_function_type,
      $.pair_type,
      $.dependent_pair_type,
      $.either_type,
      $.equality_type,
      $.inequality_type,
      $.paren_type,
      $.kind_type,
      $.min_quantity_type,
    ),

    type_application: $ => prec(PREC.CALL, seq(
      field('name', $._name), '<', commaSep1($._type_argument), '>',
    )),

    // `IO(Unit)` -- a type constructor applied via ordinary call syntax
    // rather than `<...>`. Confirmed against real Bend 2 source: the same
    // `IO` type appears as both `IO(Unit)` (a def's return type) and
    // `IO<Unit>` (a `do` block header) across the verified example corpus.
    // Bend's types are terms in its unified universe, so this reuses
    // `call_expression` itself rather than a parallel rule.
    type_call_application: $ => prec(PREC.CALL, seq(
      field('name', $._name), '(', commaSep1($._type_argument), ')',
    )),

    _type_argument: $ => $._type,

    // `+D<A>` -- a leading `+` makes a datatype application reusable.
    reusable_type: $ => prec(PREC.UNARY_GLUED, seq('+', $._type)),

    function_type: $ => prec.right(PREC.ARROW, seq(
      field('domain', $._type), '->', field('codomain', $._type),
    )),

    dependent_function_type: $ => prec.right(PREC.ARROW, seq(
      '@', optional('-'), field('name', $.identifier), ':', field('domain', $._type),
      '->', field('codomain', $._type),
    )),

    pair_type: $ => prec.left(PREC.TYPE_PAIR, seq(
      field('left', $._type), '&', field('right', $._type),
    )),

    dependent_pair_type: $ => prec.right(PREC.ARROW, seq(
      '&', field('name', $.identifier), ':', field('domain', $._type),
      '->', field('codomain', $._type),
    )),

    either_type: $ => prec.left(PREC.TYPE_PAIR, seq(
      field('left', $._type), '|', field('right', $._type),
    )),

    equality_type: $ => seq(
      '{', field('left', $._term), '==', field('right', $._term),
      ':', field('type', $._type), '}',
    ),

    inequality_type: $ => seq(
      '{', field('left', $._term), '!=', field('right', $._term),
      ':', field('type', $._type), '}',
    ),

    paren_type: $ => seq('(', $._type, ')'),

    kind_type: $ => choice(
      'Type', 'Data', 'Quant',
      seq('Kind', '(', $._type, ')'),
    ),

    min_quantity_type: $ => prec.left(PREC.CMP, seq(
      field('left', $._type), '<&>', field('right', $._type),
    )),

    // ---------------------------------------------------------------
    // Terms
    // ---------------------------------------------------------------

    _term: $ => choice(
      $._name,
      $.nat_literal,
      $.u32_literal,
      $.float_literal,
      $.char_literal,
      $.string_literal,
      $.quantity,
      $.hole,
      $.reflexivity,
      $.list_expression,
      $.array_expression,
      $.tuple_expression,
      $.paren_expression,
      $.annotated_expression,
      $.constructor_expression,
      $.lambda_expression,
      $.call_expression,
      $.gpu_call_expression,
      $.index_expression,
      $.rewrite_expression,
      $.binary_expression,
    ),

    reflexivity: $ => '{==}',

    list_expression: $ => seq('[', commaSep($._term), ']'),

    array_expression: $ => seq(
      '[', field('value', $._term), ':', field('type', $._type),
      choice(seq('*', field('count', $._term)), seq('^', field('depth', $._term))),
      ']',
    ),

    tuple_expression: $ => prec(1, seq(
      '(', $._term, repeat1(seq(',', $._term)), ')',
    )),

    paren_expression: $ => seq('(', $._term, ')'),

    annotated_expression: $ => seq('(', $._term, ':', $._type, ')'),

    constructor_expression: $ => prec(1, seq(
      field('name', $._name), '{', commaSep($.field_argument), '}',
    )),

    field_argument: $ => $._term,

    lambda_expression: $ => prec.right(PREC.LAMBDA, seq(
      optional('+'), field('param', $.identifier), '=>', field('body', $._term),
    )),

    call_expression: $ => prec(PREC.CALL, seq(
      field('function', $._term), '(', commaSep($.argument), ')',
    )),

    gpu_call_expression: $ => prec(PREC.CALL, seq(
      field('function', $._term), '!', '(', commaSep($.argument), ')',
    )),

    argument: $ => seq(optional('~'), $._term),

    index_expression: $ => prec(PREC.INDEX, seq(
      field('array', $._term), '[', field('index', $._term), ']',
    )),

    // `%e : P; e2` (inline form, `e2` the continuation) or the more common
    // statement form seen in real proofs, `%e : P` alone on its own line,
    // with the "continuation" simply being whatever statement follows in
    // the block (ordinary statement sequencing, no literal `;`).
    rewrite_expression: $ => prec.right(seq(
      '%', optional(seq(field('label', $.identifier), '@')),
      field('witness', $._term), ':', field('motive', $._type),
      optional(seq(';', field('body', $._term))),
    )),

    binary_expression: $ => choice(
      prec.left(PREC.OR, seq($._term, '||', $._term)),
      prec.left(PREC.AND, seq($._term, '&&', $._term)),
      prec.left(PREC.CMP, seq($._term, choice('<=', '>=', '<', '>'), $._term)),
      prec.right(PREC.CONS, seq($._term, choice('<>', '++'), $._term)),
      prec.left(PREC.BITOR, seq($._term, '.|.', $._term)),
      prec.left(PREC.BITXOR, seq($._term, '.^.', $._term)),
      prec.left(PREC.BITAND, seq($._term, '.&.', $._term)),
      prec.left(PREC.SHIFT, seq($._term, choice('<<', '>>'), $._term)),
      prec.left(PREC.ADD, seq($._term, choice('+', '-'), $._term)),
      prec.left(PREC.MUL, seq($._term, choice('*', '/', '%'), $._term)),
      prec.left(PREC.CMP, seq($._term, '<&>', $._term)),
    ),

    // ---------------------------------------------------------------
    // Statement terminator: one or more physical newlines, collapsing any
    // number of standalone comment/blank lines in between (see scanner.c).
    // ---------------------------------------------------------------
    _nl: $ => repeat1($._newline),
  },
});
