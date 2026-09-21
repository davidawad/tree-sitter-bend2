import Base

# 2^d via fork/join recursion: each half of the split runs as its own
# task ("parallel let"), joined by the addition below. This is Bend's
# headline feature -- ordinary-looking recursive code that the compiler
# schedules across cores (or the GPU, with `!`) without you writing any
# thread/task code yourself.
def pow2(+d: Nat) -> U32:
  match d:
    case 0n:
      1
    case 1n+p:
      a b = pow2(p) pow2(p)
      (a + b : U32)

def main() -> IO(Unit):
  do IO<Unit>:
    IO.print(U32.show(pow2(10n)))
