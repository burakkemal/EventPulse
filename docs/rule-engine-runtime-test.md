# Rule Engine Runtime Verification --- EventPulse Case Study

**Date:** 2026-02-20

## Purpose

This document explains how reviewers can quickly verify that the Rule
Engine, threshold evaluation, and anomaly notification pipeline are
working end‑to‑end.

The goal is to provide a reproducible, reviewer‑friendly validation
process.

------------------------------------------------------------------------

## Step 1 --- Create Fast Test Rule

Example rule payload:

``` json
{
  "name": "FAST TEST ERROR RULE",
  "severity": "critical",
  "window_seconds": 5,
  "cooldown_seconds": 0,
  "condition": {
    "type": "threshold",
    "metric": "count",
    "filters": {
      "event_type": "error",
      "source": "payment_service"
    },
    "operator": ">",
    "value": 1
  }
}
```

This rule triggers quickly to simplify testing.

------------------------------------------------------------------------

## Step 2 --- Send Test Events (PowerShell)

``` powershell
1..20 | ForEach-Object {
  $body = @{
      event_type = "error"
      source = "payment_service"
      timestamp = (Get-Date).ToUniversalTime().ToString("o")
      payload = @{
          message = "FAST TEST"
          severity = "critical"
      }
  } | ConvertTo-Json -Depth 5

  Invoke-RestMethod `
    -Uri "http://localhost:3000/api/v1/events" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body | Out-Null
}

Write-Host "20 test events sent."
```

------------------------------------------------------------------------

## Step 3 --- Observe Worker Logs

Run:

``` bash
docker-compose logs -f worker
```

Expected log examples:

-   "Anomaly detected"
-   "Threshold rule triggered"
-   "Publishing anomaly notification"

Example:

> Threshold rule "FAST TEST ERROR RULE" triggered: count(13) \> 1

This confirms:

-   Event ingestion pipeline works
-   Rule evaluation runs in runtime worker
-   Notification publishing occurs

------------------------------------------------------------------------

## Step 4 --- Statistical Anomaly Detection (Expected Behavior)

You may see:

> StatEval: skipped --- baseline not ready

This is expected until sufficient baseline buckets accumulate.

------------------------------------------------------------------------

## Reviewer Notes

This test intentionally uses a small window and threshold to allow
validation within seconds during review.

No production configuration changes are required.

------------------------------------------------------------------------

## Conclusion

If anomalies appear in worker logs and notifications are published, the
Rule Engine runtime integration is functioning correctly.
