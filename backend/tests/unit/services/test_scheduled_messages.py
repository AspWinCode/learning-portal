"""
Unit-тесты сервиса scheduled_messages (ТЗ: отправка отложенных SMS и MAX).
"""
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch


from app.services.scheduled_messages import dispatch_scheduled_messages, _dispatch_sms, _dispatch_max


def _make_sms(record_id="abc", phone="+79001234567", message="Тест", entity_type=None, entity_id=None):
    r = MagicMock()
    r.id = record_id
    r.phone = phone
    r.message = message
    r.status = "scheduled"
    r.scheduled_at = datetime.utcnow() - timedelta(minutes=1)
    r.entity_type = entity_type
    r.entity_id = entity_id
    r.created_by = 1
    return r


def _make_max(record_id="xyz", chat_id="79001234567@c.us", max_user_id=None, lead_id=None):
    r = MagicMock()
    r.id = record_id
    r.chat_id = chat_id
    r.max_user_id = max_user_id
    r.message = "Привет"
    r.status = "scheduled"
    r.scheduled_at = datetime.utcnow() - timedelta(minutes=1)
    r.lead_id = lead_id
    r.created_by = 1
    r.provider = "greenapi"
    return r


# ─────────────────────── _dispatch_sms ───────────────────────


@patch("app.services.scheduled_messages.sms_is_configured", return_value=False)
def test_dispatch_sms_not_configured(mock_cfg):
    db = MagicMock()
    result = _dispatch_sms(db)
    assert result == 0
    db.query.assert_not_called()


@patch("app.services.scheduled_messages.send_sms", return_value=(True, "gw123", None))
@patch("app.services.scheduled_messages.sms_is_configured", return_value=True)
def test_dispatch_sms_sends_pending(mock_cfg, mock_send):
    db = MagicMock()
    record = _make_sms()
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [record]

    result = _dispatch_sms(db)

    assert result == 1
    assert record.status == "sent"
    assert record.gateway_id == "gw123"
    assert record.sent_at is not None
    db.commit.assert_called()


@patch("app.services.scheduled_messages.send_sms", return_value=(False, None, "Timeout"))
@patch("app.services.scheduled_messages.sms_is_configured", return_value=True)
def test_dispatch_sms_marks_failed(mock_cfg, mock_send):
    db = MagicMock()
    record = _make_sms()
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [record]

    result = _dispatch_sms(db)

    assert result == 0
    assert record.status == "failed"


@patch("app.services.scheduled_messages.send_sms", return_value=(True, None, None))
@patch("app.services.scheduled_messages.sms_is_configured", return_value=True)
def test_dispatch_sms_logs_lead_communication(mock_cfg, mock_send):
    """При успешной отправке SMS для лида создаётся LeadCommunication."""
    db = MagicMock()
    record = _make_sms(entity_type="lead", entity_id=5)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [record]

    _dispatch_sms(db)

    db.add.assert_called()


@patch("app.services.scheduled_messages.sms_is_configured", return_value=True)
def test_dispatch_sms_no_pending(mock_cfg):
    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []

    result = _dispatch_sms(db)

    assert result == 0


# ─────────────────────── _dispatch_max ───────────────────────


@patch("app.services.scheduled_messages.max_is_configured", return_value=False)
def test_dispatch_max_not_configured(mock_cfg):
    db = MagicMock()
    result = _dispatch_max(db)
    assert result == 0
    db.query.assert_not_called()


@patch("app.services.scheduled_messages.send_message_personal", return_value=(True, "mid1", None))
@patch("app.services.scheduled_messages.is_personal_configured", return_value=True)
@patch("app.services.scheduled_messages.max_is_configured", return_value=True)
def test_dispatch_max_sends_via_personal(mock_cfg, mock_personal, mock_send):
    db = MagicMock()
    record = _make_max()
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [record]

    result = _dispatch_max(db)

    assert result == 1
    assert record.status == "sent"
    assert record.gateway_message_id == "mid1"
    mock_send.assert_called_once_with(record.chat_id, record.message)


@patch("app.services.scheduled_messages.send_message", return_value=(True, "mid2", None))
@patch("app.services.scheduled_messages.is_personal_configured", return_value=False)
@patch("app.services.scheduled_messages.max_is_configured", return_value=True)
def test_dispatch_max_sends_via_bot(mock_cfg, mock_personal, mock_send):
    """Если личный аккаунт не настроен и есть max_user_id — использует Bot API."""
    db = MagicMock()
    record = _make_max(chat_id=None, max_user_id=12345)
    record.chat_id = None
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [record]

    result = _dispatch_max(db)

    assert result == 1
    mock_send.assert_called_once_with(12345, record.message)


@patch("app.services.scheduled_messages.send_message_personal", return_value=(False, None, "Error"))
@patch("app.services.scheduled_messages.is_personal_configured", return_value=True)
@patch("app.services.scheduled_messages.max_is_configured", return_value=True)
def test_dispatch_max_marks_failed(mock_cfg, mock_personal, mock_send):
    db = MagicMock()
    record = _make_max()
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [record]

    result = _dispatch_max(db)

    assert result == 0
    assert record.status == "failed"


@patch("app.services.scheduled_messages.send_message_personal", return_value=(True, None, None))
@patch("app.services.scheduled_messages.is_personal_configured", return_value=True)
@patch("app.services.scheduled_messages.max_is_configured", return_value=True)
def test_dispatch_max_logs_lead_communication(mock_cfg, mock_personal, mock_send):
    """При успешной отправке MAX для лида создаётся LeadCommunication."""
    db = MagicMock()
    record = _make_max(lead_id=7)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [record]

    _dispatch_max(db)

    db.add.assert_called()


# ─────────────────────── dispatch_scheduled_messages ───────────────────────


@patch("app.services.scheduled_messages._dispatch_max", return_value=2)
@patch("app.services.scheduled_messages._dispatch_sms", return_value=3)
def test_dispatch_scheduled_messages_returns_counts(mock_sms, mock_max):
    db = MagicMock()
    result = dispatch_scheduled_messages(db)
    assert result == {"sms": 3, "max": 2}
