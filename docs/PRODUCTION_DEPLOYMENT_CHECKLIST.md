# Production Deployment Checklist

**Current Status:** 85% ready  
**Timeline:** Ready to deploy in 1-2 weeks  

---

## 🔴 CRITICAL (Must do before any deployment)

### 1. Fix Rate Limiting (1 hour) ⚠️ BLOCKING
- [ ] Install slowapi: `pip install slowapi`
- [ ] Add to requirements.txt
- [ ] Implement rate limiting on `/api/v1/auth/login`
- [ ] Configure: 5 attempts per minute per IP
- [ ] Test: Verify 429 response after 5 attempts
- [ ] File: `backend/app/middleware/rate_limiting.py`

**Code needed:**
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@router.post("/auth/login")
@limiter.limit("5/minute")
async def login(credentials: LoginRequest, ...):
    ...
```

**Estimated time:** 1 hour  
**Blocker:** YES - without this, app is vulnerable to brute force  

---

### 2. Verify Security Configs (1 hour)
- [ ] Check `.env.example` for all required vars
- [ ] Verify `FASTAPI_DEBUG=false` in production
- [ ] Verify `CORS_ORIGINS` doesn't include `*`
- [ ] Add security headers middleware
- [ ] Check HTTPS enforcement

**Security Headers to add:**
```python
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000"
    return response
```

**Estimated time:** 30 minutes

---

## 🟡 HIGH PRIORITY (Do before staging)

### 3. Deploy Monitoring Stack (2-3 hours)
- [ ] Update docker-compose.yml with Prometheus
- [ ] Update docker-compose.yml with Grafana
- [ ] Update docker-compose.yml with Alertmanager
- [ ] Test: `docker-compose up monitoring`
- [ ] Verify Prometheus scraping `/metrics`
- [ ] Import Grafana dashboards
- [ ] Configure Slack webhook
- [ ] Test: Trigger test alert

**Estimated time:** 2-3 hours

---

### 4. Run Baseline Load Test (2-3 hours)
- [ ] Start local server
- [ ] Run: `locust -f load_test.py --host=http://localhost:8000 --users=100 --spawn-rate=10 --run-time=5m`
- [ ] Collect metrics (p50/p95/p99)
- [ ] Generate report
- [ ] Compare with targets (p99 should be < 500ms)

**Estimated time:** 2-3 hours

---

### 5. Phase 1 Performance Optimizations (8 hours)
- [ ] Add database indexes (2 hours)
- [ ] Fix N+1 queries with eager loading (2 hours)
- [ ] Implement pagination (1 hour)
- [ ] Add query caching (2 hours)
- [ ] Re-run load test

**Estimated time:** 8 hours

---

## 🟢 MEDIUM PRIORITY (Do during staging)

### 6. Staging Deployment (2-3 hours)
- [ ] Create staging environment in docker-compose
- [ ] Deploy code to staging
- [ ] Run smoke tests:
  - [ ] User login
  - [ ] Create group
  - [ ] Add student to group
  - [ ] Create grade
  - [ ] Parent login & view grades
- [ ] Monitor metrics for 1 hour
- [ ] Verify all Slack alerts working

**Estimated time:** 2-3 hours

---

### 7. Comprehensive Testing (4-5 hours)
- [ ] Run all 338 tests: `pytest backend/tests/ -v`
- [ ] Run ramp-up load test (500 users, 10 min)
- [ ] Monitor: p99 latency, error rate, DB connections
- [ ] Check Grafana dashboards updating
- [ ] Verify alerts triggering

**Estimated time:** 4-5 hours

---

### 8. Security Verification (2-3 hours)
- [ ] Manual RBAC testing:
  - [ ] Trainer can only grade own students
  - [ ] Parent can only see own child
  - [ ] Guest cannot access protected endpoints
- [ ] SQL injection test
- [ ] CORS test from different domain
- [ ] Rate limiting test

**Estimated time:** 2-3 hours

---

## 🔵 LOW PRIORITY (Before production)

### 9. Documentation (1-2 hours)
- [ ] Create runbook for alerts
- [ ] Document monitoring dashboards
- [ ] Create incident response plan
- [ ] Document scaling procedures

**Estimated time:** 1-2 hours

---

