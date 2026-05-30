# Security Audit Plan for Learning Portal

**Objective:** Identify and fix security vulnerabilities before production.

**Focus Areas:** OWASP Top 10, API security, Authentication, Authorization, Data protection

---

## OWASP Top 10 Checklist

### 1. Broken Access Control
#### Check List:
- [x] RBAC enforcement in all endpoints
  - Status: ✅ VERIFIED in P1 tests
  - Implementation: `require_permission()` decorator on all protected endpoints
  - 6 roles: Owner, Admin, Trainer, Parent, Sales, Guest

- [ ] User can only access own data
  - Needs verification: Check filters in list endpoints
  - Example: Parent can only see own child's grades

- [ ] Admin endpoints require authentication
  - Example: POST /admin/users requires owner/admin role

- [ ] API key exposure prevention
  - Check: No credentials in logs, error messages, URLs

#### Test Cases:
```python
# Trainer tries to access other trainer's group → 403
# Parent tries to access other parent's child → 403
# Guest tries to create group → 403
# Unauthenticated user accesses /admin → 401
```

---

### 2. Cryptographic Failures
#### Check List:
- [ ] Passwords hashed with strong algorithm
  - Algorithm: bcrypt/argon2
  - Check: Password stored as hashed_password, never plaintext

- [ ] Sensitive data encrypted in transit (HTTPS)
  - Environment: HTTPS only in production
  - Check: All API calls use HTTPS

- [ ] API tokens have expiration
  - TTL: Check JWT expiration time
  - Default: Should be < 24 hours

- [ ] Secrets not in version control
  - Check: .env not committed, .gitignore has .env

- [ ] Database passwords encrypted
  - Check: POSTGRES_PASSWORD not in code

#### Test Cases:
```bash
# Try to login with plaintext password → should fail
# Check password hash algorithm
# Verify JWT has exp claim
# Ensure .env is in .gitignore
```

---

### 3. Injection
#### Check List:
- [ ] SQL Injection prevention
  - Framework: SQLAlchemy ORM (safe by default)
  - Check: No raw SQL queries
  - Test: Try SQL injection in search fields

- [ ] Command Injection prevention
  - Check: No shell commands with user input
  - Example: No os.system() with user data

- [ ] NoSQL Injection
  - N/A: Using SQL database

- [ ] Template Injection
  - Check: Email templates use safe rendering
  - Location: Email notifications

#### Test Cases:
```bash
# Try: POST /grades with student_id="1 OR 1=1" → should fail
# Try: GET /students?search="<script>" → should be escaped
# Try: POST /groups with name containing SQL → should be sanitized
```

---

### 4. Insecure Design
#### Check List:
- [x] Authentication flow secure
  - Status: ✅ Email + password + optional 2FA

- [x] Authorization checks present
  - Status: ✅ RBAC on all endpoints

- [ ] Rate limiting implemented
  - Check: Login endpoints have rate limit
  - Prevent: Brute force attacks

- [ ] Input validation present
  - Check: All inputs validated (type, length, format)
  - Example: Email format, phone number format

- [ ] Error messages don't leak info
  - Check: Generic error messages for security errors
  - Avoid: "User not found" on login failure

#### Test Cases:
```bash
# Try 100 login attempts → should be rate limited
# Try invalid email format → should fail
# Try SQL injection → should show generic error
```

---

### 5. Security Misconfiguration
#### Check List:
- [ ] Debug mode disabled in production
  - Check: FASTAPI_DEBUG=false

- [ ] Security headers present
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - Content-Security-Policy: strict

- [ ] CORS properly configured
  - Check: Only allowed origins in CORS_ORIGINS
  - Avoid: CORS_ORIGINS = "*"

- [ ] Dependencies up to date
  - Check: No vulnerable packages
  - Run: pip install -U pip && pip-audit

- [ ] Database not exposed
  - Check: PostgreSQL only accessible internally
  - Avoid: Port 5432 exposed publicly

#### Test Cases:
```bash
# Check CORS headers: curl -H "Origin: attacker.com" ...
# Check security headers: curl -I https://api.example.com
# Check DEBUG mode disabled: No stack traces in errors
```

---

### 6. Vulnerable & Outdated Components
#### Check List:
- [ ] Dependencies scanned for vulnerabilities
  - Tool: pip-audit, safety
  - Command: `pip-audit`

- [ ] FastAPI version up to date
  - Current: >= 0.104.0

- [ ] SQLAlchemy version secure
  - Current: >= 2.0

- [ ] PostgreSQL version supported
  - Current: >= 12

#### Commands:
```bash
# Install security scanners
pip install pip-audit safety

# Run audit
pip-audit
safety check
```

---

### 7. Authentication & Session Management
#### Check List:
- [x] Password reset tokens expire
  - TTL: 24 hours
  - Implementation: invite_token_expires_at

- [x] Sessions invalidated on logout
  - Status: ✅ Token invalidation

- [ ] Prevent session fixation
  - Check: New session token on login
  - Avoid: Reuse token across sessions

- [ ] Secure cookie settings
  - HttpOnly: true (if using cookies)
  - Secure: true (HTTPS only)
  - SameSite: Strict

