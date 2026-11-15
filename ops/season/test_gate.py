"""Tests for gate.py: projection, tier pick, upsize triggers, sample parsing.

Run: python3 -m unittest ops/season/test_gate.py
"""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gate  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
DAY = date(2026, 11, 27)  # Gate 2 night; EST, so a different UTC offset from the Oct fixture


def et(h, m=0, day=DAY):
    return datetime(day.year, day.month, day.day, h, m, tzinfo=gate.ET).timestamp()


def minutes(start_h, count, value_at):
    """1-minute samples from start_h:00 ET; value_at(i) -> pct."""
    return [(et(start_h) + 60 * i, float(value_at(i))) for i in range(count)]


def night(floor=10.0, window_value=20.0):
    """Flat afternoon floor 13:00-17:00 plus a flat 20:00-22:00 window."""
    return minutes(13, 240, lambda i: floor) + minutes(20, 120, lambda i: window_value)


def run_main(doc, *args):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(doc, f)
    try:
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            rc = gate.main(["--from-json", f.name, *args])
        return rc, out.getvalue()
    finally:
        os.unlink(f.name)


class ProjectionTest(unittest.TestCase):
    def test_gate_formulas(self):
        self.assertEqual(gate.project(1, 15, 26), (11, 15 * 1.5 + 11 * 9))
        x, p = gate.project(2, 15, 26)
        self.assertAlmostEqual(p, 15 * 1.2 + 11 * 4.4)

    def test_tier_thresholds_are_inclusive(self):
        self.assertEqual(gate.recommend_tier(60.0), "Basic 2/4")
        self.assertEqual(gate.recommend_tier(60.1), "GP 2/8")
        self.assertEqual(gate.recommend_tier(70.0), "GP 2/8")
        self.assertEqual(gate.recommend_tier(120.0), "GP 4/16")
        self.assertEqual(gate.recommend_tier(120.1), "GP 8/32")

    def test_edge_note_near_threshold_only(self):
        self.assertEqual(gate.edge_notes(95.0), [])
        self.assertIn("under the GP 4/16", gate.edge_notes(119.7)[0])
        self.assertIn("over the GP 4/16", gate.edge_notes(121.5)[0])


class Oct24FixtureTest(unittest.TestCase):
    """Sat Oct 24 Gate 1, read by eye: floor ~15, peak ~26 -> ~120% -> GP 4/16."""

    def test_reproduces_gate1_reading(self):
        cpu, cache = gate.load_samples(FIXTURES / "oct24-gate1.json")
        day = date(2026, 10, 24)
        r = gate.evaluate(
            1, cpu, gate.parse_window(day, "20:00-22:00"), gate.parse_window(day, "14:00-16:00"), cache
        )
        self.assertAlmostEqual(r.floor, 15.0)
        self.assertAlmostEqual(r.peak, 25.8)
        self.assertAlmostEqual(r.projected, 119.7, places=1)
        self.assertEqual(r.tier, "GP 4/16")
        self.assertTrue(r.edges, "a projection 0.3 under the line must be called out")
        self.assertEqual(r.flags, [])
        self.assertFalse(r.cache_available)
        self.assertEqual(r.peak_at, et(21, day=day))

    def test_cli_on_fixture(self):
        doc = json.loads((FIXTURES / "oct24-gate1.json").read_text())
        rc, out = run_main(doc, "--date", "2026-10-24", "--gate", "1")
        self.assertEqual(rc, 0)
        self.assertIn("recommended tier: GP 4/16", out)
        self.assertIn("triggers NOT checked", out)

    def test_exact_26_peak_tips_over(self):
        # The by-eye numbers are +-2 points, and 15/26 exactly lands past the
        # GP 4/16 line. Pin that so nobody is surprised at Gate 2.
        _, p = gate.project(1, 15, 26)
        self.assertEqual(gate.recommend_tier(p), "GP 8/32")


