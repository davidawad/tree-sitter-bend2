import Base

# Template: `~f` is compile-time substituted and may be instantiated more
# than once; `apply_twice` calls it twice on the same argument.
def apply_twice(~f: U32 -> U32, x: U32) -> U32:
  f(f(x))

def inc(x: U32) -> U32:
  (x + 1 : U32)

@unsafe def spin(n: Nat) -> Nat:
  match n:
    case 0n:
      0n
    case 1n+p:
      spin(1n+p)

def swap(pair: U32 & U32) -> U32 & U32:
  (a, b) = pair
  (b, a)

def render(pair: U32 & U32) -> String:
  (x, y) = pair
  U32.show(x) ++ U32.show(y)

def show_swapped(pair: U32 & U32) -> String:
  render(swap(pair))

def main() -> IO(Unit):
  do IO<Unit>:
    IO.print(U32.show(apply_twice(inc, 5)))
    IO.print(show_swapped((1, 2)))
    ?TODO
