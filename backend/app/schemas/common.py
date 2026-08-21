from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    OWNER = "owner"
    TRAINER = "trainer"
    PARENT = "parent"
    GUEST = "guest"
    SALES = "sales"
    SEO_MANAGER = "seo_manager"
    METHODIST = "methodist"
    DEVELOPER = "developer"
    MANAGER = "manager"


class SeoPageStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


class StudentStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class CharacteristicStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AbonementStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class DiscountType(str, Enum):
    NONE = "none"
    AMOUNT = "amount"
    PERCENT = "percent"


class LeadStatus(str, Enum):
    NEW = "new"
    CONTACTED = "contacted"
    NO_ANSWER = "no_answer"
    DEMO = "demo"
    INVOICE_SENT = "invoice_sent"
    WON = "won"
    LOST = "lost"
    THINKING = "thinking"
    REFUSED = "refused"
    TRIAL_SCHEDULED = "trial_scheduled"
    EVENT_REGISTERED = "event_registered"
    DECIDED_IMMEDIATELY = "decided_immediately"


class LeadTaskStatus(str, Enum):
    OPEN = "open"
    DONE = "done"


class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class EventStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class EventRegistrationStatus(str, Enum):
    REGISTERED = "registered"
    CANCELLED = "cancelled"


__all__ = [name for name in globals() if not name.startswith("_")]