class WindowTest(unittest.TestCase):
    def test_et_window_tracks_dst(self):
        oct_start, _ = gate.parse_window(date(2026, 10, 31), "20:00-22:00")
        nov_start, _ = gate.parse_window(date(2026, 11, 27), "20:00-22:00")
        self.assertEqual(oct_start.utcoffset().total_seconds(), -4 * 3600)
        self.assertEqual(nov_start.utcoffset().total_seconds(), -5 * 3600)

    def test_window_past_midnight(self):
        start, end = gate.parse_window(DAY, "22:00-01:00")
        self.assertEqual((end - start).total_seconds(), 3 * 3600)

    def test_bad_window(self):
        with self.assertRaises(ValueError):
            gate.parse_window(DAY, "8pm-10pm")

    def test_floor_uses_median_and_ignores_evening(self):
        # A 40% spike in the floor window moves the median not at all.
        cpu = minutes(14, 120, lambda i: 40.0 if i < 5 else 10.0) + minutes(20, 120, lambda i: 20.0)
        r = gate.evaluate(2, cpu, gate.parse_window(DAY, "20:00-22:00"),
                          gate.parse_window(DAY, "14:00-16:00"), None)
        self.assertEqual(r.floor, 10.0)
        self.assertEqual(r.x, 10.0)

    def test_peak_is_five_minute_mean_not_single_sample(self):
        # One 1-minute 90% blip inside a 20% bucket: mean 34, not a CPU trigger.
        cpu = night(window_value=20.0)
        cpu = [(t, 90.0 if t == et(21, 2) else v) for t, v in cpu]
        r = gate.evaluate(2, cpu, gate.parse_window(DAY, "20:00-22:00"),
                          gate.parse_window(DAY, "14:00-16:00"), None)
        self.assertAlmostEqual(r.peak, 34.0)
        self.assertEqual(r.flags, [])

    def test_missing_window_data_is_an_error(self):
        rc, _ = run_main({"cpu": minutes(14, 60, lambda i: 10)}, "--date", "2026-11-27", "--gate", "2")
        self.assertEqual(rc, 2)


class UpsizeTriggerTest(unittest.TestCase):
    def wt(self, cache=78.0, dirty=5.0, evict=0.0, at=(21, 0)):
        """1-minute WiredTiger series over the window; the given values apply
        to the 5 minutes from `at`, baseline elsewhere."""
        def pick(hot, base):
            return lambda i: hot if et(*at) <= et(20) + 60 * i < et(*at) + 300 else base
        return {
            "cache_pct": minutes(20, 120, pick(cache, 78.0)),
            "dirty_pct": minutes(20, 120, pick(dirty, 5.0)),
            "evict_rate": minutes(20, 120, pick(evict, 0.0)),
        }

    def flags(self, cpu=None, wiredtiger=None):
        doc = {"cpu": cpu or night()}
        if wiredtiger:
            doc["wiredtiger"] = wiredtiger
        rc, out = run_main(doc, "--date", "2026-11-27", "--gate", "2")
        self.assertEqual(rc, 0)
        return out

    def test_baseline_has_no_flags(self):
        out = self.flags(wiredtiger=self.wt())
        self.assertIn("upsize-regardless triggers: none", out)
        self.assertIn("cache max 78.0%", out)

    def test_cpu_over_70_in_any_bucket(self):
        cpu = night(window_value=30.0)
        cpu = [(t, 72.0 if et(21, 10) <= t < et(21, 15) else v) for t, v in cpu]
        out = self.flags(cpu=cpu)
        self.assertIn("UPSIZE REGARDLESS", out)
        self.assertIn("CPU: 1 five-minute reading(s) above 70% (max 72.0%)", out)

    def test_cache_over_80_with_app_evictions(self):
        out = self.flags(wiredtiger=self.wt(cache=82.0, evict=3.5))
        self.assertIn("cache: above 80% while app threads were evicting", out)

    def test_cache_over_80_alone_is_not_a_trigger(self):
        out = self.flags(wiredtiger=self.wt(cache=82.0, evict=0.0))
        self.assertIn("upsize-regardless triggers: none", out)

    def test_evictions_alone_with_cache_at_target_is_not_a_trigger(self):
        out = self.flags(wiredtiger=self.wt(cache=79.5, evict=10.0))
        self.assertIn("upsize-regardless triggers: none", out)

    def test_cache_and_evictions_at_different_times_is_not_a_trigger(self):
        wt = self.wt(cache=82.0)
        wt["evict_rate"] = self.wt(evict=5.0, at=(20, 30))["evict_rate"]
        out = self.flags(wiredtiger=wt)
        self.assertIn("upsize-regardless triggers: none", out)

    def test_dirty_over_15(self):
        out = self.flags(wiredtiger=self.wt(dirty=16.0))
        self.assertIn("dirty: above 15% at 5 sample(s) (max 16.0%)", out)

    def test_readings_outside_the_window_are_ignored(self):
        wt = self.wt()
        wt["dirty_pct"].append((et(23), 50.0))
        out = self.flags(wiredtiger=wt)
        self.assertIn("upsize-regardless triggers: none", out)


