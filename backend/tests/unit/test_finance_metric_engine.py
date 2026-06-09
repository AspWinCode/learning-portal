import pytest

from app.services import finance_metric_engine


def test_compute_metric_formula_supports_direction_filter(monkeypatch):
    calls = []

    def fake_aggregate(db, target_id, code, period, kind, direction=None):
        calls.append((target_id, code, period, kind, direction))
        if direction == "income":
            return 100.0
        if direction == "expense":
            return 40.0
        return 0.0

    monkeypatch.setattr(finance_metric_engine, "aggregate_article", fake_aggregate)
    monkeypatch.setattr(finance_metric_engine, "balance", lambda db, target_id: 0.0)

    result = finance_metric_engine.compute_metric_formula(
        db=None,
        target_id=7,
        formula="SUM(revenue, direction=income) - SUM(revenue, direction=expense)",
        period="2026-06",
    )

    assert result == 60.0
    assert calls == [
        (7, "revenue", "2026-06", "sum", "income"),
        (7, "revenue", "2026-06", "sum", "expense"),
    ]


def test_compute_metric_formula_returns_zero_on_division_by_zero(monkeypatch):
    monkeypatch.setattr(finance_metric_engine, "aggregate_article", lambda *args, **kwargs: 0.0)
    monkeypatch.setattr(finance_metric_engine, "balance", lambda db, target_id: 0.0)

    assert finance_metric_engine.compute_metric_formula(None, 1, "SUM(revenue) / SUM(revenue)") == 0.0


def test_compute_metric_formula_rejects_unsupported_expression(monkeypatch):
    monkeypatch.setattr(finance_metric_engine, "balance", lambda db, target_id: 0.0)

    with pytest.raises(ValueError):
        finance_metric_engine.compute_metric_formula(None, 1, "__import__('os').system('echo bad')")
