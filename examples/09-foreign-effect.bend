# Skeleton: a custom effect (from `bend guide effects`). The def's body is
# two imports; the host function is the def's name lowercased with dots
# as underscores. Try:
#   bend main.bend -o clock && ./clock
#   bend main.bend -o clock_program.js && bun clock_program.js
#   bend main.bend
import Base

def Clock.now() -> IO(U32):
  import "./clock.c"
  import "./clock.js"

def main() -> IO(Unit):
  do IO<Unit>:
    t : U32 <- Clock.now()
    IO.print("clock ms: " ++ U32.show(t))
