import pytest

from app import schemas


def test_parent_weekly_digest_settings_validates_send_time() -> None:
    payload = schemas.ParentWeeklyDigestSettingsUpdate(
        enabled=True,
        weekday=4,
        send_time="08:30",
    )

    assert payload.send_time == "08:30"


def test_parent_weekly_digest_settings_rejects_invalid_send_time() -> None:
    with pytest.raises(ValueError):
        schemas.ParentWeeklyDigestSettingsUpdate(
            enabled=True,
            weekday=4,
            send_time="25:99",
        )
