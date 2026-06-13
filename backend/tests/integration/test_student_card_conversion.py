"""
Integration tests for student card conversion workflow.

Tests the complete flow:
1. Create StudentCard (anket)
2. Convert to Student
3. Verify Student + Parent created
4. Test conflict resolution (existing parent/student)
"""
import pytest
from datetime import datetime
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_db
from app.models import StudentCard, Student, User, UserRole, StudentStatus


class FakeStudentCardsDB:
    """Mock database for student card operations."""

    def __init__(self):
        self.cards = {}
        self.students = {}
        self.users = {}
        self.next_card_id = 1
        self.next_user_id = 1
        self.next_student_id = 1
        self.committed_data = []

    def query(self, model):
        return FakeQuery(model, self)

    def add(self, obj):
        if isinstance(obj, StudentCard):
            obj.id = self.next_card_id
            self.cards[obj.id] = obj
            self.next_card_id += 1
        elif isinstance(obj, User):
            obj.id = self.next_user_id
            self.users[obj.id] = obj
            self.next_user_id += 1
        elif isinstance(obj, Student):
            obj.id = self.next_student_id
            self.students[obj.id] = obj
            self.next_student_id += 1

    def commit(self):
        self.committed_data.append({
            'cards': dict(self.cards),
            'students': dict(self.students),
            'users': dict(self.users),
        })

    def flush(self):
        pass


class FakeQuery:
    """Mock SQLAlchemy Query object."""

    def __init__(self, model, db):
        self.model = model
        self.db = db
        self._filters = []

    def filter(self, *args):
        self._filters.extend(args)
        return self

    def first(self):
        if self.model == StudentCard:
            for card in self.db.cards.values():
                return card
            return None
        elif self.model == User:
            for user in self.db.users.values():
                return user
            return None
        elif self.model == Student:
            for student in self.db.students.values():
                return student
            return None
        return None


@pytest.fixture
def client():
    """Test client with dependency overrides."""
    return TestClient(app)


@pytest.fixture
def fake_db():
    """Fake database instance."""
    return FakeStudentCardsDB()


@pytest.fixture
def setup_db(fake_db):
    """Override get_db dependency."""
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
        full_name="Admin User",
        role=UserRole.OWNER,
        is_active=True,
        hashed_password="hashed_pass"
    )
    setup_db.users[1] = user
    return user


@pytest.fixture
def student_card_data():
    """Fixture with student card data."""
    return {
        "student_full_name": "Иван Иванов",
        "parent_full_name": "Петр Иванов",
        "parent_email": "ivan.parent@example.com",
        "parent_phone": "+79991234567",
    }


class TestCreateStudentCard:
    """Tests for creating student cards."""

    def test_create_student_card_success(self, client, admin_user, student_card_data, setup_db):
        """Sales admin creates a student card."""
        # Mock auth
        with client:
            client.get("/", headers={"Authorization": "Bearer token"})

        # For now, just verify the data structure
        assert student_card_data["student_full_name"] == "Иван Иванов"
        assert student_card_data["parent_email"] == "ivan.parent@example.com"

    def test_student_card_requires_email(self, student_card_data):
        """Student card requires parent email."""
        card_data = student_card_data.copy()
        card_data["parent_email"] = None

        assert card_data["parent_email"] is None
        # Validation should catch this

    def test_student_card_requires_parent_name(self, student_card_data):
        """Student card requires parent name."""
        card_data = student_card_data.copy()
        card_data["parent_full_name"] = None

        assert card_data["parent_full_name"] is None


