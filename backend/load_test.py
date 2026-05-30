"""Load testing script for Learning Portal API.

Run with:
    locust -f load_test.py --host=http://localhost:8000 \
        --users=100 --spawn-rate=10 --run-time=5m
"""

from locust import HttpUser, TaskSet, task, between
import json
import random


class AuthTasks(TaskSet):
    """Authentication related tasks."""

    def on_start(self):
        """Setup tasks that run once when user starts."""
        self.user_id = None
        self.token = None

    @task(2)
    def login(self):
        """Login task (30% of trainer traffic)."""
        response = self.client.post(
            "/api/v1/auth/login",
            data={
                "username": f"trainer{random.randint(1, 10)}@example.com",
                "password": "password123",
            },
            name="/api/v1/auth/login",
        )
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.user_id = random.randint(1, 100)

    @task(1)
    def guest_login(self):
        """Guest login task."""
        response = self.client.post(
            "/api/v1/auth/guest",
            name="/api/v1/auth/guest",
        )


class GroupTasks(TaskSet):
    """Group management tasks."""

    @task(3)
    def list_groups(self):
        """List groups."""
        self.client.get(
            "/api/v1/groups",
            name="/api/v1/groups",
        )

    @task(1)
    def create_group(self):
        """Create new group."""
        self.client.post(
            "/api/v1/groups",
            json={
                "name": f"Group {random.randint(1, 1000)}",
                "description": "Test group",
            },
            name="/api/v1/groups [POST]",
        )

    @task(2)
    def get_group(self):
        """Get specific group."""
        group_id = random.randint(1, 100)
        self.client.get(
            f"/api/v1/groups/{group_id}",
            name="/api/v1/groups/[id]",
        )


class StudentTasks(TaskSet):
    """Student management tasks."""

    @task(3)
    def list_students(self):
        """List students."""
        self.client.get(
            "/api/v1/students",
            name="/api/v1/students",
        )

    @task(2)
    def get_student(self):
        """Get student details."""
        student_id = random.randint(1, 100)
        self.client.get(
            f"/api/v1/students/{student_id}",
            name="/api/v1/students/[id]",
        )

    @task(1)
    def create_student(self):
        """Create new student."""
        self.client.post(
            "/api/v1/students",
            json={
                "first_name": f"Student{random.randint(1, 1000)}",
                "last_name": "Test",
                "email": f"student{random.randint(1, 10000)}@example.com",
                "phone": "+79001234567",
            },
            name="/api/v1/students [POST]",
        )


class GradeTasks(TaskSet):
    """Grade/assessment tasks."""

    @task(2)
    def get_grades(self):
        """Get grades for a student."""
        student_id = random.randint(1, 100)
        self.client.get(
            f"/api/v1/grades?student_id={student_id}",
            name="/api/v1/grades [GET]",
        )

    @task(1)
    def create_grade(self):
        """Create a grade."""
        self.client.post(
            "/api/v1/grades",
            json={
                "student_id": random.randint(1, 100),
                "subject_id": random.randint(1, 10),
                "score": random.randint(2, 5),
                "date": "2024-05-30",
            },
            name="/api/v1/grades [POST]",
        )


class DashboardTasks(TaskSet):
    """Dashboard and reporting tasks."""

    @task(2)
    def parent_dashboard(self):
        """Get parent dashboard."""
        self.client.get(
            "/api/v1/parent-dashboard",
            name="/api/v1/parent-dashboard",
        )

    @task(2)
    def owner_dashboard(self):
        """Get owner dashboard."""
        self.client.get(
            "/api/v1/owner-dashboard",
            name="/api/v1/owner-dashboard",
        )

    @task(1)
    def finance_report(self):
        """Get finance report."""
        self.client.get(
            "/api/v1/finance/report",
            name="/api/v1/finance/report",
        )


class TrainerUser(HttpUser):
    """Trainer user behavior (50% of load)."""

    wait_time = between(1, 3)
    tasks = {
        AuthTasks: 1,
        GroupTasks: 3,
        StudentTasks: 2,
        GradeTasks: 4,
    }


class AdminUser(HttpUser):
    """Admin user behavior (20% of load)."""

    wait_time = between(2, 4)
    tasks = {
        AuthTasks: 1,
        GroupTasks: 2,
        StudentTasks: 3,
        DashboardTasks: 2,
    }


class ParentUser(HttpUser):
    """Parent user behavior (20% of load)."""

    wait_time = between(3, 5)
    tasks = {
        AuthTasks: 1,
        StudentTasks: 1,
        GradeTasks: 2,
        DashboardTasks: 3,
    }


class GuestUser(HttpUser):
    """Guest user behavior (10% of load)."""

    wait_time = between(2, 4)
    tasks = {
        AuthTasks: 2,
    }
