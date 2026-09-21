import Base

# A datatype and a total match over it -- Bend has no `if`; branch by
# matching constructors instead (`True{}`/`False{}` for booleans).
type Shape is Data:
  Circle{r: U32}
  Square{s: U32}

def area(shape: Shape) -> U32:
  match shape:
    case Circle{+r}:
      (3 * r * r : U32)  # crude pi ~= 3 for an integer estimate
    case Square{+s}:
      (s * s : U32)

def main() -> IO(Unit):
  do IO<Unit>:
    IO.print(U32.show(area(Square{6})))
    IO.print(U32.show(area(Circle{4})))
