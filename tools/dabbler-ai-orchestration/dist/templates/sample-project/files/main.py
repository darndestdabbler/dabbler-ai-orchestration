"""The sample project's program.

Run it once the tests are green:

    .venv\\Scripts\\python.exe main.py      (Windows)
    .venv/bin/python main.py               (macOS / Linux)

Expected output:

    Hello, world!
    HELLO, WORLD!
"""

from hello.greeting import greet, shout

if __name__ == "__main__":
    print(greet("world"))
    print(shout("world"))
