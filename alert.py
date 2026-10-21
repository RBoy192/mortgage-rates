"""Open, update or close a GitHub issue when rates stop refreshing, so the site owner gets an email.

A rate needs attention when it has been shown as "not refreshed" for more than a day: the lender's page couldn't be read
(the site keeps showing the last good figure), or a hand-entered rate is more than a week old. Run by the hourly
workflow after the scraper, with GH_TOKEN set. The issue closes itself once everything refreshes again.
"""
import json, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

TITLE = "Rates need attention"
GRACE_HOURS = 24


def problems(data, now=None):
    now = now or datetime.now(timezone.utc)
    out = []
    for r in data.get("rates", []):
        if not r.get("stale"):
            continue
        last = r.get("checked_at") or r.get("fetched_at") or ""
        try:
            when = datetime.fromisoformat(last.replace("Z", "+00:00"))
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
        except ValueError:
            when = None
        if r.get("method") == "manual":  # a hand-entered rate is only flagged stale once it's over a week old
            out.append(f"- **{r['institution']}, {r['product']}**: the hand-entered rate was last checked {last[:10]}. "
                       f"Check the scheduled task that refreshes hand-entered rates, or update manual_rates.yaml.")
        elif when is None or (now - when).total_seconds() > GRACE_HOURS * 3600:
            out.append(f"- **{r['institution']}, {r['product']}**: not read since {last[:16].replace('T', ' ')} UTC. "
                       f"The lender's page may have changed or be blocking visits. [Its page]({r.get('source', '')})")
    for key, label in (("policy_rate", "Bank of Canada policy rate"), ("prime_rate", "Prime rate")):
        if (data.get(key) or {}).get("stale"):
            out.append(f"- **{label}**: couldn't be read from the Bank of Canada in the latest update.")
    return sorted(out)


def gh(*args):
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def main():
    found = problems(json.loads(Path("rates.json").read_text()))
    open_issues = json.loads(gh("issue", "list", "--state", "open", "--search", f'in:title "{TITLE}"', "--json", "number,title,body"))
    issue = next((i for i in open_issues if i["title"] == TITLE), None)
    if found:
        body = ("These rates on whatstherate.ca haven't refreshed for more than a day. The site keeps showing the last good "
                "figure, greyed out as \"not refreshed\".\n\n" + "\n".join(found)
                + "\n\nThis issue updates itself every hour and closes on its own once everything refreshes again.")
        if issue is None:
            gh("issue", "create", "--title", TITLE, "--body", body)
            print("Opened an issue:", len(found), "rates need attention")
        elif issue["body"].strip() != body.strip():
            gh("issue", "edit", str(issue["number"]), "--body", body)
            gh("issue", "comment", str(issue["number"]), "--body", "The list changed:\n\n" + "\n".join(found))
            print("Updated the issue:", len(found), "rates need attention")
        else:
            print("Issue already up to date:", len(found), "rates need attention")
    elif issue is not None:
        gh("issue", "close", str(issue["number"]), "--comment", "All rates are refreshing again.")
        print("Closed the issue: all rates refreshing")
    else:
        print("All rates refreshing; nothing to report")


if __name__ == "__main__":
    sys.exit(main())
