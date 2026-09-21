import Base

def double(x: U32) -> U32:
  (x * 2 : U32)

def add(a: U32, b: U32) -> U32:
  (a + b : U32)

def main() -> IO(Unit):
  do IO<Unit>:
    xs : List<U32> = [1, 2, 3, 4, 5]
    doubled : List<U32> = List.map(~U32, ~U32, double, xs)
    total : U32 = List.foldl(~&1, ~U32, ~U32, add, doubled, 0)
    IO.print(U32.show(total))
