"""Automated tests for scraper.py. Run with:  python -m unittest discover -s tests -v

The pages in tests/fixtures are trimmed copies of each bank's real rate section (October 2026),
so these tests check the scraper against the layouts the banks actually use."""
import json, os, sys, tempfile, unittest
from datetime import date, timedelta
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import scraper  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402

FIX = HERE / "fixtures"
PAGES = {
    "https://bmo.example/rates": (FIX / "bmo.html").read_text(),
    "https://cibc.example/rates": (FIX / "cibc.html").read_text(),
    "https://eq.example/rates": (FIX / "eq.html").read_text(),
}
LENDERS = """
- name: BMO
  url: https://bmo.example/rates
  mode: static
  rates:
    - product: 3-year fixed
      label: "3 year fixed (closed)"
    - product: 5-year fixed
      label: "5 year Smart Fixed (closed)"
    - product: 5-year variable
      label: "5 year Variable (closed)"
- name: CIBC
  url: https://cibc.example/rates
  mode: static
  rates:
    - product: 3-year fixed
      label: "3-year fixed"
    - product: 5-year fixed
      label: "5-year fixed"
    - product: 5-year variable
      label: "5 years"
      after: "CIBC Variable Flex Mortgage"
      nth: 2
- name: EQ Bank
  url: https://eq.example/rates
  mode: static
  rates:
    - product: 3-year fixed
      label: "Standard Mortgage Rate (Closed)"
      column: "3 Year Fixed"
    - product: 5-year fixed
      label: "Standard Mortgage Rate (Closed)"
      column: "5 Year Fixed"
    - product: 5-year variable
      label: "Standard Mortgage Rate (Closed)"
      column: "5 Year Adjustable"
      prime_label: "Equitable Prime Rate (P)"
"""
BOC = {"rate": 2.25, "as_of": "2026-10-15", "source": "https://www.bankofcanada.ca/", "fetched_at": "2026-10-18T12:00:00Z", "stale": False}


def fake_get_html(url, browser=False):
    if url not in PAGES:
        raise ConnectionError(f"net::ERR_HTTP2_PROTOCOL_ERROR at {url}")
    return PAGES[url]


class InTempFolder(unittest.TestCase):
    """Each test runs in an empty folder with the network replaced by the saved pages."""

    def setUp(self):
        self.old_cwd = os.getcwd()
        self.dir = tempfile.TemporaryDirectory()
        os.chdir(self.dir.name)
        Path("institutions.yaml").write_text(LENDERS)
        patches = [mock.patch.object(scraper, "get_html", side_effect=fake_get_html),
                   mock.patch.object(scraper, "robots_ok", return_value=True),
                   mock.patch.object(scraper, "policy_rate", return_value=dict(BOC)),
                   mock.patch.object(scraper, "prime_rate", return_value=dict(BOC, rate=4.45))]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        os.chdir(self.old_cwd)
        self.dir.cleanup()

    def run_scraper(self):
        with mock.patch("sys.stdout"), mock.patch("sys.stderr"):
            code = scraper.run()
        return code, json.loads(Path("rates.json").read_text())

    @staticmethod
    def rates(out):
        return {(r["institution"], r["product"]): r for r in out["rates"]}


