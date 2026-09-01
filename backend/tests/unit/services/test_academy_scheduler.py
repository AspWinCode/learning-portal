from datetime import datetime, timezone

from app.services.academy_ai import scheduler as sch


class _Rule:
    def __init__(self, topics=None, proportions=None, cadence="0 9 * * *"):
        self.topics = topics
        self.proportions = proportions
        self.cadence = cadence


def test_next_run_from_cadence_valid():
    after = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)
    nxt = sch.next_run_from_cadence("0 9 * * *", after=after)
    assert nxt is not None
    assert nxt.hour == 9 and nxt.day == 2


def test_next_run_from_cadence_invalid():
    assert sch.next_run_from_cadence("nonsense") is None
    assert sch.next_run_from_cadence("") is None


def test_pick_direction_none_without_proportions():
    assert sch._pick_direction(_Rule()) is None
    assert sch._pick_direction(_Rule(proportions={})) is None
    assert sch._pick_direction(_Rule(proportions={"x": 0})) is None


def test_pick_direction_weighted_only_positive():
    got = {sch._pick_direction(_Rule(proportions={"ЕГЭ": 3, "bad": 0})) for _ in range(20)}
    assert got == {"ЕГЭ"}


def test_pick_topic_falls_back_to_defaults():
    assert sch._pick_topic(_Rule(topics=None)) in sch._DEFAULT_TOPICS
    assert sch._pick_topic(_Rule(topics=["  "])) in sch._DEFAULT_TOPICS
    assert sch._pick_topic(_Rule(topics=["своя тема"])) == "своя тема"


def test_positive_helper():
    assert sch._positive(1) and sch._positive("2.5")
    assert not sch._positive(0) and not sch._positive("x") and not sch._positive(None)
