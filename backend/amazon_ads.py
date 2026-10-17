"""Read-only Sponsored Products reporting, scoped to each company."""
import gzip
import json
import os
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from threading import Lock
import requests
from flask import Blueprint, jsonify, request

amazon_ads = Blueprint("amazon_ads", __name__)
_reports = {}
_lock = Lock()

def configuration(company):
    if company not in ("rayom", "shelfesteem"):
        raise ValueError("Choose Rayom or Shelfesteem.")
    prefix = {"rayom":"AMAZON_RAYOM_ADS_","linso":"AMAZON_LINSO_ADS_","shelfesteem":"AMAZON_ADS_"}[company]
    keys = ("CLIENT_ID", "CLIENT_SECRET", "REFRESH_TOKEN", "PROFILE_ID")
    config = {key: os.getenv(prefix + key, "").strip() for key in keys}
    missing = [prefix + key for key in keys if not config[key]]
    return config, missing

def aggregate(rows):
    totals = {key: sum(float(row.get(key) or 0) for row in rows) for key in ("cost", "sales7d", "impressions", "clicks")}
    totals["acos"] = totals["cost"] / totals["sales7d"] * 100 if totals["sales7d"] else None
    totals["tacos"] = None
    return totals

@amazon_ads.get("/api/advertising/amazon")
def summary():
    company = request.args.get("organization", "shelfesteem")
    period = request.args.get("period", "7D")
    try:
        config, missing = configuration(company)
        if missing:
            return jsonify(success=False, configured=False, error="Amazon Ads account is not connected.", missing=missing), 503
        if period not in ("7D", "30D"):
            return jsonify(success=False, error="Choose 7D or 30D for advertising reports."), 400
        today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
        end = today - timedelta(days=1)
        start = end - timedelta(days=int(period[:-1]) - 1)
        key = (company, config["PROFILE_ID"], str(start), str(end))
        # India profiles use the EU Ads API region.
        base = "https://advertising-api-eu.amazon.com"
        with _lock:
            state = _reports.get(key)
            if state and state.get("result") and time.time() - state["created"] < 300:
                return jsonify(state["result"])
            if state and state.get("result"):
                _reports.pop(key, None)
                state = None
            token_response = requests.post("https://api.amazon.com/auth/o2/token", data={
                "grant_type": "refresh_token", "client_id": config["CLIENT_ID"],
                "client_secret": config["CLIENT_SECRET"], "refresh_token": config["REFRESH_TOKEN"],
            }, timeout=20)
            if not token_response.ok:
                return jsonify(success=False, error="Amazon Ads authorization failed. Check this company's Ads credentials."), 502
            headers = {"Authorization": "Bearer " + token_response.json()["access_token"],
                       "Amazon-Advertising-API-ClientId": config["CLIENT_ID"],
                       "Amazon-Advertising-API-Scope": config["PROFILE_ID"]}
            if state is None:
                response = requests.post(base + "/reporting/reports", headers={**headers,
                    "Content-Type": "application/vnd.createasyncreportrequest.v3+json"}, json={
                    "name": "LINSO Sponsored Products daily report", "startDate": str(start), "endDate": str(end),
                    "configuration": {"adProduct": "SPONSORED_PRODUCTS", "groupBy": ["campaign"],
                        "columns": ["date", "campaignId", "campaignName", "impressions", "clicks", "cost", "sales7d"],
                        "reportTypeId": "spCampaigns", "timeUnit": "DAILY", "format": "GZIP_JSON"}}, timeout=30)
                if not response.ok:
                    return jsonify(success=False, error=f"Amazon Ads report request failed ({response.status_code}). Check API access and profile."), 502
                state = {"id": response.json()["reportId"]}
                _reports[key] = state
            response = requests.get(base + "/reporting/reports/" + state["id"], headers=headers, timeout=20)
            if not response.ok:
                return jsonify(success=False, error=f"Amazon Ads report status failed ({response.status_code})."), 502
            report = response.json()
            if report.get("status") == "FAILURE":
                _reports.pop(key, None)
                return jsonify(success=False, error="Amazon could not generate the advertising report. Retry."), 502
            if report.get("status") != "COMPLETED":
                return jsonify(success=True, pending=True, message="Amazon is preparing the advertising report."), 202
            download = requests.get(report["url"], timeout=30)
            download.raise_for_status()
            raw = download.content
            if raw[:2] == b"\x1f\x8b":
                raw = gzip.decompress(raw)
            rows = json.loads(raw)
            result = dict(success=True, organization=company, marketplace="Amazon", source="Amazon Ads",
                          coverage="Sponsored Products", startDate=str(start), endDate=str(end),
                          totals=aggregate(rows), campaigns=rows)
            state.update(result=result, created=time.time())
            return jsonify(result)
    except ValueError as exc:
        return jsonify(success=False, error=str(exc)), 400
    except (requests.RequestException, KeyError, TypeError) as exc:
        return jsonify(success=False, error="Unable to retrieve Amazon Ads data. Check connection and retry."), 502
