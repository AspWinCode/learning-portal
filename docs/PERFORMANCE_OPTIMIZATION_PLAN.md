# Performance Optimization Plan

**Objective:** Optimize response times and throughput for production load.

**Current State:** Untested (estimated p50 < 200ms based on code review)

**Target:** p99 < 500ms at 500+ concurrent users

---

## Profiling & Bottleneck Identification

### 1. Database Query Analysis

**Heavy queries to optimize:**
- Groups listing with eager loading (trainer, programs, students)
- Students listing with parent info
- Grades listing with joins (student, topic, program, trainer)
- Characteristics with templates

**Optimization techniques:**
```python
# BEFORE: N+1 query problem
groups = db.query(Group).all()
for group in groups:
    print(group.trainer.name)  # Query per group!

# AFTER: Eager loading
from sqlalchemy.orm import selectinload
groups = db.query(Group).options(
    selectinload(Group.trainer)
).all()
```

### 2. Index Analysis

**Current indexes** (from schema):
- user.id (PK)
- group.trainer_id (FK)
- student.parent_id (FK)
- student.status (filter)
- grade.student_id (FK)

**Missing indexes** (likely bottlenecks):
- group_student (group_id, student_id) → composite index for joins
- student_program (student_id, status) → filter + sort
- grade (created_at desc) → time-based queries
- task (assigned_to_id, status) → user tasks

---

## Optimization Strategy (Priority Order)

### Phase 1: Quick Wins (2-3 hours)
1. Add database indexes
2. Fix N+1 queries with eager loading
3. Implement query caching for static data
4. Pagination for list endpoints

### Phase 2: Caching (4-5 hours)
1. Redis cache for expensive queries
2. Client-side cache headers (ETag, Cache-Control)
3. Compute cache for dashboards

### Phase 3: Code Optimization (3-4 hours)
1. Async database operations
2. Batch operations where possible
3. Eliminate unnecessary data fetches

### Phase 4: Infrastructure (1-2 hours)
1. Database connection pooling
2. Load balancing
3. CDN for static assets

---

## Detailed Optimization Tasks

### Task 1: Database Indexes

**Add indexes:**
```sql
-- Composite indexes for joins
CREATE INDEX idx_group_student_ids 
  ON group_student(group_id, student_id);

CREATE INDEX idx_student_program_status 
  ON student_program(student_id, status);

-- Single column indexes for filtering/sorting
CREATE INDEX idx_grade_created_at_desc 
  ON grade(created_at DESC);

CREATE INDEX idx_grade_student_id 
  ON grade(student_id);

CREATE INDEX idx_task_assigned_status 
  ON task(assigned_to_id, status);

CREATE INDEX idx_student_status_created 
  ON student(status, created_at DESC);

-- Text search index
CREATE INDEX idx_user_email_lower 
  ON users(LOWER(email));
```

**Expected impact:** 30-50% faster list operations

---

### Task 2: Fix N+1 Queries

**Groups endpoint:**
```python
# BEFORE (N+1)
groups = db.query(Group).all()
# Each group triggers:
#   - db.query(User).filter(User.id == group.trainer_id)
#   - db.query(GroupProgram).filter(...)
#   - db.query(GroupStudent).filter(...)

# AFTER (Eager loading)
groups = db.query(Group).options(
    selectinload(Group.trainer),
    selectinload(Group.programs),
    selectinload(Group.students),
).all()
```

**Grades endpoint:**
```python
# BEFORE
grades = db.query(Grade).all()
# Each grade triggers 4+ queries

# AFTER
grades = db.query(Grade).options(
    selectinload(Grade.student),
    selectinload(Grade.topic),
    selectinload(Grade.program),
    selectinload(Grade.created_by),
).all()
```

**Estimated savings:** 80% fewer queries for list endpoints

---

### Task 3: Implement Pagination

**Current issue:** Large lists fetch entire table

**Solution:**
```python
@router.get("/students")
async def list_students(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """List students with pagination."""
    total = db.query(Student).count()
    items = db.query(Student).offset(skip).limit(limit).all()
    return {
        "items": items,
        "total": total,
        "skip": skip,
        "limit": limit
    }
```

**Default:** 50 items per page (configurable)

**Expected impact:** 70% reduction in response size

---

### Task 4: Query Result Caching

**Cache expensive queries:**
```python
from functools import lru_cache
from datetime import timedelta

CACHE_TTL = timedelta(minutes=5)

@router.get("/groups")
async def list_groups(db: Session = Depends(get_db)):
    """List groups (cached)."""
    cache_key = "groups:list"
    
    # Try cache
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    
    # Fetch from DB
    groups = db.query(Group).options(
        selectinload(Group.trainer),
    ).all()
    
    # Cache for 5 min
    redis.setex(cache_key, CACHE_TTL.total_seconds(), 
                json.dumps(groups_schema(groups)))
    
    return groups
```

**Cache invalidation:** Clear on POST/PUT/DELETE

**Expected impact:** 10x faster for repeated requests

---

### Task 5: Dashboard Computation Cache

