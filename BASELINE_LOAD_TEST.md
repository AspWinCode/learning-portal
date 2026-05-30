# Baseline Load Test Procedure

## Overview

This procedure runs a baseline load test on the Learning Portal API to establish performance metrics before optimization.

**Target:**
- 100 concurrent users
- 5 minute duration
- Spawn rate: 10 users/second
- Metric collection: p50, p95, p99 latency, error rate

---

## Prerequisites

```bash
# Install Locust
pip install locust

# Ensure backend is running
docker-compose up -d db redis backend
# OR
cd backend && python -m uvicorn app.main:app --reload
```

---

## Step 1: Start Monitoring (Optional)

```bash
# Terminal 1: Start monitoring stack
docker-compose --profile observability up -d prometheus grafana alertmanager

# Verify Prometheus is collecting metrics
# Visit: http://localhost:9090/targets
```

---

## Step 2: Run Baseline Load Test

```bash
# Terminal 2: Run load test
cd backend

# Option A: Web UI (interactive)
locust -f load_test.py --host=http://localhost:8000

# Then visit: http://localhost:8089
# - Set "Number of users": 100
# - Set "Spawn rate": 10
# - Click "Start swarming"

# Option B: CLI (non-interactive)
locust -f load_test.py \
  --host=http://localhost:8000 \
  --users=100 \
  --spawn-rate=10 \
  --run-time=5m \
  --headless \
  --csv=load_test_results
```

---

## Step 3: Monitor During Test

```bash
# Terminal 3: Watch Grafana dashboard
# Visit: http://localhost:3001
# Login: admin / admin (or your password)

# Key metrics to watch:
# - Request rate (RPS)
# - p50/p95/p99 latency
# - Error rate
# - Database connections

# Terminal 4: Watch Prometheus
# Visit: http://localhost:9090
# Query examples:
# - rate(request_duration_seconds_sum[1m]) / rate(request_duration_seconds_count[1m])
# - histogram_quantile(0.99, rate(request_duration_seconds_bucket[1m]))
# - rate(errors_total[1m])
```

---

## Step 4: Analyze Results

### From Locust Output

When test completes, you'll see:

```
Type     Name                          # reqs      # fails  Median  90%     95%     99%
GET      /api/v1/groups                 500        0       25      45      52      78
POST     /api/v1/grades                 250        5       78      145     189     234
GET      /api/v1/students               400        0       12      28      35      45
...
Total    -                             8450        8       28      48      62      85ms
```

**Key Metrics:**
- **Median**: 50th percentile (p50) latency
- **90%**: 90th percentile (p90) latency
- **95%**: 95th percentile (p95) latency
- **99%**: 99th percentile (p99) latency
- **# fails**: Number of failed requests
- **Error rate**: % of requests that failed

### Expected Targets (Before Optimization)

| Metric | Target | Status |
|--------|--------|--------|
| p50 latency | < 100ms | ⏳ TBD |
| p95 latency | < 300ms | ⏳ TBD |
| p99 latency | < 500ms | ⏳ TBD |
| Error rate | < 1% | ⏳ TBD |
| RPS capacity | 100+ at 100 users | ⏳ TBD |

### From Prometheus

```bash
# Download results
curl 'http://localhost:9090/api/v1/query?query=histogram_quantile(0.99,rate(request_duration_seconds_bucket[5m]))' | jq
```

Generate HTML report:

```bash
# Option 1: Manual Grafana screenshot
# - Visit Grafana dashboard
# - Set time range to test duration
# - Take screenshot
# - Export as PDF

# Option 2: Export Prometheus data
curl 'http://localhost:9090/api/v1/query_range?query=rate(requests_total[1m])&start=START&end=END&step=30s' > metrics.json
```

---

## Step 5: Document Results

Create `BASELINE_LOAD_TEST_RESULTS.md`:

```markdown
# Baseline Load Test Results

**Date:** 2026-05-30
**Duration:** 5 minutes
**Users:** 100 (spawn rate 10/sec)

## Latency Metrics

| Percentile | Latency | Status |
|------------|---------|--------|
| p50 | XXXms | ✅ / ⚠️ / ❌ |
| p95 | XXXms | ✅ / ⚠️ / ❌ |
| p99 | XXXms | ✅ / ⚠️ / ❌ |

## Request Distribution

| Endpoint | Count | Errors | p99 |
|----------|-------|--------|-----|
| GET /api/v1/groups | 500 | 0 | 85ms |
| POST /api/v1/grades | 250 | 2 | 150ms |
| ... | ... | ... | ... |

## Errors

- Error rate: 0.1%
- Most common error: [describe]
- Pattern: [e.g., timeouts under high load]

## Bottlenecks

- Database connection pool: [description]
- Slow endpoints: [list]
- Memory usage: [peak usage]

## Recommendations

1. [Priority 1 optimization]
2. [Priority 2 optimization]
3. [Priority 3 optimization]
```

---

## Step 6: Interpret Results

### Green (Good Performance) ✅
- p99 < 500ms
- Error rate < 1%
- No timeouts
- Stable under sustained load
- **Action:** Proceed with Phase 1 optimization

### Yellow (Acceptable Performance) ⚠️
- p99: 500-1000ms
- Error rate: 1-3%
- Occasional timeouts
- Degrades slightly at end of test
- **Action:** Implement Phase 1 optimizations, then retest

### Red (Poor Performance) ❌
- p99 > 1000ms
- Error rate > 3%
- Frequent timeouts
- Response times increasing over time
- **Action:** Debug specific endpoints, increase resources, run Phase 1 optimizations

---

## Common Issues

### "Connection refused" errors
- Ensure backend is running: `docker-compose logs backend`
- Check port 8000: `curl http://localhost:8000/api/v1/auth/guest`

### High latency for specific endpoints
- Check database query performance: `docker-compose logs backend | grep slow`
- Review application logs for errors
- Check database connection pool size

### "Too many connections" database errors
- Increase PostgreSQL connection limit
- Reduce number of concurrent users
- Enable connection pooling (pgBouncer)

### Memory usage increasing over time
- Check for memory leaks: `docker stats backend`
- Look for unbounded caches
- Review logging levels

---

## Performance Optimization Roadmap

**After baseline test, implement in order:**

### Phase 1 (Week 1): Quick Wins
1. Database indexes on frequently queried columns
2. Fix N+1 queries with eager loading
3. Implement pagination for list endpoints
4. Add query caching with Redis

**Expected improvement:** 50% latency reduction

### Phase 2 (Week 2): Advanced Caching
1. Cache dashboard data (5m TTL)
2. Cache user role/permissions (1h TTL)
3. Cache group membership (30m TTL)
4. Cache invalidation strategy

**Expected improvement:** 80% latency for repeated requests

### Phase 3 (Week 3): Code Optimization
1. Profile hot paths
2. Reduce payload sizes
3. Batch operations
4. Async I/O optimization

**Expected improvement:** 20% additional improvement

---

## Cleanup

```bash
# Stop all containers
docker-compose down

# Remove volumes
docker volume prune

# Remove test data
rm -f load_test_results*
```

---

## Success Criteria

✅ **Baseline established**: Test completed without crashes
✅ **Metrics collected**: p50/p95/p99 latency documented
✅ **Bottlenecks identified**: Know what to optimize
✅ **Results documented**: BASELINE_LOAD_TEST_RESULTS.md created

---

**Estimated time:** 1-2 hours (including analysis)
**Next step:** Phase 1 performance optimizations
