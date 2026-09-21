import Base

# Bend's headline feature: state an intent as a `law` (a claim, which
# is itself just a type), then write a `def` of the same name that
# proves it. The checker rejects the file if the proof doesn't
# actually establish the claim -- this is what "blocks AI mistakes
# via proof" means in practice, not marketing copy.

law add_zero:
  for x: Nat
  {Nat.add(x, 0n) == x : Nat}

def add_zero(x):              # unannotated: fills the law, inherits its type
  match x:
    case 0n:
      {==}                     # base case: Nat.add(0n, 0n) reduces to 0n by computation
    case 1n+p:
      %add_zero(p) : {1n+Nat.add(p, 0n) == 1n+_ : Nat}   # rewrite using the inductive hypothesis
      {==}

def main() -> IO(Unit):
  do IO<Unit>:
    IO.print("add_zero proved for all Nat -- checked, not asserted")
