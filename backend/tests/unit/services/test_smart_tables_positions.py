from app.services.smart_tables.executor import _position_after


def test_position_after_none_inserts_before_first_position():
    assert _position_after([10.0, 20.0, 30.0], None) == 9.0


def test_position_after_none_uses_zero_for_empty_collection():
    assert _position_after([], None) == 0.0


def test_position_after_existing_item_uses_midpoint_before_next_item():
    assert _position_after([10.0, 20.0, 30.0], 10.0) == 15.0


def test_position_after_last_item_keeps_room_for_future_inserts():
    assert _position_after([10.0, 20.0, 30.0], 30.0) == 31.0


def test_many_insert_between_positions_remain_strictly_ordered():
    positions = [0.0, 1.0]
    after_pos = 0.0

    for _ in range(40):
        new_pos = _position_after(positions, after_pos)
        assert after_pos < new_pos < 1.0
        positions.append(new_pos)
        after_pos = new_pos

    ordered = sorted(positions)
    assert len(ordered) == len(set(ordered))
    assert all(left < right for left, right in zip(ordered, ordered[1:]))
