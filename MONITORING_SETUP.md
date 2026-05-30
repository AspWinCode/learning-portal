# Monitoring Stack Setup Guide

## Overview

The Learning Portal includes a complete monitoring stack with Prometheus, Grafana, and Alertmanager.

**Components:**
- **Prometheus** (port 9090): Metrics collection and alerting rules
- **Grafana** (port 3001): Dashboards and visualization
- **Alertmanager** (port 9093): Alert routing to Slack

---

## Quick Start

### 1. Start the Monitoring Stack

```bash
# Create required volumes
docker volume create learning-portal_db_data

# Start all services including monitoring
docker-compose --profile observability up -d

# Verify services are running
docker-compose ps
```

### 2. Access Interfaces

- **Prometheus:** http://localhost:9090
- **Grafana:** http://localhost:3001
- **Alertmanager:** http://localhost:9093

### 3. Configure Slack Webhook (Optional)

To enable Slack alerts:

```bash
# Get webhook from: https://api.slack.com/messaging/webhooks

# Update .env or docker-compose environment
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Restart alertmanager
docker-compose up -d alertmanager
```

---

## Configuration Files

All monitoring configuration is in `deploy/observability/`:

```
deploy/observability/
├── prometheus.yml          # Prometheus config + alert rules
├── alerts.yml             # Alert definitions
├── alertmanager.yml       # Alert routing to Slack
└── grafana/
    ├── provisioning/
    │   ├── datasources/   # Prometheus datasource config
    │   └── dashboards/    # Grafana dashboards
```

---

## Key Metrics

Prometheus scrapes metrics from:
- **Backend API** (port 8000): /metrics endpoint
- **Database** (port 5432): PostgreSQL metrics (optional)

**Available metrics:**
- `request_duration_seconds` - HTTP request latency
- `errors_total` - Error counts by endpoint
- `db_query_duration_seconds` - Database query latency
- `db_connections_active` - Active database connections
- `cache_hits_total` / `cache_misses_total` - Cache statistics
- `failed_logins_total` - Failed login attempts

---

## Alert Rules

Alerts are defined in `deploy/observability/alerts.yml`:

| Alert | Severity | Condition |
|-------|----------|-----------|
| HighAPILatency | CRITICAL | p99 > 1.0s for 5m |
| HighErrorRate | CRITICAL | >5% errors for 2m |
| SlowDatabaseQueries | WARNING | p95 > 0.5s for 5m |
| HighDatabaseConnections | WARNING | >80 active for 5m |
| DatabaseDown | CRITICAL | postgres unreachable |
| SuspiciousLoginActivity | WARNING | High failed login rate |
| RateLimitHits | INFO | >10% requests rate limited |
| ServiceDown | CRITICAL | Backend unreachable |

---

## Slack Integration

Alerts route to Slack channels by severity:
- **#alerts-critical:** CRITICAL severity alerts (1h repeat)
- **#alerts-warnings:** WARNING severity alerts (4h repeat)
- **#alerts-info:** INFO severity alerts (24h repeat)
- **#monitoring:** Default alerts and resolved notifications

---

## Grafana Dashboards

### Overview Dashboard
- Request rate (RPS)
- p50/p95/p99 latency
- Error rate
- Active database connections

Shows real-time performance of the Learning Portal API.

---

## Troubleshooting

### Prometheus not collecting metrics

```bash
# Check backend metrics endpoint
curl http://localhost:8000/metrics

# Verify Prometheus targets
# Visit: http://localhost:9090/targets
```

### Grafana datasource not working

```bash
# Check Prometheus is accessible from Grafana container
docker-compose exec grafana curl http://prometheus:9090/-/healthy
```

### Alertmanager not sending to Slack

```bash
# Verify webhook URL in docker-compose
docker-compose logs alertmanager

# Test webhook with curl
curl -X POST -H 'Content-Type: application/json' \
  -d '{"text":"Test alert"}' \
  YOUR_SLACK_WEBHOOK_URL
```

---

## Performance Testing

Run load tests while monitoring:

```bash
# Terminal 1: Start monitoring
docker-compose --profile observability up -d

# Terminal 2: Start backend
docker-compose up -d backend db redis

# Terminal 3: Run load test
cd backend
python -m pytest tests/load/ -v

# Terminal 4: Watch Grafana
# Visit http://localhost:3001
```

---

## Cleanup

```bash
# Stop monitoring stack
docker-compose down

# Remove volumes (careful!)
docker volume rm learning-portal_db_data
docker volume rm learning-portal_grafana_data
```

---

## Production Notes

**Before deploying to production:**

1. **Set Slack webhook** in environment variables
2. **Configure alert thresholds** based on actual performance
3. **Set Grafana admin password** (don't use default)
4. **Enable persistent storage** for Prometheus data
5. **Add authentication** to Prometheus and Alertmanager (reverse proxy)
6. **Review alert rules** for false positives
7. **Setup Slack channels** #alerts-critical, #alerts-warnings, #alerts-info

---

## Next Steps

1. ✅ Start monitoring stack (docker-compose --profile observability up)
2. ✅ Verify Prometheus scraping metrics (http://localhost:9090/targets)
3. ✅ Configure Slack webhook for alerts
4. ✅ Review Grafana dashboard (http://localhost:3001)
5. Run baseline load test with monitoring enabled
6. Configure alert rules thresholds based on actual performance

---

**Estimated time to full production monitoring:** 2-3 hours
