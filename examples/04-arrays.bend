import Base

# Array<T> is affine: at most one live owner, and a read hands back
# the array *beside* the element. Destructuring a computed expression
# directly is refused by the checker ("a match cannot scrutinize a
# computed value") -- thread it into a helper whose PARAMETER is that
# pair instead, same as this file's `cell`.
def cell(a: Array<U32> & U32) -> U32:
  (arr, v) = a
  v

# `a[i] <- v` on its own line implicitly rebinds `a` -- but only in a
# plain statement sequence like this one, not inside a `do` block
# (there, every line is a typed bind/let/step; build the array here
# and hand `main` only the finished value).
def build() -> U32:
  arr = [0 : U32*8n]  # 8 slots (power of two), all zero
  arr[0] <- 10
  arr[1] <- 32
  cell(arr[1])

def main() -> IO(Unit):
  do IO<Unit>:
    IO.print(U32.show(build()))