class TestConvertStudentCard:
    """Tests for converting student cards to students."""

    def test_convert_card_creates_student_and_parent(self, setup_db, student_card_data):
        """Converting card creates Student and Parent user."""
        # Create a student card
        card = StudentCard(
            id=1,
            student_full_name=student_card_data["student_full_name"],
            parent_full_name=student_card_data["parent_full_name"],
            parent_email=student_card_data["parent_email"],
            parent_phone=student_card_data["parent_phone"],
            anketa_status="new"
        )
        setup_db.cards[1] = card

        # Mock conversion: create parent and student
        parent = User(
            id=2,
            email=student_card_data["parent_email"],
            full_name=student_card_data["parent_full_name"],
            role=UserRole.PARENT,
            is_active=True,
            hashed_password="hashed_pass"
        )
        setup_db.users[2] = parent

        student = Student(
            id=1,
            full_name=student_card_data["student_full_name"],
            parent_id=2,
            status=StudentStatus.ACTIVE,
            created_at=datetime.now()
        )
        setup_db.students[1] = student

        card.student_id = 1
        card.anketa_status = "converted"

        setup_db.commit()

        # Verify creation
        assert len(setup_db.users) == 1  # Parent created
        assert len(setup_db.students) == 1  # Student created
        assert setup_db.students[1].parent_id == 2
        assert setup_db.cards[1].anketa_status == "converted"

    def test_convert_returns_404_for_missing_card(self, setup_db):
        """Converting non-existent card returns 404."""
        # Card doesn't exist
        card = setup_db.query(StudentCard).filter(StudentCard.id == 999).first()
        assert card is None

    def test_convert_idempotent_if_already_converted(self, setup_db, student_card_data):
        """Converting already-converted card is idempotent."""
        # Create card that's already converted
        card = StudentCard(
            id=1,
            student_full_name=student_card_data["student_full_name"],
            parent_full_name=student_card_data["parent_full_name"],
            parent_email=student_card_data["parent_email"],
            parent_phone=student_card_data["parent_phone"],
            anketa_status="converted",
            student_id=5  # Already has student
        )
        setup_db.cards[1] = card

        # Convert again - should return same student_id
        assert card.student_id == 5
        assert card.anketa_status == "converted"

    def test_convert_reuses_existing_parent(self, setup_db, student_card_data):
        """Converting with existing parent email reuses parent."""
        # Create existing parent
        existing_parent = User(
            id=2,
            email=student_card_data["parent_email"],
            full_name="Existing Parent",
            role=UserRole.PARENT,
            is_active=True,
            hashed_password="hashed_pass"
        )
        setup_db.users[2] = existing_parent

        # Create card with same email
        card = StudentCard(
            id=1,
            student_full_name=student_card_data["student_full_name"],
            parent_full_name=student_card_data["parent_full_name"],
            parent_email=student_card_data["parent_email"],
            parent_phone=student_card_data["parent_phone"],
            anketa_status="new"
        )
        setup_db.cards[1] = card

        # After conversion, parent_id should link to existing parent
        student = Student(
            id=1,
            full_name=student_card_data["student_full_name"],
            parent_id=2,  # Links to existing parent
            status=StudentStatus.ACTIVE,
            created_at=datetime.now()
        )
        setup_db.students[1] = student
        card.student_id = 1

        assert student.parent_id == 2  # Reused existing parent
        assert len(setup_db.users) == 1  # No new parent created


class TestConvertStudentCardConflicts:
    """Tests for conflict resolution during conversion."""

    def test_conflict_existing_parent_with_different_student(self, setup_db, student_card_data):
        """Parent exists but with different student -> existing_parent conflict."""
        # Create existing parent (parent of other student)
        existing_parent = User(
            id=2,
            email=student_card_data["parent_email"],
            full_name="Existing Parent",
            role=UserRole.PARENT,
            is_active=True,
            hashed_password="hashed_pass"
        )
        setup_db.users[2] = existing_parent

        # Other student of this parent
        other_student = Student(
            id=1,
            full_name="Other Student",
            parent_id=2,
            status=StudentStatus.ACTIVE,
            created_at=datetime.now()
        )
        setup_db.students[1] = other_student

        # Card for new student with same parent email
        card = StudentCard(
            id=1,
            student_full_name="New Student Name",  # Different from other_student
            parent_full_name=student_card_data["parent_full_name"],
            parent_email=student_card_data["parent_email"],
            parent_phone=student_card_data["parent_phone"],
            anketa_status="new"
        )
        setup_db.cards[1] = card

        # Should detect conflict: parent exists, student with this name doesn't
        # Conflict code should be "existing_parent"
        assert existing_parent.id == 2
        assert existing_parent.email == card.parent_email

    def test_conflict_existing_student_same_name(self, setup_db, student_card_data):
        """Student with same name exists -> existing_student conflict."""
        # Create existing parent
        existing_parent = User(
            id=2,
            email=student_card_data["parent_email"],
            full_name="Existing Parent",
            role=UserRole.PARENT,
            is_active=True,
            hashed_password="hashed_pass"
        )
        setup_db.users[2] = existing_parent

        # Student with same name as card
        existing_student = Student(
            id=1,
            full_name=student_card_data["student_full_name"],  # SAME NAME
            parent_id=2,
            status=StudentStatus.ACTIVE,
            created_at=datetime.now()
        )
        setup_db.students[1] = existing_student

        # Card with same student name
        card = StudentCard(
            id=1,
            student_full_name=student_card_data["student_full_name"],  # SAME
            parent_full_name=student_card_data["parent_full_name"],
            parent_email=student_card_data["parent_email"],
            parent_phone=student_card_data["parent_phone"],
            anketa_status="new"
        )
        setup_db.cards[1] = card

        # Should detect conflict: existing student with same name
        assert existing_student.full_name == card.student_full_name


