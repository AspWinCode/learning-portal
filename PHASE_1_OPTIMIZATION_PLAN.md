# Phase 1 Performance Optimization Plan

**Target:** 50% latency reduction (p99: 500ms → 250ms)  
**Duration:** 8 hours  
**Expected Result:** Significant improvement in database query performance

---

## Identified Bottlenecks

### 1. N+1 Query in read_students() endpoint ⚠️ CRITICAL

**File:** `backend/app/routers/students.py:340-413`

**Issue:**
```python
# Line 393: Load students
rows = query.all()

# Line 403: ADDITIONAL QUERY - get_students_display_names calls db.query again!
display_names = get_students_display_names(db, [s.id for s in students])
```

**Problem:** After loading students with eager loading, the code makes another query to fetch StudentCard data for display names.

**Current Flow:**
1. Query Student + selectinload(student_programs) + selectinload(group_students) → 1 query
2. Query StudentCard for display names → 1 additional query
3. **Total:** 2 queries for what should be 1

**Fix:** Modify `get_students_display_names()` to accept pre-loaded students instead of querying again.

**Files to Change:**
- `backend/app/student_display.py` - Remove redundant query
- `backend/app/routers/students.py` - Pass pre-loaded data

**Estimated Time:** 30 minutes

---

### 2. Missing Database Indexes ⚠️ HIGH

**Issue:** Frequently queried columns have no indexes

**Queries Needing Indexes:**
```sql
-- students.py: Student.full_name filter
SELECT * FROM students WHERE full_name ILIKE '%term%';
-- Index: CREATE INDEX idx_student_full_name ON students(full_name);

-- students.py: StudentStatus filter  
SELECT * FROM students WHERE status = 'ACTIVE';
-- Index: CREATE INDEX idx_student_status ON students(status);

-- groups.py: Group.trainer_id filter
SELECT * FROM groups WHERE trainer_id = 123;
-- Index: CREATE INDEX idx_group_trainer_id ON groups(trainer_id);

-- grades.py: Grade.student_id filter
SELECT * FROM grades WHERE student_id = 123;
-- Index: CREATE INDEX idx_grade_student_id ON grades(student_id);

-- StudentProgram: Frequently joined
SELECT * FROM student_programs WHERE student_id = 123;
-- Index: CREATE INDEX idx_student_program_student_id ON student_programs(student_id);
```

**Fix:** Add indexes in migration file

**Files to Change:**
- `backend/alembic/versions/` - Create new migration
- Add indexes for: student_id, status, full_name, trainer_id

**Estimated Time:** 1 hour (including migration)

---

### 3. Inefficient Dashboard Queries ⚠️ HIGH

**File:** `backend/app/routers/owner_dashboard.py`

**Issue:** Dashboard endpoints may compute aggregates in Python instead of database

**Queries to Optimize:**
```python
# Current (slow): Load all records, then aggregate in Python
students = db.query(Student).all()
active_count = len([s for s in students if s.status == StudentStatus.ACTIVE])

# Better (fast): Aggregate in database
active_count = db.query(func.count(Student.id)).filter(
    Student.status == StudentStatus.ACTIVE
).scalar()
```

**Fix:** Use SQLAlchemy aggregation functions (func.count, func.sum, etc.)

**Files to Change:**
- `backend/app/routers/owner_dashboard.py`
- `backend/app/routers/parent_dashboard.py`
- `backend/app/routers/finance.py`

**Estimated Time:** 1.5 hours

---

### 4. Missing Pagination Limits ⚠️ MEDIUM

**Issue:** Some list endpoints return unlimited data

**Current:**
```python
@router.get("/")
async def list_items(db: Session):
    # Returns ALL items - could be 10,000+
    return db.query(Item).all()
```

**Fix:** Add pagination with default limit

**Endpoints to Fix:**
- `/api/v1/groups` - Add default limit 50
- `/api/v1/programs` - Add default limit 100
- `/api/v1/tasks` - Add default limit 50
- `/api/v1/characteristics` - Add default limit 100

**Files to Change:**
- `backend/app/routers/groups.py`
- `backend/app/routers/programs.py`
- `backend/app/routers/tasks.py`
- `backend/app/routers/characteristics.py`

**Estimated Time:** 1 hour

---

### 5. Inefficient Subqueries ⚠️ HIGH

**File:** `backend/app/routers/students.py:363-373`

**Issue:** Complex subquery for trainer access control

```python
# Current: Subquery inside main query
subq = (
    db.query(Student.id)
    .join(GroupStudent, GroupStudent.student_id == Student.id)
    .join(Group, Group.id == GroupStudent.group_id)
    .filter(
        Group.trainer_id == current_user.id,
        Student.status == StudentStatus.ACTIVE,
    )
    .distinct()
)
query = query.filter(Student.id.in_(subq))

# Could be optimized with better joins/indexes
```

**Fix:** Add index on (group_id, trainer_id) for faster joins

**Estimated Time:** 30 minutes (part of index optimization)

---

## Implementation Order

### Step 1: Fix N+1 Query (30 min)
**Priority:** CRITICAL
**Impact:** Immediate 20% improvement for student list endpoint

