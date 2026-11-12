from zipfile import ZipFile
from io import BytesIO

from app.services.smm_projects.vk_pack import build_vk_pack


def test_build_vk_pack_contains_human_text_and_ordered_media():
    archive = build_vk_pack(
        title="Карусель",
        text="Готовый текст публикации",
        assets=[("first.png", b"one", "image/png"), ("second.jpg", b"two", "image/jpeg")],
    )

    with ZipFile(BytesIO(archive)) as zipped:
        names = zipped.namelist()
        assert names[:2] == ["post.txt", "README.txt"]
        assert "media/01_first.png" in names
        assert "media/02_second.jpg" in names
        assert zipped.read("post.txt").decode().strip() == "Готовый текст публикации"
