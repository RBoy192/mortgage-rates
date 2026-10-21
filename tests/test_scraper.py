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
                   mock.patch.object(scraper, "prime_rate", return_value=dict(BOC, rate=4.45)),
                   mock.patch.object(scraper, "boc_history", return_value={})]
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

    def test_bank_of_canada_history_keeps_only_changes_and_merges_with_later_days(self):
        fake = {"observations": [
            {"d": "2025-10-01", "V39079": {"v": "2.50"}, "V80691311": {"v": "4.70"}, "V80691334": {"v": "6.05"}, "V80691335": {"v": "6.09"}},
            {"d": "2025-10-08", "V39079": {"v": "2.50"}, "V80691311": {"v": "4.70"}, "V80691334": {"v": "6.05"}, "V80691335": {"v": "6.09"}},
            {"d": "2025-10-30", "V39079": {"v": "2.25"}},
            {"d": "2025-11-05", "V39079": {"v": "2.25"}, "V80691311": {"v": "4.45"}, "V80691334": {"v": "6.05"}, "V80691335": {"v": "6.09"}},
            {"d": "2026-10-14", "V39079": {"v": "2.25"}, "V80691311": {"v": "4.45"}, "V80691334": {"v": "6.05"}, "V80691335": {"v": "6.19"}}]}
        resp = mock.Mock(); resp.json.return_value = fake
        with mock.patch("requests.get", return_value=resp):
            found = scraper.boc_history(day="2026-10-18")
        self.assertEqual(found["policy_rate"], [["2025-10-01", 2.5], ["2025-10-08", 2.5], ["2025-10-30", 2.25], ["2026-10-14", 2.25]])  # flat until the change
        self.assertEqual(found["posted|5-year fixed"], [["2025-10-01", 6.09], ["2025-11-05", 6.09], ["2026-10-14", 6.19]])
        h = {"series": {"prime_rate": [["2026-10-17", 4.45], ["2026-10-18", 4.45]], "BMO|5-year fixed": [["2026-10-18", 5.14]]}}
        h = scraper.merge_boc_history(h, found)
        self.assertEqual(h["series"]["prime_rate"][0], ["2025-10-01", 4.7])
        self.assertEqual(h["series"]["prime_rate"][-2:], [["2026-10-17", 4.45], ["2026-10-18", 4.45]])
        self.assertEqual(h["series"]["BMO|5-year fixed"], [["2026-10-18", 5.14]])

    def test_a_failed_history_download_doesnt_fail_the_run(self):
        with tempfile.TemporaryDirectory() as d:
            old = os.getcwd(); os.chdir(d)
            try:
                Path("institutions.yaml").write_text(LENDERS)
                with mock.patch.object(scraper, "get_html", side_effect=fake_get_html), \
                        mock.patch.object(scraper, "robots_ok", return_value=True), \
                        mock.patch.object(scraper, "policy_rate", return_value=dict(BOC)), \
                        mock.patch.object(scraper, "prime_rate", return_value=dict(BOC, rate=4.45)), \
                        mock.patch.object(scraper, "boc_history", side_effect=ConnectionError("down")), \
                        mock.patch("sys.stdout"), mock.patch("sys.stderr"):
                    self.assertEqual(scraper.run(), 0)
                self.assertIn("EQ Bank|3-year fixed", json.loads(Path("history.json").read_text())["series"])
            finally:
                os.chdir(old)

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
                        mock.patch.object(scraper, "boc_history", return_value={}), \
                        mock.patch("sys.stdout"), mock.patch("sys.stderr"):
                    scraper.run()
                h = json.loads(Path("history.json").read_text())
                self.assertEqual(h["series"]["EQ Bank|5-year variable"][-1][1], 4.79)
                self.assertEqual(h["series"]["prime_rate"][-1][1], 4.45)
            finally:
                os.chdir(old)


if __name__ == "__main__":
    unittest.main()