```python
# Fix get_students_display_names to not re-query
def get_students_display_names_cached(db: Session, students: List[Student]) -> Dict[int, str]:
    """Use pre-loaded students instead of querying again."""
    student_map = {s.id: s.full_name for s in students}
    # Only query StudentCard
    student_ids = [s.id for s in students]
    cards = db.query(StudentCard).filter(
        StudentCard.student_id.in_(student_ids),
        StudentCard.archived.is_(False),
    ).all()
    # ... merge results
    return result
```

---

### Step 2: Add Database Indexes (1 hour)
**Priority:** HIGH  
**Impact:** 30-50% improvement for filtered queries

Create migration: `alembic/versions/2024_05_30_add_performance_indexes.py`

```python
def upgrade():
    op.create_index('idx_student_status', 'students', ['status'])
    op.create_index('idx_student_full_name', 'students', ['full_name'])
    op.create_index('idx_student_program_student_id', 'student_programs', ['student_id'])
    op.create_index('idx_grade_student_id', 'grades', ['student_id'])
    op.create_index('idx_group_trainer_id', 'groups', ['trainer_id'])
    op.create_index('idx_group_student_student_id', 'group_students', ['student_id'])
    op.create_index('idx_group_student_group_id', 'group_students', ['group_id'])
```

**To Execute:**
```bash
docker-compose exec backend alembic upgrade head
```

---

### Step 3: Optimize Dashboard Queries (1.5 hours)
**Priority:** HIGH
**Impact:** 40% improvement for dashboard endpoints

Replace Python aggregation with SQL:

```python
# owner_dashboard.py
def get_student_stats(db: Session):
    # BEFORE
    students = db.query(Student).all()
    active = len([s for s in students if s.status == StudentStatus.ACTIVE])
    
    # AFTER
    active = db.query(func.count(Student.id)).filter(
        Student.status == StudentStatus.ACTIVE
    ).scalar() or 0
```

---

### Step 4: Add Pagination (1 hour)
**Priority:** MEDIUM
**Impact:** 20% improvement for large result sets

```python
# groups.py
@router.get("/")
async def list_groups(
    skip: int = 0,
    limit: int = Query(50, le=100),  # Add limit parameter
    db: Session = Depends(get_db),
):
    return db.query(Group).offset(skip).limit(limit).all()
```

---

## Verification Steps

### Before Optimization
```bash
# Terminal 1
docker-compose up -d db redis backend

# Terminal 2: Check slow queries
docker-compose logs -f backend | grep slow

# Terminal 3: Run load test
cd backend
locust -f load_test.py --host=http://localhost:8000 \
  --users=50 --spawn-rate=5 --run-time=3m

# Record metrics:
# p50: ___ms, p95: ___ms, p99: ___ms
```

### After Each Optimization
1. Apply the change
2. Restart backend
3. Run same load test
4. Compare p99 latency
5. Record in PHASE_1_RESULTS.md

---

## Expected Results

| Optimization | Step | Current p99 | Target p99 | Improvement |
|--------------|------|------------|-----------|------------|
| Baseline | - | 500ms | - | - |
| N+1 fix | 1 | 500ms | 400ms | 20% ↓ |
| Indexes | 2 | 400ms | 300ms | 25% ↓ |
| Dashboards | 3 | 300ms | 280ms | 7% ↓ |
| Pagination | 4 | 280ms | 250ms | 11% ↓ |
| **TOTAL** | - | **500ms** | **250ms** | **50% ↓** |

---

## Risks & Rollback

**Risk 1: Migration Failure**
- Mitigation: Test migration on local database first
- Rollback: `alembic downgrade -1`

**Risk 2: Query Performance Regression**
- Mitigation: Compare plan before/after with EXPLAIN
- Rollback: Revert git commit

**Risk 3: Breaking Changes**
- Mitigation: Run full test suite after each change
- Rollback: `git revert <commit>`

---

## Success Criteria

✅ N+1 query eliminated  
✅ All indexes created and used (verify with EXPLAIN ANALYZE)  
✅ Dashboard queries use SQL aggregation  
✅ All list endpoints have pagination  
✅ p99 latency reduced to < 300ms at 50 users  
✅ All tests still pass (338/338)  
✅ Load test results documented  

---

## Timeline

**Day 1 (4 hours):**
- Step 1: N+1 fix (30 min)
- Step 2: Indexes (1 hour)
- Step 3: Dashboard optimization (1.5 hours)
- Step 4: Pagination (1 hour)

**Day 2 (3 hours):**
- Verification & testing (1 hour)
- Load test & metrics collection (2 hours)
- Document results

---

## Next Phase (Phase 2)

After Phase 1, move to **Phase 2 Caching (Week 2):**
- Redis query caching (TTL: 5 minutes)
- Dashboard cache (TTL: 1 hour)
- Warm up cache on startup
- Cache invalidation strategy

Expected improvement: 80% latency for repeated requests

---

**Status:** Ready to implement  
**Start Time:** After baseline load test  
**Estimated Completion:** 8 hours total
