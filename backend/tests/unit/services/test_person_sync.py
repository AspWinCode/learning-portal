from app.models import Lead, StudentCard, User, UserRole
from app.services.person_sync import (
    attach_record_to_person,
    get_or_create_person,
    merge_persons,
    sync_lead_person,
    sync_student_card_person,
    sync_user_person,
)


class DummyDb:
    def __init__(self):
        self.persons = []
        self.users = []
        self.leads = []
        self.student_cards = []

    def add(self, item):
        if getattr(item, "id", None) is not None:
            return
        if isinstance(item, User):
            item.id = len(self.users) + 1
            self.users.append(item)
            return
        if isinstance(item, Lead):
            item.id = len(self.leads) + 1
            self.leads.append(item)
            return
        if isinstance(item, StudentCard):
            item.id = len(self.student_cards) + 1
            self.student_cards.append(item)
            return
        item.id = len(self.persons) + 1
        self.persons.append(item)

    def flush(self):
        return None

    def delete(self, item):
        if item in self.persons:
            self.persons.remove(item)

    def query(self, model):
        if model is User:
            return DummyQuery(self.users)
        if model is Lead:
            return DummyQuery(self.leads)
        if model is StudentCard:
            return DummyQuery(self.student_cards)
        return DummyQuery(self.persons)


class DummyQuery:
    def __init__(self, persons):
        self.persons = persons
        self._items = list(persons)

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def first(self):
        return self._items[0] if self._items else None

    def all(self):
        return list(self._items)


def test_get_or_create_person_reuses_existing_by_email():
    db = DummyDb()
    first = get_or_create_person(
        db,
        full_name="Parent One",
        email="parent@example.com",
        phone_normalized="+79990000001",
        role_hint="parent",
    )
    second = get_or_create_person(
        db,
        full_name="Parent One Updated",
        email="parent@example.com",
        phone_normalized="+79990000001",
        role_hint="lead",
    )
    assert first is second
    assert len(db.persons) == 1


def test_sync_entities_assign_person_id():
    db = DummyDb()
    user = User(
        email="parent@example.com",
        hashed_password="hash",
        full_name="Parent One",
        role=UserRole.PARENT,
    )
    user.phone_normalized = "+79990000001"
    sync_user_person(db, user)

    lead = Lead(
        owner_id=1,
        contact_name="Parent One",
        phone="+79990000001",
    )
    lead.email = "parent@example.com"
    lead.parent_full_name = "Parent One"
    lead.phone_normalized = "+79990000001"
    sync_lead_person(db, lead)

    card = StudentCard(student_full_name="Child One")
    card.parent_full_name = "Parent One"
    card.parent_email = "parent@example.com"
    card.phone_normalized = "+79990000001"
    sync_student_card_person(db, card)

    assert user.person_id == lead.person_id == card.person_id
    assert len(db.persons) == 1


def test_merge_persons_relinks_entities():
    db = DummyDb()
    target = get_or_create_person(db, full_name="Parent One", email="parent@example.com", role_hint="parent")
    source = get_or_create_person(db, full_name="Child One", phone_normalized="+79990000001", role_hint="lead")
    user = User(email="parent@example.com", hashed_password="hash", full_name="Parent One", role=UserRole.PARENT)
    user.person_id = target.id
    lead = Lead(owner_id=1, contact_name="Child One", phone="+79990000001")
    lead.person_id = source.id
    db.add(user)
    db.add(lead)

    merge_persons(db, source_person=source, target_person=target)

    assert lead.person_id == target.id
    assert len(db.persons) == 1


def test_attach_record_to_person_assigns_person_id():
    db = DummyDb()
    person = get_or_create_person(db, full_name="Parent One", email="parent@example.com", role_hint="parent")
    lead = Lead(owner_id=1, contact_name="Parent One", phone="+79990000001")
    lead.phone_normalized = "+79990000001"
    db.add(lead)

    attach_record_to_person(db, person=person, entity_type="lead", entity_id=lead.id)

    assert lead.person_id == person.id