class ValidData(InTempFolder):
    def test_reads_every_rate_from_the_real_layouts(self):
        code, out = self.run_scraper()
        got = {k: v["rate"] for k, v in self.rates(out).items()}
        self.assertEqual(code, 0)
        self.assertEqual(got, {
            ("BMO", "3-year fixed"): 4.94, ("BMO", "5-year fixed"): 5.14, ("BMO", "5-year variable"): 4.10,
            ("CIBC", "3-year fixed"): 5.09, ("CIBC", "5-year fixed"): 5.34, ("CIBC", "5-year variable"): 4.20,
            ("EQ Bank", "3-year fixed"): 5.49, ("EQ Bank", "5-year fixed"): 5.59, ("EQ Bank", "5-year variable"): 4.79,
        })

    def test_each_rate_records_where_and_how_it_was_collected(self):
        _, out = self.run_scraper()
        r = self.rates(out)[("CIBC", "5-year fixed")]
        self.assertEqual(r["source"], "https://cibc.example/rates")
        self.assertEqual(r["method"], "automatic")
        self.assertFalse(r["stale"])
        self.assertTrue(r["checked_at"].endswith("Z"))

    def test_prime_plus_spread_uses_the_lenders_own_prime_not_a_script_or_reverse_mortgage_prime(self):
        soup = BeautifulSoup(PAGES["https://eq.example/rates"], "html.parser")
        rate, shown = scraper.extract(soup, {"label": "Standard Mortgage Rate (Closed)", "column": "5 Year Adjustable",
                                             "prime_label": "Equitable Prime Rate (P)"})
        self.assertEqual(rate, 4.79)
        self.assertIn("4.45", shown)

    def test_prime_minus_spread(self):
        soup = BeautifulSoup(PAGES["https://eq.example/rates"], "html.parser")
        rate, _ = scraper.extract(soup, {"label": "EQB Evolution Suite", "column": "5 Year Adjustable",
                                         "prime_label": "Equitable Prime Rate (P)"})
        self.assertEqual(rate, 3.6)

    def test_ignores_rates_inside_scripts(self):
        soup = BeautifulSoup(PAGES["https://bmo.example/rates"], "html.parser")
        with self.assertRaises(ValueError):
            scraper.rate_by_label(soup, '"rate"')

    def test_label_inside_a_longer_phrase_does_not_win_over_an_exact_cell(self):
        # "5 years" also appears inside "Amortizations 25 years or less" on CIBC's page
        soup = BeautifulSoup(PAGES["https://cibc.example/rates"], "html.parser")
        self.assertEqual(scraper.rate_by_label(soup, "5 years", nth=2, after="CIBC Variable Flex Mortgage")[0], 4.20)


class MissingRates(InTempFolder):
    def test_a_missing_label_is_reported_and_nothing_is_invented(self):
        Path("institutions.yaml").write_text(LENDERS.replace('"5 year Variable (closed)"', '"10 year Variable (closed)"'))
        code, out = self.run_scraper()
        self.assertEqual(code, 1)
        self.assertNotIn(("BMO", "5-year variable"), self.rates(out))
        self.assertIn(("BMO", "5-year fixed"), self.rates(out))

    def test_a_missing_column_is_reported(self):
        soup = BeautifulSoup(PAGES["https://eq.example/rates"], "html.parser")
        with self.assertRaisesRegex(ValueError, "no column"):
            scraper.extract(soup, {"label": "Standard Mortgage Rate (Closed)", "column": "7 Year Fixed"})

    def test_a_cell_without_a_rate_is_reported(self):
        soup = BeautifulSoup(PAGES["https://eq.example/rates"], "html.parser")
        with self.assertRaisesRegex(ValueError, "no rate"):
            scraper.extract(soup, {"label": "Standard Mortgage Rate (Closed)", "column": "6 Month"})

    def test_an_implausible_rate_is_rejected(self):
        soup = BeautifulSoup("<table><tr><td>5-year fixed</td><td>45.0%</td></tr></table>", "html.parser")
        with self.assertRaisesRegex(ValueError, "plausible"):
            scraper.extract(soup, {"label": "5-year fixed"})


class FailedRequests(InTempFolder):
    def test_a_blocked_page_is_reported_not_worked_around(self):
        Path("institutions.yaml").write_text(LENDERS.replace("https://bmo.example/rates", "https://blocked.example/rates"))
        with mock.patch("sys.stdout"), mock.patch("sys.stderr") as err:
            code = scraper.run()
        self.assertEqual(code, 1)
        self.assertIn("ERR_HTTP2_PROTOCOL_ERROR", "".join(str(c) for c in err.write.call_args_list))
        out = json.loads(Path("rates.json").read_text())
        self.assertFalse(any(r["institution"] == "BMO" for r in out["rates"]))

    def test_a_failed_bank_of_canada_request_keeps_the_last_value_flagged_stale(self):
        self.run_scraper()
        with mock.patch.object(scraper, "policy_rate", side_effect=ConnectionError("timeout")):
            code, out = self.run_scraper()
        self.assertEqual(code, 1)
        self.assertTrue(out["policy_rate"]["stale"])
        self.assertEqual(out["policy_rate"]["rate"], 2.25)