class ParsingTest(unittest.TestCase):
    def test_parse_matrix_and_merge_max_across_nodes(self):
        payload = {"status": "success", "data": {"resultType": "matrix", "result": [
            {"metric": {"host": "a"}, "values": [[100, "10.5"], [160, "11"]]},
            {"metric": {"host": "b"}, "values": [[100, "30"], [160, "5"]]},
        ]}}
        self.assertEqual(gate.merge_max(gate.parse_matrix(payload)), [(100.0, 30.0), (160.0, 11.0)])

    def test_parse_matrix_error_status(self):
        with self.assertRaises(ValueError):
            gate.parse_matrix({"status": "error", "error": "bad query"})

    def test_iso_timestamps_in_samples(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump({"cpu": [["2026-11-27T20:00:00-05:00", 12]]}, f)
        try:
            cpu, cache = gate.load_samples(Path(f.name))
        finally:
            os.unlink(f.name)
        self.assertEqual(cpu, [(et(20), 12.0)])
        self.assertIsNone(cache)

    def test_find_evict_metric(self):
        self.assertEqual(
            gate.find_evict_metric(["x", "mongodb_ss_wt_cache_pages_evicted_by_application_threads"]),
            "mongodb_ss_wt_cache_pages_evicted_by_application_threads",
        )
        self.assertEqual(
            gate.find_evict_metric(["mongodb_ss_wt_eviction_application_threads_evict_time"]),
            "mongodb_ss_wt_eviction_application_threads_evict_time",
        )
        self.assertIsNone(gate.find_evict_metric(["mongodb_up"]))

    def test_fetch_do_cpu_falls_back_to_next_engine(self):
        calls = []

        def fake_get(url, token):
            calls.append(url)
            if "/mongodb/" in url:
                raise ValueError("404")
            return {"status": "success", "data": {"result": [{"values": [[1, "20"]]}]}}

        with mock.patch.dict(os.environ, {"RF_GATE_DO_TOKEN": "t"}):
            s, path = gate.fetch_do_cpu("db", datetime.fromtimestamp(0, gate.ET),
                                        datetime.fromtimestamp(60, gate.ET), "max",
                                        ("mongodb", "mysql"), http_get=fake_get)
        self.assertEqual(path, "/monitoring/metrics/database/mysql/cpu_usage")
        self.assertEqual(s, [(1.0, 20.0)])
        self.assertIn("db_id=db", calls[0])
        self.assertIn("aggregate=max", calls[0])

    def test_fetch_do_cpu_all_empty_points_at_manual_fallback(self):
        with mock.patch.dict(os.environ, {"RF_GATE_DO_TOKEN": "t"}):
            with self.assertRaisesRegex(RuntimeError, "--from-json"):
                gate.fetch_do_cpu("db", datetime.fromtimestamp(0, gate.ET),
                                  datetime.fromtimestamp(60, gate.ET), "max", ("mysql",),
                                  http_get=lambda u, t: {"status": "success", "data": {"result": []}})


if __name__ == "__main__":
    unittest.main()
