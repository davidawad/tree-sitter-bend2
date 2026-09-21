import Base

#{ a single-line block comment #}

#{
  # a multi-line block comment
  # every continuation line starts with '#'
#}

#{
  #{
    # nested block comment
  #}
#}

def main() -> IO(Unit):
  do IO<Unit>:
    IO.print("block comments ok")
