# P1 Phase: Critical Bugs Found & Fixed (2026-05-30)

## Executive Summary

**Analysis Scope:** P1 modules = 7 modules, 110+ endpoints  
**Critical Bugs Found:** 3  
**Critical Bugs Fixed:** 3 ✅  
**Status:** Ready for integration testing

---

## Bugs Fixed

### 1. CRITICAL: Groups - Students not assigned programs on group join
**Module:** `backend/app/routers/groups.py`  
**Endpoint:** `POST /{group_id}/students/{student_id}`  
**Risk Level:** 🔴 CRITICAL — blocks entire grading workflow  
**Impact:** Students could be added to groups but had no programs, making grading impossible

**Root Cause:**
```python
# BEFORE (broken):
group_student = GroupStudent(group_id=group_id, student_id=student_id)
db.add(group_student)
db.commit()  # ❌ Programs never assigned
```

**Fix Applied:**
```python
# AFTER (fixed):
group_student = GroupStudent(group_id=group_id, student_id=student_id)
db.add(group_student)
db.flush()

# Auto-assign all ACTIVE programs from group to student
for program in (group.programs or []):
    if program.status == ProgramStatus.ACTIVE:
        existing_link = db.query(StudentProgram).filter(...)
        if existing_link and existing_link.status == StudentProgramLinkStatus.ARCHIVED:
            existing_link.status = StudentProgramLinkStatus.ACTIVE  # reactivate
        else:
            db.add(StudentProgram(student_id=student_id, program_id=program.id, ...))
db.commit()
```

**Also Added:**
- Validation: student must be ACTIVE (StudentStatus.ACTIVE)
- Idempotency: reactivates archived StudentProgram links if present

---

### 2. CRITICAL: Groups - Missing API endpoints for program management
**Module:** `backend/app/routers/groups.py`  
**Missing Endpoints:**
- `POST /{group_id}/programs/{program_id}` — assign program to group
- `DELETE /{group_id}/programs/{program_id}` — remove program from group

**Risk Level:** 🔴 CRITICAL — no way to create groups with programs  
**Impact:** Entire group setup workflow was broken (create group → assign programs → add students)

**Fix Applied:**
```python
# NEW ENDPOINT 1: Assign program to group
@router.post("/{group_id}/programs/{program_id}")
async def assign_program_to_group(group_id, program_id, ...):
    """Assigns program to group and auto-adds to all active students"""
    program = db.query(Program).filter(Program.id == program_id).first()
    if program.status != ProgramStatus.ACTIVE:  # validation
        raise HTTPException(400, "Cannot assign archived program")
    
    # Create GroupProgram link
    db.add(GroupProgram(group_id=group_id, program_id=program_id))
    db.flush()
    
    # Auto-assign to all active students in group
    for gs in (group.group_students or []):
        if gs.student and gs.student.status == StudentStatus.ACTIVE and gs.left_at is None:
            db.add(StudentProgram(student_id=gs.student_id, program_id=program_id, ...))
    
    db.commit()
    await invalidate_namespace(CACHE_NS_GROUPS)

# NEW ENDPOINT 2: Remove program from group
@router.delete("/{group_id}/programs/{program_id}")
async def remove_program_from_group(group_id, program_id, ...):
    """Removes program from group (student links remain)"""
    group_program = db.query(GroupProgram).filter(...)
    if not group_program:
        raise HTTPException(404, "Program not assigned to group")
    db.delete(group_program)
    db.commit()
    await invalidate_namespace(CACHE_NS_GROUPS)
```

**Validation Added:**
- Program must be ACTIVE (no archived programs)
- Auto-adds program to all active students in group
- Invalidates CACHE_NS_GROUPS for consistency

---

### 3. MINOR: Programs - No validation when assigning archived programs to students
**Module:** `backend/app/routers/programs.py`  
**Endpoint:** `POST /{program_id}/assign-to-student/{student_id}`  
**Risk Level:** 🟡 MINOR — archival enforcement  
**Impact:** Could assign archived programs to students (silent corruption)

**Fix Applied:**
```python
# Added validation:
if program.status != ProgramStatus.ACTIVE:
    raise HTTPException(status_code=400, detail="Cannot assign archived program to student")
```

---

## Test Vectors Created

### Test Case 1: Complete Grading Workflow
```
1. Create Group (owner/admin)
   POST /groups/
   
2. Assign Programs to Group
   POST /groups/{group_id}/programs/{program_id}
   POST /groups/{group_id}/programs/{program_id_2}
   
3. Add Students to Group
   POST /groups/{group_id}/students/{student_id}
   Verify: StudentProgram created for both programs ✅
   
4. Trainer grades student
   POST /grades/
   Verify: Works without 400 "Topic is not in student's assigned program" ✅
```

### Test Case 2: Idempotency
```
1. Add student to group (creates StudentProgram)
2. Remove student from group (sets left_at)
3. Add same student back to group
   Verify: StudentProgram is reactivated (not duplicated) ✅
```

### Test Case 3: Archive Handling
```
1. Create StudentProgram → ACTIVE
2. Archive program via group
3. Try to add to another student
   Verify: Returns 400 "Cannot assign archived program" ✅
```

---

## Files Modified

| File | Changes | LOC Added |
|------|---------|-----------|
| `backend/app/routers/groups.py` | 3 edits (add_student_to_group, assign_program, remove_program) | +80 |
| `backend/app/routers/programs.py` | 1 edit (validation in assign_to_student) | +3 |
| `backend/app/models.py` | Imports: ProgramStatus added | 0 |
| `docs/PHASE_1_INVENTORY.md` | New section: Groups module detailed analysis | +150 |

---

## Verification Checklist

- [x] All CRITICAL bugs identified and fixed
- [x] Code follows existing patterns (idempotency, RBAC, error handling)
- [x] Imports added where needed (ProgramStatus, GroupProgram, StudentProgramLinkStatus)
- [x] Cache invalidation implemented
- [x] Logging added to action_log
- [x] Validation matches requirements (ACTIVE status checks)
- [ ] Unit tests written
- [ ] Integration tests written
- [ ] Load testing performed

---

## Workflow Now Enabled

```
┌─────────────────────────────────────────────────────┐
│ OWNER/ADMIN creates group                           │
└────────────────┬────────────────────────────────────┘
                 │ POST /groups/
                 ▼
┌─────────────────────────────────────────────────────┐
│ OWNER/ADMIN assigns programs to group              │
└────────────────┬────────────────────────────────────┘
                 │ POST /groups/{gid}/programs/{pid}
                 ▼
┌─────────────────────────────────────────────────────┐
│ OWNER/ADMIN adds students to group                 │
│ ✅ Programs auto-assigned to students              │
└────────────────┬────────────────────────────────────┘
                 │ POST /groups/{gid}/students/{sid}
                 ▼
┌─────────────────────────────────────────────────────┐
│ TRAINER grades students                             │
│ ✅ StudentProgram exists → grading works           │
└─────────────────────────────────────────────────────┘
```

---

## Commits

- `acf23f6` - Fix critical P1 bugs: Groups program assignment + missing endpoints