### 10. Phase 2 Optimizations (4-5 hours) - OPTIONAL
- [ ] Setup Redis caching
- [ ] Implement query caching
- [ ] Cache invalidation strategy
- [ ] Re-run stress test

**Estimated time:** 4-5 hours (optional)

---

## 📋 Production Deployment (Final Stage)

### Prerequisites Check
- [ ] All critical items done
- [ ] All high priority items done  
- [ ] 99%+ test pass rate
- [ ] p99 latency < 500ms on 500 users
- [ ] Error rate < 1%
- [ ] Monitoring stack working
- [ ] All alerts configured

### Deployment Steps
1. [ ] Create production environment
2. [ ] Deploy code
3. [ ] Run migrations: `alembic upgrade head`
4. [ ] Smoke test critical paths
5. [ ] Monitor metrics for 24h
6. [ ] Enable auto-scaling if needed
7. [ ] Announce to users

**Estimated time:** 4-5 hours

---

## 🗓️ Timeline Estimate

| Task | Duration | Blocker | Start |
|------|----------|---------|-------|
| Fix rate limiting | 1h | YES | Today |
| Verify security | 1h | YES | Today |
| Deploy monitoring | 2-3h | - | Tomorrow |
| Load test baseline | 2-3h | - | Tomorrow |
| Phase 1 perf opt | 8h | - | This week |
| Staging deploy | 2-3h | - | This week |
| Comprehensive test | 4-5h | - | This week |
| Security verify | 2-3h | - | Next week |
| Production deploy | 4-5h | - | Next week |
| **TOTAL** | **~30h** | - | - |

---

## 🎯 Path to Production

### TODAY (CRITICAL - 2 hours)
- [ ] Fix rate limiting ⚠️
- [ ] Verify security configs
- **Unlock:** Can deploy to staging

### THIS WEEK (8-10 hours)
- [ ] Deploy monitoring stack
- [ ] Run baseline load test
- [ ] Phase 1 performance optimizations
- [ ] Staging deployment
- [ ] Comprehensive testing
- **Unlock:** Can do production deployment

### NEXT WEEK (6-8 hours)
- [ ] Security verification
- [ ] Phase 2 optimizations (optional)
- [ ] Production deployment
- [ ] Monitoring & incident response
- **Result:** LIVE 🚀

---

## 🚨 Stop Points (Don't pass without success)

1. **After Rate Limiting Fix**
   - [ ] 5 login attempts fail
   - [ ] 6th attempt gets 429 status

2. **After Load Test Baseline**
   - [ ] p99 latency < 500ms at 100 users
   - [ ] Error rate < 1%
   - [ ] No timeout errors

3. **After Staging Deploy**
   - [ ] All smoke tests pass
   - [ ] Monitoring metrics flowing
   - [ ] Slack alerts working

4. **After Comprehensive Test**
   - [ ] 99%+ tests passing
   - [ ] p99 < 500ms at 500 users
   - [ ] Load test passed
   - [ ] No memory leaks (24h soak test)

---

## 📞 Critical Contacts

- **On-call:** [To be assigned]
- **Slack:** #monitoring, #alerts-critical
- **Incident Response:** See incident_response_plan.md
- **Rollback Plan:** See rollback_plan.md

---

## ✅ Final Sign-Off

- [ ] Product owner: approved for staging
- [ ] Tech lead: approved for production
- [ ] Security: approved (8.5/10 audit)
- [ ] Operations: monitoring ready

---

## 📊 Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Test pass rate | 99% | 99.11% | ✅ |
| API p99 latency | < 500ms | TBD | ⏳ |
| Error rate | < 1% | TBD | ⏳ |
| Security rating | 8/10 | 8.5/10 | ✅ |
| Monitoring ready | Yes | Yes | ✅ |
| Rate limiting | Implemented | ⏳ | ⏳ |

---

**Current Status:** Ready to start critical items  
**Next Step:** Fix rate limiting (1 hour)  
**Estimated Ready for Production:** 2026-06-06 (1 week)

---

**DO NOT DEPLOY TO PRODUCTION WITHOUT:**
1. ✅ All critical items complete
2. ✅ 99%+ test pass rate
3. ✅ Load test successful
4. ✅ Monitoring stack working
5. ✅ Security audit passing
