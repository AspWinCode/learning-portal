from app.services.smm_projects.metrics import _count


def test_count_reads_vk_counter_object():
    assert _count({"likes": {"count": 12}}, "likes") == 12


def test_count_accepts_plain_integer_and_missing_value():
    assert _count({"views": 45}, "views") == 45
    assert _count({}, "views") is None


def test_count_rejects_invalid_and_negative_values():
    assert _count({"comments": {"count": "many"}}, "comments") is None
    assert _count({"reposts": {"count": -2}}, "reposts") == 0