class TestBefore(unittest.TestCase):
    def test_before_stops_reading_at_marker(self):
        from bs4 import BeautifulSoup
        html = ('<h2>Fixed Rate Mortgages</h2><div><div>3 Year</div><div>5.94%</div><div>4.59%</div></div>'
                '<div><div>5 Year (Conventional)<sup>1</sup></div><div>6.09%</div><div>4.79%</div></div>'
                '<h2>Servus No Frills Mortgage</h2><div><div>5 Year (Conventional)</div><div>6.09%</div><div>4.64%</div></div>')
        soup = BeautifulSoup(html, "html.parser")
        item = {"label": "5 Year (Conventional)", "nth": 2, "after": "Fixed Rate Mortgages", "before": "No Frills"}
        self.assertEqual(scraper.extract(soup, item)[0], 4.79)
        self.assertEqual(scraper.extract(soup, {"label": "3 Year", "nth": 2, "after": "Fixed Rate Mortgages", "before": "No Frills"})[0], 4.59)
        with self.assertRaises(ValueError):
            scraper.extract(soup, {"label": "5 Year (Conventional)", "before": "Not on this page"})


class TestNewLenders(unittest.TestCase):
    """Mock pages laid out like each lender's real rate page (October 2026), read with the real institutions.yaml entries."""
    PAGES = {
        "Manulife Bank": '<nav><a>Manulife One</a><a>Manulife Bank Select</a></nav><h2>Special rates</h2>'
            '<div class="c"><p>5-year closed fixed-rate</p><p>As low as 4.89%* (APR)</p><p>Manulife One</p><p>(New clients only)</p></div>'
            '<div class="c"><p>5-year closed fixed-rate</p><p>As low as 4.94%** (APR)</p><p>Manulife Bank Select Mortgage</p><p>(New clients only)</p></div>'
            '<div class="c"><p>5-year closed fixed-rate</p><p>As low as 4.79%&dagger; (APR)</p><p>Manulife Bank Select High Ratio mortgage</p></div>'
            '<h2>Current rates</h2><h3>Manulife One</h3><table><tr><td>Manulife One Base Rate</td><td>4.95%</td></tr>'
            '<tr><td>3-year closed</td><td>5.29%</td></tr><tr><td>5-year closed</td><td>5.39%</td></tr></table>'
            '<h3>Manulife Bank Select</h3><table><tr><td>Manulife Bank Prime Rate</td><td>4.45%</td></tr>'
            '<tr><th>Variable-rate terms</th><th>APR (%)</th></tr><tr><td>5-year closed (Manulife Bank prime + 0.00%)</td><td>4.45%</td></tr>'
            '<tr><td>5-year open (Manulife Bank prime + 1.00%)</td><td>5.45%</td></tr>'
            '<tr><th>Fixed-rate terms</th><th>APR (%)</th></tr><tr><td>3-year closed</td><td>5.19%</td></tr><tr><td>5-year closed</td><td>5.39%</td></tr></table>',
        "Vancity": '<h2>High-ratio insured mortgages.</h2><table><tr><td>3-year fixed-term fixed-rate insured residential</td><td>4.70%</td><td>4.73%</td></tr></table>'
            '<h2>Fixed-term fixed-rate mortgages.</h2><table><tr><th></th><th>Rates as of 2026-10-01</th></tr>'
            '<tr><td>3-year fixed-term fixed-rate (special offer)</td><td>4.75%**</td><td>4.78%**</td></tr>'
            '<tr><td>5-year fixed-term fixed-rate (special offer)</td><td>4.84%**</td><td>4.86%**</td></tr>'
            '<tr><td>3-year fixed-term residential</td><td>4.80%</td><td>4.83%</td></tr></table>'
            '<h2>Variable rate mortgages.</h2><table><tr><td>5-year variable rate fixed-term (Vancity homeprime rate - 0.50%)&dagger;&dagger;</td><td>3.95%</td><td>3.97%</td></tr></table>',
        "Meridian": '<nav><a>Mortgage and borrowing rates</a></nav><p>The current Meridian Prime Rate is 4.45%</p>'
            '<div><b>4.74% (4.76% APR1)</b><span>Fixed-rate mortgage</span><span>5-Year Closed</span></div>'
            '<div role="tablist"><button>Fixed rates</button><button>Variable rates</button></div>'
            '<h3>Special offers</h3><table><tr><td>3-Year Closed (special offer)</td><td>4.49%</td><td>4.52% APR<sup>1</sup></td></tr>'
            '<tr><td>3-Year Closed High Ratio<sup>2</sup> (special offer)</td><td>4.34%</td><td>4.37% APR</td></tr>'
            '<tr><td>5-Year Closed (special offer)</td><td>4.74%</td><td>4.76% APR</td></tr></table>'
            '<h3>Posted rates</h3><table><tr><td>3-Year Closed</td><td>6.54%</td></tr><tr><td>5-Year Closed</td><td>6.49%</td></tr>'
            '<tr><td>10-Year Closed</td><td>6.99%</td><td>7.00% APR</td></tr></table>'
            '<table><tr><td>5-Year Closed</td><td>3.64% (Prime - 0.81%)</td><td>3.66% APR</td></tr>'
            '<tr><td>5-Year Closed High Ratio<sup>2</sup></td><td>3.44% (Prime - 1.01%)</td></tr></table>',
        "First National": '<nav><a>Adjustable rate mortgages</a></nav><p>Rates effective as of Friday, October 16, 2026</p>'
            '<h3>Fixed rate mortgages – closed terms</h3><table><tr><th>Mortgage type</th><th>1 year</th><th>2 year</th><th>3 year</th>'
            '<th>4 year</th><th>5 year</th><th>7 year</th><th>10 year</th></tr>'
            '<tr><td>Insured</td><td>5.69</td><td>5.34</td><td>5.28</td><td>5.24</td><td>4.99</td><td>5.44</td><td>5.74</td></tr>'
            '<tr><td>Conventional</td><td>5.69</td><td>5.34</td><td>5.28</td><td>5.24</td><td>5.31</td><td>5.44</td><td>5.74</td></tr></table>'
            '<h3>Adjustable rate mortgages</h3><table><tr><th>Mortgage type</th><th>5 year</th></tr>'
            '<tr><td>Insured</td><td>Prime - 0.75% for the entire term</td></tr>'
            '<tr><td>Conventional</td><td>Prime - 0.31% for the entire term</td></tr></table>'
            '<p><b>First National Prime Rate: 4.45</b></p>',
        "Libro Credit Union": '<div role="table"><div role="rowgroup"><div role="row"><div role="columnheader">Range</div><div role="columnheader">Rate</div></div></div>'
            '<div role="rowgroup"><div role="row"><div role="cell">1st Mortgage Variable 5 Year Closed from (Prime - 0.30%)</div><div role="cell">4.150% Open option + 0.80%</div></div>'
            '<div role="row"><div role="cell">3 Year Closed</div><div role="cell">5.090%</div></div><div role="row"><div role="cell">3 Year Closed - High-Ratio</div><div role="cell">4.390%</div></div>'
            '<div role="row"><div role="cell">5 Year Closed</div><div role="cell">5.140%</div></div></div></div>',
        "ICICI Bank Canada": '<table><tr><th>Term</th><th>iGlobal Rates</th><th>Posted Rates</th></tr>'
            '<tr><td>3-Year Fixed Closed</td><td>** Contact our Mortgage Specialist</td><td>6.14%</td></tr>'
            '<tr><td>5-Year Fixed Closed</td><td>** Contact our Mortgage Specialist</td><td>6.14%</td></tr>'
            '<tr><td>5-Year Variable Closed</td><td>** Contact our Mortgage Specialist</td><td>Prime<sup>6</sup> + 1.00%</td></tr></table>'
            '<p>ICICI Bank Canada Prime Rate is 4.45% as of October 30, 2025.</p>',
        "Access Credit Union": '<table><tr><th>Mortgages</th><th>Rates</th></tr><tr><td>3 Year Fixed</td><td>4.19%</td></tr><tr><td>5 Year Fixed</td><td>4.39%</td></tr>'
            '<tr><td>Variable Open (Prime)</td><td>4.45%</td></tr><tr><td>Variable Closed (Prime - 0.90%)</td><td>3.55%</td></tr></table>',
        "Steinbach Credit Union": '<table><tr><td>High-Ratio Fixed 3-year Mortgage</td><td></td><td>4.09%</td></tr><tr><td>High-Ratio Closed Variable Mortgage</td><td></td><td>3.55%</td></tr>'
            '<tr><td>Conventional Fixed 3-year Mortgage</td><td></td><td>4.19%</td></tr><tr><td>Conventional Fixed 5-year Mortgage</td><td></td><td>4.39%</td></tr>'
            '<tr><td>Conventional Closed Variable Mortgage</td><td></td><td>3.55%</td></tr></table>',
        "Tru Cooperative Bank": '<h3>Featured mortgage rates</h3><p>5-Year Fixed Closed - Insured 4.59%</p><h2>Fixed mortgage rates</h2><table>'
            '<tr><td>3 year fixed rate (closed)<sup>2</sup></td><td>4.64%</td><td>4.67%</td></tr><tr><td>4 year fixed rate (closed)<sup>2</sup></td><td>4.69%</td><td>4.72%</td></tr>'
            '<tr><td>5 year fixed rate (closed) - insured<sup>3</sup></td><td>4.59%</td><td>4.61%</td></tr><tr><td>5 year fixed rate (closed)<sup>2</sup></td><td>4.74%</td><td>4.76%</td></tr></table>'
            '<h2>Variable mortgage rates</h2><p>Open/closed Mortgage Rates</p><table>'
            '<tr><td>5 year variable rate (closed) - insured<sup>3</sup></td><td>3.70%</td><td>3.72%</td></tr><tr><td>5 year variable rate (closed)<sup>2</sup></td><td>3.85%</td><td>3.87%</td></tr></table>',
    }
    WANT = {
        "Manulife Bank": {"3-year fixed": 5.19, "5-year fixed": 4.94, "5-year variable": 4.45},
        "Vancity": {"3-year fixed": 4.75, "5-year fixed": 4.84, "5-year variable": 3.95},
        "Meridian": {"3-year fixed": 4.49, "5-year fixed": 4.74, "5-year variable": 3.64},
        "First National": {"3-year fixed": 5.28, "5-year fixed": 5.31, "5-year variable": 4.14},
        "Libro Credit Union": {"3-year fixed": 5.09, "5-year fixed": 5.14, "5-year variable": 4.15, "3-year fixed insured": 4.39},
        "ICICI Bank Canada": {"3-year fixed": 6.14, "5-year fixed": 6.14, "5-year variable": 5.45},
        "Access Credit Union": {"3-year fixed": 4.19, "5-year fixed": 4.39, "5-year variable": 3.55},
        "Steinbach Credit Union": {"3-year fixed": 4.19, "5-year fixed": 4.39, "5-year variable": 3.55, "3-year fixed insured": 4.09, "5-year variable insured": 3.55},
        "Tru Cooperative Bank": {"3-year fixed": 4.64, "5-year fixed": 4.74, "5-year variable": 3.85, "5-year fixed insured": 4.59, "5-year variable insured": 3.70},
    }

    def test_new_lenders_read_the_right_rates(self):
        import yaml
        conf = {l["name"]: l for l in yaml.safe_load((HERE.parent / "institutions.yaml").read_text())}
        for name, html in self.PAGES.items():
            soup = BeautifulSoup(html, "html.parser")
            for item in scraper.active(conf[name]):
                if item["product"] not in self.WANT[name]:
                    continue  # e.g. insured rates, which these mock pages don't include
                with self.subTest(lender=name, product=item["product"]):
                    self.assertEqual(scraper.extract(soup, item)[0], self.WANT[name][item["product"]])

    def test_plain_numbers_only_when_asked(self):
        soup = BeautifulSoup('<table><tr><th>Type</th><th>5 year</th></tr><tr><td>Conventional</td><td>5.31</td></tr></table>', "html.parser")
        with self.assertRaises(ValueError):
            scraper.extract(soup, {"label": "Conventional", "column": "5 year"})
        self.assertEqual(scraper.extract(soup, {"label": "Conventional", "column": "5 year", "plain": True})[0], 5.31)


