from types import SimpleNamespace

from datetime import datetime, timezone

import pytest

from app.services.smm_projects.metrics import _collect_instagram_metrics, _count
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


def test_performance_breakdown_does_not_treat_views_only_as_zero_engagement():
    publication = SimpleNamespace(status="success", channel="max", metrics_json={"views": 120})
    result = _performance_breakdown([(publication, None, None)])

    assert result == {"by_channel_format": [], "by_channel_genre": []}


def test_instagram_engagement_uses_reach_when_available():
    publication = SimpleNamespace(
        status="success", channel="instagram",
        metrics_json={"reach": 200, "likes": 20, "comments": 4},
    )

    result = _performance_breakdown([(publication, None, None)])

    insight = result["by_channel_format"][0]
    assert insight["exposure_basis"] == "reach"
    assert insight["reach"] == 200
    assert insight["engagement_rate"] == 12.0


@pytest.mark.asyncio
async def test_instagram_metrics_persist_only_counters_returned_by_meta():
    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"data": [
                {"name": "views", "values": [{"value": 321}]},
                {"name": "likes", "values": [{"value": 18}]},
                {"name": "comments", "values": [{"value": 4}]},
            ]}

    class Client:
        async def get(self, url, params):
            assert url.endswith("/media-123/insights")
            assert params["access_token"] == "secret"
            return Response()

    publication = SimpleNamespace(external_id="media-123", metrics_json=None, metrics_updated_at=None)
    now = datetime.now(timezone.utc)

    updated = await _collect_instagram_metrics(Client(), 1, [publication], {"token": "secret"}, now)

    assert updated == 1
    assert publication.metrics_json == {"views": 321, "likes": 18, "comments": 4}
    assert publication.metrics_updated_at == now


@pytest.mark.asyncio
async def test_instagram_empty_insights_are_not_saved_as_zeroes():
    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"data": []}

    class Client:
        async def get(self, url, params):
            return Response()

    publication = SimpleNamespace(external_id="media-456", metrics_json=None, metrics_updated_at=None)

    updated = await _collect_instagram_metrics(
        Client(), 1, [publication], {"token": "secret"}, datetime.now(timezone.utc),
    )

    assert updated == 1
    assert publication.metrics_json is None
    assert publication.metrics_updated_at is not None
