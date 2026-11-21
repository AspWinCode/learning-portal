from types import SimpleNamespace

from app.services.smm_projects.metrics import _count
from app.services.smm_projects.content_plans import _performance_breakdown


def test_count_reads_vk_counter_object():
    assert _count({"likes": {"count": 12}}, "likes") == 12


def test_count_accepts_plain_integer_and_missing_value():
    assert _count({"views": 45}, "views") == 45
    assert _count({}, "views") is None


def test_count_rejects_invalid_and_negative_values():
    assert _count({"comments": {"count": "many"}}, "comments") is None
    assert _count({"reposts": {"count": -2}}, "reposts") == 0


def test_performance_breakdown_uses_view_weighted_rates_and_minimum_sample():
    rows = []
    for index in range(3):
        publication = SimpleNamespace(
            status="success", channel="vk",
            metrics_json={"views": 100, "likes": 10, "comments": 2, "reposts": 3},
        )
        content = SimpleNamespace(input_json={"content_format": "Пост"})
        plan_item = SimpleNamespace(content_format="Пост", genre="Образовательный")
        rows.append((publication, content, plan_item))
    # A low-sample segment should be retained for reporting but marked ineligible.
    rows.append((
        SimpleNamespace(status="success", channel="vk", metrics_json={"views": 10, "likes": 8}),
        SimpleNamespace(input_json={"content_format": "Карусель"}),
        SimpleNamespace(content_format="Карусель", genre="Интерактивный"),
    ))

    result = _performance_breakdown(rows)

    post = next(row for row in result["by_channel_format"] if row["format"] == "Пост")
    carousel = next(row for row in result["by_channel_format"] if row["format"] == "Карусель")
    assert post["sample_size"] == 3
    assert post["engagement_rate"] == 15.0
    assert post["enough_data"] is True
    assert carousel["engagement_rate"] == 80.0
    assert carousel["enough_data"] is False