class TestBackfillLayouts(unittest.TestCase):
    """Older page layouts used when rebuilding history from archived copies (backfill/layouts.yaml)."""
    def setUp(self):
        old = os.getcwd(); os.chdir(HERE.parent); self.addCleanup(os.chdir, old)
        import backfill; self.b = backfill

    def test_skips_hidden_template_and_reads_the_real_row(self):
        html = ('<div class="m"><p>3 Year Fixed Closed</p><p>Posted Rate: 3.49% Special Rate: 2.14%</p></div>'
                '<table><tr><td>3 Year Fixed Closed<sup>6</sup></td><td>2.14 %</td><td>2.18 %</td></tr></table>')
        item = {"product": "3-year fixed", "label": "3 Year Fixed Closed", "pattern": r'^\s*(?:\d\s+)?(\d{1,2}\.\d{2})\s*%'}
        self.assertEqual(self.b.read_one(BeautifulSoup(html, "html.parser"), item)[0], 2.14)

    def test_blank_template_is_skipped_not_guessed(self):
        html = '<table><tr><td>3 Year Fixed Closed 6</td><td>%</td><td>%</td></tr></table>'
        item = {"product": "3-year fixed", "label": "3 Year Fixed Closed", "pattern": r'^\s*(?:\d\s+)?(\d{1,2}\.\d{2})\s*%'}
        with self.assertRaises(ValueError):
            self.b.read_one(BeautifulSoup(html, "html.parser"), item)

    def test_rbc_variable_reads_the_bracketed_rate_and_needs_special_offers(self):
        lender = {"name": "RBC Royal Bank", "rates": []}
        items = {i["product"]: i for i in self.b.items_for(lender, "2021-02-25")}
        page = ('<h3>25 Year Amortization or Less</h3><table><tr><th>Term</th><th>{}</th><th>APR</th></tr>'
                '<tr><td>3 Year Closed</td><td>2.190%</td><td>2.230%</td></tr><tr><td>5 Year Closed</td><td>2.220%</td><td>2.250%</td></tr></table>'
                '<h4>Variable Mortgage Rates</h4><table><tr><td>5 Year Closed</td><td>RBC Prime Rate - 0.350% (2.100%)</td><td>2.130%</td></tr></table>'
                '<h3>Greater Than 25 Year Amortization</h3>')
        soup = BeautifulSoup(page.format("Special Offers"), "html.parser")
        self.assertEqual(self.b.read_one(soup, items["5-year variable"])[0], 2.10)
        self.assertEqual(self.b.read_one(soup, items["3-year fixed"])[0], 2.19)
        self.assertEqual(self.b.read_one(soup, items["5-year fixed"])[0], 2.22)
        with self.assertRaises(ValueError):  # a week when the table showed only posted rates
            self.b.read_one(BeautifulSoup(page.format("Posted Rates"), "html.parser"), items["3-year fixed"])

    def test_current_settings_after_the_last_old_layout(self):
        lender = {"name": "RBC Royal Bank", "rates": [{"product": "3-year fixed", "label": "3 Year Fixed Closed"}]}
        self.assertEqual(self.b.items_for(lender, "2026-08-01")[0]["label"], "3 Year Fixed Closed")


