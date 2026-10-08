"""Exercise the publication guard against disposable Git repositories."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

GUARD = Path(__file__).with_name("check_publication.py").resolve()


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.git("init", "-q")
        self.git("config", "user.name", "Publication test")
        self.git("config", "user.email", "test@example.invalid")

    def git(self, *args):
        return subprocess.run(["git", "-c", f"safe.directory={self.root}", *args],
                              cwd=self.root, capture_output=True, check=True)

    def check(self, *args):
        return subprocess.run([sys.executable, str(GUARD), *args], cwd=self.root,
                              capture_output=True, text=True)

    def stage(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        self.git("add", name)

    def test_public_example_is_allowed(self):
        self.stage("data/demo/turbine.csv", "time,power\n")
        self.stage(".env.example", "SAMAL_PORT=8080\n")
        self.assertEqual(self.check().returncode, 0)

    def test_checks_staged_content_without_printing_secret(self):
        fake = "gh" + "p_" + "A" * 36
        self.stage("config.txt", fake)
        (self.root / "config.txt").write_text("clean working tree")
        result = self.check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("possible GitHub token", result.stderr)
        self.assertNotIn(fake, result.stderr + result.stdout)

    def test_deleted_private_file_still_fails_history_check(self):
        self.stage("data/raw/private.csv", "time,power\n")
        self.git("commit", "-qm", "Add private fixture")
        self.git("rm", "data/raw/private.csv")
        self.stage("README.md", "Public source\n")
        self.git("commit", "-qm", "Remove fixture")
        self.assertEqual(self.check().returncode, 0)
        result = self.check("--history")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("data/raw/private.csv", result.stderr)


if __name__ == "__main__":
    unittest.main()
