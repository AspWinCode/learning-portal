"""
Unit-тесты сервиса payment_overdue_tasks (ТЗ: автозадачи по просрочке оплаты).
"""
from datetime import date, timedelta
from unittest.mock import MagicMock, patch


from app.services.payment_overdue_tasks import (
    create_payment_overdue_tasks,
    _create_payment_overdue_task,
    _has_active_task,
    TASK_KIND_PAYMENT_OVERDUE,
    FIRST_REMINDER_DAYS,
    SECOND_REMINDER_DAYS,
)


def test_create_payment_overdue_tasks_no_creator_returns_zero():
    """Нет owner и sales пользователя -> возврат 0, задачи не создаются."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.side_effect = [None, None]

    result = create_payment_overdue_tasks(db)

    assert result == 0
    db.commit.assert_not_called()


def test_create_payment_overdue_tasks_no_cards_returns_zero():
    """Есть creator, но нет карточек с next_payment_date -> 0."""
    db = MagicMock()
    mock_owner = MagicMock()
    mock_owner.id = 1
    db.query.return_value.filter.return_value.first.return_value = mock_owner
    db.query.return_value.filter.return_value.all.return_value = []

    result = create_payment_overdue_tasks(db)

    assert result == 0


def test_has_active_task_returns_true_when_task_exists():
    """_has_active_task возвращает True, если активная задача есть."""
    db = MagicMock()
    db.query.return_value.join.return_value.filter.return_value.first.return_value = 42

    out = _has_active_task(db, student_id=1, task_kind=TASK_KIND_PAYMENT_OVERDUE, reminder_stage=1)

    assert out is True


def test_has_active_task_returns_false_when_no_task():
    """_has_active_task возвращает False, если задачи нет."""
    db = MagicMock()
    db.query.return_value.join.return_value.filter.return_value.first.return_value = None

    out = _has_active_task(db, student_id=1, task_kind=TASK_KIND_PAYMENT_OVERDUE, reminder_stage=1)

    assert out is False


@patch("app.services.payment_overdue_tasks._get_student_group_name", return_value="Группа А")
@patch("app.services.payment_overdue_tasks._get_student_parent_name", return_value="Родитель")
def test_create_payment_overdue_task_stage1(mock_parent, mock_group):
    """_create_payment_overdue_task этап 1: заголовок и reminder_stage."""
    db = MagicMock()
    next_pay = date.today() - timedelta(days=FIRST_REMINDER_DAYS)

    task = _create_payment_overdue_task(
        db,
        student_id=10,
        student_name="Ученик",
        next_payment_date=next_pay,
        stage=1,
        created_by_id=1,
        assigned_to_id=2,
    )

    assert task is not None
    assert task.title == "Оплата просрочена"
    assert task.task_kind == TASK_KIND_PAYMENT_OVERDUE
    assert task.reminder_stage == 1
    assert task.priority == "normal"
    assert "1-е напоминание" in task.description
    db.add.assert_called()
    db.flush.assert_called()


@patch("app.services.payment_overdue_tasks._get_student_group_name", return_value=None)
@patch("app.services.payment_overdue_tasks._get_student_parent_name", return_value=None)
def test_create_payment_overdue_task_stage2(mock_parent, mock_group):
    """_create_payment_overdue_task этап 2: заголовок «повтор», priority high."""
    db = MagicMock()
    next_pay = date.today() - timedelta(days=SECOND_REMINDER_DAYS)

    task = _create_payment_overdue_task(
        db,
        student_id=10,
        student_name="Ученик",
        next_payment_date=next_pay,
        stage=2,
        created_by_id=1,
        assigned_to_id=None,
    )

    assert task is not None
    assert "повтор" in task.title
    assert task.reminder_stage == 2
    assert task.priority == "high"
    db.add.assert_called()
