import Base

def main() -> IO(Unit):
  do IO<Unit>:
    IO.print("Hello from Bend!")
    IO.print(U32.show((6 * 7 : U32)))