- [ ] Multi-factor authentication
  - Check: 2FA available for sensitive accounts
  - Method: TOTP or email verification

#### Test Cases:
```bash
# Reset password, verify token expires
# Login, logout, try to use old token → should fail
# Check token doesn't expose user info
```

---

### 8. Software & Data Integrity Failures
#### Check List:
- [ ] Code signed for integrity
  - Check: Commits signed with GPG

- [ ] Dependencies downloaded from trusted sources
  - Check: pip uses PyPI only
  - Avoid: Installing from random URLs

- [ ] No auto-updates enabled
  - Check: Dependencies pinned in requirements.txt
  - Avoid: Automatic version upgrades

- [ ] Deployment pipeline secure
  - Check: Only authorized users can deploy
  - Logs: Deployment changes logged

#### Test Cases:
```bash
# Verify git commits are signed
git log --oneline --show-signature | head
```

---

### 9. Logging & Monitoring
#### Check List:
- [ ] Security events logged
  - Events: Login, logout, failed auth, permission denied
  - Storage: Persistent logs

- [ ] Sensitive data not logged
  - Check: No passwords, tokens, SSN in logs
  - Filtering: Redact sensitive fields

- [ ] Logs protected from tampering
  - Access: Only admin can read logs
  - Immutable: Logs cannot be deleted

- [ ] Monitoring & alerting configured
  - Alerts: Failed logins, rate limit breaches
  - Response: < 1 hour to investigate

#### Test Cases:
```bash
# Check logs for security events
# Verify passwords not logged
# Check log access controls
```

---

### 10. Server-Side Request Forgery (SSRF)
#### Check List:
- [ ] External URLs validated
  - Check: No user-controlled URLs in HTTP requests
  - Example: Student avatar upload URL

- [ ] Internal endpoints protected
  - Check: 127.0.0.1 endpoints require auth
  - Example: /admin/debug endpoints

- [ ] DNS rebinding prevented
  - Check: Validate hostname after DNS lookup

#### Test Cases:
```bash
# Try: POST /user/avatar with URL=file:///etc/passwd → should fail
# Try: POST /upload with URL=http://127.0.0.1:5432 → should fail
```

---

## Implementation Status

### ✅ Already Implemented
1. RBAC with 6 roles
2. Password hashing with bcrypt
3. JWT token authentication
4. Soft-delete for data integrity
5. SQLAlchemy ORM (SQL injection safe)
6. Status validation on all operations

### 📋 To Verify
1. Rate limiting on auth endpoints
2. CORS configuration
3. Security headers
4. Debug mode disabled
5. Dependency vulnerabilities
6. Log sanitization

### ⚠️ To Implement
1. 2FA for admin accounts
2. IP whitelisting for admin endpoints
3. Request signing for API calls
4. Enhanced audit logging
5. DDoS protection

---

## Testing Commands

### 1. Check Dependencies for Vulnerabilities
```bash
pip install pip-audit safety
pip-audit
safety check
```

### 2. CORS Security Test
```bash
curl -H "Origin: https://attacker.com" \
  -H "Access-Control-Request-Method: POST" \
  http://localhost:8000/api/v1/grades
```

### 3. Authentication Test
```bash
# Try login with 100+ attempts
for i in {1..100}; do
  curl -X POST http://localhost:8000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done
# Should see rate limit response (429)
```

### 4. SQL Injection Test
```bash
curl "http://localhost:8000/api/v1/students?search=1%27%20OR%201%3D1" \
  -H "Authorization: Bearer $TOKEN"
# Should return sanitized/no results
```

### 5. XSS Test
```bash
curl -X POST http://localhost:8000/api/v1/groups \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"<script>alert(1)</script>"}'
# Name should be escaped in response
```

---

## Priority Fixes

### CRITICAL (Must fix before production)
1. [ ] Ensure debug mode disabled
2. [ ] Verify RBAC on all endpoints
3. [ ] Check no credentials in logs
4. [ ] Verify password hashing algorithm

### HIGH (Should fix before production)
1. [ ] Add rate limiting
2. [ ] Configure CORS properly
3. [ ] Add security headers
4. [ ] Scan dependencies

### MEDIUM (Nice to have)
1. [ ] Implement 2FA
2. [ ] Add request signing
3. [ ] Enhanced audit logging
4. [ ] IP whitelisting

---

## Compliance Checks

### GDPR (if applicable)
- [ ] User data can be exported
- [ ] User data can be deleted
- [ ] Consent logged for emails/SMS
- [ ] Privacy policy accessible

### PCI-DSS (if handling payments)
- [ ] No payment card data stored
- [ ] Payment gateway integration secure
- [ ] Logs PCI compliant

---

## Sign-off

- [ ] Security review completed
- [ ] All critical issues fixed
- [ ] Penetration testing done
- [ ] Compliance verified
- [ ] Ready for production

---

**Status:** Ready to audit  
**Estimated Time:** 8 hours (initial audit + fixes)  
**Tools:** pip-audit, safety, curl, browser dev tools  
**Report:** To be generated after audit
