import pytest
from pydantic import ValidationError

from app.schemas.owner_workspace import OwnerUsefulLinkCreate, OwnerUsefulLinkUpdate


def test_long_appsheet_url_is_allowed_as_link_title():
    long_url = "https://www.appsheet.com/start/example?" + "state=" + ("x" * 700)

    payload = OwnerUsefulLinkCreate(title=long_url, url=long_url)

    assert payload.title == long_url
    assert payload.url == long_url


def test_useful_link_title_has_defensive_length_limit():
    with pytest.raises(ValidationError):
        OwnerUsefulLinkCreate(title="x" * 4097, url="https://example.com")

    with pytest.raises(ValidationError):
        OwnerUsefulLinkUpdate(title="x" * 4097)