class TestAlertAndFeed(unittest.TestCase):
    def test_alert_waits_a_day_and_flags_old_manual_rates(self):
        import alert
        from datetime import datetime, timezone
        now = datetime(2026, 10, 21, 12, tzinfo=timezone.utc)
        data = {"rates": [
            {"institution": "A", "product": "5-year fixed", "stale": True, "method": "automatic", "checked_at": "2026-10-21T02:00:00Z"},
            {"institution": "B", "product": "5-year fixed", "stale": True, "method": "automatic", "checked_at": "2026-10-19T02:00:00Z"},
            {"institution": "C", "product": "3-year fixed", "stale": True, "method": "manual", "checked_at": "2026-10-10"},
            {"institution": "D", "product": "3-year fixed", "stale": False, "method": "automatic", "checked_at": "2026-10-01T00:00:00Z"}],
            "prime_rate": {"rate": 4.45, "stale": True}}
        found = alert.problems(data, now)
        self.assertEqual(len(found), 3)
        self.assertTrue(any("**B," in f for f in found) and any("**C," in f for f in found) and any("Prime rate" in f for f in found))
        self.assertFalse(any("**A," in f or "**D," in f for f in found))

    def test_feed_lists_recent_changes_newest_first(self):
        import feed
        from datetime import date
        h = {"series": {"X|5-year fixed": [["2026-10-01", 5.0], ["2026-10-02", 5.0], ["2026-10-03", 4.9]],
                        "Y|3-year fixed": [["2026-10-01", 4.5], ["2026-10-05", 4.6]],
                        "Z|3-year fixed": [["2025-01-01", 4.5], ["2026-10-05", 4.6]],   # a long gap is not a change we saw
                        "posted|5-year fixed": [["2026-10-01", 6.0], ["2026-10-04", 6.1]]}}
        c = feed.changes(h, today=date(2026, 10, 10))
        self.assertEqual([(x["lender"], x["date"]) for x in c], [("Y", "2026-10-05"), ("X", "2026-10-03")])
        self.assertIn("down 0.10", feed.entry_text(c[1])[0])
        import xml.dom.minidom
        xml.dom.minidom.parseString(feed.atom(c, "2026-10-05T12:00:00Z"))
