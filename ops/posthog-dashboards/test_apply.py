"""Tests for apply.py's pre-flight config validation.

Run: python3 -m unittest ops/posthog-dashboards/test_apply.py
"""
import sys
import unittest
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from apply import DASHBOARDS_FILE, INSIGHTS_FILE, validate_config  # noqa: E402


class ValidateConfigTest(unittest.TestCase):
    def test_committed_config_is_valid(self):
        insights = yaml.safe_load(INSIGHTS_FILE.read_text())
        dashboards = yaml.safe_load(DASHBOARDS_FILE.read_text())
        self.assertEqual(validate_config(insights, dashboards), [])

    def test_catches_what_posthog_would_reject(self):
        insights = {"insights": [{"name": "a", "description": "x" * 401}, {"name": "a"}]}
        dashboards = {
            "dashboards": [{"name": "d", "description": "y" * 500, "insights": ["a", "zz"]}]
        }
        errors = "\n".join(validate_config(insights, dashboards))
        self.assertIn("duplicate insight name: a", errors)
        self.assertIn("insight 'a' description is 401 chars", errors)
        self.assertIn("dashboard 'd' description is 500 chars", errors)
        self.assertIn("unknown insight: zz", errors)

    def test_description_at_limit_is_allowed(self):
        insights = {"insights": [{"name": "a", "description": "x" * 400}]}
        self.assertEqual(validate_config(insights, {"dashboards": []}), [])


if __name__ == "__main__":
    unittest.main()
