# Load Testing Plan for Learning Portal

**Objective:** Verify system can handle production load without performance degradation.

**Target:** 1000+ concurrent users, 5000+ requests/minute

---

## Test Scenarios

### 1. Baseline Test (100 users, 5 min)
- **Users:** 100 concurrent
- **Spawn rate:** 10 users/sec
- **Duration:** 5 minutes
- **Expected:** All requests < 500ms p99

### 2. Ramp-up Test (500 users, 10 min)
- **Users:** 500 concurrent
- **Spawn rate:** 20 users/sec
- **Duration:** 10 minutes
- **Expected:** Graceful degradation, no 5xx errors

### 3. Stress Test (1000+ users until failure)
- **Users:** Start at 1000, increase by 200 every 2 min
- **Duration:** Until system breaks
- **Expected:** Identify breaking point

### 4. Soak Test (200 users, 2 hours)
- **Users:** 200 concurrent
- **Duration:** 2 hours
- **Expected:** No memory leaks, stable p50/p99

---

## User Roles & Workflows

### Trainer (50% of traffic)
- Login
- List groups (5x)
- List students (3x)
- Create group (2x)
- Add student to group (2x)
- Create grade (2x)
- List grades (1x)
- Dashboard (1x)

### Admin (20% of traffic)
- Login
- List all groups (3x)
- Analytics dashboard (2x)
- List users (1x)

### Parent (20% of traffic)
- Login
- Check child progress (4x)
- List grades (2x)
- Check messages (1x)

### Guest (10% of traffic)
- Public endpoints
- Health checks

---

## Metrics to Measure

### Response Time
- p50 (median)
- p95 (95th percentile)
- p99 (99th percentile)
- Max response time
- Target: p99 < 500ms for all endpoints

### Throughput
- Requests/sec
- Requests/minute
- Target: 5000+ RPS sustained

### Error Rate
- HTTP 4xx (bad requests)
- HTTP 5xx (server errors)
- Network errors
- Target: < 1% 5xx errors

### System Resources
- CPU usage
- Memory usage
- Database connections
- Disk I/O

### Specific Endpoints
Track separately:
- `/api/v1/auth/login` — Should be fast
- `/api/v1/grades` — POST (grade creation)
- `/api/v1/groups/{id}/students/{id}` — Add student
- `/api/v1/groups` — List groups
- `/api/v1/students` — List students

---

## Prerequisites

### 1. Setup Test Database
```bash
# Create fresh database for load test
docker exec learning-portal-postgres psql -U postgres -c "DROP DATABASE IF EXISTS test_load;"
docker exec learning-portal-postgres psql -U postgres -c "CREATE DATABASE test_load;"
```

### 2. Seed Test Data
```bash
# Create 100 trainers, 1000 students, 50 groups, 200 programs
python -m pytest tests/load_test_fixtures.py -v
```

### 3. Verify Server is Running
```bash
curl http://localhost:8000/health
```

---

## Running Tests

### Option 1: CLI Mode (Non-interactive)
```bash
locust -f load_test.py \
  --host=http://localhost:8000 \
  --users=100 \
  --spawn-rate=10 \
  --run-time=5m \
  --csv=results/baseline
```

### Option 2: Web UI (Interactive)
```bash
locust -f load_test.py --host=http://localhost:8000
# Open http://localhost:8089
# Configure users, spawn rate, duration
# Monitor real-time stats
```

### Option 3: Headless with Report
```bash
locust -f load_test.py \
  --host=http://localhost:8000 \
  --users=500 \
  --spawn-rate=20 \
  --run-time=10m \
  --headless \
  --csv=results/ramp-up \
  --html=results/ramp-up.html
```

---

## Expected Results

### Baseline (100 users, 5 min)
- Requests: ~3000
- p50: < 100ms
- p99: < 300ms
- 5xx errors: 0%
- Throughput: 10+ RPS

### Ramp-up (500 users, 10 min)
- Requests: ~30000
- p50: 100-200ms
- p99: 300-500ms
- 5xx errors: < 0.5%
- Throughput: 50+ RPS

### Stress Test (1000+ users)
- Breaking point: > 1000 RPS
- Graceful degradation: Response times increase but no crashes
- No resource exhaustion: CPU < 90%, Memory < 85%

### Soak Test (200 users, 2 hours)
- Stable metrics throughout
- No memory leaks: Memory consistent
- No connection pools exhausted

---

## Failure Criteria

❌ **FAIL** if:
- p99 > 1000ms
- 5xx error rate > 5%
- System crashes under 500 concurrent users
- Memory/CPU max out before 500 users
- Database connections exhausted

✅ **PASS** if:
- p99 < 500ms at 500 users
- 5xx error rate < 1%
- Graceful degradation up to 1000 users
- Resources stable at 200 users for 2 hours

---

## Analysis & Optimization

After each test, analyze:

1. **Slow Endpoints** — Which took longest?
   - Grade creation slower than expected?
   - Group listing needs pagination?

2. **Resource Bottlenecks**
   - CPU bound? (optimize code)
   - I/O bound? (optimize queries)
   - Memory bound? (reduce objects)

3. **Database Issues**
   - Connection pool exhausted?
   - Slow queries?
   - N+1 problems?

4. **Network Issues**
   - Packet loss?
   - Latency spikes?

---

## Optimization Priorities

Based on results:

1. **Critical** (p99 > 1000ms)
   - Optimize database queries
   - Add caching (Redis)
   - Reduce payload size

2. **High** (p99 > 500ms)
   - Add indexes to database
   - Implement pagination
   - Connection pooling

3. **Medium** (p99 > 300ms)
   - Code profiling
   - Async improvements
   - Frontend optimization

---

## Reporting

Create report with:
- Summary stats (RPS, p50/p95/p99)
- Time series graphs
- Endpoint performance breakdown
- Error analysis
- Resource utilization
- Recommendations

Example: `results/load_test_report_2026-05-30.html`

---

## Next Steps

1. Run baseline test (TODAY)
2. Analyze results and identify bottlenecks
3. Optimize critical paths
4. Run ramp-up test
5. Identify breaking point with stress test
6. Implement optimizations
7. Re-test to confirm improvements
8. Production deployment with confidence

---

**Status:** Ready to run  
**Test Environment:** Docker Compose local  
**Baseline Target:** 100 users, p99 < 300ms
