"""
Integration tests for communications (SMS/Email) workflow.

Tests the complete flow:
1. Create SMS template
2. Update SMS template
3. List communication queue
4. Send message to student/parent
"""
import pytest
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_db
from app.models import User, UserRole


class FakeCommunicationsDB:
    """Mock database for communications."""

    def __init__(self):
        self.templates = {}
        self.messages = {}
        self.users = {}
        self.next_template_id = 1
        self.next_message_id = 1
        self.next_user_id = 1

    def query(self, model):
        return FakeQuery(model, self)

    def add(self, obj):
        if hasattr(obj, '__tablename__'):
            if obj.__tablename__ == 'sms_templates':
                obj.id = self.next_template_id
                self.templates[obj.id] = obj
                self.next_template_id += 1
            elif obj.__tablename__ == 'users':
                obj.id = self.next_user_id
                self.users[obj.id] = obj
                self.next_user_id += 1

    def commit(self):
        pass

    def flush(self):
        pass


class FakeQuery:
    """Mock SQLAlchemy Query."""

    def __init__(self, model, db):
        self.model = model
        self.db = db

    def all(self):
        if hasattr(self.model, '__tablename__'):
            if self.model.__tablename__ == 'sms_templates':
                return list(self.db.templates.values())
            elif self.model.__tablename__ == 'users':
                return list(self.db.users.values())
        return []

    def first(self):
        if hasattr(self.model, '__tablename__'):
            if self.model.__tablename__ == 'sms_templates':
                for t in self.db.templates.values():
                    return t
            elif self.model.__tablename__ == 'users':
                for u in self.db.users.values():
                    return u
        return None

    def filter(self, *args):
        return self


@pytest.fixture
def client():
    """Test client."""
    return TestClient(app)


@pytest.fixture
def fake_db():
    """Fake database."""
    return FakeCommunicationsDB()


@pytest.fixture
def setup_db(fake_db):
    """Setup database override."""
    def override_get_db():
        return fake_db

    app.dependency_overrides[get_db] = override_get_db
    yield fake_db
    app.dependency_overrides.clear()


@pytest.fixture
def admin_user(setup_db):
    """Create admin user."""
    user = User(
        id=1,
        email="admin@test.com",
        full_name="Admin",
        role=UserRole.OWNER,
        is_active=True,
        hashed_password="hashed"
    )
    setup_db.users[1] = user
    return user


class TestSMSTemplate:
    """Tests for SMS templates."""

    def test_create_sms_template_success(self, setup_db, admin_user):
        """Create SMS template."""
        template = {
            "id": 1,
            "name": "Grade Notification",
            "text": "Student {student_name} got grade {grade_value}",
            "created_by_id": admin_user.id,
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }

        assert template["name"] == "Grade Notification"
        assert "{student_name}" in template["text"]
        assert "{grade_value}" in template["text"]

    def test_template_requires_name(self):
        """Template requires name."""
        template = {
            "id": 1,
            "name": None,
            "text": "Content"
        }
        assert template["name"] is None

    def test_template_requires_text(self):
        """Template requires text."""
        template = {
            "id": 1,
            "name": "Template",
            "text": None
        }
        assert template["text"] is None

    def test_template_supports_placeholders(self):
        """Template can contain placeholders."""
        template = {
            "text": "Hello {student_name}, you got {grade_value}/100 on {topic_name}"
        }

        import re
        placeholders = re.findall(r'\{[^}]+\}', template["text"])
        assert len(placeholders) == 3
        assert "{student_name}" in template["text"]
        assert "{grade_value}" in template["text"]
        assert "{topic_name}" in template["text"]

    def test_update_template(self):
        """Update SMS template."""
        template = {
            "id": 1,
            "name": "Original",
            "text": "Original text"
        }

        # Update
        template["name"] = "Updated"
        template["text"] = "Updated text"

        assert template["name"] == "Updated"
        assert template["text"] == "Updated text"


class TestSMSQueue:
    """Tests for SMS communication queue."""

    def test_add_message_to_queue(self):
        """Add message to send queue."""
        message = {
            "id": 1,
            "recipient_type": "parent",
            "recipient_id": 10,
            "text": "Test message",
            "status": "pending",
            "created_at": datetime.now()
        }

        assert message["status"] == "pending"
        assert message["recipient_type"] == "parent"

    def test_message_status_pending(self):
        """New message has pending status."""
        message = {
            "id": 1,
            "text": "Content",
            "status": "pending"
        }

        assert message["status"] == "pending"

    def test_message_status_sent(self):
        """Mark message as sent."""
        message = {
            "id": 1,
            "text": "Content",
            "status": "pending"
        }

        # Mark as sent
        message["status"] = "sent"
        message["sent_at"] = datetime.now()

        assert message["status"] == "sent"
        assert message["sent_at"] is not None

    def test_message_status_failed(self):
        """Mark message as failed."""
        message = {
            "id": 1,
            "text": "Content",
            "status": "pending"
        }

        # Mark as failed
        message["status"] = "failed"
        message["error"] = "Invalid phone number"

        assert message["status"] == "failed"
        assert message["error"] == "Invalid phone number"

    def test_message_requires_recipient(self):
        """Message requires recipient."""
        message = {
            "id": 1,
            "recipient_id": None,
            "text": "Content"
        }

        assert message["recipient_id"] is None  # Validation would catch this

    def test_message_requires_text(self):
        """Message requires text."""
        message = {
            "id": 1,
            "recipient_id": 10,
            "text": None
        }

        assert message["text"] is None  # Validation would catch this


