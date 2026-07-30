"""The sample project's tests.

Run them with the project's own Python:

    .venv\\Scripts\\python.exe -m unittest      (Windows)
    .venv/bin/python -m unittest               (macOS / Linux)

The second test fails until `shout` exists. That is expected right now, and
fixing it is exactly what the task in
docs/session-sets/001-add-a-shout/spec.md asks for.
"""

import unittest

from hello import greeting


class TestGreeting(unittest.TestCase):
    def test_greet_says_hello(self):
        self.assertEqual(greeting.greet("world"), "Hello, world!")

    def test_shout_is_loud(self):
        self.assertEqual(greeting.shout("world"), "HELLO, WORLD!")


if __name__ == "__main__":
    unittest.main()
