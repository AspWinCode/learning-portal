"""
Load testing for Learning Portal.

Simulates typical user workflows:
- Auth: Login
- Groups: Create group, add student, assign program
- Grades: Create grade for student
- Leads: Convert student card

Run:
    locust -f load_test.py --host=http://localhost:8000 --users=100 --spawn-rate=10 --run-time=5m
"""
from locust import HttpUser, task, between
import random
import json


class AuthUser:
    """Shared auth tokens."""
    tokens = {}


class LearningPortalUser(HttpUser):
    """Typical Learning Portal user."""

    wait_time = between(1, 3)  # Wait 1-3 seconds between tasks

    def on_start(self):
        """Login on start."""
        self.login()

    def login(self):
        """Login as trainer/admin."""
        response = self.client.post(
            "/api/v1/auth/login",
            json={
                "email": f"trainer{random.randint(1, 5)}@test.com",
                "password": "password123"
            }
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("access_token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            self.headers = {}

    @task(5)
    def list_groups(self):
        """List groups (high frequency)."""
        self.client.get(
            "/api/v1/groups",
            headers=self.headers
        )

    @task(3)
    def list_students(self):
        """List students."""
        self.client.get(
            "/api/v1/students",
            headers=self.headers
        )

    @task(2)
    def create_group(self):
        """Create a new group."""
        response = self.client.post(
            "/api/v1/groups",
            json={
                "name": f"Group {random.randint(1, 1000)}",
                "trainer_id": 2,
                "program_ids": [1, 2, 3]
            },
            headers=self.headers
        )
        if response.status_code == 201:
            self.group_id = response.json().get("id")

    @task(2)
    def add_student_to_group(self):
        """Add student to group."""
        if hasattr(self, 'group_id'):
            self.client.post(
                f"/api/v1/groups/{self.group_id}/students/{random.randint(1, 50)}",
                headers=self.headers
            )

    @task(2)
    def create_grade(self):
        """Create grade for student."""
        response = self.client.post(
            "/api/v1/grades",
            json={
                "student_id": random.randint(1, 50),
                "topic_id": random.randint(1, 100),
                "program_id": random.randint(1, 10),
                "value": random.randint(1, 100)
            },
            headers=self.headers
        )
        # Expected: 201 or 400 (validation errors)
        assert response.status_code in [201, 400, 404]

    @task(1)
    def list_grades(self):
        """List grades."""
        self.client.get(
            "/api/v1/grades",
            headers=self.headers
        )

    @task(1)
    def get_dashboard(self):
        """Get trainer dashboard."""
        self.client.get(
            "/api/v1/trainer/dashboard",
            headers=self.headers
        )


class AdminUser(HttpUser):
    """Admin user for admin operations."""

    wait_time = between(2, 5)

    def on_start(self):
        """Login as admin."""
        response = self.client.post(
            "/api/v1/auth/login",
            json={
                "email": "admin@test.com",
                "password": "password123"
            }
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("access_token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            self.headers = {}

    @task(3)
    def list_all_groups(self):
        """List all groups."""
        self.client.get(
            "/api/v1/groups",
            headers=self.headers
        )

    @task(2)
    def get_analytics(self):
        """Get analytics dashboard."""
        self.client.get(
            "/api/v1/owner/dashboard",
            headers=self.headers
        )

    @task(1)
    def list_users(self):
        """List all users."""
        self.client.get(
            "/api/v1/admin/users",
            headers=self.headers
        )


class ParentUser(HttpUser):
    """Parent user checking student progress."""

    wait_time = between(3, 6)

    def on_start(self):
        """Login as parent."""
        response = self.client.post(
            "/api/v1/auth/login",
            json={
                "email": f"parent{random.randint(1, 20)}@test.com",
                "password": "password123"
            }
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("access_token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            self.headers = {}

    @task(4)
    def get_child_progress(self):
        """Check child's progress."""
        self.client.get(
            "/api/v1/parent/dashboard",
            headers=self.headers
        )

    @task(2)
    def list_grades_for_child(self):
        """List grades for child."""
        self.client.get(
            "/api/v1/parent/grades",
            headers=self.headers
        )

    @task(1)
    def get_messages(self):
        """Check messages."""
        self.client.get(
            "/api/v1/parent/messages",
            headers=self.headers
        )


class GuestUser(HttpUser):
    """Unauthenticated guest user."""

    wait_time = between(2, 4)

    @task(5)
    def public_endpoint(self):
        """Access public endpoints."""
        self.client.get("/api/v1/public/info")

    @task(2)
    def health_check(self):
        """Check health."""
        self.client.get("/health")