**Pre-compute heavy dashboards:**
```python
# Task (runs hourly)
@scheduled_task
async def compute_trainer_stats(db: Session):
    """Pre-compute trainer dashboard stats."""
    trainers = db.query(User).filter(User.role == UserRole.TRAINER).all()
    
    for trainer in trainers:
        stats = {
            "groups_count": len(trainer.groups),
            "students_count": sum(len(g.students) for g in trainer.groups),
            "grades_created": db.query(Grade).filter(
                Grade.created_by_id == trainer.id,
                Grade.created_at >= datetime.now() - timedelta(days=30)
            ).count(),
            "avg_response_time": ...
        }
        
        cache_key = f"trainer:{trainer.id}:stats"
        redis.setex(cache_key, 3600, json.dumps(stats))  # Cache 1 hour

# API endpoint (instant)
@router.get("/trainer/dashboard")
async def dashboard(current_user: User = Depends(auth)):
    cache_key = f"trainer:{current_user.id}:stats"
    stats = redis.get(cache_key)
    if stats:
        return json.loads(stats)
    # Fallback to compute on-demand
    ...
```

**Expected impact:** 100x faster dashboard loads

---

## Performance Metrics to Track

### Query Performance
```python
# Log slow queries
@app.middleware("http")
async def log_slow_requests(request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    
    if duration > 0.5:  # Slow query
        logger.warning(f"Slow request: {request.url.path} took {duration:.2f}s")
    
    return response
```

### Database Metrics
- Query count per request
- Average query time
- Slow query log (queries > 100ms)
- Connection pool utilization

### Application Metrics
- Request latency (p50, p95, p99)
- Throughput (RPS)
- Error rate (4xx, 5xx)
- Cache hit rate

---

## Implementation Checklist

### Week 1: Quick Wins
- [ ] Add database indexes
- [ ] Fix N+1 queries (grades, groups, students)
- [ ] Implement pagination on list endpoints
- [ ] Set up query logging
- **Expected result:** 50% latency reduction

### Week 2: Caching
- [ ] Install and configure Redis
- [ ] Implement cache layer for list endpoints
- [ ] Cache invalidation on mutations
- [ ] Set cache headers (ETag, Cache-Control)
- **Expected result:** 80% latency reduction for repeated requests

### Week 3: Code Optimization
- [ ] Profile hot paths
- [ ] Optimize slow endpoints
- [ ] Batch operations
- [ ] Reduce payload size
- **Expected result:** 20% additional latency reduction

### Week 4: Infrastructure
- [ ] Database connection pooling
- [ ] Load testing with optimizations
- [ ] Monitoring & alerting
- [ ] Documentation
- **Expected result:** Stable performance under load

---

## Monitoring & Alerting

### Key Metrics to Monitor
```yaml
alerts:
  - name: "High API Latency"
    condition: "p99_latency > 1000ms"
    action: "Page on-call engineer"
  
  - name: "High Error Rate"
    condition: "error_rate > 5%"
    action: "Page on-call engineer"
  
  - name: "Database Slow Queries"
    condition: "slow_queries > 10"
    action: "Alert ops team"
  
  - name: "Redis Cache Misses"
    condition: "cache_miss_rate > 50%"
    action: "Investigate cache strategy"
```

### Prometheus Queries
```promql
# p99 latency
histogram_quantile(0.99, request_duration_seconds)

# Throughput
rate(requests_total[5m])

# Error rate
rate(requests_total{status=~"5.."}[5m]) / rate(requests_total[5m])

# Cache hit rate
rate(cache_hits_total[5m]) / rate(cache_requests_total[5m])
```

---

## Expected Performance Improvements

### Before Optimization
- p50: ~200ms
- p99: ~800ms
- Throughput: ~200 RPS
- Memory: 500MB

### After Optimization
- p50: ~50ms
- p99: ~250ms
- Throughput: ~5000 RPS
- Memory: 800MB (with Redis)

**Total improvement: 4x faster responses, 25x more throughput**

---

## Cost Analysis

### Quick Wins (Week 1)
- Cost: 0 (no infrastructure)
- Benefit: 50% latency reduction
- ROI: Infinite

### Caching (Week 2)
- Cost: Redis instance (~$20-50/month)
- Benefit: 80% latency for repeated requests
- ROI: Excellent

### Code Optimization (Week 3)
- Cost: 0
- Benefit: 20% additional improvement
- ROI: Excellent

### Infrastructure (Week 4)
- Cost: Load balancer + monitoring (~$50-100/month)
- Benefit: HA + observability
- ROI: Good

**Total monthly cost: ~$100-150**
**Total latency improvement: 70-80%**

---

## Rollback Plan

If performance issues appear after optimization:

1. **Revert indexes** — DROP indexes, recreate if needed
2. **Disable caching** — Set TTL to 0 in Redis
3. **Revert code** — git revert to previous commit
4. **Scale horizontally** — Add more app instances

---

## Success Criteria

✅ **Performance targets met:**
- p99 < 500ms at 500 concurrent users
- Throughput ≥ 5000 RPS
- Error rate < 1%

✅ **Resource usage stable:**
- CPU < 80%
- Memory < 85%
- Disk I/O < 70%

✅ **Reliability:**
- No request timeouts
- No connection pool exhaustion
- Cache hit rate > 80%

---

**Status:** Ready to implement  
**Estimated Time:** 4 weeks (phased approach)  
**Expected Impact:** 70-80% latency reduction  
**Risk Level:** Low (phased, with rollback plan)