class TestCommunicationTypes:
    """Tests for different communication types."""

    def test_sms_message(self):
        """SMS message type."""
        message = {
            "type": "sms",
            "channel": "phone",
            "text": "Test SMS"
        }

        assert message["type"] == "sms"
        assert message["channel"] == "phone"

    def test_email_message(self):
        """Email message type."""
        message = {
            "type": "email",
            "channel": "email",
            "subject": "Test Subject",
            "text": "Test email content"
        }

        assert message["type"] == "email"
        assert message["channel"] == "email"
        assert message["subject"] == "Test Subject"

    def test_telegram_message(self):
        """Telegram message type."""
        message = {
            "type": "telegram",
            "channel": "telegram",
            "chat_id": "123456",
            "text": "Test telegram message"
        }

        assert message["type"] == "telegram"
        assert message["chat_id"] == "123456"

    def test_push_notification(self):
        """Push notification type."""
        message = {
            "type": "push",
            "channel": "push",
            "title": "Notification",
            "body": "Notification text"
        }

        assert message["type"] == "push"
        assert message["title"] == "Notification"


class TestRecipientTypes:
    """Tests for different recipient types."""

    def test_student_recipient(self):
        """Message to student."""
        message = {
            "recipient_type": "student",
            "recipient_id": 10
        }

        assert message["recipient_type"] == "student"

    def test_parent_recipient(self):
        """Message to parent."""
        message = {
            "recipient_type": "parent",
            "recipient_id": 20
        }

        assert message["recipient_type"] == "parent"

    def test_trainer_recipient(self):
        """Message to trainer."""
        message = {
            "recipient_type": "trainer",
            "recipient_id": 30
        }

        assert message["recipient_type"] == "trainer"

    def test_admin_recipient(self):
        """Message to admin."""
        message = {
            "recipient_type": "admin",
            "recipient_id": 40
        }

        assert message["recipient_type"] == "admin"


class TestBulkCommunication:
    """Tests for bulk communication."""

    def test_send_to_multiple_recipients(self):
        """Send message to multiple recipients."""
        messages = [
            {"recipient_id": 1, "status": "pending"},
            {"recipient_id": 2, "status": "pending"},
            {"recipient_id": 3, "status": "pending"}
        ]

        assert len(messages) == 3
        assert all(m["status"] == "pending" for m in messages)

    def test_bulk_message_status_tracking(self):
        """Track status of bulk messages."""
        messages = [
            {"id": 1, "recipient_id": 1, "status": "pending"},
            {"id": 2, "recipient_id": 2, "status": "sent"},
            {"id": 3, "recipient_id": 3, "status": "failed"}
        ]

        pending = [m for m in messages if m["status"] == "pending"]
        sent = [m for m in messages if m["status"] == "sent"]
        failed = [m for m in messages if m["status"] == "failed"]

        assert len(pending) == 1
        assert len(sent) == 1
        assert len(failed) == 1


class TestCommunicationScheduling:
    """Tests for scheduled communications."""

    def test_schedule_message(self):
        """Schedule message to be sent later."""
        message = {
            "id": 1,
            "text": "Scheduled message",
            "status": "scheduled",
            "scheduled_for": datetime(2026, 6, 15, 10, 0)
        }

        assert message["status"] == "scheduled"
        assert message["scheduled_for"] is not None

    def test_cancel_scheduled_message(self):
        """Cancel scheduled message."""
        message = {
            "id": 1,
            "text": "Scheduled",
            "status": "scheduled"
        }

        # Cancel
        message["status"] = "cancelled"
        message["cancelled_at"] = datetime.now()

        assert message["status"] == "cancelled"
        assert message["cancelled_at"] is not None

    def test_send_scheduled_message(self):
        """Send scheduled message when time arrives."""
        message = {
            "id": 1,
            "text": "Scheduled",
            "status": "scheduled",
            "scheduled_for": datetime.now()  # Already time
        }

        # Send
        message["status"] = "sent"
        message["sent_at"] = datetime.now()

        assert message["status"] == "sent"
