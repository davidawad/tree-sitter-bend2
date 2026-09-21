; highlights.scm -- tree-sitter-bend2
;
; See grammar.js's header and the README's Known Limitations for what this
; deliberately does not (yet) cover: standalone comment lines swallowed by
; the indentation scanner in a few narrow positions, and locals.scm/
; indents.scm are not implemented (see README Roadmap).

; -------------------------------------------------------------------------
; Comments
; -------------------------------------------------------------------------

(comment) @comment
(block_comment) @comment

; -------------------------------------------------------------------------
; Literals
; -------------------------------------------------------------------------

(string_literal) @string
(char_literal) @character
(nat_literal) @number
(u32_literal) @number
(float_literal) @float
(quantity) @constant

(hole) @constant.builtin

; -------------------------------------------------------------------------
; Keywords
; -------------------------------------------------------------------------

[
  "def"
  "law"
  "type"
  "is"
  "match"
  "case"
  "do"
  "return"
  "for"
  "exs"
  "where"
  "import"
  "as"
] @keyword

(unsafe_annotation) @attribute

[
  "Type"
  "Data"
  "Kind"
  "Quant"
] @type.builtin

; -------------------------------------------------------------------------
; Functions, types, constructors
; -------------------------------------------------------------------------

(def_declaration name: (identifier) @function)
(def_declaration name: (qualified_identifier (identifier) @function .))
(law_declaration name: (identifier) @function)

(type_declaration name: (identifier) @type)
(constructor_definition name: (identifier) @constructor)
(constructor_expression name: (_) @constructor)
(constructor_pattern name: (_) @constructor)

(parameter name: (identifier) @variable.parameter)
(lambda_expression param: (identifier) @variable.parameter)

; A bare uppercase-leading identifier is a type or constructor name
; anywhere in real Bend source (`Nat`, `U32`, `Cons`, a user's own `type`
; names) -- same heuristic bend-mode.el's font-lock uses. Kept last among
; identifier rules so more specific captures above (function/constructor
; names in binding position) win where nvim-treesitter's "first match
; among rules with equal specificity" behavior would otherwise be
; ambiguous.
((identifier) @type
  (#match? @type "^[A-Z]"))

; -------------------------------------------------------------------------
; Operators
; -------------------------------------------------------------------------

[
  "="
  "=>"
  "->"
  "<-"
  "+"
  "-"
  "*"
  "/"
  "%"
  "=="
  "!="
  "<="
  ">="
  "<"
  ">"
  "&&"
  "||"
  "<>"
  "++"
  ".|."
  ".^."
  ".&."
  "<<"
  ">>"
  "<&>"
  "&"
  "|"
  "~"
  "!"
  "@"
] @operator

(reflexivity) @operator

; -------------------------------------------------------------------------
; Punctuation
; -------------------------------------------------------------------------

[ "(" ")" "[" "]" "{" "}" ] @punctuation.bracket
[ "," ":" ";" "." ] @punctuation.delimiter