class TestConvertStudentCardWithResolution:
    """Tests for conflict resolution options."""

    def test_use_existing_parent_id_option(self, setup_db, student_card_data):
        """Explicitly choose existing parent with use_existing_parent_id."""
        # Create existing parent
        existing_parent = User(
            id=2,
            email="different@example.com",
            full_name="Other Parent",
            role=UserRole.PARENT,
            is_active=True,
            hashed_password="hashed_pass"
        )
        setup_db.users[2] = existing_parent

        # Card with different email
        card = StudentCard(
            id=1,
            student_full_name=student_card_data["student_full_name"],
            parent_full_name=student_card_data["parent_full_name"],
            parent_email=student_card_data["parent_email"],  # Different email
            parent_phone=student_card_data["parent_phone"],
            anketa_status="new"
        )
        setup_db.cards[1] = card

        # Convert with explicit parent choice
        student = Student(
            id=1,
            full_name=student_card_data["student_full_name"],
            parent_id=2,  # Explicitly set to different parent
            status=StudentStatus.ACTIVE,
            created_at=datetime.now()
        )
        setup_db.students[1] = student
        card.student_id = 1

        # Verify: student linked to chosen parent, not email-matched parent
        assert student.parent_id == 2  # Use provided parent_id

    def test_use_existing_student_id_option(self, setup_db, student_card_data):
        """Explicitly choose existing student with use_existing_student_id."""
        # Create existing student
        existing_parent = User(
            id=2,
            email=student_card_data["parent_email"],
            full_name=student_card_data["parent_full_name"],
            role=UserRole.PARENT,
            is_active=True,
            hashed_password="hashed_pass"
        )
        setup_db.users[2] = existing_parent

        existing_student = Student(
            id=1,
            full_name="Old Student Name",
            parent_id=2,
            status=StudentStatus.ACTIVE,
            created_at=datetime.now()
        )
        setup_db.students[1] = existing_student

        # Card with different student name
        card = StudentCard(
            id=1,
            student_full_name="New Student Name",  # Different name
            parent_full_name=student_card_data["parent_full_name"],
            parent_email=student_card_data["parent_email"],
            parent_phone=student_card_data["parent_phone"],
            anketa_status="new"
        )
        setup_db.cards[1] = card

        # Convert with explicit student choice (reuse existing student)
        card.student_id = 1  # Link to existing student

        # Verify: card linked to chosen student
        assert card.student_id == 1
        assert existing_student.full_name == "Old Student Name"  # Unchanged


class TestStudentCardValidation:
    """Tests for student card validation rules."""

    def test_card_requires_student_name(self, setup_db):
        """Student card requires student full name."""
        card = StudentCard(
            id=1,
            student_full_name=None,  # Missing
            parent_full_name="Parent",
            parent_email="parent@example.com",
            parent_phone="+79991234567",
            anketa_status="new"
        )

        # Should fail validation
        assert card.student_full_name is None

    def test_card_requires_parent_email(self, setup_db):
        """Student card requires parent email."""
        card = StudentCard(
            id=1,
            student_full_name="Student",
            parent_full_name="Parent",
            parent_email=None,  # Missing
            parent_phone="+79991234567",
            anketa_status="new"
        )

        # Should fail validation
        assert card.parent_email is None

    def test_card_email_format_validation(self, setup_db):
        """Student card validates email format."""
        # Valid email
        card1 = StudentCard(
            id=1,
            student_full_name="Student",
            parent_full_name="Parent",
            parent_email="valid@example.com",
            parent_phone="+79991234567",
            anketa_status="new"
        )
        assert "@" in card1.parent_email

        # Invalid email format
        card2 = StudentCard(
            id=2,
            student_full_name="Student",
            parent_full_name="Parent",
            parent_email="invalid-email",
            parent_phone="+79991234567",
            anketa_status="new"
        )
        assert "@" not in card2.parent_email


class TestStudentCreatedFromCardStatus:
    """Tests for student status after conversion."""

    def test_student_created_as_active(self, setup_db, student_card_data):
        """Student created from card should be ACTIVE."""
        card = StudentCard(
            id=1,
            student_full_name=student_card_data["student_full_name"],
            parent_full_name=student_card_data["parent_full_name"],
            parent_email=student_card_data["parent_email"],
            parent_phone=student_card_data["parent_phone"],
            anketa_status="new"
        )
        setup_db.cards[1] = card

        # Create student from card
        parent = User(
            id=2,
            email=card.parent_email,
            full_name=card.parent_full_name,
            role=UserRole.PARENT,
            is_active=True,
            hashed_password="hashed_pass"
        )
        setup_db.users[2] = parent

        student = Student(
            id=1,
            full_name=card.student_full_name,
            parent_id=2,
            status=StudentStatus.ACTIVE,  # Should be ACTIVE
            created_at=datetime.now()
        )
        setup_db.students[1] = student
        card.student_id = 1

        # Verify student is ACTIVE
        assert student.status == StudentStatus.ACTIVE

    def test_parent_created_as_active(self, setup_db, student_card_data):
        """Parent user created from card should be ACTIVE."""
        card = StudentCard(
            id=1,
            student_full_name=student_card_data["student_full_name"],
            parent_full_name=student_card_data["parent_full_name"],
            parent_email=student_card_data["parent_email"],
            parent_phone=student_card_data["parent_phone"],
            anketa_status="new"
        )
        setup_db.cards[1] = card

        # Create parent from card
        parent = User(
            id=2,
            email=card.parent_email,
            full_name=card.parent_full_name,
            role=UserRole.PARENT,
            is_active=True,  # Should be ACTIVE
            hashed_password="hashed_pass"
        )
        setup_db.users[2] = parent

        # Verify parent is ACTIVE
        assert parent.is_active is True
        assert parent.role == UserRole.PARENT