class StaleData(InTempFolder):
    def test_a_rate_that_fails_later_keeps_its_last_value_but_is_flagged_stale(self):
        self.run_scraper()
        Path("institutions.yaml").write_text(LENDERS.replace("https://cibc.example/rates", "https://blocked.example/rates"))
        code, out = self.run_scraper()
        r = self.rates(out)[("CIBC", "5-year fixed")]
        self.assertEqual(code, 1)
        self.assertEqual(r["rate"], 5.34)
        self.assertTrue(r["stale"])

    def manual(self, days_old, rate=5.25):
        checked = (date.fromisoformat(scraper.today()) - timedelta(days=days_old)).isoformat()
        Path("manual_rates.yaml").write_text(f"- institution: BMO\n  product: 5-year fixed\n  rate: {rate}\n  checked: {checked}\n")
        Path("institutions.yaml").write_text(LENDERS.replace("https://bmo.example/rates", "https://blocked.example/rates"))

    def test_a_recent_manual_rate_fills_in_when_collection_fails(self):
        self.manual(days_old=2)
        _, out = self.run_scraper()
        r = self.rates(out)[("BMO", "5-year fixed")]
        self.assertEqual((r["rate"], r["method"], r["stale"]), (5.25, "manual", False))

    def test_an_old_manual_rate_is_never_shown_as_current(self):
        self.manual(days_old=scraper.MANUAL_MAX_DAYS + 1)
        code, out = self.run_scraper()
        r = self.rates(out)[("BMO", "5-year fixed")]
        self.assertTrue(r["stale"])
        self.assertEqual(code, 1)

    def test_an_automatic_rate_always_beats_a_manual_one(self):
        self.manual(days_old=0)
        Path("institutions.yaml").write_text(LENDERS)
        _, out = self.run_scraper()
        r = self.rates(out)[("BMO", "5-year fixed")]
        self.assertEqual((r["rate"], r["method"]), (5.14, "automatic"))

    def test_a_bad_manual_entry_is_skipped(self):
        Path("manual_rates.yaml").write_text("- institution: BMO\n  product: 5-year fixed\n  rate: 55\n  checked: 2026-10-18\n")
        with mock.patch("sys.stderr"):
            self.assertEqual(scraper.load_manual(), {})


class History(unittest.TestCase):
    out = {"rates": [{"institution": "BMO", "product": "5-year fixed", "rate": 5.14, "stale": False},
                     {"institution": "CIBC", "product": "5-year fixed", "rate": 5.34, "stale": True}],
           "policy_rate": {"rate": 2.25, "stale": False}}

    def test_adds_one_point_per_day_and_skips_stale_rates(self):
        h = scraper.update_history({}, self.out, day="2026-10-17")
        h = scraper.update_history(h, self.out, day="2026-10-18")
        self.assertEqual(h["series"]["BMO|5-year fixed"], [["2026-10-17", 5.14], ["2026-10-18", 5.14]])
        self.assertNotIn("CIBC|5-year fixed", h["series"])
        self.assertEqual(h["series"]["policy_rate"][-1], ["2026-10-18", 2.25])

    def test_a_later_run_on_the_same_day_replaces_that_days_value(self):
        h = scraper.update_history({}, self.out, day="2026-10-18")
        changed = json.loads(json.dumps(self.out))
        changed["rates"][0]["rate"] = 4.99
        h = scraper.update_history(h, changed, day="2026-10-18")
        self.assertEqual(h["series"]["BMO|5-year fixed"], [["2026-10-18", 4.99]])

    def test_the_scraper_writes_history_json(self):
        with tempfile.TemporaryDirectory() as d:
            old = os.getcwd()
            os.chdir(d)
            try:
                Path("institutions.yaml").write_text(LENDERS)
                with mock.patch.object(scraper, "get_html", side_effect=fake_get_html), \
                        mock.patch.object(scraper, "robots_ok", return_value=True), \
                        mock.patch.object(scraper, "policy_rate", return_value=dict(BOC)), \
                        mock.patch.object(scraper, "prime_rate", return_value=dict(BOC, rate=4.45)), \
                        mock.patch("sys.stdout"), mock.patch("sys.stderr"):
                    scraper.run()
                h = json.loads(Path("history.json").read_text())
                self.assertEqual(h["series"]["EQ Bank|5-year variable"][-1][1], 4.79)
                self.assertEqual(h["series"]["prime_rate"][-1][1], 4.45)
            finally:
                os.chdir(old)


if __name__ == "__main__":
    unittest.main()
