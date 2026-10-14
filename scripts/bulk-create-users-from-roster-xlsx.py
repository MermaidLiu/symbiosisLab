#!/usr/bin/env python3
"""Bulk-create platform accounts from 人员名单.xlsx via admin API."""
from __future__ import annotations

import json
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

try:
    from pypinyin import Style, lazy_pinyin
except ImportError:
    print("Install: pip3 install pypinyin", file=sys.stderr)
    sys.exit(1)

API = "https://daigroup.org/lab"
COOKIE = "/tmp/symbiosis-bulk-users.txt"
DEFAULT_XLSX = Path.home() / "Downloads/人员名单.xlsx"
OUT_CSV = Path(__file__).resolve().parents[1] / "docs/import-templates/人员名单-开通结果.csv"


def read_xlsx(path: Path) -> list[list[str]]:
    z = zipfile.ZipFile(path)
    ss: list[str] = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        for si in root.findall(".//m:si", ns):
            ss.append("".join((t.text or "") for t in si.findall(".//m:t", ns)))
    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

    def col_row(ref: str) -> tuple[str, int]:
        col = row = ""
        for ch in ref:
            if ch.isalpha():
                col += ch
            else:
                row += ch
        return col, int(row)

    def col_to_idx(col: str) -> int:
        n = 0
        for ch in col:
            n = n * 26 + (ord(ch.upper()) - 64)
        return n - 1

    rows: dict[int, dict[int, str]] = {}
    for c in sheet.findall(".//m:sheetData/m:row/m:c", ns):
        ref = c.get("r") or "A1"
        col, row = col_row(ref)
        v = c.find("m:v", ns)
        if v is None:
            val = ""
        else:
            t = c.get("t")
            val = ss[int(v.text)] if t == "s" else (v.text or "")
        rows.setdefault(row, {})[col_to_idx(col)] = str(val).strip()

    max_row = max(rows)
    max_col = max(max(r.keys()) for r in rows.values())
    return [[rows.get(r, {}).get(c, "") for c in range(max_col + 1)] for r in range(1, max_row + 1)]


def password_from_name(name: str) -> str:
    py = lazy_pinyin(name, style=Style.NORMAL)
    return "".join(p[0] for p in py if p).lower() + "123"


def map_roles(job: str) -> list[str]:
    if "技术员" in job:
        return ["user", "animal_manager"]
    if "科研助理" in job or "行政" in job:
        return ["user", "research_assistant"]
    return ["user"]


def map_applied_role(job: str) -> str:
    if "技术员" in job:
        return "technician"
    return "student"


def curl_json(method: str, url: str, data: dict | None = None) -> dict:
    cmd = ["curl", "-sS", "--max-time", "120", "-b", COOKIE, "-c", COOKIE, "-X", method, url]
    if data is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(data, ensure_ascii=False)]
    raw = subprocess.check_output(cmd)
    return json.loads(raw)


def main() -> None:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx.is_file():
        print("File not found:", xlsx, file=sys.stderr)
        sys.exit(1)

    matrix = read_xlsx(xlsx)
    curl_json(
        "POST",
        f"{API}/api/auth",
        {"action": "login", "email": "admin@lab.edu.cn", "password": "admin123"},
    )

    results: list[dict] = []
    for row in matrix:
        name, job, phone, email = (row + ["", "", "", ""])[:4]
        name = name.strip()
        if not name:
            continue
        email = email.strip().lower()
        phone = "".join(ch for ch in phone if ch.isdigit())
        pwd = password_from_name(name)
        if not email:
            results.append({"name": name, "status": "skipped", "reason": "no_email"})
            continue
        if not phone:
            results.append(
                {
                    "name": name,
                    "status": "skipped",
                    "reason": "no_phone",
                    "email": email,
                    "password": pwd,
                }
            )
            continue

        body = {
            "name": name,
            "email": email,
            "phone": phone,
            "password": pwd,
            "department": "Symbionics Lab",
            "employeeId": phone,
            "school": "清华大学",
            "personType": job,
            "appliedRole": map_applied_role(job),
            "phoneLocked": True,
            "roles": map_roles(job),
        }
        resp = curl_json("POST", f"{API}/api/users", body)
        if resp.get("user"):
            results.append(
                {
                    "name": name,
                    "phone": phone,
                    "email": email,
                    "password": pwd,
                    "job": job,
                    "status": "created",
                }
            )
        else:
            err = resp.get("error", "unknown")
            if err in ("email_exists", "phone_exists"):
                # reset password for existing account
                users = curl_json("GET", f"{API}/api/users").get("users", [])
                target = next(
                    (
                        u
                        for u in users
                        if u.get("email", "").lower() == email
                        or u.get("phone") == phone
                    ),
                    None,
                )
                if target:
                    patch = curl_json(
                        "PATCH",
                        f"{API}/api/users",
                        {
                            "userId": target["id"],
                            "password": pwd,
                            "accountStatus": "active",
                            "name": name,
                            "phone": phone,
                        },
                    )
                    if patch.get("user"):
                        results.append(
                            {
                                "name": name,
                                "phone": phone,
                                "email": email,
                                "password": pwd,
                                "job": job,
                                "status": "updated_password",
                            }
                        )
                        continue
            results.append(
                {"name": name, "phone": phone, "email": email, "status": "failed", "error": err}
            )

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    headers = ["name", "phone", "email", "password", "job", "status", "error", "reason"]
    lines = [",".join(headers)]
    for r in results:
        lines.append(",".join('"' + str(r.get(h, "")).replace('"', '""') + '"' for h in headers))
    OUT_CSV.write_text("\n".join(lines) + "\n", encoding="utf-8")

    created = sum(1 for r in results if r["status"] == "created")
    updated = sum(1 for r in results if r["status"] == "updated_password")
    failed = sum(1 for r in results if r["status"] == "failed")
    skipped = sum(1 for r in results if r["status"] == "skipped")
    print(f"created={created} updated={updated} failed={failed} skipped={skipped}")
    print("report:", OUT_CSV)
    for r in results:
        if r["status"] == "skipped":
            print("SKIP", r["name"], r.get("reason"), r.get("email", ""), r.get("password", ""))


if __name__ == "__main__":
    main()
